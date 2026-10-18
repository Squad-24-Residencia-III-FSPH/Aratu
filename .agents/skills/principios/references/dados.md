# Dados — modelagem e PostgreSQL 18

Material de consulta dos princípios 3 (compatibilidade) e 4 (idempotência e
atomicidade) da skill `principios`. Leia quando a tarefa criar ou alterar
tabela, coluna, índice ou migration, escrever consulta que **lê, decide e
grava**, ou implementar rotinas de alocação e processamento em lote no sistema Aratu.

A primeira parte reúne as diretrizes fundamentais de modelagem relacional.
A segunda é específica do **PostgreSQL 18** no ecossistema do Aratu.

---

## Antes de criar tabela ou coluna

1. **Escreva a frase da linha.** "Uma linha desta tabela registra que a solicitação S
   foi alocada para a viagem V na versão X pelo usuário U." Se não sai
   uma frase clara, a tabela mistura dois grãos distintos. Um significado por tabela
   (Date 9.6; Kimball p.39).
2. **Uma informação, um lugar.** Evite flags paralelas que possam se contradizer
   (ex: `IN_PROGRESS` e `PLANNED` simultâneos). O estado do ciclo de vida deve ser
   expresso em **uma** coluna de estado (`status` ou `state`) com valores controlados em inglês (`UPPER_SNAKE_CASE`) via constraint `CHECK`.
3. **Tipo é regra de negócio.** Hodômetro, identificação de veículo, login, papéis e estados
   não são simples strings ou inteiros genéricos: são tipos de domínio. Use constraints
   declarativas no banco e types/enums em inglês no TypeScript.
4. **Histórico e auditoria:**
   - Datas de eventos operacionais reais (`planned_departure`, `occurred_at`)
     são dados de domínio; não confunda com `created_at` / `registered_at` (carimbos de inserção técnica).
   - O que muda com o tempo (versão de solicitação, eventos de viagem, eventos de atendimento) exige registro histórico
     e controle de revisão (`revision`).

---

## Tratamento de Nulos

- **O nulo não diz por que falta.** Se uma coluna é anulável, o motivo deve ser único
  (ex: `planned_end` é nulo quando o término ainda não foi estimado). Se puder faltar
  por motivos diferentes, separe em campos explícitos ou estados de domínio.
- **Medida numérica não informada é nula, não zero.** Zero distorce médias de
  consumo de combustível e contagens de quilometragem (`odometer`).
- **Armadilhas do nulo no SQL:**
  - `col <> 'ACTIVE'` descarta as linhas onde `col` é nula;
  - `UNIQUE` no PostgreSQL permite múltiplos nulos (salvo com `UNIQUE NULLS NOT DISTINCT` a partir do PG 15);
  - Funções de agregação como `SUM()` e `AVG()` ignoram nulos.

---

## Concorrência: Ler, Decidir, Gravar

**O risco clássico no Aratu:** duas requisições simultâneas tentam alocar a mesma viatura
ou o mesmo motorista para o mesmo horário, ou alterar a mesma solicitação.

No PostgreSQL, previna nesta ordem:

1. **Transação com trava explícita (`SELECT ... FOR UPDATE`) e controle de revisão (`revision`):**
   Ao avaliar a disponibilidade ou atualizar estado dentro de uma transação no `pg`:
   ```sql
   BEGIN;
   SELECT id, state, revision
     FROM trip.trips
    WHERE id = $1
      FOR UPDATE;
   -- Valida se o estado aceita alocação e se a revisão confere
   INSERT INTO trip.allocations (request_id, trip_id, user_id, actor_snapshot, reason)
   VALUES ($1, $2, $3, $4, $5);
   UPDATE trip.trips SET revision = revision + 1 WHERE id = $2;
   COMMIT;
   ```
2. **Restrições de chave única parcial ou exclusão:**
   Quando a regra puder ser garantida declarativamente pelo PostgreSQL (ex: um mesmo veículo
   não pode ter duas viagens `'IN_PROGRESS'` simultâneas), utilize unique index parcial:
   ```sql
   CREATE UNIQUE INDEX trip_trips_vehicle_in_progress_unique ON trip.trips (vehicle_id) WHERE state = 'IN_PROGRESS';
   ```
