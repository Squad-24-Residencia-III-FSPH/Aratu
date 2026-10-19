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
4. **Histórico, bi-temporalidade e imutabilidade do passado:**
   - O sistema guarda a história de como cada entidade chegou ao estado atual; **o passado não é apagado**.
   - Datas de eventos operacionais reais (`occurred_at`) são dados de domínio; não confunda com o momento do lançamento no banco (`registered_at` / `created_at`).
   - Consulte e aplique rigorosamente a seção dedicada **Preservação Histórica, Bi-temporalidade e Imutabilidade do Passado** abaixo.

---

## Preservação Histórica, Bi-temporalidade e Imutabilidade do Passado

O Sistema Aratu adota como princípio fundamental que **uma alteração posterior nunca apaga o que aconteceu antes**. As consultas do sistema devem responder a duas perguntas vitais da administração pública e da saúde (FSPH/SVO):
1. **O que sabemos hoje?** (Estado vigente atualizado da entidade);
2. **O que a equipe sabia quando tomou determinada decisão?** (Contexto e evidências vigentes na época do fato).

### 1. As 5 Perguntas Obrigatórias de Cada Acontecimento Operacional
Todo evento operacional confirmado (hodômetros, manutenções, abastecimentos, aprovações, viagens, paradas, afastamentos e ocorrências SVO) deve permitir responder:

| # | Pergunta Essencial | Campo / Estrutura Técnica | Descrição e Requisito |
|---|---|---|---|
| **1** | **O que aconteceu ou mudou?** | `before` / `after` (ou colunas de estado anterior/novo) | Como estava a entidade antes da operação e como ficou após a confirmação. |
| **2** | **Quando aconteceu e quando foi registrado?** | `occurred_at` vs `registered_at` | **Bi-temporalidade:** A data em que o fato ocorreu no mundo real (`occurred_at`) pode ser dias anterior ao momento em que o operador lançou a informação no sistema (`registered_at`). Ambos os carimbos devem ser preservados. |
| **3** | **Quem informou e quem cadastrou?** | `reported_by` vs `registered_by` + `actor_snapshot` | **Autoria obrigatória:** Quem originou o dado no campo (`reported_by`) e **quem autenticou e registrou no sistema (`registered_by` + `actor_snapshot`)**. Proibido evento anônimo. |
| **4** | **Por que houve a mudança?** | `reason` / `justification` | Justificativa obrigatória para decisões de negócio, especialmente em **correções, cancelamentos, anulações e reaberturas excepcionais**. |
| **5** | **Qual é a evidência?** | `evidence_description` / `attachment_url` | Comprovante (foto, anexo, documento assinado) ou, na ausência de arquivo digital, a descrição detalhada do canal e meio pelo qual a informação foi recebida. |

### 2. Mandato Inegociável de Autoria do Histórico (`registered_by` e `actor_snapshot`)
Toda mutação e todo evento persistido no histórico deve identificar com absoluta precisão **qual usuário realizou a alteração**:
- **`registered_by BIGINT NOT NULL REFERENCES auth.users(id)`:** Chave estrangeira obrigatória apontando para a conta de usuário que autenticou a requisição HTTP;
- **`actor_snapshot JSONB NOT NULL`:** Snapshot imutável contendo `{ id, name, email, role }` no instante do registro. Isso impede que alterações cadastrais posteriores no usuário (mudança de nome, troca de perfil ou desativação) apaguem ou distorçam a autoria histórica da ação;
- **Distinção semântica essencial:**
  - `reported_by TEXT NOT NULL`: Fonte da informação fática (ex: *"Condutor João Santos via WhatsApp"*, *"Atendente Maria por telefone"*);
  - `registered_by BIGINT NOT NULL`: Servidor ou operador autenticado que efetivamente abriu o sistema e gravou o lançamento.

