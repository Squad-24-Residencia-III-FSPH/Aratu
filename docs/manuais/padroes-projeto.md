# Padrões de Projeto (Design Patterns) — Sistema Aratu

Este documento estabelece o catálogo canônico de **Padrões de Projeto (Design Patterns)** adotados no **Aratu — Sistema de Gestão de Frota e Operações (Squad 24 — FSPH & SVO)**.

O objetivo deste guia é fornecer consistência arquitetural, desacoplamento e testabilidade em todo o ciclo de vida do software, aplicando **SOLID**, **DRY**, **KISS** e **YAGNI** sem complexidade acidental.

---

## 1. Matriz Canônica de Padrões por Camada

| Camada do Sistema | Padrão Principal | Nome em Inglês | Papel e Responsabilidade no Sistema Aratu |
|---|---|---|---|
| **Arquitetura Geral** | Arquitetura em Camadas + Inversão Leve | *Layered Architecture + Dependency Inversion* | Separação estrita em pipeline unidirecional: `Routes` → `Controllers` → `Services` → `Repositories`. |
| **Persistência / Dados** | Repositório | *Repository Pattern* | Encapsulamento de queries SQL parametrizadas (`$1, $2`) em Schemas Nativos (`auth`, `audit`, `fleet`, `trip`, `svo`), isolamento do `pg.Pool` e transações atômicas com `SELECT ... FOR UPDATE`. |
| **Negócio / Domínio** | Máquina de Estados / Estado | *State Pattern (FSM)* | Controle do ciclo de vida imutável de solicitações e viagens, bloqueando transições ilegais em tempo de compilação e execução. |
| **Algoritmos Variáveis** | Estratégia | *Strategy Pattern* | Variação dinâmica de algoritmos sem acoplamento nem `switch/case` extensos (ex: exportadores de relatórios em CSV, PDF e XLSX). |
| **Segurança e HTTP** | Cadeia de Responsabilidade | *Chain of Responsibility* | Pipeline modular de middlewares Express 5: validação de token JWT → autorização RBAC → validação de schema → controller → tratamento global de erro. |
| **Interface (React 19 + MUI)** | Hooks Customizados + Componentes Compostos | *Custom Hooks + Compound Components* | Desacoplamento de efeitos assíncronos e I/O de rede (Hooks) e composição semântica sobre Material UI (`@mui/material`) com tema unificado (`theme.ts`) e estado compartilhado (WCAG 2.2 AA). |

---

## 2. Arquitetura em Camadas com Inversão de Dependência Leve (*Layered Architecture*)

### 2.1 Princípio e Fluxo Unidirecional
No Aratu, a dependência aponta sempre para o centro (domínio). O fluxo de uma requisição segue rigorosamente uma única direção:

```
[Cliente HTTP / React]
         │
         ▼
[1. Routes]        (Declara endpoint em inglês, métodos e encadeia middlewares de autorização)
         │
         ▼
[2. Controllers]   (Extrai params/body, valida tipos de borda, invoca Service, responde HTTP JSON)
         │
         ▼
[3. Services]      (Regras puras de negócio, invariantes, cálculos, sem Express/HTTP)
         │
         ▼
[4. Repositories]  (Consultas SQL parametrizadas em Schemas Nativos do PostgreSQL 18: auth, fleet, trip, etc.)
         │
         ▼
[PostgreSQL 18]
```

### 2.2 Regras de Ouro
1. **O `Service` é agnóstico de protocolo:** nunca importa `Request`, `Response` ou `NextFunction` do Express. Se for necessário simular um objeto HTTP para testar um `Service`, a regra está na camada errada.
2. **Injeção de dependência leve via construtor ou fábrica:** o `Service` recebe sua instância de repositório via construtor ou parâmetro opcional, facilitando a substituição por mocks em testes unitários sem a necessidade de frameworks pesados de DI.

### 2.3 Exemplo Prático (TypeScript / Express 5)

```typescript
// backend/src/services/request.service.ts
import { IRequestRepository } from '../types/request.types';
import { RequestRepository } from '../repositories/request.repository';

export class RequestService {
  constructor(
    private readonly repository: IRequestRepository = new RequestRepository()
  ) {}

  /**
   * Aprova uma solicitação de transporte enviada, incrementando sua revisão.
   */
  public async approveRequest(id: number, managerId: number, reason: string): Promise<void> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new Error('Solicitação de transporte não encontrada.');
    }

    if (request.state !== 'SUBMITTED') {
      throw new Error(`Não é possível aprovar solicitação no estado "${request.state}".`);
    }

    await this.repository.updateState(id, 'APPROVED', managerId, reason);
  }
}
```

