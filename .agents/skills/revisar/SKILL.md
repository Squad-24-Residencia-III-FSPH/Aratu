---
name: revisar
description: >
  Realiza a revisão automatizada de código e conformidade arquitetural da branch
  atual contra develop no Sistema Aratu, auditando camadas Express 5 / React 19,
  segurança SQL no PostgreSQL 18, concorrência, WCAG 2.2 AA e LGPD/SVO. Use
  quando o usuário pedir /revisar ou solicitar code review da tarefa antes do
  Pull Request.
argument-hint: "[nome da branch, chave da issue no Jira ou vazio para revisar a branch atual contra develop]"
model: sonnet
effort: high
license: MIT
---

# Revisão Automatizada de Código — Sistema Aratu

Executa uma revisão técnica e funcional completa da branch atual (ou especificada) contra a branch base **`develop`**, verificando a conformidade com a skill canônica **`.agents/skills/principios/SKILL.md`** e com toda a documentação em `docs/`.

A revisão:
1. Avalia aderência ao requisito/SDD (`docs/plans/`), arquitetura em camadas (Express 5 e React 19), modelagem e segurança SQL no **PostgreSQL 18**, concorrência, tipagem estrita TypeScript, **WCAG 2.2 Nível AA** e proteção de dados (**LGPD / Sigilo SVO**);
2. Executa as ferramentas automatizadas de QA (`tsc`, `eslint` e testes) nos containers `backend` e `frontend`;
3. Emite relatório estruturado com veredito claro e oferece correção assistida para desvios puramente mecânicos.

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A chave ou URL da tarefa no Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- O nome da branch do desenvolvedor (ex: `dev-eliakim`);
- Vazio: revisa a branch atual (`git branch --show-current`) contra `develop` (para o PR de QA).

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

### Passo 2 — Calcular o Diff contra `develop` e Ler os Arquivos Tocados

Execute em paralelo:
```bash
git diff --name-only develop...HEAD
git diff develop...HEAD
git log develop..HEAD --oneline
```

Leia integralmente cada arquivo de código alterado em `backend/src/` e `frontend/src/` (ignorando `package-lock.json` e `node_modules/`).

---

### Passo 3 — Revisão Técnica Item a Item

Classifique cada critério como:
- 🔴 **Bloqueante** — impede o merge; deve ser corrigido.
- 🟡 **Atenção** — ponto de melhoria ou decisão que requer justificativa.
- 🟢 **OK** — critério integralmente atendido.
- ⚪ **N/A** — não aplicável ao escopo do diff.

#### Eixo 1 — Aderência ao Requisito, Escopo e Fluxo Git (`dev-<nome>`)
- **C1 (Escopo e Tamanho):** O diff contém apenas alterações pertinentes à tarefa? Está abaixo de 400 linhas e separa refatoração estrutural de mudança de comportamento?
- **C2 (Fluxo Git e Commits):** O trabalho está mantido na branch do desenvolvedor (`dev-<nome>`, atualizada somente a partir da `main`, com PR destinado à `develop` para QA) e os commits seguem Conventional Commits (`tipo(escopo): descrição curta`) identificando a tarefa?
- **C3 (Cumprimento do Requisito e SDD):** Todos os requisitos funcionais e casos de borda previstos na tarefa e no plano SDD foram atendidos sem introduzir escopo especulativo (**YAGNI**)?

#### Eixo 2 — Arquitetura em Camadas e Princípios (SOLID / DRY / KISS)
- **C4 (Invariantes de Camada Backend):** Rotas (`routes/`) e Controllers (`controllers/`) estão livres de regras de negócio e de SQL? Services (`services/`) estão livres de objetos HTTP (`Request`/`Response`)? Repositories (`repositories/`) concentram todo o acesso ao `pg`?
- **C5 (Invariantes de Camada Frontend):** Componentes UI reutilizáveis (`components/ui/`) foram reaproveitados em vez de HTML avulso duplicado? As chamadas `fetch` passam exclusivamente por `frontend/src/services/`?
- **C6 (Ausência de Ciclos e Feature Flags):** Não há importação circular entre módulos nem criação de feature flags não autorizadas?

