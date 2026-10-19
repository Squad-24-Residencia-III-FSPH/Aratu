# Padrões de Implementação Backend — Sistema Aratu

Este documento descreve as diretrizes práticas para implementação no **Backend** do **Sistema Aratu** (**Node.js, Express 5, TypeScript e PostgreSQL 18 via driver `pg`**).

---

## 1. Separação de Responsabilidades por Camada

| Camada | Localização | O que faz | O que é proibido |
|---|---|---|---|
| **Routes** | `backend/src/routes/` | Registra endpoints REST em inglês (`/api/vehicles`, `/api/trips`), associa middlewares de autenticação/RBAC e delega ao Controller | Conter lógica de validação, regras de domínio ou SQL |
| **Controllers** | `backend/src/controllers/` | Lê `req.params`, `req.query` e `req.body`, chama o Service e formata a resposta HTTP (`res.status().json()`) | Acessar o banco ou implementar regras de negócio |
| **Services** | `backend/src/services/` | Executa regras de negócio puras em inglês (`allocateRequest()`, `createTrip()`, validação de capacidade e fluxos do SVO) | Importar `Request`/`Response` do Express ou montar SQL cru |
| **Repositories** | `backend/src/repositories/` | Executa queries parametrizadas (`$1, $2`) no PostgreSQL 18 em Schemas Nativos (`auth`, `audit`, `fleet`, `trip`, `svo`) via `pg.Pool` ou `PoolClient` | Tomar decisões de negócio ou retornar status HTTP |
| **Middlewares** | `backend/src/middlewares/` | Autenticação, verificação de perfil RBAC, validação de schema de entrada e handler global de erros | Conter fluxos completos de domínio |
| **Types** | `backend/src/types/` | Interfaces, DTOs, union types em inglês (`UPPER_SNAKE_CASE`) e constantes de domínio | Conter lógica executável |

---

## 2. Acesso a Dados e Transações no PostgreSQL 18 (`pg`)

### 2.1 Regras obrigatórias em consultas SQL

1. **Parâmetros posicionais (`$1, $2, ...`) sempre:** nunca concatene nem interpole variáveis dentro da string SQL.
2. **Proibido `SELECT *` e Schemas Nativos:** declare explicitamente as tabelas qualificadas no schema no plural (ex: `trip.trips`, `fleet.vehicles`) e as colunas retornadas, convertendo campos `snake_case` para aliases `camelCase` limpos no TypeScript (`license_plate AS "licensePlate"`, `created_at AS "createdAt"`).
3. **Filtro e ordenação no banco:** nunca busque tabelas inteiras para filtrar com `.filter()` ou ordenar com `.sort()` em memória no Node.js.
4. **Prevenção de N+1:** em listagens que exigem dados relacionados (ex: viagens com dados do veículo e motorista), utilize `JOIN` explícito no SQL.

### 2.2 Transações atômicas e controle de concorrência

Operações que alteram múltiplas tabelas ou que **leem, decidem e gravam** (como aprovar uma solicitação, criar viagem e alocar uma viatura, ou despachar uma equipe do SVO) devem rodar dentro de uma transação atômica com trava pessimista (`SELECT ... FOR UPDATE`):

```typescript
import { Pool } from 'pg';

export async function allocateRequestToTripInTransaction(
  pool: Pool,
  requestId: number,
  requestRevision: number,
  tripId: number,
  tripRevision: number,
  userId: number,
  reason: string
): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Trava a linha da solicitação e da viagem para evitar alocação concorrente
    const requestRes = await client.query<{ id: number; state: string; revision: number }>(
      `SELECT id, state, revision
         FROM trip.requests
        WHERE id = $1
          FOR UPDATE;`,
      [requestId]
    );

    const request = requestRes.rows[0];
    if (!request || request.state !== 'APPROVED' || request.revision !== requestRevision) {
      throw new Error('A solicitação selecionada não está aprovada ou sua revisão está desatualizada.');
    }

    const tripRes = await client.query<{ id: number; state: string; revision: number }>(
      `SELECT id, state, revision
         FROM trip.trips
        WHERE id = $1
          FOR UPDATE;`,
      [tripId]
    );

    const trip = tripRes.rows[0];
    if (!trip || !['PLANNED', 'IN_PROGRESS'].includes(trip.state) || trip.revision !== tripRevision) {
      throw new Error('A viagem selecionada não aceita alocação ou sua revisão está desatualizada.');
    }

    // 2. Registra a alocação e incrementa a revisão atomicamente
    const allocationRes = await client.query<{ id: number }>(
      `INSERT INTO trip.allocations (
         request_id, trip_id, user_id, actor_snapshot, reason
       )
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id;`,
      [requestId, tripId, userId, JSON.stringify({ userId }), reason]
    );

    await client.query(
      `UPDATE trip.requests
          SET revision = revision + 1
        WHERE id = $1;`,
      [requestId]
    );

    await client.query(
      `UPDATE trip.trips
          SET revision = revision + 1
        WHERE id = $1;`,
      [tripId]
    );

    await client.query('COMMIT');
    return allocationRes.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Obrigatório: garante devolução da conexão ao pool em qualquer cenário
    client.release();
  }
}
```