### 3. Arquitetura Tripartite de Histórico no Sistema Aratu
A preservação histórica é implementada combinando três padrões complementares de acordo com a natureza da entidade:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      ARQUITETURA TRIPARTITE DE HISTÓRICO NO ARATU                      │
├────────────────────────────┬──────────────────────────────────┬────────────────────────┤
│ Padrão de Modelagem        │ Estrutura no PostgreSQL 18       │ Aplicação no Domínio   │
├────────────────────────────┼──────────────────────────────────┼────────────────────────┤
│ A. Estado Atual + Eventos  │ Tabela Principal (rápida) +      │ Entidades Mestres      │
│    (SCD Tipo 4)            │ Tabela de Eventos com FK         │ (fleet.vehicles,       │
│                            │ (vehicle_events, driver_events)  │  fleet.drivers)        │
├────────────────────────────┼──────────────────────────────────┼────────────────────────┤
│ B. Encadeamento Append-Only│ Linhas imutáveis com encadeamento│ Medições Operacionais  │
│    com Retificação         │ via supersedes_id e justificativa│ (odometer_readings,    │
│                            │ (sem DELETE físico)              │  fuel_logs)            │
├────────────────────────────┼──────────────────────────────────┼────────────────────────┤
│ C. Snapshot no Ponto       │ Payload JSONB ou colunas estáticas│ Decisões e Contratos   │
│    de Consumo              │ congelando contexto da época     │ (trip.trips,           │
│                            │ (vehicle_snapshot, driver_snap)  │  svo.occurrences)      │
└────────────────────────────┴──────────────────────────────────┴────────────────────────┘
```

#### A. Entidades Mestres: Estado Atual + Tabela de Eventos (`fleet.vehicles` + `fleet.vehicle_events`)
- `fleet.vehicles` armazena o estado vigente (placa, capacidade atual, status, quilometragem atual). As consultas operacionais cotidianas são ultrarrápidas (`SELECT * FROM fleet.vehicles WHERE is_active = true`);
- `fleet.vehicle_events` armazena cada mutação ocorrida desde o cadastro (mudança de capacidade, manutenções, transferências de lotação), associada por `vehicle_id` e contendo `occurred_at`, `registered_at`, `registered_by`, `actor_snapshot`, `before_state`, `after_state` e `reason`.
- O mesmo vale para condutores (`fleet.drivers` + `fleet.driver_events`), registrando contratos anteriores, renovações de CNH, férias, afastamentos e períodos de atividade.

#### B. Medições e Fatos Diários: Encadeamento de Retificações (`supersedes_id`)
- Registros como hodômetro ou abastecimento são fatos contínuos.
- Se João informou 52.000 km por engano e depois enviou foto mostrando 51.200 km:
  1. O registro original de 52.000 km permanece gravado (`id = 101`);
  2. A retificação gera um novo registro (`id = 102`) com 51.200 km, `supersedes_id = 101`, `reason = 'Condutor digitou 52.000 por engano'`, `evidence_description = 'Foto do painel'`, `registered_by` e `actor_snapshot` de Ana (operadora que corrigiu);
  3. A consulta de quilometragem vigente lê o registro retificador, mas a auditoria preserva o lançamento original intacto.

#### C. Decisões e Contratos: Snapshot de Contexto no Ponto de Consumo
- Viagens (`trip.trips`) e atendimentos SVO (`svo.occurrences`) congelam o contexto fático no momento do despacho:
  - Armazenam `vehicle_snapshot JSONB NOT NULL` e `driver_snapshot JSONB NOT NULL` com os dados daquele instante;
  - Se a van mudar de capacidade no futuro ou o motorista for desligado, a viagem passada mantém fidelidade absoluta ao momento em que foi realizada.

### 4. Ciclo de Vida de Viagens e Paradas
- **Cancelamento de paradas:** Cancelar uma parada em uma viagem em andamento **não apaga a parada do banco** nem desfaz os atendimentos ou coletas já concluídos nela. A parada é marcada como cancelada (`cancelled_at`, `cancelled_by`, `cancellation_reason`), permanecendo visível no itinerário auditável.
- **Reabertura excepcional de viagens:** Se uma viagem já encerrada precisar ser reaberta por exceção administrativa, o registro do encerramento anterior é preservado na linha do tempo, exigindo justificativa obrigatória e registro do responsável pela reabertura.

### 5. Escopo e Delimitação
- Este princípio aplica-se a **acontecimentos confirmados, submissões e mudanças relevantes** da operação e da administração.
- **Não se aplica a:** digitação em tempo real, toques de teclado ou rascunhos locais que ainda não foram submetidos pelo usuário.

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
