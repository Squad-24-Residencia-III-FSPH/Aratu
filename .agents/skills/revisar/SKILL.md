---
name: revisar
description: >
  Realiza a revisão automatizada de código e conformidade arquitetural da branch
  atual contra develop no Sistema Aratu, auditando camadas Express 5 / React 19,
  segurança SQL no PostgreSQL 18, concorrência, WCAG 2.2 AA e LGPD/SVO, e gera o
  Relatório de Revisão autocontido em HTML em docs/reviews/<chave-tarefa>-<slug>.html
  a partir de docs/reviews/EXEMPLO_REVISAO.html. Use quando o usuário pedir /revisar
  ou solicitar code review da tarefa antes do Pull Request.
argument-hint: "[nome da branch, chave da issue no Jira ou vazio para revisar a branch atual contra develop]"
model: sonnet
effort: high
license: MIT
---

# Revisão Automatizada de Código — Sistema Aratu

Executa uma revisão técnica e funcional completa da branch atual (ou especificada) contra a branch base **`develop`**, verificando a conformidade com a skill canônica **`.agents/skills/principios/SKILL.md`** e com toda a documentação em `docs/`, e gera o **Relatório de Revisão em HTML** em `docs/reviews/<chave-tarefa>-<slug>.html` seguindo o template `docs/reviews/EXEMPLO_REVISAO.html`.

> **Formato de saída da revisão: HTML autocontido em `docs/reviews/<chave-tarefa>-<slug>.html` + resumo executivo no terminal.**

A revisão:
1. Avalia aderência ao requisito/SDD (`docs/plans/`), arquitetura em camadas (Express 5 e React 19), modelagem e segurança SQL no **PostgreSQL 18**, concorrência, tipagem estrita TypeScript, **WCAG 2.2 Nível AA** e proteção de dados (**LGPD / Sigilo SVO**);
2. Executa a pré-auditoria estática (`node docs/scripts/aratu-check.mjs`) e as ferramentas automatizadas de QA (`tsc`, `eslint` e testes);
3. Gera o documento HTML visual de Code Review em `docs/reviews/<chave-tarefa>-<slug>.html` (para leitura confortável no navegador) e apresenta um resumo objetivo no terminal.

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A chave ou URL da tarefa no Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- O nome da branch da tarefa (ex: `feat/controle-sessao-token` ou `feature/login`);
- Vazio: revisa a branch atual (`git branch --show-current`) contra `develop`.

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** É terminantemente proibido emitir parecer de code review ou sugerir alterações sem antes ler e aplicar integralmente a skill canônica **`.agents/skills/principios/SKILL.md`** e seus documentos de referência.

1. **Carregue obrigatoriamente a fonte canônica de princípios:**
   - `.agents/skills/principios/SKILL.md` (ordem de precedência dos 9 princípios, Regra da Dúvida, Teste do *"provavelmente"*, LGPD/SVO e formato de saída);
   - `.agents/skills/principios/references/camadas.md` (separação estrita Express 5 e React 19);
   - `.agents/skills/principios/references/escopo-impacto.md` (perfis RBAC e proibição de feature flags não autorizadas);
   - `.agents/skills/principios/references/dados.md` e `.agents/skills/principios/references/consultas.md` (modelagem, transações `SELECT ... FOR UPDATE`, índices sargáveis e prevenção de SQL Injection no PostgreSQL 18);
   - `.agents/skills/principios/references/ux-fluxo.md`, `.agents/skills/principios/references/ui-componentes.md` e `.agents/skills/principios/references/acessibilidade.md` (5 estados visuais, reuso de componentes e WCAG 2.2 Nível AA).
2. **Carregue os guias operacionais complementares em `docs/manuais/`:**
   - `docs/manuais/revisao-codigo.md`, `docs/manuais/erros-comuns.md`, `docs/manuais/padroes-codigo.md`, `docs/manuais/padroes-docblocks.md`, `docs/manuais/padroes-backend.md`, `docs/manuais/padroes-frontend.md`, `docs/manuais/padroes-projeto.md` e `docs/manuais/escalabilidade-extensibilidade.md`.
3. **Subordinação à Regra da Dúvida na Revisão:** Se um trecho do diff parecer ambíguo quanto à regra de negócio da FSPH/SVO, não assuma premissas nem reescreva a regra por conta própria — aponte a dúvida objetivamente ao desenvolvedor. Encerre sempre a resposta com a assinatura exigida por `principios/SKILL.md` (`[código/plano] → [princípio que guiou] · dúvidas: ...`).

---

### Passo 1 — Identificar Branch, Contexto da Tarefa e Plano SDD

1. Verifique a branch ativa e o estado da working tree:
   ```bash
   git branch --show-current
   git status --short
   ```
2. Caso exista chave do Jira ou plano em `docs/plans/`, carregue o contexto via `.agents/skills/buscar-tarefa/SKILL.md` e leia o arquivo SDD correspondente em `docs/plans/`.