#### Eixo 3 — Banco de Dados (PostgreSQL 18), Concorrência e Segurança
- **C7 (Prevenção de SQL Injection):** 100% das queries usam parâmetros posicionais (`$1, $2, ...`) sem interpolação de strings (template literals)? → Violação é 🔴.
- **C8 (Performance e Projeção SQL):** Nenhuma query utiliza `SELECT *`? Os filtros de data/texto são sargáveis (sem funções sobre a coluna no `WHERE`) e evitam N+1?
- **C9 (Transações e Concorrência):** Operações compostas ou de alocação concorrente usam `BEGIN ... COMMIT / ROLLBACK` com `SELECT ... FOR UPDATE` e garantem `client.release()` no bloco `finally`? → Vazamento de conexão ou condição de corrida é 🔴.
- **C10 (Migrações PostgreSQL 18):** Tabelas em `snake_case` plural, FKs `<tabela_singular>_id` com `ON DELETE RESTRICT` (sem `CASCADE` indevido), `TIMESTAMPTZ` para instantes temporais e DDL transacional com rollback?
- **C11 (Autorização RBAC no Backend):** As rotas protegidas validam o perfil do usuário (`ADMIN`, `GESTOR_FROTA`, `SOLICITANTE`, `MOTORISTA`, `OPERADOR_SVO`) via middleware no Express? → Proteger apenas no React é 🔴.
- **C12 (Proteção de Dados — LGPD e Sigilo SVO):** Nenhum dado pessoal real (CPF, CNH, nomes reais, laudos/óbitos do SVO) consta em seeds, testes, logs ou commits, e nenhum segredo foi hardcoded? → Violação é 🔴.

#### Eixo 4 — Clean Code e Tipagem TypeScript Estrita
- **C13 (Tipagem Estrita):** Zero uso de `any` ou `@ts-ignore`? Parâmetros, retornos e payloads possuem interfaces/types explícitos em `src/types/`?
- **C14 (Sem Valores Mágicos, Código Limpo e TSDoc):** Status, tipos de veículo e perfis usam union types/constantes nomeadas? Nomes seguem `camelCase` / `PascalCase` / `UPPER_SNAKE_CASE`? Métodos públicos de Services/Middlewares possuem TSDoc conforme `docs/manuais/padroes-docblocks.md`? Não há `console.log` de debug nem código morto?

#### Eixo 5 — Interface React 19, UX e Acessibilidade (WCAG 2.2 Nível AA)
- **C15 (Os 5 Estados Visuais):** Toda tela/listagem assíncrona trata explicitamente os estados *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*?
- **C16 (Formulários e Controles Acessíveis):** Todos os inputs usam `useId()` vinculando `<label htmlFor>` ao `<input id>`, `aria-invalid` e `role="alert"`? Botões com ícone possuem `aria-label` contextualizado?
- **C17 (Teclado, Foco e Alvos de Toque):** Nenhum CSS remove `:focus-visible` sem substituto? Modais fecham com `Esc`? Os alvos interativos respeitam o mínimo de **44×44px** para operação móvel e os badges não dependem apenas de cor?

---

### Passo 4 — Executar Verificações Automatizadas de QA (`docs/manuais/testes.md`)

Verifique se os containers estão ativos (`docker compose ps`) ou execute localmente:

```bash
# Backend: compilação TypeScript estrita e testes
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm test

# Frontend: linter ESLint e build de produção (tsc -b && vite build)
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

Qualquer erro de compilação TypeScript, falha de lint ou teste quebrado pelo diff é classificado como 🔴 **Bloqueante**.

---

### Passo 5 — Emitir Relatório Estruturado e Gate de Conclusão

Apresente o relatório no formato abaixo:

```markdown
## Relatório de Revisão Automatizada — Sistema Aratu

- **Branch revisada:** `{branch}` (base: `develop`)
- **Módulo(s) Afetado(s):** `{FROTA | VIAGENS | SVO | MOTORISTAS | MANUTENCOES | AUTENTICACAO_RBAC}`

| Gravidade | Quantidade |
|---|---|
| 🔴 Bloqueante | {N} |
| 🟡 Atenção | {N} |
| 🟢 OK | {N} |
| ⚪ N/A | {N} |

### 🔴 Itens Bloqueantes
{Arquivo:linha, critério violado, impacto operacional na FSPH/SVO e como corrigir}

### 🟡 Itens de Atenção
{Arquivo:linha, observação e recomendação técnica}

### 🧪 Resultado do QA Automatizado
- **Backend (`tsc --noEmit` / testes):** {Passou / Falhou}
- **Frontend (`eslint` / `vite build`):** {Passou / Falhou}

### 👥 Foco Obrigatório do(s) Revisor(es) Humano(s)
{O que o revisor humano da Squad 24 deve validar funcionalmente antes do merge em develop}

---
**Veredito:** `{APROVADO_PARA_REVISAO_HUMANA | BLOQUEADO_POR_PENDENCIAS}`
```

Se houver pendências 🔴 puramente mecânicas (ex: remoção de `console.log`, substituição de `SELECT *` por colunas explícitas já conhecidas, ajuste de tipagem local sem alterar comportamento), verifique antes se a working tree está limpa (`git status --porcelain`) e ofereça aplicá-las mediante confirmação explícita do desenvolvedor.
