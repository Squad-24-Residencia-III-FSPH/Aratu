# Padrões de Projeto (Design Patterns) — Sistema Aratu

Este documento estabelece o catálogo canônico de **Padrões de Projeto (Design Patterns)** adotados no **Aratu — Sistema de Gestão de Frota e Operações (Squad 24 — FSPH & SVO)**.

O objetivo deste guia é fornecer consistência arquitetural, desacoplamento e testabilidade em todo o ciclo de vida do software, aplicando **SOLID**, **DRY**, **KISS** e **YAGNI** sem complexidade acidental.

---

## 1. Matriz Canônica de Padrões por Camada

| Camada do Sistema | Padrão Principal | Nome em Inglês | Papel e Responsabilidade no Sistema Aratu |
|---|---|---|---|
| **Arquitetura Geral** | Arquitetura em Camadas + Inversão Leve | *Layered Architecture + Dependency Inversion* | Separação estrita em pipeline unidirecional: `Routes` → `Controllers` → `Services` → `Repositories`. |
| **Persistência / Dados** | Repositório | *Repository Pattern* | Encapsulamento de queries SQL parametrizadas (`$1, $2`), isolamento do `pg.Pool` e transações atômicas com `SELECT ... FOR UPDATE`. |
| **Negócio / Domínio** | Máquina de Estados / Estado | *State Pattern (FSM)* | Controle do ciclo de vida imutável de viagens e óbitos, bloqueando transições ilegais em tempo de compilação e execução. |
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
[1. Routes]        (Declara endpoint, métodos e encadeia middlewares de autorização)
         │
         ▼
[2. Controllers]   (Extrai params/body, valida tipos de borda, invoca Service, responde HTTP JSON)
         │
         ▼
[3. Services]      (Regras puras de negócio, invariantes, cálculos, sem Express/HTTP)
         │
         ▼
[4. Repositories]  (Consultas SQL parametrizadas no PostgreSQL 18, sem lógica de negócio)
         │
         ▼
[PostgreSQL 18]
```

### 2.2 Regras de Ouro
1. **O `Service` é agnóstico de protocolo:** nunca importa `Request`, `Response` ou `NextFunction` do Express. Se for necessário simular um objeto HTTP para testar um `Service`, a regra está na camada errada.
2. **Injeção de dependência leve via construtor ou fábrica:** o `Service` recebe sua instância de repositório via construtor ou parâmetro opcional, facilitando a substituição por mocks em testes unitários sem a necessidade de frameworks pesados de DI.

### 2.3 Exemplo Prático (TypeScript / Express 5)

```typescript
// backend/src/services/viagem.service.ts
import { IViagemRepository } from '../types/viagem.types';
import { ViagemRepository } from '../repositories/viagem.repository';

export class ViagemService {
  constructor(
    private readonly repository: IViagemRepository = new ViagemRepository()
  ) {}

