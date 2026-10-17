# Infraestrutura, Banco de Dados e Segurança Operacional — Sistema Aratu

Este documento concentra as diretrizes operacionais de banco de dados (**PostgreSQL 18**), concorrência, containers Docker e segurança da informação (LGPD e sigilo do SVO) do **Sistema Aratu**.

---

## 1. Governança de Banco de Dados (PostgreSQL 18 — Padrão `modelo.sql` em Inglês)

O banco oficial do projeto é o **PostgreSQL 18** (`postgres:18-alpine`).

### 1.1 Convenções de Modelagem e Nomenclatura (Prefixo de 3 Letras em Inglês)

- **Tabelas:** nomes em `snake_case` no singular iniciados por prefixo único de 3 letras em inglês (`sec_sector`, `usr_user`, `srv_service`, `veh_vehicle`, `drv_driver`, `vhs_vehicle_service`, `aud_audit`, `apo_approval_policy`, `ape_policy_event`, `req_request`, `rqv_request_version`, `rqe_request_event`, `trp_trip`, `tre_trip_event`, `ral_request_allocation`, `fve_fulfillment_event`, `rte_round_trip_event`, `par_system_parameter`, `mnt_maintenance`).
- **Um significado por tabela:** cada tabela deve representar um único grão claro no domínio (ex: uma solicitação `req_request` versus a viagem `trp_trip` e a alocação `ral_request_allocation`).
- **Chaves Primárias (PK) e Projeção no Repository (`SELECT`):**
  - Na tabela (`CREATE TABLE`): `<pre>_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (ex: `veh_id`, `drv_id`, `trp_id`, `req_id`, `usr_id`).
  - No `SELECT` do Repository: projeta-se `<pre>_id AS id` e remove-se o prefixo das demais colunas via alias `camelCase` (`veh_identification AS identification`, `trp_planned_departure AS "plannedDeparture"`).
- **Colunas Próprias:**
  - Formato `<pre>_<column_name>` em inglês (ex: `veh_identification`, `veh_seats`, `veh_active`, `veh_revision`, `trp_planned_departure`, `trp_state`, `trp_created_at`).
- **Chaves Estrangeiras (FK):**
  - Formato `<ref_pre>_id` mantendo o nome exato da PK da tabela referenciada (ex: `veh_id`, `drv_id`, `usr_id`), ou `<ref_pre>_id_<role>` quando houver múltiplas referências à mesma tabela (ex: `usr_id_requester`, `req_id_outbound`, `req_id_return`).
  - **Restrição de integridade padrão:** utilizar `ON DELETE RESTRICT` para impedir deleções acidentais de registros históricos.
- **Objetos Auxiliares (sem `idx_`, `uq_`, `trg_`, `fn_`):**
  - **Índices e Unique Indexes:** iniciam diretamente com o prefixo de 3 letras da tabela `<pre>_<descriptive_name>` (ex: `rqe_unique_decision`, `trp_vehicle_in_progress`, `ral_by_request`, `aud_by_table`).
  - **Triggers e Funções:** nomes em inglês sem `trg_` ou `fn_` (triggers: `preserve`, `prevent_delete`, `audit`; funções internas: `_barrier()`, `_actor()`, `_audit()`, `_validate_trip()`; funções públicas: `save_sector()`, `create_trip()`, `allocate_request()`).
  - **Views:** `vw_<descriptive_name_in_english>` (ex: `vw_active_allocations`, `vw_round_trip_pairs`, `vw_active_policies`).
- **Estados e Ciclo de Vida:**
  - Uma informação mora em um só lugar: utilize uma única coluna `<pre>_state` validada por `CHECK` com valores em inglês (`UPPER_SNAKE_CASE`, ex: `'PLANNED'`, `'IN_PROGRESS'`, `'COMPLETED'`, `'CANCELED'`).
- **Campos Booleanos:** tipo nativo `BOOLEAN NOT NULL DEFAULT false / true` (proibido usar inteiros `0/1` ou strings `'S'/'N'`).
- **Campos Temporais:** `TIMESTAMPTZ` para eventos com data, hora e fuso (`clock_timestamp()`).

### 1.2 Migrações e Operações Críticas

- **DDL Transacional:** toda migration no PostgreSQL 18 deve rodar dentro de `BEGIN; ... COMMIT;` para garantir atomicidade.
- Configure as credenciais locais em `.env` usando `.env.example` como referência. `docker-compose.yml` lê `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `POSTGRES_PORT`; a API executada no host usa `DATABASE_URL` apontando para `localhost`, enquanto o Compose injeta a URL com host interno `db`.
- O backend pode ser iniciado diretamente no host com `npm --prefix backend run dev` depois de instalar as dependências; `JWT_SECRET` deve ser exclusivo do ambiente e `JWT_EXPIRES_IN` usa `8h` como padrão.
- A migration inicial de usuários pode ser aplicada na raiz do repositório após iniciar o container do banco:
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

- **Proibido usar `SELECT *`:** liste explicitamente todas as colunas esperadas nas queries SQL convertendo o prefixo de 3 letras via alias (`veh_id AS id`).
- **Queries Sargáveis (que aproveitam índices):** nunca aplique funções sobre a coluna filtrada no `WHERE`:
  - **Errado:** `WHERE DATE(trp_planned_departure) = '2026-10-15'`
  - **Correto:** `WHERE trp_planned_departure >= '2026-10-15T00:00:00Z' AND trp_planned_departure < '2026-10-16T00:00:00Z'`
- **Índices estratégicos e parciais (sem `idx_` ou `uq_`):**
  ```sql
  CREATE UNIQUE INDEX trp_vehicle_in_progress ON trp_trip (veh_id) WHERE trp_state = 'IN_PROGRESS';
  CREATE INDEX ral_by_request ON ral_request_allocation (req_id);
  ```
- **Paginação eficiente:** em tabelas volumosas de histórico, prefira *Keyset Pagination* (`WHERE (req_created_at, req_id) < ($1, $2) ORDER BY req_created_at DESC, req_id DESC LIMIT 20`) em vez de `OFFSET` elevado.
- **Medição real:** antes e depois de otimizar uma query, meça com `EXPLAIN (ANALYZE, BUFFERS)`.

---

## 3. Concorrência e Atomicidade

Operações que leem um estado, tomam uma decisão e gravam no banco (ex: alocar uma viatura ou motorista para uma viagem ou chamado do SVO) estão sujeitas a condições de corrida (*race conditions*).

- **Padrão obrigatório:** execute a leitura e a gravação dentro de uma mesma transação com trava explícita (`SELECT ... FOR UPDATE`) e validação de revisão (`<pre>_revision`):
  ```sql
  BEGIN;
  SELECT trp_id AS id, trp_state AS state, trp_revision AS revision
    FROM trp_trip
   WHERE trp_id = $1
     FOR UPDATE;
  -- Valida no Service se state aceita alocação e se revision confere
  INSERT INTO ral_request_allocation (req_id, rqv_id, trp_id, usr_id, ral_actor_snapshot, ral_reason, ral_snapshot)
  VALUES ($1, $2, $3, $4, $5, $6, $7);
  UPDATE trp_trip SET trp_revision = trp_revision + 1 WHERE trp_id = $3;
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
