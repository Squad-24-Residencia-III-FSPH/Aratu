# Infraestrutura, Banco de Dados e Segurança Operacional — Sistema Aratu

Este documento concentra as diretrizes operacionais de banco de dados (**PostgreSQL 18**), concorrência, containers Docker e segurança da informação (LGPD e sigilo do SVO) do **Sistema Aratu**.

---

## 1. Governança de Banco de Dados (PostgreSQL 18 — Padrão `modelo.sql` em Inglês)

O banco oficial do projeto é o **PostgreSQL 18** (`postgres:18-alpine`).

### 1.1 Convenções de Modelagem e Nomenclatura (Schemas Nativos de Domínio em Inglês)

O banco é organizado em **5 Schemas Nativos de Domínio**: `auth`, `audit`, `fleet`, `trip`, `svo`.

- **Tabelas:** qualificadas no schema **no plural** em `snake_case` (`auth.users`, `auth.sectors`, `audit.logs`, `fleet.vehicles`, `fleet.drivers`, `fleet.maintenance_orders`, `trip.requests`, `trip.trips`, `trip.allocations`, `svo.occurrences`). O uso do plural evita palavras reservadas SQL (`USER`, `ORDER`, `GROUP`). Proibido usar prefixos húngaros.
- **Um significado por tabela:** cada tabela deve representar um único grão claro no domínio (ex: a solicitação `trip.requests` versus a viagem `trip.trips` e a alocação `trip.allocations`).
- **Chaves Primárias (PK):** sempre `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.
- **Colunas Próprias:** nomes substantivos limpos em inglês `snake_case` (ex: `name`, `email`, `password_hash`, `role`, `active` / `is_active`, `planned_departure`, `state`, `created_at`).
- **Chaves Estrangeiras (FK):**
  - Formato `<entity>_id` no singular referenciando a tabela de origem (ex: `user_id REFERENCES auth.users(id)`, `vehicle_id REFERENCES fleet.vehicles(id)`).
  - Quando houver múltiplas referências à mesma entidade, adicione o papel semântico: `user_id_requester`, `user_id_manager`.
  - **Restrição de integridade padrão:** utilizar `ON DELETE RESTRICT` para impedir deleções acidentais de registros históricos.
- **Objetos Auxiliares:**
  - **Índices Únicos e de Busca:** `<schema>_<table>_<purpose>` (ex: `auth_users_email_lower_unique`, `trip_trips_vehicle_in_progress`, `audit_logs_by_user`, `trip_allocations_by_request`).
  - **Triggers e Funções:** nomes em inglês sem prefixos artificiais (triggers: `preserve`, `prevent_delete`, `audit_trigger`; funções: `_actor_snapshot()`, `_audit()`, `create_trip()`).
  - **Views:** qualificadas no schema ou com `vw_` em inglês (ex: `trip.vw_active_allocations`).
- **Estados e Ciclo de Vida:**
  - Uma informação mora em um só lugar: utilize uma única coluna `state` ou `status` validada por `CHECK` com valores em inglês (`UPPER_SNAKE_CASE`, ex: `'PLANNED'`, `'IN_PROGRESS'`, `'COMPLETED'`, `'CANCELED'`).
- **Campos Booleanos:** tipo nativo `BOOLEAN NOT NULL DEFAULT false / true` com prefixo `is_` ou `has_` (proibido usar inteiros `0/1` ou strings `'S'/'N'`).
- **Campos Temporais:** `TIMESTAMPTZ` para eventos com data, hora e fuso (`clock_timestamp()`).

### 1.2 Migrações e Operações Críticas

- **DDL Transacional:** toda migration no PostgreSQL 18 deve rodar dentro de `BEGIN; ... COMMIT;` para garantir atomicidade.
- Configure as credenciais locais em `.env` usando `.env.example` como referência. `docker-compose.yml` lê `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `POSTGRES_PORT`; a API executada no host usa `DATABASE_URL` apontando para `localhost`, enquanto o Compose injeta a URL com host interno `db`.
- O backend pode ser iniciado diretamente no host com `npm --prefix backend run dev` depois de instalar as dependências; `JWT_SECRET` deve ser exclusivo do ambiente e `JWT_EXPIRES_IN` usa `8h` como padrão.
- A migration inicial pode ser aplicada na raiz do repositório após iniciar o container do banco:
  ```bash
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backend/src/database/migrations/202610160001_create_users.sql
  ```
  Para reverter essa migration:
  ```bash
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backend/src/database/migrations/202610160001_create_users.down.sql
  ```
