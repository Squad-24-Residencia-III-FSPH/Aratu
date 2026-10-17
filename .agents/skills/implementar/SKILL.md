---
name: implementar
description: >
  Implementa passo a passo um Plano Técnico de Implementação (SDD) localizado
  em docs/plans/<chave-tarefa>-<slug>.html no Sistema Aratu, obedecendo
  integralmente à skill canônica principios (Regra da Dúvida, DRY, SOLID, KISS,
  YAGNI, Clean Code, TSDoc, padrões de projeto, camadas Express 5 / React 19,
  PostgreSQL 18 e WCAG 2.2 AA). Use quando o usuário pedir /implementar ou
  solicitar a codificação de um plano técnico já elaborado.
argument-hint: "[caminho do SDD em docs/plans/<arquivo>.html, chave do Jira (ex: FROTA-27) ou vazio para o plano da tarefa atual]"
license: MIT
---

# Implementar Plano Técnico (SDD) — Sistema Aratu

Skill de execução de código da **Squad 24** para o **Aratu — Sistema de Gestão de Frota e Operações** (**Fundação de Saúde Parreiras Horta — FSPH** e **Serviço de Verificação de Óbito — SVO**).

Lê um **Plano Técnico de Implementação (SDD)** aprovado em `docs/plans/<chave-tarefa>-<slug>.html` e executa a codificação completa em camadas (`PostgreSQL 18` → `Types` → `Repositories` → `Services` → `Controllers/Routes` → `React 19 UI` → `Testes`), garantindo conformidade estrita com a skill canônica **`principios`**.

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- O caminho ou nome do arquivo SDD (ex: `docs/plans/frota-27-controle-sessao-token.html`);
- A chave ou URL da tarefa no Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- Vazio: localiza automaticamente o SDD correspondente à branch atual (`git branch --show-current`) em `docs/plans/`.

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** É terminantemente proibido escrever ou alterar qualquer linha de código sem antes carregar e aplicar integralmente a skill canônica **`.agents/skills/principios/SKILL.md`** e seus documentos de referência.

1. **Leitura obrigatória imediata:**
   - `.agents/skills/principios/SKILL.md` (Regra da Dúvida, Teste do *"provavelmente"*, ordem de precedência dos 9 princípios, proteção LGPD/SVO e formato de saída);
   - `.agents/skills/principios/references/camadas.md` e `.agents/skills/principios/references/escopo-impacto.md`;
   - `docs/manuais/padroes-projeto.md` (Layered Architecture, Repository, State Pattern/FSM, Strategy, Chain of Responsibility, Custom Hooks e Compound Components);
   - `docs/manuais/padroes-codigo.md` e `docs/manuais/padroes-docblocks.md` (TSDoc semântico focado no "porquê").
2. **Leitura condicional obrigatória conforme o escopo do SDD:**
   - Se o plano envolver banco de dados, migrations ou queries no PostgreSQL 18: leia `.agents/skills/principios/references/dados.md`, `.agents/skills/principios/references/consultas.md` e `docs/manuais/padroes-backend.md`;
   - Se o plano envolver telas React 19, formulários, estados visuais ou componentes: leia `.agents/skills/principios/references/ux-fluxo.md`, `.agents/skills/principios/references/ui-componentes.md`, `.agents/skills/principios/references/acessibilidade.md` e `docs/manuais/padroes-frontend.md`.
3. **Ordem de precedência inegociável:**
   `1. Padrões do projeto` → `2. Escopo de impacto` → `3. Compatibilidade de dados e contratos` → `4. Idempotência e atomicidade` → `5. YAGNI` → `6. DRY` → `7. SOLID` → `8. KISS` → `9. Clean Code`.

---

### Passo 1 — Localizar o Plano SDD e Preparar a Branch Gitflow

1. Identifique o arquivo do plano em `docs/plans/<chave-tarefa>-<slug>.html`.
   - Caso não exista um SDD para a tarefa solicitada, **interrompa** e pergunte ao usuário se deseja gerar o plano primeiro via `/plano` (`.agents/skills/plano/SKILL.md`).
