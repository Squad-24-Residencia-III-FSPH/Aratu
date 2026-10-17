# Padrões de Documentação de Código (TSDoc / DocBlocks) — Sistema Aratu

Este documento define o padrão oficial de documentação de classes, métodos, funções, middlewares e componentes para o **Sistema Aratu — Gestão de Frota e Operações** (Squad 24 — FSPH & SVO).

O projeto adota **TSDoc semântico**, alinhado ao ecossistema TypeScript, React 19 e Express 5.

---

## 1. Princípios Gerais

1. **Código em inglês, TSDoc em português:** identificadores de código (classes, métodos, funções, parâmetros, tipos e erros como `TripService`, `allocateVehicle()`, `NotFoundError`) são escritos em **inglês**, enquanto o texto explicativo dentro dos blocos TSDoc (`/** ... */`) é escrito em **português claro (PT-BR)**.
2. **Documente o "porquê", não o "o quê":** registre regras de negócio não evidentes, invariantes de domínio, restrições operacionais e detalhes de concorrência (ex: transações no pool `pg` com `SELECT ... FOR UPDATE`).
3. **Não duplique tipagem estática:** o compilador TypeScript e a IDE (VS Code) já inferem e validam os tipos em tempo real. **Não utilize tipos manuais dentro das tags** (ex: proibido `@param {string} identification`).
4. **Metadados pertencem ao Git:** não utilize tags como `@author`, `@since` ou `@version`. O histórico de autoria e versões é rastreado com precisão histórica pelo Git (`git blame`, `git log` e Conventional Commits).
5. **Precisão e Integridade:** documentação desatualizada é pior do que nenhuma documentação. Se você alterar a assinatura ou a regra de um método, atualize seu TSDoc no mesmo commit (**Regra do Escoteiro**).

---

## 2. Estrutura e Tags TSDoc Permitidas

Os blocos de documentação iniciam com `/**` e terminam com `*/`.

```typescript
/**
 * Resumo em uma frase clara no presente ou infinitivo explicando o propósito do método.
 *
 * Parágrafo(s) adicional(is) detalhando invariantes de negócio, impactos operacionais
 * na FSPH ou no SVO, ou particularidades técnicas (opcional).
 *
 * @param parameterName - Descrição do significado e eventuais restrições no domínio.
 * @returns Descrição do valor retornado em caso de sucesso.
 * @throws {ErrorClassName} Quando a condição de erro de negócio ocorrer.
 * @example Exemplo prático de chamada (quando o formato não for óbvio).
 */
```

### Guia de Tags

| Tag | Quando utilizar | Exemplo |
|---|---|---|
| **Resumo** (sem tag) | Primeira linha obrigatória em todo bloco TSDoc. | `/** Aloca uma solicitação aprovada a uma viagem planejada. */` |
| `@param <name>` | Obrigatório para parâmetros cujo propósito não seja 100% evidente pelo nome. | `@param requestId - Identificador único da solicitação aprovada.` |
| `@returns` | Obrigatório para funções com retorno não-void onde o resultado precisa de contexto. | `@returns Alocação registrada com os snapshots de auditoria.` |
| `@throws {ErrorType}` | Obrigatório quando o método lança erros de domínio esperados. | `@throws {AllocationConflictError} Se a solicitação já possuir alocação vigente.` |
| `@remarks` | Opcional; para destacar regras de concorrência, transações ou impacto LGPD. | `@remarks Executa em transação com lock pessimista no PostgreSQL.` |
| `@example` | Opcional; quando o payload ou formato de entrada/saída for complexo. | `@example const res = await authService.buildLoginResponse(user);` |

> 🚫 **Tags Proibidas (YAGNI e Redundância):** `@author`, `@since`, `@version`, `@param {type}`, `@returns {type}`.

---

## 3. Escopo de Obrigatoriedade