- Antes de aplicar qualquer alteração estrutural (`ALTER`, `DROP`) ou atualização em massa:
  1. Avalie o volume de registros afetados e as dependências entre tabelas;
  2. Documente o objetivo, as tabelas/colunas impactadas e o **script de rollback**;
  3. Verifique a compatibilidade com os dados já gravados (nunca assuma que uma regra nova vale apenas dali para frente sem tratar o passivo).

---

## 2. Performance de Consultas e Indexação

- **Proibido usar `SELECT *`:** liste explicitamente todas as colunas esperadas nas queries SQL, mapeando para `camelCase` no TypeScript (`license_plate AS "licensePlate"`).
- **Queries Sargáveis (que aproveitam índices):** nunca aplique funções sobre a coluna filtrada no `WHERE`:
  - **Errado:** `WHERE DATE(planned_departure) = '2026-10-15'`
  - **Correto:** `WHERE planned_departure >= '2026-10-15T00:00:00Z' AND planned_departure < '2026-10-16T00:00:00Z'`
- **Índices estratégicos e parciais:**
  ```sql
  CREATE UNIQUE INDEX trip_trips_vehicle_in_progress ON trip.trips (vehicle_id) WHERE state = 'IN_PROGRESS';
  CREATE INDEX trip_allocations_by_request ON trip.allocations (request_id);
  ```
- **Paginação eficiente:** em tabelas volumosas de histórico, prefira *Keyset Pagination* (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20`) em vez de `OFFSET` elevado.
- **Medição real:** antes e depois de otimizar uma query, meça com `EXPLAIN (ANALYZE, BUFFERS)`.

---

## 3. Concorrência e Atomicidade

Operações que leem um estado, tomam uma decisão e gravam no banco (ex: alocar uma viatura ou motorista para uma viagem ou chamado do SVO) estão sujeitas a condições de corrida (*race conditions*).

- **Padrão obrigatório:** execute a leitura e a gravação dentro de uma mesma transação com trava explícita (`SELECT ... FOR UPDATE`) e validação de revisão (`revision`):
  ```sql
  BEGIN;
  SELECT id, state, revision
    FROM trip.trips
   WHERE id = $1
     FOR UPDATE;
  -- Valida no Service se state aceita alocação e se revision confere
  INSERT INTO trip.allocations (request_id, trip_id, user_id, actor_snapshot, reason)
  VALUES ($1, $2, $3, $4, $5);
  UPDATE trip.trips SET revision = revision + 1 WHERE id = $2;
  COMMIT;
  ```
- **Transações curtas:** nunca execute chamadas HTTP externas, geração pesada de arquivos ou envio de notificações dentro de uma transação aberta no PostgreSQL.

---

## 4. Segurança Operacional, LGPD e Sigilo do SVO

- **Zero segredos versionados:** senhas de banco, chaves de token JWT e credenciais externas devem ser injetadas exclusivamente via variáveis de ambiente (`.env` ignorado no Git). Use placeholders em exemplos de documentação.
- Para execução local, copie `.env.example` para `.env` e substitua os placeholders de `POSTGRES_PASSWORD`, `DATABASE_URL` e `JWT_SECRET` por valores correspondentes/exclusivos (por exemplo, gere valores hexadecimais com `openssl rand -hex 32`). `JWT_EXPIRES_IN` aceita segundos (`s`), minutos (`m`), horas (`h`) ou dias (`d`); o padrão é `8h`.
- Em produção, sirva a API somente por HTTPS: bcrypt protege as senhas armazenadas, mas não cifra o tráfego entre o cliente e o servidor.
- **Sigilo de Dados Sensíveis (LGPD / SVO / FSPH):**
  - O SVO lida com informações de óbito, identificação de falecidos, laudos e dados de familiares.
  - A gestão de frota lida com dados de servidores e motoristas.
  - **Regra absoluta:** nunca utilize dados reais em ambientes de desenvolvimento, seeds, testes, logs ou dumps compartilhados sem autorização formal e anonimização completa.
