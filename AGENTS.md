# Diretrizes para Agentes de IA — Sistema Aratu

Este repositório contém o código do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** no âmbito da Residência em Software III para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

Todo agente de IA (Antigravity, Gemini, Claude, Codex, Copilot, Cursor, etc.) que atuar neste projeto deve seguir rigorosamente as diretrizes abaixo.

---

## 1. Skill Canônica de Desenvolvimento: `principios`

A fonte oficial e mandatória de princípios arquiteturais, de engenharia e de processo deste projeto está localizada em:

👉 **[`.agents/skills/principios/SKILL.md`](.agents/skills/principios/SKILL.md)**

Antes de planejar, codificar, refatorar, corrigir defeitos ou revisar código, consulte e aplique a skill e seus documentos de referência:
- [Acessibilidade (WCAG 2.2 Nível AA)](.agents/skills/principios/references/acessibilidade.md)
- [Camadas e Arquitetura (Express e React)](.agents/skills/principios/references/camadas.md)
- [Consultas e Performance no PostgreSQL 18](.agents/skills/principios/references/consultas.md)
- [Modelagem de Dados e Concorrência](.agents/skills/principios/references/dados.md)
- [Escopo de Impacto e Perfis RBAC](.agents/skills/principios/references/escopo-impacto.md)
- [Planejamento de Tarefas e SDD](.agents/skills/principios/references/planejamento.md)
- [UI e Componentes em React 19](.agents/skills/principios/references/ui-componentes.md)
- [UX e Fluxos Operacionais (FSPH / SVO)](.agents/skills/principios/references/ux-fluxo.md)

### Skills Operacionais do Fluxo SDD (`.agents/skills/`)
> **Regra de Subordinação Obrigatória:** Ao executar qualquer uma das skills abaixo, o agente é **obrigado** a carregar e obedecer integralmente à skill canônica **[`principios`](.agents/skills/principios/SKILL.md)** e às suas referências (`Passo 0` bloqueante).

- **[`buscar-tarefa`](.agents/skills/buscar-tarefa/SKILL.md)** (`/buscar-tarefa`): Coleta dados da issue no Jira via `node docs/scripts/jira-fetch.mjs` e estrutura o contexto Git da branch do desenvolvedor (`dev-<nome>`).
- **[`plano`](.agents/skills/plano/SKILL.md)** (`/plano`): Planeja a tarefa aplicando a Regra da Dúvida e gera o SDD em `docs/plans/<chave-tarefa>-<slug>.html` a partir de `docs/plans/EXEMPLO_PLANO.html`.
- **[`testar`](.agents/skills/testar/SKILL.md)** (`/testar`): Executa a bateria de testes funcionais (API REST, UI React 19, PostgreSQL 18, RBAC e WCAG 2.2 AA).
- **[`revisar`](.agents/skills/revisar/SKILL.md)** (`/revisar`): Realiza a revisão automatizada do diff da branch `dev-<nome>` validando camadas, segurança SQL, concorrência, WCAG 2.2 AA e LGPD/SVO.
- **[`documentar-modulo`](.agents/skills/documentar-modulo/SKILL.md)** (`/documentar-modulo`): Gera ou atualiza a documentação HTML do módulo em `docs/modulos/<MODULO>.html`.

---

## 2. A Regra Inegociável da Dúvida

- **É terminantemente proibido assumir premissas.**
- Toda dúvida, divergência entre o pedido e a base de código, ou informação inconclusiva deve ser interrompida e perguntada diretamente ao usuário antes de virar código ou plano.
- *Teste do Provavelmente:* Frases como *"provavelmente"*, *"imagino que"*, *"deve ser"* indicam premissa não confirmada. Transforme-as em perguntas objetivas com a sua recomendação técnica.

---

## 3. Stack Tecnológica e Camadas

- **Backend:** Node.js, Express 5, TypeScript (`tsx`), PostgreSQL driver (`pg`).
  - `src/routes/`: Definição de endpoints REST.
  - `src/controllers/`: Validação de requisição e resposta HTTP JSON.
  - `src/services/`: Regras de negócio puras (sem dependência de Express ou HTTP).
  - `src/repositories/` / `src/database/`: Acesso a dados PostgreSQL com queries parametrizadas (`$1, $2`).
- **Frontend:** React 19, TypeScript, Vite.
  - `src/components/`: Componentes visuais acessíveis e reutilizáveis (usando `useId()` para formulários).
  - `src/pages/`: Telas e fluxos de navegação.
  - `src/services/`: Cliente de API centralizado.
- **Banco de Dados:** PostgreSQL 18 via Docker (`postgres:18-alpine`).
- **Padrões de Projeto:** Consulte [`docs/manuais/padroes-projeto.md`](docs/manuais/padroes-projeto.md) para aplicação obrigatória de Repository, State Pattern (FSM), Strategy, Chain of Responsibility e Compound Components.
- **Containers:** Docker & Docker Compose (`docker-compose.yml` com `db`, `backend`, `frontend`).

---

## 4. Fluxo Git (Branch por Desenvolvedor) e Commits

- **Branches e Promoção (`dev-<nome>` → `develop` (QA) → `main`):**
  - Todo o trabalho permanece sempre na branch fixa do desenvolvedor (`dev-<nome>`, ex: `dev-eliakim`, `dev-arthur`). **Não crie branches `feature/...` ou `fix/...` separadas.**
  - A branch `dev-<nome>` é **somente atualizada a partir da `main`** (`git pull origin main`).
  - Ao concluir uma entrega, a branch `dev-<nome>` envia um **Pull Request para `develop`**, onde passa pelo **QA** e, após validação, segue da `develop` para a `main`.
- **Commits:** Padrão Conventional Commits identificando a entrega (`tipo(escopo): descrição curta`):
  - `feat(auth): implementar controle de sessao e token (FROTA-27)`
  - `feat(frota): adicionar cadastro de veiculos`
  - `fix(viagens): corrigir validacao de status`
- **Proteção de Dados (LGPD / SVO):** Nunca inserir dados pessoais reais de motoristas, servidores ou falecidos em testes, seeds, fixtures ou mensagens de commit.