---

## 3. Controle de Acesso Baseado em Perfis (RBAC)

A proteção visual de rotas no React **não substitui** a validação de segurança no backend. Todo endpoint restrito deve validar o perfil do usuário autenticado via middleware no Express:

- **Papéis oficiais do domínio (em inglês em `UPPER_SNAKE_CASE`):**
  - `ADMIN` (Administrador)
  - `MANAGER` / `FLEET_MANAGER` (Gestor de Frota / Aprovador)
  - `REQUESTER` (Solicitante de Viagem — FSPH)
  - `OPERATOR` / `SVO_OPERATOR` (Operador de Frota / Equipe SVO)
  - `TRIAGE` (Triagem)
  - `DRIVER` (Motorista)

- **Árvore de decisão de comportamento:**
  1. Se a diferença de comportamento depende do dado da entidade (`req_category`, `req_state`, `sec_id`, `srv_id`), condicione pelo dado no `Service`.
  2. Se a diferença é sobre *quem* tem permissão para executar a ação, aplique o middleware de RBAC na rota.
  3. Não crie feature flags sem solicitação explícita do usuário.

---

## 4. Contratos HTTP e Mensagens de Erro

As respostas de erro originadas no backend são lidas por pessoas na interface e devem respeitar a acessibilidade e a clareza operacional:

- Utilize códigos de status HTTP semânticos:
  - `200 OK` / `201 Created` / `204 No Content`
  - `400 Bad Request` (formato de entrada inválido)
  - `401 Unauthorized` (não autenticado / sessão expirada)
  - `403 Forbidden` (perfil RBAC sem permissão para a operação)
  - `404 Not Found` (recurso não encontrado)
  - `409 Conflict` (conflito de estado, revisão ou concorrência, ex: veículo já alocado no horário)
  - `422 Unprocessable Entity` (violação de regra de negócio)
- **Mensagens orientadoras:** nunca exponha stack traces ou erros internos do PostgreSQL na resposta JSON. Retorne uma mensagem em português claro dizendo o que ocorreu e como o usuário pode resolver.

---

## 5. Parametrização Dinâmica e Escalabilidade

- **Regras Operacionais Editáveis (`par_system_parameter`):** Prazos de antecedência de viagem, tolerâncias de quilometragem e limites de permanência do SVO devem ser obtidos dinamicamente via `SystemParameterService` (com cache em memória e invalidação) em vez de hardcoded no código.
- **Diretrizes Completas:** Consulte a modelagem da tabela, estratégia de cache e o roteiro de extensibilidade em:
  👉 **[`docs/manuais/escalabilidade-extensibilidade.md`](escalabilidade-extensibilidade.md)**

---

## 6. Padrões de Projeto (Design Patterns)

A camada backend adota formalmente os padrões **Repository**, **State Pattern (FSM)**, **Strategy** e **Chain of Responsibility**. Consulte o catálogo completo com exemplos práticos de código em:
👉 **[`docs/manuais/padroes-projeto.md`](padroes-projeto.md)**

---

## 7. Testes Automatizados e Banco de Dados Isolado (FROTA-161)

O backend do Aratu adota uma estratégia leve e rápida de testes automatizados com execução direta em TypeScript:

1. **Test Runner Nativo e Assertivas Estritas:**
   - Execução via `node:test` e `node:assert/strict` gerenciada pelo `tsx --test`.
   - Elimina dependências externas pesadas (Jest/Mocha), mantendo tempo de execução inferior a 5 segundos.
2. **Isolamento de Banco de Dados (`aratu_test`):**
   - Os testes de integração conectam exclusivamente a um banco de dados dedicado (`POSTGRES_DB_TEST=aratu_test` ou `DATABASE_URL_TEST`), nunca tocando na base de desenvolvimento (`meubanco`) ou de produção.
   - O helper `backend/tests/helpers/db-test.ts` provisiona o banco e gerencia conexões via singleton `Pool`, garantindo encerramento limpo (`closeTestPool()`) no hook `after()`.
