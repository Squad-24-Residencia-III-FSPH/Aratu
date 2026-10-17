# Padrões de Projeto (Design Patterns) — Sistema Aratu

Este documento estabelece o catálogo canônico de **Padrões de Projeto (Design Patterns)** adotados no **Aratu — Sistema de Gestão de Frota e Operações (Squad 24 — FSPH & SVO)**.

O objetivo deste guia é fornecer consistência arquitetural, desacoplamento e testabilidade em todo o ciclo de vida do software, aplicando **SOLID**, **DRY**, **KISS** e **YAGNI** sem complexidade acidental.

---

## 1. Matriz Canônica de Padrões por Camada

| Camada do Sistema | Padrão Principal | Nome em Inglês | Papel e Responsabilidade no Sistema Aratu |
|---|---|---|---|
| **Arquitetura Geral** | Arquitetura em Camadas + Inversão Leve | *Layered Architecture + Dependency Inversion* | Separação estrita em pipeline unidirecional: `Routes` → `Controllers` → `Services` → `Repositories`. |
| **Persistência / Dados** | Repositório | *Repository Pattern* | Encapsulamento de queries SQL parametrizadas (`$1, $2`), projeção `<pre>_id AS id`, isolamento do `pg.Pool` e transações atômicas com `SELECT ... FOR UPDATE`. |
| **Negócio / Domínio** | Máquina de Estados / Estado | *State Pattern (FSM)* | Controle do ciclo de vida imutável de solicitações e viagens, bloqueando transições ilegais em tempo de compilação e execução. |
| **Algoritmos Variáveis** | Estratégia | *Strategy Pattern* | Variação dinâmica de algoritmos sem acoplamento nem `switch/case` extensos (ex: exportadores de relatórios em CSV, PDF e XLSX). |
| **Segurança e HTTP** | Cadeia de Responsabilidade | *Chain of Responsibility* | Pipeline modular de middlewares Express 5: validação de token JWT → autorização RBAC → validação de schema → controller → tratamento global de erro. |
| **Interface (React 19)** | Hooks Customizados + Componentes Compostos | *Custom Hooks + Compound Components* | Desacoplamento de efeitos assíncronos e I/O de rede (Hooks) e composição semântica acessível com estado compartilhado (WCAG 2.2 AA). |

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
[4. Repositories]  (Consultas SQL parametrizadas no PostgreSQL 18 com prefixo de 3 letras)
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
- **Projeções explícitas e mapeamento `<pre>_id AS id`:** proibido o uso de `SELECT *`. Toda consulta deve explicitar as colunas com prefixo de 3 letras e convertê-las via alias para `camelCase` sem o prefixo.
- **Gerenciamento de transações:** o repositório deve suportar tanto o pool compartilhado (`pg.Pool`) quanto um cliente transacional dedicado (`pg.PoolClient`) para operações atômicas com `SELECT ... FOR UPDATE`.

### 3.3 Exemplo Prático

```typescript
// backend/src/repositories/trip.repository.ts
import { Pool, PoolClient } from 'pg';
import { pool } from '../database/connection';
import { Trip, ITripRepository, TripState } from '../types/trip.types';

export class TripRepository implements ITripRepository {
  constructor(private readonly db: Pool = pool) {}

  public async findById(id: number, client?: PoolClient): Promise<Trip | null> {
    const executor = client ?? this.db;
    const query = `
      SELECT trp_id AS id,
             veh_id AS "vehicleId",
             drv_id AS "driverId",
             trp_planned_departure AS "plannedDeparture",
             trp_planned_end AS "plannedEnd",
             trp_state AS state,
             trp_revision AS revision,
             trp_created_at AS "createdAt"
        FROM trp_trip
       WHERE trp_id = $1
       LIMIT 1;
    `;
    const { rows } = await executor.query<Trip>(query, [id]);
    return rows[0] ?? null;
  }

  public async findByIdForUpdate(id: number, client: PoolClient): Promise<Trip | null> {
    const query = `
      SELECT trp_id AS id,
             veh_id AS "vehicleId",
             drv_id AS "driverId",
             trp_state AS state,
             trp_revision AS revision
        FROM trp_trip
       WHERE trp_id = $1
         FOR UPDATE;
    `;
    const { rows } = await client.query<Trip>(query, [id]);
    return rows[0] ?? null;
  }

  public async updateState(id: number, state: TripState, client?: PoolClient): Promise<void> {
    const executor = client ?? this.db;
    const query = `
      UPDATE trp_trip
         SET trp_state = $2,
             trp_revision = trp_revision + 1
       WHERE trp_id = $1;
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

#### Ciclo de Vida da Viagem (`trp_trip`):
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

## 7. Hooks Customizados e Componentes Compostos (*React 19*)

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

### 7.2 Padrão Componentes Compostos (*Compound Components*)
Para componentes com múltiplos elementos interdependentes (como cards operacionais, acordeões e modais), utiliza-se o padrão de Componentes Compostos via Context do React, garantindo **acessibilidade nativa (WCAG 2.2 AA)** e flexibilidade visual:

```typescript
// frontend/src/components/ui/TripCard.tsx
import React, { createContext, useContext, useId } from 'react';

interface TripCardContextValue {
  id: string;
  statusId: string;
}

const TripCardContext = createContext<TripCardContextValue | null>(null);

export function TripCard({ children }: { children: React.ReactNode }) {
  const uniqueId = useId();
  const statusId = `status-${uniqueId}`;

  return (
    <TripCardContext.Provider value={{ id: uniqueId, statusId }}>
      <article
        aria-labelledby={statusId}
        style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', margin: '8px 0' }}
      >
        {children}
      </article>
    </TripCardContext.Provider>
  );
}

TripCard.Header = function TripCardHeader({ children }: { children: React.ReactNode }) {
  const context = useContext(TripCardContext);
  if (!context) throw new Error('TripCard.Header deve estar dentro de TripCard');
  return <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>{children}</header>;
};

TripCard.Status = function TripCardStatus({ label }: { label: string }) {
  const context = useContext(TripCardContext);
  if (!context) throw new Error('TripCard.Status deve estar dentro de TripCard');
  return (
    <span id={context.statusId} style={{ fontWeight: 600 }}>
      Estado: {label}
    </span>
  );
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
| **Abstrações Especulativas (Violação YAGNI)** | Criar dezenas de interfaces e fábricas genéricas para funcionalidades simples de CRUD. | Aplicar os padrões canônicos apenas onde agregam valor real, testabilidade ou segurança de concorrência. |
