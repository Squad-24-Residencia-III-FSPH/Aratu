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
   expresso em **uma** coluna de estado (`<pre>_state`) com valores controlados em inglês (`UPPER_SNAKE_CASE`) via constraint `CHECK`.
3. **Tipo é regra de negócio.** Hodômetro, identificação de veículo, login, papéis e estados
   não são simples strings ou inteiros genéricos: são tipos de domínio. Use constraints
   declarativas no banco e types/enums em inglês no TypeScript.
4. **Histórico e auditoria:**
   - Datas de eventos operacionais reais (`trp_planned_departure`, `tre_occurred_at`, `fve_occurred_at`)
     são dados de domínio; não confunda com `<pre>_created_at` / `<pre>_registered_at` (carimbos de inserção técnica).
   - O que muda com o tempo (versão de solicitação, eventos de viagem, eventos de atendimento) exige registro histórico
     e controle de revisão (`<pre>_revision`).

---

## Tratamento de Nulos

- **O nulo não diz por que falta.** Se uma coluna é anulável, o motivo deve ser único
  (ex: `trp_planned_end` é nulo quando o término ainda não foi estimado). Se puder faltar
  por motivos diferentes, separe em campos explícitos ou estados de domínio.
- **Medida numérica não informada é nula, não zero.** Zero distorce médias de
  consumo de combustível e contagens de quilometragem (`tre_odometer`).
- **Armadilhas do nulo no SQL:**
  - `col <> 'ACTIVE'` descarta as linhas onde `col` é nula;
  - `UNIQUE` no PostgreSQL permite múltiplos nulos (salvo com `UNIQUE NULLS NOT DISTINCT` a partir do PG 15);
  - Funções de agregação como `SUM()` e `AVG()` ignoram nulos.

---

## Concorrência: Ler, Decidir, Gravar

**O risco clássico no Aratu:** duas requisições simultâneas tentam alocar a mesma viatura
ou o mesmo motorista para o mesmo horário, ou alterar a mesma solicitação.

No PostgreSQL, previna nesta ordem:

1. **Transação com trava explícita (`SELECT ... FOR UPDATE`) e controle de revisão (`<pre>_revision`):**
   Ao avaliar a disponibilidade ou atualizar estado dentro de uma transação no `pg`:
   ```sql
   BEGIN;
   SELECT trp_id AS id, trp_state AS state, trp_revision AS revision
     FROM trp_trip
    WHERE trp_id = $1
      FOR UPDATE;
   -- Valida se o estado aceita alocação e se a revisão confere
   INSERT INTO ral_request_allocation (req_id, rqv_id, trp_id, usr_id, ral_actor_snapshot, ral_reason, ral_snapshot)
   VALUES ($1, $2, $3, $4, $5, $6, $7);
   UPDATE trp_trip SET trp_revision = trp_revision + 1 WHERE trp_id = $3;
   COMMIT;
   ```
2. **Restrições de chave única parcial ou exclusão:**
   Quando a regra puder ser garantida declarativamente pelo PostgreSQL (ex: um mesmo veículo
   não pode ter duas viagens `'IN_PROGRESS'` simultâneas), utilize unique index parcial:
   ```sql
   CREATE UNIQUE INDEX trp_vehicle_in_progress ON trp_trip (veh_id) WHERE trp_state = 'IN_PROGRESS';
   ```
3. **Transação curta e atômica:**
   Nunca coloque chamadas a APIs externas, envio de e-mails ou processamento pesado dentro
   da transação do banco. A transação deve ser aberta, executar os comandos SQL e fazer commit
   no menor tempo possível para evitar retenção de locks.

---

## Aratu — convenções e práticas no PostgreSQL 18 (Padrão `modelo.sql` em Inglês)

O banco de dados oficial do projeto é o **PostgreSQL 18** (imagem Docker `postgres:18-alpine`).

### 1. Migrações e DDL Transacional
- O PostgreSQL suporta DDL transacional: comandos como `CREATE TABLE`, `ALTER TABLE` e
  `ADD COLUMN` rodam dentro de transações (`BEGIN; ... COMMIT;`). Se uma instrução falhar,
  a migração inteira sofre rollback de forma limpa.

### 2. Nomenclatura Padrão (Prefixo de 3 Letras em Inglês)
- **Tabelas:** `<pre>_<singular_entity>` em `snake_case` singular com prefixo único de 3 letras (`sec_sector`, `usr_user`, `srv_service`, `veh_vehicle`, `drv_driver`, `vhs_vehicle_service`, `aud_audit`, `apo_approval_policy`, `ape_policy_event`, `req_request`, `rqv_request_version`, `rqe_request_event`, `trp_trip`, `tre_trip_event`, `ral_request_allocation`, `fve_fulfillment_event`, `rte_round_trip_event`, `par_system_parameter`, `mnt_maintenance`).
- **Chave Primária na Tabela e no `SELECT`:**
  - Na tabela (`CREATE TABLE`): `<pre>_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (ex: `veh_id`, `drv_id`, `trp_id`, `req_id`, `usr_id`).
  - No `SELECT` do Repository: projeta-se `<pre>_id AS id` e remove-se o prefixo das demais colunas via alias `camelCase` (`veh_identification AS identification`, `trp_planned_departure AS "plannedDeparture"`).
- **Colunas Próprias:** iniciam sempre pelo prefixo de 3 letras da própria tabela (`<pre>_<column_name>`, ex: `veh_identification`, `veh_seats`, `veh_active`, `veh_revision`).
- **Chaves Estrangeiras:** mantêm o nome exato da PK da tabela referenciada `<ref_pre>_id` sem o prefixo da tabela filha (ex: `veh_id`, `drv_id`, `usr_id`), ou `<ref_pre>_id_<role>` quando houver múltiplas FKs para a mesma tabela (ex: `usr_id_requester`, `req_id_outbound`, `req_id_return`).
- **Objetos Auxiliares (sem `idx_`, `uq_`, `trg_`, `fn_`):**
  - **Índices e Unique Indexes:** iniciam diretamente com o prefixo de 3 letras da tabela `<pre>_<descriptive_name>` (ex: `rqe_unique_decision`, `trp_vehicle_in_progress`, `ral_by_request`, `aud_by_table`).
  - **Triggers e Funções:** nomes em inglês sem `trg_` ou `fn_` (triggers: `preserve`, `prevent_delete`, `audit`; funções internas: `_barrier()`, `_actor()`, `_audit()`, `_validate_trip()`; funções públicas: `save_sector()`, `create_trip()`, `allocate_request()`).
  - **Views:** `vw_<descriptive_name_in_english>` (ex: `vw_active_allocations`, `vw_round_trip_pairs`, `vw_active_policies`).
- **Campos Booleanos:** tipo nativo `boolean NOT NULL DEFAULT true / false`.
- **Campos Temporais:** `timestamptz` para instantes no tempo com fuso horário (`clock_timestamp()`).

### 3. Proteção e Sigilo de Dados (LGPD e SVO)
- O Serviço de Verificação de Óbito (SVO) trata dados extremamente delicados (registros
  de falecidos, declarações de óbito, dados de familiares). A gestão de frota trata dados
  de motoristas e servidores.
- **Proibição absoluta:** É terminantemente proibido inserir dados reais em migrações,
  scripts de seed, testes, fixtures ou commits. Utilize exclusivamente dados fictícios e
  geradores de dados sintéticos.
