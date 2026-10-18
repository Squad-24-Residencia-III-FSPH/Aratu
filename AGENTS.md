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

- **[`buscar-tarefa`](.agents/skills/buscar-tarefa/SKILL.md)** (`/buscar-tarefa`): Coleta dados da issue no Jira via `node docs/scripts/jira-fetch.mjs` e estrutura o contexto Gitflow da tarefa (`develop` como base).
- **[`plano`](.agents/skills/plano/SKILL.md)** (`/plano`): Planeja a tarefa aplicando a Regra da Dúvida e gera o SDD em `docs/plans/<chave-tarefa>-<slug>.html` a partir de `docs/plans/EXEMPLO_PLANO.html`.
- **[`implementar`](.agents/skills/implementar/SKILL.md)** (`/implementar`): Implementa o plano SDD passo a passo em camadas seguindo rigorosamente a skill `principios`.
- **[`testar`](.agents/skills/testar/SKILL.md)** (`/testar`): Executa a bateria de testes funcionais (API REST, UI React 19, PostgreSQL 18, RBAC e WCAG 2.2 AA).
- **[`revisar`](.agents/skills/revisar/SKILL.md)** (`/revisar`): Realiza a revisão automatizada do diff da branch da tarefa contra `develop` validando camadas, segurança SQL, concorrência, WCAG 2.2 AA e LGPD/SVO, e gera o relatório visual em `docs/reviews/<chave-tarefa>-<slug>.html` a partir de `docs/reviews/EXEMPLO_REVISAO.html`.
- **[`documentar-modulo`](.agents/skills/documentar-modulo/SKILL.md)** (`/documentar-modulo`): Gera ou atualiza a documentação HTML do módulo em `docs/modulos/<MODULO>.html`.

### Scripts Utilitários de Automação e Economia de Tokens (`docs/scripts/`)
- **[`jira-fetch.mjs`](docs/scripts/jira-fetch.mjs)**: Coleta issues do Jira (`node docs/scripts/jira-fetch.mjs FROTA-27 --save` ou `--mine`).
- **[`mapa-codigo.mjs`](docs/scripts/mapa-codigo.mjs)**: Gera snapshot em Markdown de todos os arquivos, símbolos exportados, rotas e tabelas (`node docs/scripts/mapa-codigo.mjs`).
- **[`gerar-esqueleto.mjs`](docs/scripts/gerar-esqueleto.mjs)**: Cria o esqueleto HTML pré-preenchido com CSS e seções fixas para SDD (`node docs/scripts/gerar-esqueleto.mjs plano FROTA-27`), Revisão (`node docs/scripts/gerar-esqueleto.mjs revisao FROTA-27`) ou Módulo (`node docs/scripts/gerar-esqueleto.mjs modulo FROTA`).
- **[`aratu-check.mjs`](docs/scripts/aratu-check.mjs)**: Executa pré-auditoria estática (camadas, SQL `$1`, `SELECT *`, `FOR UPDATE`, `any`, `useId`, foco WCAG), valida Gitflow/Commits e roda testes automatizados (`node docs/scripts/aratu-check.mjs`).

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
- **Frontend:** React 19, TypeScript, Vite, Material UI (`@mui/material` v9 + `@emotion`).
  - `src/theme.ts`: Fonte única de design tokens do Material UI (paleta `#FF6B00`, tipografia e altura mínima `44px` para WCAG 2.2 AA).
  - `src/components/layout/`: Estrutura padronizada de tela (`AppShell`, `PageHeader`).
  - `src/components/ui/`: Componentes visuais acessíveis e reutilizáveis sobre Material UI (`FormField` com `useId()`, `DataTable`, `FilterBar`, `EntityCard`, `StatCard`, `StatusChip`, `StateFeedback`, `ConfirmDialog`).
  - `src/pages/`: Telas e fluxos de navegação (estilização via `theme.ts`/`sx`; CSS Modules restritos a layout estrutural com classes em **inglês em `camelCase`**, proibido `:global(.Mui...)`).
- **Banco de Dados:** PostgreSQL 18 via Docker (`postgres:18-alpine`) estruturado em **Schemas Nativos de Domínio** (`auth`, `audit`, `fleet`, `trip`, `svo`), tabelas no plural (`<schema>.<plural_entity>`), PK `id BIGINT GENERATED ALWAYS AS IDENTITY`, colunas em inglês `snake_case` e FKs `<entity>_id`.
- **Padrões de Projeto:** Consulte [`docs/manuais/padroes-projeto.md`](docs/manuais/padroes-projeto.md) para aplicação obrigatória de Repository, State Pattern (FSM), Strategy, Chain of Responsibility e Compound Components.
- **Containers:** Docker & Docker Compose (`docker-compose.yml` com `db`, `backend`, `frontend`).

---

## 4. Fluxo Git (Gitflow) e Commits

- **Branches Principais:**
  - `main`: Versões estáveis e entregas validadas.
  - `develop`: Integração das funcionalidades em desenvolvimento.
- **Branches de Trabalho (criadas a partir de `develop`):**
  - `feat/<nome-da-tarefa>` ou `feature/<nome-da-tarefa>`: Nova funcionalidade (ex: `feat/controle-sessao-token`, `feature/login`).
  - `fix/<nome-da-tarefa>`: Correção de defeito (ex: `fix/vehicle-validation`).
  - `hotfix/<nome-da-tarefa>`: Correção urgente em produção/versão estável.
  - `release/<versao>`: Preparação de uma entrega.
  - Fluxo: atualizar `develop` (`git switch develop && git pull origin develop`) → criar branch da tarefa (`git switch -c feat/<nome-da-tarefa>`) → implementar e testar → enviar branch e abrir **Pull Request para `develop`**.
- **Commits:** Padrão Conventional Commits (`tipo(escopo): descrição curta`):
  - `feat(auth): implementar controle de sessao e token (FROTA-27)`
  - `feat(frota): adicionar cadastro de veiculos`
  - `fix(viagens): corrigir validacao de status`
- **Proteção de Dados (LGPD / SVO):** Nunca inserir dados pessoais reais de motoristas, servidores ou falecidos em testes, seeds, fixtures ou mensagens de commit.