2. Leia integralmente todas as seções do SDD em `docs/plans/<arquivo>.html`.
3. Verifique a branch ativa e o estado do repositório:
   ```bash
   git branch --show-current
   git status --short
   ```
   - Caso o repositório ainda esteja em `develop` ou `main`, crie/troque para a branch da tarefa conforme o Gitflow (`feat/<nome-da-tarefa>`, `feature/<nome-da-tarefa>` ou `fix/<nome-da-tarefa>`) a partir de `develop`.

---

### Passo 2 — Auditoria de Fidelidade e Regra da Dúvida (Antes e Durante o Código)

> **É terminantemente proibido improvisar ou assumir premissas.**

1. Execute `node docs/scripts/mapa-codigo.mjs` para visualizar rapidamente o estado atual do repositório e inspecione os arquivos existentes listados na **Seção 3 (Estrutura de Arquivos)** do SDD antes de modificá-los.
2. Se encontrar **qualquer divergência** entre o que o SDD descreve e o estado real do código/banco, ou se surgir qualquer ambiguidade sobre regra de negócio da FSPH/SVO, perfil RBAC ou contrato:
   - **Pare imediatamente** no ponto da dúvida;
   - Apresente a divergência ao usuário de forma objetiva com as opções e sua recomendação técnica;
   - Enquanto aguarda resposta, implemente apenas as partes 100% independentes da dúvida.
3. **Delimitação estrita de escopo (YAGNI e Foco do Diff):**
   - Implemente exclusivamente o que está especificado no SDD;
   - Um diff muda comportamento **ou** estrutura, nunca os dois juntos — não faça refatorações em massa em arquivos adjacentes não relacionados.

---

### Passo 3 — Execução Sequencial em Camadas (De Dentro para Fora)

Implemente os artefatos previstos no SDD respeitando a direção das dependências para manter o projeto sempre compilável:

#### 3.1 Banco de Dados e Migrações (`PostgreSQL 18` — Seção 4 do SDD)
- Escreva a migration SQL dentro de transação explícita (`BEGIN; ... COMMIT;`);
- Garanta nomes de tabelas no padrão de prefixo de 3 letras em inglês (`<pre>_<singular_entity>`), PK `<pre>_id`, colunas próprias `<pre>_<col>`, chaves estrangeiras `<ref_pre>_id` com `ON DELETE RESTRICT`, colunas temporais `TIMESTAMPTZ` e índices iniciando pelo prefixo da tabela (`<pre>_<descriptive_name>` sem `idx_`/`uq_`);
- Mantenha medidas ainda não conhecidas (ex: `tre_odometer` quando não aplicável) como `NULL`, nunca zero.

#### 3.2 Contratos e Tipagem Estrita (`backend/src/types/` — Seção 5 do SDD)
- Crie/atualize interfaces, DTOs de entrada/saída em `camelCase` em inglês (sem o prefixo SQL de 3 letras), union types em `UPPER_SNAKE_CASE` em inglês e matriz de transição de estados (**State Pattern / FSM**);
- Proibido o uso de `any`, `@ts-ignore` ou valores mágicos soltos no código.

#### 3.3 Persistência (`backend/src/repositories/` — Repository Pattern)
- Concentre 100% do acesso ao `pg` na camada de repositório, com nomes de classes e métodos em inglês;
- Utilize exclusivamente queries parametrizadas (`$1, $2, ...`) — zero interpolação de strings;
- Declare projeções explícitas de colunas mapeando `<pre>_id AS id` e aliases `camelCase` limpos (proibido `SELECT *`);
- Em alocações concorrentes de veículos/motoristas ou operações multi-etapa, utilize `PoolClient` com `BEGIN ... COMMIT / ROLLBACK`, `SELECT ... FOR UPDATE` e liberação garantida em `finally { client.release(); }`.

