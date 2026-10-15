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
- **Containers:** Docker & Docker Compose (`docker-compose.yml` com `db`, `backend`, `frontend`).

---

## 4. Gitflow e Commits

- **Branches:** Baseadas sempre a partir de `develop`.
  - `feature/<modulo>-<funcionalidade>`
  - `fix/<modulo>-<defeito>`
- **Commits:** Padrão Conventional Commits (`tipo(escopo): descrição curta`):
  - `feat(frota): adicionar cadastro de veiculos`
  - `fix(viagens): corrigir validacao de status`
- **Proteção de Dados (LGPD / SVO):** Nunca inserir dados pessoais reais de motoristas, servidores ou falecidos em testes, seeds, fixtures ou mensagens de commit.