---

### Passo 2 — Executar Pré-Auditoria Estática (`aratu-check.mjs`) e Ler o Diff

1. Execute o script de pré-auditoria automatizada (que já valida branch Gitflow, Conventional Commits, estatística do diff contra `develop`, violações estáticas C4–C17, TypeScript e testes automatizados):
   ```bash
   node docs/scripts/aratu-check.mjs
   ```
2. Inspecione o diff detalhado contra `develop` e leia os arquivos de código alterados em `backend/src/` e `frontend/src/`:
   ```bash
   git diff develop...HEAD
   ```

---

### Passo 3 — Revisão Técnica Item a Item

Combine o resultado de `node docs/scripts/aratu-check.mjs` com a análise semântica do código para classificar cada critério como:
- 🔴 **Bloqueante** — impede o merge; deve ser corrigido.
- 🟡 **Atenção** — ponto de melhoria ou decisão que requer justificativa.
- 🟢 **OK** — critério integralmente atendido.
- ⚪ **N/A** — não aplicável ao escopo do diff.

#### Eixo 1 — Aderência ao Requisito, Escopo e Fluxo Git (Gitflow)
- **C1 (Escopo e Tamanho):** O diff contém apenas alterações pertinentes à tarefa? Está abaixo de 400 linhas e separa refatoração estrutural de mudança de comportamento?
- **C2 (Fluxo Git e Commits):** A branch da tarefa segue o padrão Gitflow (`feat/<nome-da-tarefa>`, `feature/<nome-da-tarefa>`, `fix/<nome-da-tarefa>` ou `hotfix/<nome-da-tarefa>`), criada a partir de `develop` com PR destinado à `develop`, e os commits seguem Conventional Commits (`tipo(escopo): descrição curta`)?
- **C3 (Cumprimento do Requisito e SDD):** Todos os requisitos funcionais e casos de borda previstos na tarefa e no plano SDD foram atendidos sem introduzir escopo especulativo (**YAGNI**)?

#### Eixo 2 — Arquitetura em Camadas e Princípios (SOLID / DRY / KISS)
- **C4 (Invariantes de Camada Backend):** Rotas (`routes/`) e Controllers (`controllers/`) estão livres de regras de negócio e de SQL? Services (`services/`) estão livres de objetos HTTP (`Request`/`Response`)? Repositories (`repositories/`) concentram todo o acesso ao `pg`?
- **C5 (Invariantes de Camada Frontend e Material UI):** Componentes reutilizáveis sobre Material UI (`src/components/layout/` e `src/components/ui/`: `AppShell`, `PageHeader`, `FormField`, `DataTable`, `FilterBar`, `EntityCard`, `StatCard`, `StatusChip`, `StateFeedback`, `ConfirmDialog`) foram reaproveitados em vez de estrutura MUI crua repetida? As chamadas `fetch` passam exclusivamente por `frontend/src/services/`? Nenhum arquivo CSS usa `:global(.Mui...)` para sobrescrever o `src/theme.ts`?
- **C6 (Ausência de Ciclos e Feature Flags):** Não há importação circular entre módulos nem criação de feature flags não autorizadas?

#### Eixo 3 — Banco de Dados (PostgreSQL 18), Concorrência e Segurança
- **C7 (Prevenção de SQL Injection):** 100% das queries usam parâmetros posicionais (`$1, $2, ...`) sem interpolação de strings (template literals)? → Violação é 🔴.
- **C8 (Performance e Projeção SQL):** Nenhuma query utiliza `SELECT *`? Os filtros de data/texto são sargáveis (sem funções sobre a coluna no `WHERE`) e evitam N+1?
- **C9 (Transações e Concorrência):** Operações compostas ou de alocação concorrente usam `BEGIN ... COMMIT / ROLLBACK` com `SELECT ... FOR UPDATE` e garantem `client.release()` no bloco `finally`? → Vazamento de conexão ou condição de corrida é 🔴.
- **C10 (Migrações PostgreSQL 18):** Tabelas no padrão de prefixo de 3 letras em inglês (`<pre>_<singular_entity>`), PK `id` (projetada como `SELECT id AS <pre>_id` no Repository), colunas próprias `<pre>_<col>`, FKs `<ref_pre>_id` com `ON DELETE RESTRICT`, objetos auxiliares `<pre>_<descriptive_name>` (sem `idx_`, `uq_`, `trg_`, `fn_`), `TIMESTAMPTZ` e DDL transacional com rollback?
- **C11 (Autorização RBAC no Backend):** As rotas protegidas validam o perfil do usuário via middleware no Express? → Proteger apenas no React é 🔴.
- **C12 (Proteção de Dados — LGPD e Sigilo SVO):** Nenhum dado pessoal real (CPF, CNH, nomes reais, laudos/óbitos do SVO) consta em seeds, testes, logs ou commits, e nenhum segredo foi hardcoded? → Violação é 🔴.