  public async aprovarSolicitacao(id: string, gestorId: string): Promise<void> {
    const viagem = await this.repository.buscarPorId(id);
    if (!viagem) {
      throw new Error('Solicitação de viagem não encontrada.');
    }

    if (viagem.status !== 'pendente') {
      throw new Error(`Não é possível aprovar viagem no status "${viagem.status}".`);
    }

    await this.repository.atualizarStatus(id, 'aprovada', gestorId);
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
- **Projeções explícitas:** proibido o uso de `SELECT *`. Toda consulta deve explicitar as colunas necessárias.
- **Gerenciamento de transações:** o repositório deve suportar tanto o pool compartilhado (`pg.Pool`) quanto um cliente transacional dedicado (`pg.PoolClient`) para operações atômicas com `SELECT ... FOR UPDATE`.

### 3.3 Exemplo Prático

```typescript
// backend/src/repositories/viagem.repository.ts
import { Pool, PoolClient } from 'pg';
import { pool } from '../database/connection';
import { Viagem, IViagemRepository } from '../types/viagem.types';

export class ViagemRepository implements IViagemRepository {
  constructor(private readonly db: Pool = pool) {}

  public async buscarPorId(id: string, client?: PoolClient): Promise<Viagem | null> {
    const executor = client ?? this.db;
    const query = `
      SELECT id, veiculo_id AS "veiculoId", motorista_id AS "motoristaId",
             status, data_saida AS "dataSaida", data_retorno AS "dataRetorno",
             created_at AS "createdAt", updated_at AS "updatedAt"
        FROM viagens
       WHERE id = $1
       LIMIT 1;
    `;
    const { rows } = await executor.query<Viagem>(query, [id]);
    return rows[0] ?? null;
  }

  public async buscarComTrava(id: string, client: PoolClient): Promise<Viagem | null> {
    const query = `
      SELECT id, veiculo_id AS "veiculoId", motorista_id AS "motoristaId", status
        FROM viagens
       WHERE id = $1
         FOR UPDATE;
    `;
    const { rows } = await client.query<Viagem>(query, [id]);
    return rows[0] ?? null;
  }

  public async atualizarStatus(id: string, status: string, usuarioId: string, client?: PoolClient): Promise<void> {
    const executor = client ?? this.db;
    const query = `
      UPDATE viagens
         SET status = $2,
             atualizado_por = $3,
             updated_at = clock_timestamp()
       WHERE id = $1;
    `;
    await executor.query(query, [id, status, usuarioId]);
  }
}
```

---

## 4. Padrão Estado / Máquina de Estados Finitos (*State Pattern / FSM*)

### 4.1 Propósito no Aratu
O Aratu gerencia fluxos operacionais críticos (solicitações de viagens da FSPH e chamados de óbito do SVO). Esses fluxos possuem ciclos de vida estritos que **nunca podem sofrer transições arbitrárias** ou inconsistentes.

### 4.2 Grafo de Transições Válidas

#### Ciclo de Vida da Viagem Institucional:
```
[pendente] ────► [aprovada] ────► [em_andamento] ────► [concluida]
    │                │                   │
    ▼                ▼                   ▼
[cancelada]      [cancelada]         [interrompida]
```

### 4.3 Implementação Tipada e Imutável

```typescript
// backend/src/types/viagem-estados.types.ts
export type ViagemStatus =
  | 'pendente'
  | 'aprovada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada'
  | 'interrompida';

/**
 * Matriz estrita de transições válidas no domínio Aratu.
 */
export const TRANSIÇÕES_PERMITIDAS: Record<ViagemStatus, readonly ViagemStatus[]> = {
  pendente: ['aprovada', 'cancelada'],
  aprovada: ['em_andamento', 'cancelada'],
  em_andamento: ['concluida', 'interrompida'],
  concluida: [],
  cancelada: [],
  interrompida: ['concluida'],
} as const;

export class TransicaoInvalidaError extends Error {
  constructor(statusAtual: ViagemStatus, novoStatus: ViagemStatus) {
    super(`Transição de status inválida no domínio de Viagens: não é permitido mudar de "${statusAtual}" para "${novoStatus}".`);
    this.name = 'TransicaoInvalidaError';
  }
}

export function validarTransicaoViagem(atual: ViagemStatus, destino: ViagemStatus): void {
  const permitidos = TRANSIÇÕES_PERMITIDAS[atual];
  if (!permitidos.includes(destino)) {
    throw new TransicaoInvalidaError(atual, destino);
  }
}
```

---

## 5. Padrão Estratégia (*Strategy Pattern*)

### 5.1 Propósito no Aratu
O padrão Strategy permite variar dinamicamente algoritmos e formatos de processamento sem acoplar a classe invocadora a condicionais `if/else` ou `switch/case` extensos.

Aplicações principais:
1. **Exportação de relatórios gerenciais:** geração de dados em CSV, PDF e XLSX mantendo o mesmo conjunto de dados filtrados.
2. **Cálculo de alocação de diárias:** regras específicas para deslocamentos na Grande Aracaju versus interior de Sergipe.

### 5.2 Exemplo Prático: Exportação de Relatórios

```typescript
// backend/src/services/exportacao/exportador.strategy.ts
export interface FormatoExportacaoStrategy<T> {
  readonly extensao: string;
  readonly contentType: string;
  gerar(dados: readonly T[]): Promise<Buffer>;
}

export class CsvExportadorStrategy<T extends Record<string, unknown>> implements FormatoExportacaoStrategy<T> {
  public readonly extensao = 'csv';
  public readonly contentType = 'text/csv; charset=utf-8';

  public async gerar(dados: readonly T[]): Promise<Buffer> {
    if (dados.length === 0) return Buffer.from('');
    const cabecalho = Object.keys(dados[0]).join(';');
    const linhas = dados.map(item => Object.values(item).map(v => `"${String(v ?? '')}"`).join(';'));
    return Buffer.from([cabecalho, ...linhas].join('\r\n'), 'utf-8');
  }
}

export class ExportadorContext<T extends Record<string, unknown>> {
  constructor(private strategy: FormatoExportacaoStrategy<T>) {}

  public setStrategy(strategy: FormatoExportacaoStrategy<T>): void {
    this.strategy = strategy;
  }

  public async exportar(dados: readonly T[]): Promise<{ buffer: Buffer; contentType: string; extensao: string }> {
    const buffer = await this.strategy.gerar(dados);
    return {
      buffer,
      contentType: this.strategy.contentType,
      extensao: this.strategy.extensao,
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
// backend/src/routes/viagem.routes.ts
import { Router } from 'express';
import { autenticarToken } from '../middlewares/auth.middleware';
import { autorizarPerfis } from '../middlewares/rbac.middleware';
import { validarSchema } from '../middlewares/validacao.middleware';
import { criarViagemSchema } from '../schemas/viagem.schema';
import { ViagemController } from '../controllers/viagem.controller';

const router = Router();
const controller = new ViagemController();

router.post(
  '/',
  autenticarToken,
  autorizarPerfis(['SOLICITANTE', 'GESTOR_FROTA', 'ADMIN']),
  validarSchema(criarViagemSchema),
  controller.criar.bind(controller)
);

export default router;
```

---

## 7. Hooks Customizados e Componentes Compostos (*React 19*)

### 7.1 Padrão Custom Hooks (Separação de I/O e Efeitos)
Toda comunicação assíncrona, paginação e ciclo de vida devem ser encapsulados em Hooks Customizados (`frontend/src/hooks/`). A página (`Page`) e o componente visual apenas consomem os estados:

```typescript
// frontend/src/hooks/useViagens.ts
import { useState, useEffect, useCallback } from 'react';
import { Viagem } from '../types/viagem';
import { buscarViagensApi } from '../services/viagem.api';

export function useViagens() {
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);
    try {
      const dados = await buscarViagensApi();
      setViagens(dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar viagens');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return { viagens, isLoading, erro, recarregar: carregar };
}
```

### 7.2 Padrão Componentes Compostos (*Compound Components*)
Para componentes com múltiplos elementos interdependentes (como cards operacionais, acordeões e modais), utiliza-se o padrão de Componentes Compostos via Context do React, garantindo **acessibilidade nativa (WCAG 2.2 AA)** e flexibilidade visual:

```typescript
// frontend/src/components/ui/ViagemCard.tsx
import React, { createContext, useContext, useId } from 'react';

interface ViagemCardContextValue {
  id: string;
  statusId: string;
}

const ViagemCardContext = createContext<ViagemCardContextValue | null>(null);

export function ViagemCard({ children }: { children: React.ReactNode }) {
  const uniqueId = useId();
  const statusId = `status-${uniqueId}`;

  return (
    <ViagemCardContext.Provider value={{ id: uniqueId, statusId }}>
      <article
        aria-labelledby={statusId}
        style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', margin: '8px 0' }}
      >
        {children}
      </article>
    </ViagemCardContext.Provider>
  );
}

ViagemCard.Header = function ViagemCardHeader({ children }: { children: React.ReactNode }) {
  const context = useContext(ViagemCardContext);
  if (!context) throw new Error('ViagemCard.Header deve estar dentro de ViagemCard');
  return <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>{children}</header>;
};

ViagemCard.Status = function ViagemCardStatus({ status }: { status: string }) {
  const context = useContext(ViagemCardContext);
  if (!context) throw new Error('ViagemCard.Status deve estar dentro de ViagemCard');
  return (
    <span id={context.statusId} style={{ fontWeight: 600 }}>
      Status: {status}
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
| **God Service** | Um único serviço gerenciando múltiplos domínios (ex: `SistemaGeralService`). | Respeitar os limites dos domínios da FSPH/SVO (`FrotaService`, `ViagemService`, `SvoService`). |
| **Pular Camadas (*Bypass*)** | Fazer o `Controller` chamar diretamente o `Repository` sem passar pelo `Service`. | Toda requisição deve fluir obrigatoriamente por `Controller` → `Service` → `Repository`. |
| **Regras de Negócio no Frontend** | Cria divergência de regras entre web e API, além de ser facilmente burlável. | O frontend apenas renderiza e reflete o estado; a validação final da invariante reside sempre no `Service`. |
| **Abstrações Especulativas (Violação YAGNI)** | Criar dezenas de interfaces e fábricas genéricas para funcionalidades simples de CRUD. | Aplicar os padrões canônicos apenas onde agregam valor real, testabilidade ou segurança de concorrência. |