---

## 3. Padrão Repositório (*Repository Pattern*)

### 3.1 Propósito no Aratu
O padrão Repositório atua como uma coleção em memória de entidades de domínio, mediando a comunicação entre a camada de negócio (`Services`) e o mecanismo de persistência (`PostgreSQL 18` com driver `pg`).

### 3.2 Diretrizes Mandatórias
- **Zero SQL fora de `repositories/`:** é terminantemente proibido executar consultas SQL dentro de controllers, middlewares ou services.
- **Consultas parametrizadas:** nunca concatenar variáveis em strings SQL. Utilize sempre parâmetros posicionais (`$1, $2`).
- **Projeções explícitas e Schemas Nativos:** proibido o uso de `SELECT *`. Toda consulta referencia `<schema>.<plural_entity>` (ex: `trip.trips`, `fleet.vehicles`) com projeção de colunas limpas, mapeando campos snake_case para `camelCase` no TypeScript.
- **Gerenciamento de transações:** o repositório deve suportar tanto o pool compartilhado (`pg.Pool`) quanto um cliente transacional dedicado (`pg.PoolClient`) para operações atômicas com `SELECT ... FOR UPDATE`.

### 3.3 Exemplo Prático

```typescript
// backend/src/repositories/trip.repository.ts
import { Pool, PoolClient } from 'pg';
import { pool } from '../database/connection';
import { Trip, ITripRepository, TripState } from '../types/trip.types';

export class TripRepository implements ITripRepository {
  constructor(private readonly db: Pool = pool) {}

  public async findById(id: string, client?: PoolClient): Promise<Trip | null> {
    const executor = client ?? this.db;
    const query = `
      SELECT id,
             vehicle_id AS "vehicleId",
             driver_id AS "driverId",
             planned_departure AS "plannedDeparture",
             planned_end AS "plannedEnd",
             state,
             revision,
             created_at AS "createdAt"
        FROM trip.trips
       WHERE id = $1
       LIMIT 1;
    `;
    const { rows } = await executor.query<Trip>(query, [id]);
    return rows[0] ?? null;
  }

  public async findByIdForUpdate(id: string, client: PoolClient): Promise<Trip | null> {
    const query = `
      SELECT id,
             vehicle_id AS "vehicleId",
             driver_id AS "driverId",
             state,
             revision
        FROM trip.trips
       WHERE id = $1
         FOR UPDATE;
    `;
    const { rows } = await client.query<Trip>(query, [id]);
    return rows[0] ?? null;
  }

  public async updateState(id: string, state: TripState, client?: PoolClient): Promise<void> {
    const executor = client ?? this.db;
    const query = `
      UPDATE trip.trips
         SET state = $2,
             revision = revision + 1
       WHERE id = $1;
    `;
    await executor.query(query, [id, state]);
  }
}
```

---

## 4. Padrão Estado / Máquina de Estados Finitos (*State Pattern / FSM*)

### 4.1 Propósito no Aratu
O Aratu gerencia fluxos operacionais críticos (solicitações de transporte da FSPH e atendimento do SVO). Esses fluxos possuem ciclos de vida estritos que **nunca podem sofrer transições arbitrárias** ou inconsistentes.

### 4.2 Grafo de Transições Válidas

#### Ciclo de Vida da Viagem (`trip.trips`):
```
[PLANNED] ────► [IN_PROGRESS] ────► [COMPLETED]
    │                 │
    ▼                 ▼
[CANCELED]       [CANCELED]
```

### 4.3 Implementação Tipada e Imutável

```typescript
// backend/src/types/trip-state.types.ts
export type TripState =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';

/**
 * Matriz estrita de transições válidas no domínio de Viagens do Aratu.
 */
export const ALLOWED_TRIP_TRANSITIONS: Record<TripState, readonly TripState[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
} as const;

export class InvalidTransitionError extends Error {
  constructor(currentState: TripState, nextState: TripState) {
    super(`Transição de estado inválida no domínio de Viagens: não é permitido mudar de "${currentState}" para "${nextState}".`);
    this.name = 'InvalidTransitionError';
  }
}

export function validateTripTransition(currentState: TripState, targetState: TripState): void {
  const allowed = ALLOWED_TRIP_TRANSITIONS[currentState];
  if (!allowed.includes(targetState)) {
    throw new InvalidTransitionError(currentState, targetState);
  }
}
```

---

## 5. Padrão Estratégia (*Strategy Pattern*)