#### 3.4 Regras de Negócio (`backend/src/services/` — Service Puro)
- Implemente todas as validações de domínio, cálculos, verificação de parâmetros dinâmicos (`par_system_parameter`) e transições de estado com classes e métodos em inglês;
- A camada `Service` nunca importa `Request`, `Response` ou status HTTP do Express;
- Documente métodos públicos com TSDoc semântico em português conforme `docs/manuais/padroes-docblocks.md` (explicando regras da FSPH/SVO e mapeando `@throws`).

#### 3.5 Borda HTTP e Segurança (`backend/src/middlewares/`, `controllers/`, `routes/` — Express 5)
- Encadeie os middlewares segundo o padrão **Chain of Responsibility**: autenticação JWT → autorização de perfis **RBAC** (`ADMIN`, `MANAGER`, `OPERATOR`, `REQUESTER`, `TRIAGE`, `DRIVER`) → validação de payload → método do `Controller`;
- No `Controller`, extraia dados da requisição, acione o `Service` e retorne status HTTP semânticos (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`) com mensagens orientadoras em português claro (sem expor stack traces ou detalhes internos do banco).

#### 3.6 Interface Web e Acessibilidade (`frontend/src/` — React 19 + WCAG 2.2 AA — Seções 6 e 7 do SDD)
- Crie/atualize contratos em `frontend/src/types/` e chamadas centralizadas em `frontend/src/services/`;
- Isole ciclo de vida e estado assíncrono em **Custom Hooks** (`frontend/src/hooks/`);
- Reutilize os componentes de `frontend/src/components/ui/` (**DRY** e **Compound Components**);
- Garanta os critérios inegociáveis da **WCAG 2.2 Nível AA**:
  - `useId()` conectando `<label htmlFor>` ao `<input id>`, `aria-invalid`, `aria-describedby` e erros com `role="alert"`;
  - Navegação integral por teclado (`Tab`, `Enter`, `Espaço`, `Esc`), `:focus-visible` nítido e alvos interativos mínimos de **44×44px**;
  - Anúncios dinâmicos via `role="status"` / `aria-live="polite"` e badges que não dependam exclusivamente de cor;
- Trate obrigatoriamente os **5 estados visuais** na página (`frontend/src/pages/`): *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro (com botão de tentar novamente)* e *Parcial*.

#### 3.7 Testes e Documentação do Módulo (Seções 9 e 11 do SDD)
- Implemente os testes unitários e de integração especificados na Seção 9 utilizando dados **100% sintéticos/fictícios** (conformidade absoluta com **LGPD e Sigilo SVO**);
- Caso a Seção 11 do SDD indique impacto na documentação do módulo, atualize `docs/modulos/<MODULO>.html`.

---

### Passo 4 — Verificação Técnica e Checklist Pré-PR (Seção 10 do SDD)

Após concluir a codificação, execute o auditor estático e os testes automatizados em um único comando:

```bash
node docs/scripts/aratu-check.mjs
```

Se os containers Docker estiverem ativos, complemente com o build de produção:
```bash
docker compose exec backend npx tsc --noEmit
docker compose exec frontend npm run build
```

Corrija imediatamente qualquer violação estática (🔴 Bloqueante), erro de compilação TypeScript ou falha nos testes apontada por `aratu-check.mjs`.

---

### Passo 5 — Relatório de Entrega da Implementação

Apresente ao usuário um resumo claro contendo:
1. **Arquivos criados e modificados** por camada (com links clicáveis);
2. **Itens do Checklist Pré-PR (Seção 10 do SDD)** verificados (`tsc`, `lint`, `build`, segurança SQL, RBAC, WCAG 2.2 AA e LGPD);
3. **Sugestão de Commit** no padrão Conventional Commits (`tipo(escopo): descrição curta (FROTA-XX)`) — **nunca execute `git commit` ou `git push` sem confirmação explícita do usuário**;
4. **Próximos passos recomendados:** executar `/testar` e `/revisar` antes de abrir o Pull Request para `develop`;
5. **Assinatura obrigatória da skill `principios`:**
   `[código/plano] → [princípio que guiou] · dúvidas: ...`
