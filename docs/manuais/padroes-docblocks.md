# Padrões de Documentação de Código (TSDoc / DocBlocks) — Sistema Aratu

Este documento define o padrão oficial de documentação de classes, métodos, funções, middlewares e componentes para o **Sistema Aratu — Gestão de Frota e Operações** (Squad 24 — FSPH & SVO).

O projeto adota **TSDoc semântico**, alinhado ao ecossistema TypeScript, React 19 e Express 5.

---

## 1. Princípios Gerais

1. **Código autoexplicativo primeiro:** nomes expressivos no vocabulário de frotas e saúde pública da **FSPH** e do **SVO** (`alocarViatura()`, `solicitarViagem()`, `liberarCorpoSvo()`) reduzem a necessidade de comentários óbvios.
2. **Documente o "porquê", não o "o quê":** registre regras de negócio não evidentes, invariantes de domínio, restrições operacionais e detalhes de concorrência (ex: transações no pool `pg` com `SELECT ... FOR UPDATE`).
3. **Não duplique tipagem estática:** o compilador TypeScript e a IDE (VS Code) já inferem e validam os tipos em tempo real. **Não utilize tipos manuais dentro das tags** (ex: proibido `@param {string} placa`).
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
 * @param nomeDoParametro - Descrição do significado e eventuais restrições no domínio.
 * @returns Descrição do valor retornado em caso de sucesso.
 * @throws {NomeDoErro} Quando a condição de erro de negócio ocorrer.
 * @example Exemplo prático de chamada (quando o formato não for óbvio).
 */
```

### Guia de Tags

| Tag | Quando utilizar | Exemplo |
|---|---|---|
| **Resumo** (sem tag) | Primeira linha obrigatória em todo bloco TSDoc. | `/** Aloca uma viatura para uma solicitação de viagem aprovada. */` |
| `@param <nome>` | Obrigatório para parâmetros cujo propósito não seja 100% evidente pelo nome. | `@param viagemId - Identificador único da solicitação de viagem.` |
| `@returns` | Obrigatório para funções com retorno não-void onde o resultado precisa de contexto. | `@returns Viagem com os dados da viatura e motorista vinculados.` |
| `@throws {TipoErro}` | Obrigatório quando o método lança erros de domínio esperados. | `@throws {ConflitoAlocacaoError} Se o veículo já estiver em uso no período.` |
| `@remarks` | Opcional; para destacar regras de concorrência, transações ou impacto LGPD. | `@remarks Executa em transação com lock pessimista no PostgreSQL.` |
| `@example` | Opcional; quando o payload ou formato de entrada/saída for complexo. | `@example const res = await authService.gerarRespostaLogin(user);` |

> 🚫 **Tags Proibidas (YAGNI e Redundância):** `@author`, `@since`, `@version`, `@param {tipo}`, `@returns {tipo}`.

---

## 3. Escopo de Obrigatoriedade

| Camada / Elemento | Nível | O que deve ser documentado |
|---|---|---|
| **Services (`backend/src/services/`)** | 🔴 **Obrigatório** | Todos os métodos públicos (regras de negócio, cálculos de km, transições de status e validações de domínio). |
| **Repositories (`backend/src/repositories/`)** | 🟡 **Recomendado** | Métodos que executam transações (`BEGIN ... COMMIT`), consultas com travas concorrentes (`FOR UPDATE`) ou projeções complexas. |
| **Middlewares (`backend/src/middlewares/`)** | 🔴 **Obrigatório** | Middlewares de autenticação, autorização RBAC e tratamento global de erros, explicando o que validam e quais headers/erros injetam. |
| **Componentes UI Compartilhados (`frontend/src/components/ui/`)** | 🔴 **Obrigatório** | Props do componente e diretrizes de acessibilidade (WCAG 2.2 Nível AA). |
| **Custom Hooks (`frontend/src/hooks/`)** | 🟡 **Recomendado** | Parâmetros de entrada, estado retornado e efeitos colaterais disparados. |
| **Controllers (`backend/src/controllers/`)** | ⚪ **Opcional** | Métodos de controller são dispensados de DocBlock longo se apenas delegam ao service e formatam HTTP. |
| **Funções Privadas ou Utilitárias Simples** | ⚪ **Opcional** | Dispensadas se o nome e a tipagem TypeScript forem autoexplicativos. |

---

## 4. Exemplos Práticos no Sistema Aratu

### 4.1 Service de Negócio (Backend)

```typescript
// backend/src/services/viagemService.ts

/**
 * Serviço responsável pelas regras de negócio e ciclo de vida de viagens da FSPH.
 */
export class ViagemService {
  /**
   * Aloca uma viatura e motorista para uma solicitação de viagem previamente aprovada.
   *
   * Garante atomicidade transacional e concorrência segura via lock pessimista no veículo,
   * impedindo que dois gestores aloquem a mesma viatura para horários sobrepostos.
   *
   * @param viagemId - UUID da solicitação de viagem aprovada.
   * @param veiculoId - UUID da viatura a ser alocada.
   * @param motoristaId - UUID do motorista responsável pela condução.
   * @returns Solicitação de viagem atualizada com status `alocada`.
   *
   * @throws {RegistroNaoEncontradoError} Se a viagem, veículo ou motorista não existirem.
   * @throws {StatusInvalidoError} Se a viagem não estiver no status `aprovada`.
   * @throws {ConflitoAlocacaoError} Se o veículo ou motorista já possuírem agendamento conflitante.
   * @throws {CnhVencidaError} Se a CNH do motorista estiver expirada na data da viagem.
   */
  async alocarViatura(
    viagemId: string,
    veiculoId: string,
    motoristaId: string
  ): Promise<SolicitacaoViagem> {
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
 * Injeta o payload validado em `req.usuario` para uso nos controllers e middlewares seguintes.
 *
 * @param req - Requisição Express contendo cabeçalho `Authorization: Bearer <token>`.
 * @param res - Resposta Express usada para emitir status 401 em caso de falha.
 * @param next - Função para prosseguir na esteira de middlewares.
 */
export const autenticar = (req: Request, res: Response, next: NextFunction): void => {
  // Implementação...
};
```

### 4.3 Componente Visual Acessível (Frontend React 19)

```tsx
// frontend/src/components/ui/StatusBadge.tsx

import React from 'react';
import type { StatusViagem } from '../../types/viagem.types';

/**
 * Propriedades do componente de badge de status de viagem.
 */
export interface StatusBadgeProps {
  /** Status operacional atual da solicitação de viagem. */
  status: StatusViagem;
  /**
   * Texto descritivo para leitores de tela quando o status visual não for suficiente.
   * @default Conforme o mapeamento do status
   */
  descricaoAcessivel?: string;
  /** Classe CSS customizada opcional. */
  className?: string;
}

/**
 * Badge visual acessível para exibição de status operacionais (FSPH e SVO).
 *
 * Em conformidade com a WCAG 2.2 AA (Critério 1.4.1), não depende exclusivamente
 * de cores para transmitir informação: combina cor de contraste mínimo 4.5:1,
 * ícone contextual e texto explícito.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  descricaoAcessivel,
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