### 5.1 Propósito no Aratu
O padrão Strategy permite variar dinamicamente algoritmos e formatos de processamento sem acoplar a classe invocadora a condicionais `if/else` ou `switch/case` extensos.

Aplicações principais:
1. **Exportação de relatórios gerenciais:** geração de dados em CSV, PDF e XLSX mantendo o mesmo conjunto de dados filtrados.
2. **Cálculo de políticas de aprovação:** regras específicas para avaliação manual versus automática por setor e serviço.

### 5.2 Exemplo Prático: Exportação de Relatórios

```typescript
// backend/src/services/export/exporter.strategy.ts
export interface ExportFormatStrategy<T> {
  readonly extension: string;
  readonly contentType: string;
  generate(data: readonly T[]): Promise<Buffer>;
}

export class CsvExportStrategy<T extends Record<string, unknown>> implements ExportFormatStrategy<T> {
  public readonly extension = 'csv';
  public readonly contentType = 'text/csv; charset=utf-8';

  public async generate(data: readonly T[]): Promise<Buffer> {
    if (data.length === 0) return Buffer.from('');
    const header = Object.keys(data[0]).join(';');
    const lines = data.map(item => Object.values(item).map(v => `"${String(v ?? '')}"`).join(';'));
    return Buffer.from([header, ...lines].join('\r\n'), 'utf-8');
  }
}

export class ExporterContext<T extends Record<string, unknown>> {
  constructor(private strategy: ExportFormatStrategy<T>) {}

  public setStrategy(strategy: ExportFormatStrategy<T>): void {
    this.strategy = strategy;
  }

  public async export(data: readonly T[]): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
    const buffer = await this.strategy.generate(data);
    return {
      buffer,
      contentType: this.strategy.contentType,
      extension: this.strategy.extension,
    };
  }
}
```

---

## 6. Cadeia de Responsabilidade (*Chain of Responsibility — Middlewares Express 5*)

### 6.1 Propósito no Aratu
No Express 5, o padrão Chain of Responsibility organiza o processamento de requisições em uma esteira sequencial de interceptadores desacoplados. Cada elo possui responsabilidade única e decide se repassa a requisição ao próximo (`next()`) ou encerra o fluxo com resposta HTTP específica.

### 6.2 Pipeline Obrigatório de Rotas Protegidas

```
Requisição HTTP
      │
      ▼
[1. Middleware de Autenticação (JWT)]          ──► 401 se ausente/inválido/expirado
      │
      ▼
[2. Middleware de Autorização RBAC (Perfis)]   ──► 403 se perfil não autorizado
      │
      ▼
[3. Middleware de Validação de Payload (DTO)]   ──► 400/422 se schema inválido
      │
      ▼
[4. Controller da Rota]                        ──► Execução e resposta 200/201
      │ (em caso de erro lançado com throw)
      ▼
[5. Tratador Global de Erros]                  ──► Resposta JSON orientadora padronizada
```

### 6.3 Exemplo Prático de Encadeamento

```typescript
// backend/src/routes/trip.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import { authorizeRoles } from '../middlewares/rbac.middleware';
import { validateSchema } from '../middlewares/validation.middleware';
import { createTripSchema } from '../schemas/trip.schema';
import { TripController } from '../controllers/trip.controller';

const router = Router();
const controller = new TripController();

router.post(
  '/',
  authenticateToken,
  authorizeRoles(['MANAGER', 'ADMIN']),
  validateSchema(createTripSchema),
  controller.create.bind(controller)
);

export default router;
```

---

## 7. Hooks Customizados, Material UI e Componentes Compostos (*React 19 + `@mui/material`*)

### 7.1 Padrão Custom Hooks (Separação de I/O e Efeitos)
Toda comunicação assíncrona, paginação e ciclo de vida devem ser encapsulados em Hooks Customizados (`frontend/src/hooks/`). A página (`Page`) e o componente visual apenas consomem os estados:

```typescript
// frontend/src/hooks/useTrips.ts
import { useState, useEffect, useCallback } from 'react';
import { Trip } from '../types/trip.types';
import { fetchTripsApi } from '../services/trip.api';

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTripsApi();
      setTrips(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar viagens');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { trips, isLoading, error, reload: load };
}
```

### 7.2 Padrão Componentes Compostos (*Compound Components*) sobre Material UI
Para componentes com múltiplos elementos interdependentes (como `EntityCard` para viaturas/viagens/chamados SVO, acordeões e modais), utiliza-se o padrão de Componentes Compostos sobre o `@mui/material` (`Card`, `CardContent`, `Box`, `Typography`) via Context do React, garantindo **acessibilidade nativa (WCAG 2.2 AA)**, respeito ao `frontend/src/theme.ts` e flexibilidade visual sem estilos inline avulsos:

```tsx
// frontend/src/components/ui/EntityCard.tsx
import React, { createContext, useContext, useId } from 'react';
import { Box, Card, CardActions, CardContent, Typography } from '@mui/material';

interface EntityCardContextValue {
  id: string;
  titleId: string;
  statusId: string;
}

const EntityCardContext = createContext<EntityCardContextValue | null>(null);

export function EntityCard({ children }: { children: React.ReactNode }) {
  const uniqueId = useId();
  const titleId = `title-${uniqueId}`;
  const statusId = `status-${uniqueId}`;

  return (
    <EntityCardContext.Provider value={{ id: uniqueId, titleId, statusId }}>
      <Card
        component="article"
        variant="outlined"
        aria-labelledby={titleId}
        aria-describedby={statusId}
        sx={{ mb: 1.5 }}
      >
        {children}
      </Card>
    </EntityCardContext.Provider>
  );
}

EntityCard.Header = function EntityCardHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const context = useContext(EntityCardContext);
  if (!context) throw new Error('EntityCard.Header must be used within EntityCard');
  return (
    <Box component="header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 2 }}>
      <Typography id={context.titleId} component="h3" variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      {children}
    </Box>
  );
};

EntityCard.Status = function EntityCardStatus({ children }: { children: React.ReactNode }) {
  const context = useContext(EntityCardContext);
  if (!context) throw new Error('EntityCard.Status must be used within EntityCard');
  return <Box id={context.statusId}>{children}</Box>;
};

EntityCard.Body = function EntityCardBody({ children }: { children: React.ReactNode }) {
  const context = useContext(EntityCardContext);
  if (!context) throw new Error('EntityCard.Body must be used within EntityCard');
  return <CardContent sx={{ py: 1.5 }}>{children}</CardContent>;
};

EntityCard.Actions = function EntityCardActions({ children }: { children: React.ReactNode }) {
  const context = useContext(EntityCardContext);
  if (!context) throw new Error('EntityCard.Actions must be used within EntityCard');
  return <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'flex-end' }}>{children}</CardActions>;
};
```

---

## 8. Antipadrões Proibidos no Sistema Aratu

| Antipadrão | Por que é proibido no Aratu | O que fazer no lugar |
|---|---|---|
| **Fat Controller** | Acopla regras de negócio ao protocolo HTTP, impedindo testes isolados e reuso. | Mover todas as validações de domínio, cálculos e invariantes para a camada `Service`. |
| **SQL em Controllers ou Services** | Viola a fronteira de persistência, gera duplicação de queries e risco de SQL Injection. | Centralizar todo acesso a dados em `repositories/` com queries parametrizadas (`$1, $2`). |
| **God Service** | Um único serviço gerenciando múltiplos domínios (ex: `GeneralSystemService`). | Respeitar os limites dos domínios da FSPH/SVO (`FleetService`, `TripService`, `RequestService`, `SvoService`). |
| **Pular Camadas (*Bypass*)** | Fazer o `Controller` chamar diretamente o `Repository` sem passar pelo `Service`. | Toda requisição deve fluir obrigatoriamente por `Controller` → `Service` → `Repository`. |
| **Regras de Negócio no Frontend** | Cria divergência de regras entre web e API, além de ser facilmente burlável. | O frontend apenas renderiza e reflete o estado; a validação final da invariante reside sempre no `Service`. |
| **Repetição de MUI Cru nas Pages** | Repetir `FormControl`+`FormLabel`+`OutlinedInput` ou tabelas/cards do zero em cada página gera inconsistência e falhas de WCAG (`useId`). | Consumir os componentes padronizados de `src/components/layout/` (`AppShell`, `PageHeader`) e `src/components/ui/` (`FormField`, `DataTable`, `EntityCard`, `StatusChip`, `StateFeedback`). |
| **Overrides `:global(.Mui...)` e CSS em PT-BR** | Quebra o tema central (`theme.ts`), viola o tamanho mínimo `44px` da WCAG 2.2 AA e polui o TypeScript com `styles['classe-pt']`. | Estilizar via `theme.ts` e prop `sx`/`styled`; em `*.module.css`, usar apenas classes em **inglês em `camelCase`** (`styles.pageContainer`). |
| **Abstrações Especulativas (Violação YAGNI)** | Criar dezenas de interfaces e fábricas genéricas para funcionalidades simples de CRUD. | Aplicar os padrões canônicos apenas onde agregam valor real, testabilidade ou segurança de concorrência. |