| Camada / Elemento | Nível | O que deve ser documentado |
|---|---|---|
| **Services (`backend/src/services/`)** | 🔴 **Obrigatório** | Todos os métodos públicos (regras de negócio, cálculos de km, transições de estado e validações de domínio). |
| **Repositories (`backend/src/repositories/`)** | 🟡 **Recomendado** | Métodos que executam transações (`BEGIN ... COMMIT`), consultas com travas concorrentes (`FOR UPDATE`) ou projeções complexas. |
| **Middlewares (`backend/src/middlewares/`)** | 🔴 **Obrigatório** | Middlewares de autenticação, autorização RBAC e tratamento global de erros, explicando o que validam e quais headers/erros injetam. |
| **Componentes UI Compartilhados (`frontend/src/components/ui/`)** | 🔴 **Obrigatório** | Props do componente e diretrizes de acessibilidade (WCAG 2.2 Nível AA). |
| **Custom Hooks (`frontend/src/hooks/`)** | 🟡 **Recomendado** | Parâmetros de entrada, estado retornado e efeitos colaterais disparados. |
| **Controllers (`backend/src/controllers/`)** | ⚪ **Opcional** | Métodos de controller são dispensados de DocBlock longo se apenas delegam ao service e formatam HTTP. |
| **Funções Privadas ou Utilitárias Simples** | ⚪ **Opcional** | Dispensadas se o nome em inglês e a tipagem TypeScript forem autoexplicativos. |

---

## 4. Exemplos Práticos no Sistema Aratu

### 4.1 Service de Negócio (Backend)

```typescript
// backend/src/services/trip.service.ts

/**
 * Serviço responsável pelas regras de negócio e ciclo de vida de viagens da FSPH e SVO.
 */
export class TripService {
  /**
   * Aloca uma solicitação de transporte previamente aprovada a uma viagem planejada.
   *
   * Garante atomicidade transacional e concorrência segura via lock pessimista,
   * impedindo que dois gestores aloquem a mesma solicitação ou excedam a capacidade da viatura.
   *
   * @param requestId - Identificador único da solicitação aprovada (`req_id`).
   * @param tripId - Identificador único da viagem (`trp_id`).
   * @param reason - Justificativa operacional obrigatória para trilha de auditoria.
   * @returns Alocação registrada com dados de viagem, viatura e motorista.
   *
   * @throws {NotFoundError} Se a solicitação ou viagem não existirem.
   * @throws {InvalidStateError} Se a solicitação não estiver no estado `'APPROVED'`.
   * @throws {AllocationConflictError} Se a solicitação já possuir alocação vigente ou exceder assentos/limite de corpos.
   */
  async allocateRequest(
    requestId: number,
    tripId: number,
    reason: string
  ): Promise<RequestAllocation> {
    // Implementação da regra...
  }
}
```

### 4.2 Middleware de Autenticação e RBAC (Backend)

```typescript
// backend/src/middlewares/auth.ts

/**
 * Middleware que intercepta requisições HTTP exigindo token JWT Bearer válido.
 *
 * Extrai o token do cabeçalho `Authorization`, valida a assinatura criptográfica,
 * verifica a expiração da sessão e checa se o usuário permanece ativo no sistema.
 * Injeta o payload validado em `req.user` para uso nos controllers e middlewares seguintes.
 *
 * @param req - Requisição Express contendo cabeçalho `Authorization: Bearer <token>`.
 * @param res - Resposta Express usada para emitir status 401 em caso de falha.
 * @param next - Função para prosseguir na esteira de middlewares.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  // Implementação...
};
```

### 4.3 Componente Visual Acessível (Frontend React 19)

```tsx
// frontend/src/components/ui/StatusBadge.tsx

import React from 'react';
import type { TripState } from '../../types/trip.types';

/**
 * Propriedades do componente de badge de estado de viagem.
 */
export interface StatusBadgeProps {
  /** Estado operacional atual da viagem ('PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'). */
  state: TripState;
  /**
   * Texto descritivo para leitores de tela quando o rótulo visual não for suficiente.
   * @default Conforme o mapeamento em português do estado
   */
  accessibleLabel?: string;
  /** Classe CSS customizada opcional. */
  className?: string;
}

/**
 * Badge visual acessível para exibição de estados operacionais (FSPH e SVO).
 *
 * Em conformidade com a WCAG 2.2 AA (Critério 1.4.1), não depende exclusivamente
 * de cores para transmitir informação: combina cor de contraste mínimo 4.5:1,
 * ícone contextual e rótulo traduzido em português.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  state,
  accessibleLabel,
  className = '',
}) => {
  // Renderização acessível...
};
```

---

## 5. Regra do Escoteiro e Revisão de Código

- Durante a revisão de código (`/revisar` ou code review da Squad 24):
  - **Falta de TSDoc em métodos públicos de `Service`** é apontada como ponto de atenção ou bloqueante caso a regra de negócio seja complexa.
  - **Comentários redundantes** (que apenas repetem o nome do método ou duplicam tipos) devem ser removidos ou enriquecidos com o contexto operacional.
  - Se você editar uma função existente que não possui documentação, adicione o bloco TSDoc conforme este padrão antes de enviar o Pull Request.