#### Eixo 4 — Clean Code, Nomenclatura em Inglês e Tipagem TypeScript Estrita
- **C13 (Tipagem Estrita):** Zero uso de `any` ou `@ts-ignore`? Parâmetros, retornos e payloads possuem interfaces/types explícitos em `src/types/`?
- **C14 (Nomenclatura em Inglês, CSS Modules `camelCase` e TSDoc):** Classes, métodos, funções, variáveis, constantes, componentes, hooks, arquivos `.ts`/`.tsx`, endpoints e classes de `*.module.css` (`camelCase`) estão em inglês? Estados e papéis usam union types em `UPPER_SNAKE_CASE`? Métodos públicos de Services/Middlewares possuem TSDoc em português conforme `docs/manuais/padroes-docblocks.md`? Não há `console.log` de debug nem código morto?

#### Eixo 5 — Interface React 19, UX e Acessibilidade (WCAG 2.2 Nível AA)
- **C15 (Os 5 Estados Visuais):** Toda tela/listagem assíncrona trata explicitamente os estados *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial* (via `StateFeedback`)?
- **C16 (Formulários e Controles Acessíveis):** Todos os campos usam `FormField` ou `useId()` vinculando `FormLabel`/`<label htmlFor>` ao `id` do input, `aria-invalid` e `aria-describedby`? Botões com ícone possuem `aria-label` contextualizado?
- **C17 (Teclado, Foco e Alvos de Toque):** Nenhum CSS remove `:focus-visible` sem substituto? Modais (`ConfirmDialog`) fecham com `Esc`? Os alvos interativos respeitam o mínimo de **44×44px** (`theme.ts`) para operação móvel e os `StatusChip` não dependem apenas de cor?

---

### Passo 4 — Executar Verificações Complementares nos Containers Docker (`docs/manuais/testes.md`)

Além da saída de `node docs/scripts/aratu-check.mjs`, caso os containers Docker estejam ativos (`docker compose ps`), execute:

```bash
# Backend: compilação TypeScript estrita e testes no container
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm test

# Frontend: linter ESLint e build de produção (tsc -b && vite build)
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

Qualquer erro de compilação TypeScript, falha de lint ou teste quebrado pelo diff é classificado como 🔴 **Bloqueante**.

---

### Passo 5 — Gerar o Relatório HTML em `docs/reviews/<chave-tarefa>-<slug>.html` e Resumo no Terminal

1. **Gere o esqueleto HTML pré-preenchido** (com o CSS oficial de `docs/reviews/EXEMPLO_REVISAO.html`, cards de contadores e tabela dos 17 critérios `C1`–`C17` pronta):
   ```bash
   node docs/scripts/gerar-esqueleto.mjs revisao <CHAVE_JIRA_OU_BRANCH> --modulo <MODULO> --force
   ```
   *(Economia de tokens: não é necessário ler `docs/reviews/EXEMPLO_REVISAO.html` inteiro, pois o script já injeta todo o CSS e a tabela base).*
2. **Edite cirurgicamente o arquivo `docs/reviews/<chave-tarefa>-<slug>.html`** preenchendo os marcadores:
   - `<!-- PREENCHER_VEREDITO -->`: `.verdict-approved` (`APROVADO_PARA_REVISAO_HUMANA`) ou `.verdict-blocked` (`BLOQUEADO_POR_PENDENCIAS`);
   - `<!-- PREENCHER_CONTADORES -->`: quantidade de 🔴 Bloqueantes, 🟡 Atenção, 🟢 OK e ⚪ N/A;
   - `<!-- PREENCHER_REVISAO_SECAO_1 -->`: tabela de arquivos criados/alterados no diff;
   - `<!-- PREENCHER_REVISAO_SECAO_2 -->`: status (`badge-ok`, `badge-warn`, `badge-block`, `badge-na`) e evidência de cada critério `C1` a `C17`;
   - `<!-- PREENCHER_REVISAO_SECAO_3 -->`: detalhamento de itens bloqueantes e de atenção (arquivo:linha, impacto na FSPH/SVO e como corrigir);
   - `<!-- PREENCHER_REVISAO_SECAO_4 -->`: resultado de `aratu-check.mjs`, compilação TypeScript e testes;
   - `<!-- PREENCHER_REVISAO_SECAO_5 -->`: checklist para o revisor humano da Squad 24.
3. **Apresente no terminal um resumo conciso** com o link clicável para o arquivo `docs/reviews/<chave-tarefa>-<slug>.html`, o quadro de contadores (🔴/🟡/🟢/⚪) e o veredito final.
4. Se houver pendências 🔴 puramente mecânicas (ex: remoção de `console.log`, substituição de `SELECT *` por colunas explícitas já conhecidas, ajuste de tipagem local sem alterar comportamento), verifique antes se a working tree está limpa (`git status --porcelain`) e ofereça aplicá-las mediante confirmação explícita do desenvolvedor.