3. **Transação curta e atômica:**
   Nunca coloque chamadas a APIs externas, envio de e-mails ou processamento pesado dentro
   da transação do banco. A transação deve ser aberta, executar os comandos SQL e fazer commit
   no menor tempo possível para evitar retenção de locks.

---

## Aratu — convenções e práticas no PostgreSQL 18 (Schemas Nativos de Domínio)

O banco de dados oficial do projeto é o **PostgreSQL 18** (imagem Docker `postgres:18-alpine`), organizado em **Schemas Nativos de Domínio** em inglês.

### 1. Migrações e DDL Transacional
- O PostgreSQL suporta DDL transacional: comandos como `CREATE SCHEMA`, `CREATE TABLE`, `ALTER TABLE` e
  `ADD COLUMN` rodam dentro de transações (`BEGIN; ... COMMIT;`). Se uma instrução falhar,
  a migração inteira sofre rollback de forma limpa.

### 2. Schemas de Domínio e Nomenclatura
O banco é particionado em 5 schemas de negócio correspondentes aos módulos do Aratu:
- **`auth`**: Autenticação, controle de sessão e usuários (`auth.users`, `auth.sessions`, `auth.sectors`, `auth.system_parameters`).
- **`audit`**: Trilha de auditoria transversal e imutável (`audit.logs`).
- **`fleet`**: Gestão de veículos, condutores e manutenções (`fleet.vehicles`, `fleet.drivers`, `fleet.services`, `fleet.vehicle_services`, `fleet.maintenance_orders`).
- **`trip`**: Solicitações de transporte institucional FSPH, aprovações e viagens (`trip.requests`, `trip.trips`, `trip.allocations`, `trip.approval_policies`).
- **`svo`**: Operações de verificação de óbito, remoções e laudos (`svo.occurrences`, `svo.custody_records`, `svo.release_orders`).

#### Regras de Nomenclatura:
- **Tabelas:** `<schema>.<plural_entity>` em `snake_case` **no plural** (ex: `auth.users`, `audit.logs`, `fleet.vehicles`, `fleet.drivers`, `trip.trips`, `trip.requests`, `svo.occurrences`). O uso do plural evita colisões com palavras reservadas do SQL (`USER`, `ORDER`, `GROUP`) e representa a coleção de registros. Proibido usar prefixos húngaros nas tabelas ou colunas.
- **Chave Primária (PK):**
  - Sempre `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` em todas as tabelas.
  - No `SELECT` do Repository, projeta-se diretamente `id` (ou `id AS "userId"` em JOINs compostos), sem necessidade de aliases redundantes.
- **Colunas Próprias:** nomes substantivos limpos em inglês `snake_case` (ex: `name`, `email`, `password_hash`, `role`, `active` / `is_active`, `license_plate`, `capacity`, `revision`, `created_at`).
- **Chaves Estrangeiras (FK):** seguem `<entity>_id` **no singular** referenciando a tabela de origem (ex: `user_id BIGINT REFERENCES auth.users(id)`, `vehicle_id BIGINT REFERENCES fleet.vehicles(id)`). Quando houver múltiplas referências à mesma entidade, adicione o papel semântico: `user_id_requester`, `user_id_manager`.
- **Índices e Constraints:**
  - Índices únicos e de busca: `<schema>_<table>_<purpose>` (ex: `auth_users_email_lower_unique ON auth.users(lower(email))`, `audit_logs_by_user ON audit.logs(user_id)`).
- **Campos Booleanos:** tipo nativo `boolean NOT NULL DEFAULT true / false` com prefixo `is_` ou `has_` (ex: `is_active`, `requires_triage`).
- **Campos Temporais:** `timestamptz` para instantes no tempo com fuso horário (`clock_timestamp()`).

### 3. Proteção e Sigilo de Dados (LGPD e SVO)
- O Serviço de Verificação de Óbito (SVO) trata dados extremamente delicados (registros
  de falecidos, declarações de óbito, dados de familiares). A gestão de frota trata dados
  de motoristas e servidores.
- **Proibição absoluta:** É terminantemente proibido inserir dados reais em migrações,
  scripts de seed, testes, fixtures ou commits. Utilize exclusivamente dados fictícios e
  geradores de dados sintéticos.
