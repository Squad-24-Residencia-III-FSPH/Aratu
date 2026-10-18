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