3. **Migrações Dinâmicas e Idempotentes:**
   - O utilitário `DatabaseMigrator` (`backend/src/database/migrator.ts`) descobre todos os arquivos `*.sql` em `src/database/migrations/` e os aplica ordenadamente dentro de transações atômicas `BEGIN ... COMMIT / ROLLBACK`, registrando versões na tabela `schema_migrations`.
4. **Limpeza Dinâmica entre Testes:**
   - A função `truncateTestDatabase()` esvazia tabelas de domínio via `TRUNCATE ... RESTART IDENTITY CASCADE` baseada no `information_schema.tables`, preservando a tabela de controle `schema_migrations` para velocidade e isolamento absoluto entre casos de teste.
5. **Comandos Operacionais Padronizados no `package.json`:**
   - `npm test`: Executa toda a suíte (testes unitários e de integração);
   - `npm run test:unit`: Executa testes unitários isolados em memória;
   - `npm run test:integration`: Executa testes de integração com banco PostgreSQL 18 real;
   - `npm run test:db:setup`: Provisiona o banco de testes e executa migrações de forma avulsa via linha de comando.
6. **Conformidade com LGPD e Sigilo SVO:**
   - Fixtures e testes utilizam exclusivamente dados sintéticos e e-mails fictícios (`@example.test`), sendo estritamente proibido transcrever dados reais de servidores, motoristas ou óbitos.

---

## 8. Ciclo de Vida do Banco de Dados: Migrações e Seeds (`db:migrate` e `db:seed`)

O Sistema Aratu adota uma separação rigorosa de responsabilidades entre alterações de schema/catálogo e provisionamento operacional de contas:

### 8.1 Migrações e Dados de Catálogo (`npm run db:migrate`)
- **Arquivo Orquestrador:** `backend/src/database/scripts/migrate.ts` invocando `DatabaseMigrator`.
- **Escopo Exclusivo:**
  - Definição DDL (schemas nativos `auth`, `audit`, `fleet`, `trip`, `svo`, tabelas, constraints e índices);
  - **Dados de Catálogo Estruturais (Lookups):** Os 6 perfis RBAC canônicos (`ADMINISTRADOR`, `GESTOR`, `SOLICITANTE`, `MOTORISTA`, `ATENDENTE_SVO`, `EQUIPE_SVO`), as permissões do sistema e suas associações N:N são provisionados diretamente nas migrações SQL (`INSERT ... ON CONFLICT DO NOTHING`).
- **Segurança e Idempotência:**
  - Cada arquivo de migração roda em transação atômica (`BEGIN ... COMMIT`);
  - Toda migração aplicada é registrada na tabela `schema_migrations`;
  - Seguro para rodar automaticamente na inicialização de containers e pipelines de CI/CD.

### 8.2 Bootstrap Operacional de Ambiente (`npm run db:seed`)
- **Arquivo Orquestrador:** `backend/src/database/scripts/seed.ts`.
- **Escopo Exclusivo:**
  - Criação do primeiro usuário `ADMINISTRADOR` do sistema quando a base de dados acabou de ser provisionada.
- **Configuração via Variáveis de Ambiente:**
  - `INITIAL_ADMIN_EMAIL`: E-mail normalizado do primeiro Administrador (ex: `admin@aratu.fsph.se.gov.br`).
  - `INITIAL_ADMIN_PASSWORD`: Senha forte para o Administrador.
  - `INITIAL_ADMIN_NAME`: Nome de exibição institucional (opcional, padrão: `Administrador do Sistema`).
- **Padrões Mandatórios de Segurança:**
  1. **Auditoria Transacional Obrigatória:** Toda criação do Administrador inicial gera imediatamente e na mesma transação um registro em `audit.logs` (`table = 'auth.users'`, `operation = 'INSERT'`, `reason = 'BOOTSTRAP_INITIAL_ADMIN'`), garantindo rastreabilidade completa perante a LGPD.
  2. **Bloqueio em Produção:** Se `NODE_ENV === 'production'`, o script aborta a execução se `INITIAL_ADMIN_PASSWORD` contiver o placeholder do template (`replace-with-a-strong-password`) ou possuir menos de 8 caracteres.
  3. **Idempotência Segura:** Se a conta já existir na base, o script não altera sua senha ou perfil, emitindo apenas confirmação de existência.
  4. **Troca Obrigatória:** Em ambientes operacionais reais, a senha inicial deve ser alterada no primeiro acesso do Administrador.

---

## 9. Modelagem de Histórico, Bi-temporalidade e Preservação de Contexto

No backend do Sistema Aratu, **o passado não é apagado**: consultas operacionais e de auditoria devem ser capazes de reconstruir tanto o estado vigente atual quanto o contexto conhecido pela equipe no instante exato de cada decisão histórica.

### 9.1 Mandato Inegociável de Autoria do Histórico
Toda linha gravada em tabelas de histórico ou eventos operacionais deve identificar explicitamente **qual usuário autenticado realizou a alteração**:
- **`registered_by BIGINT NOT NULL REFERENCES auth.users(id)`:** Chave estrangeira que amarra a autoria à conta do usuário;
- **`actor_snapshot JSONB NOT NULL`:** Snapshot imutável (`{ id, name, email, role }`) do usuário no instante da gravação. Previne que alterações cadastrais posteriores (troca de nome ou perfil) apaguem ou distorçam quem tomou a decisão;
- **`reported_by TEXT NOT NULL`:** Fonte externa ou de campo (ex: *"Motorista em trânsito por telefone"* ou *"Guia nº 402"*).

---

### 9.2 Arquitetura Tripartite de Histórico

#### Padrão A: Entidades Mestres — Estado Atual + Livro de Eventos (SCD Tipo 4)
Para entidades de cadastro contínuo (**Veículos e Condutores**):
- **Tabela Principal (Estado Vigente):** `fleet.vehicles` e `fleet.drivers` contêm os atributos atuais, garantindo que consultas operacionais rotineiras sejam indexadas e rápidas.
- **Tabela de Eventos (Histórico Completo):** `fleet.vehicle_events` e `fleet.driver_events` registram cada mutação confirmada com histórico de antes/depois.

```sql
-- 1. Tabela Principal (Estado Atual)
CREATE TABLE IF NOT EXISTS fleet.vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_plate TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL,
  current_odometer_km INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. Tabela de Histórico de Eventos (SCD Tipo 4)
CREATE TABLE IF NOT EXISTS fleet.vehicle_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles(id),
  event_type TEXT NOT NULL,                  -- 'CAPACITY_CHANGE', 'MAINTENANCE', 'STATUS_CHANGE'
  occurred_at TIMESTAMPTZ NOT NULL,          -- Momento real do fato
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL,                 -- Quem comunicou
  registered_by BIGINT NOT NULL REFERENCES auth.users(id), -- Quem cadastrou
  actor_snapshot JSONB NOT NULL,             -- Snapshot do operador ({ id, name, email, role })
  reason TEXT NOT NULL,                      -- Justificativa da mudança
  evidence_description TEXT,                 -- Canal ou descrição da evidência
  attachment_url TEXT,                       -- Link para foto/documento
  before_state JSONB,                        -- Snapshot do estado antes da mutação
  after_state JSONB NOT NULL,                -- Snapshot do estado após a mutação
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

#### Padrão B: Medições Operacionais — Encadeamento Append-Only (`supersedes_id`)
Para dados de fluxo contínuo onde ocorrem retificações frequentes (**Hodômetros e Abastecimentos**):

```sql
CREATE TABLE IF NOT EXISTS fleet.vehicle_odometer_readings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id BIGINT NOT NULL REFERENCES fleet.vehicles(id),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reported_by TEXT NOT NULL,
  registered_by BIGINT NOT NULL REFERENCES auth.users(id),
  actor_snapshot JSONB NOT NULL,
  reason TEXT,                               -- Obrigatório caso seja retificação
  evidence_description TEXT,
  attachment_url TEXT,                       -- Foto do painel
  supersedes_id BIGINT REFERENCES fleet.vehicle_odometer_readings(id),
  is_annulled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

#### Padrão C: Decisões e Contratos — Snapshot no Ponto de Consumo
Para ações com validade jurídica (**Viagens e Ocorrências do SVO**):
- Viagens (`trip.trips`) congelam em `vehicle_snapshot JSONB` e `driver_snapshot JSONB` a capacidade da viatura e a habilitação do condutor no instante do despacho.
- Paradas de itinerário (`trip.trip_stops`) **nunca recebem `DELETE`**: recebem `status = 'CANCELLED'`, `cancelled_at`, `cancelled_by` e `cancellation_reason`.

---

### 9.3 Coordenação na Camada Service
Mutação que altera uma entidade mestre (ex: alteração de capacidade) deve ser executada pelo `Service` em **uma única transação atômica** (`BEGIN ... COMMIT`):
1. Trava a entidade mestre com `SELECT ... FOR UPDATE`;
2. Atualiza a tabela principal (`UPDATE fleet.vehicles SET capacity = $1, revision = revision + 1 ...`);
3. Insere o registro em `fleet.vehicle_events` contendo `before_state`, `after_state`, `registered_by` e `actor_snapshot` extraídos da sessão autenticada;
4. Faz o `COMMIT` atômico. Se o histórico falhar, a mutação na tabela mestre sofre rollback imediato.



