---
name: plano
description: >
  Planeja uma tarefa do Sistema Aratu aplicando a skill canônica principios e a
  Regra da Dúvida, e gera o Plano Técnico de Implementação (SDD) autocontido em
  HTML em docs/plans/<chave-tarefa>-<slug>.html a partir de docs/plans/EXEMPLO_PLANO.html. Use
  quando o usuário pedir /plano, solicitar o planejamento técnico/SDD de uma
  história do Jira, funcionalidade ou correção no Aratu.
argument-hint: "[chave ou URL da issue no Jira (ex: FROTA-27) ou descrição da funcionalidade]"
model: opus
effort: high
license: MIT
---

# Planejar Tarefa e Gerar SDD — Sistema Aratu

Coleta o contexto de uma tarefa (via Jira / `.agents/skills/buscar-tarefa/SKILL.md` ou descrição direta do desenvolvedor), carrega obrigatoriamente a skill canônica **`.agents/skills/principios/SKILL.md`** e o guia **`.agents/skills/principios/references/planejamento.md`**, resolve **todas as dúvidas e ambiguidades antes de decidir** e gera o Plano Técnico de Implementação (SDD) em `docs/plans/<chave-tarefa>-<slug>.html` seguindo o template oficial `docs/plans/EXEMPLO_PLANO.html`.

> **Formato de saída do plano: exclusivamente HTML (`docs/plans/<chave-tarefa>-<slug>.html`).** Não gere arquivos `.md` dentro de `docs/plans/`.

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A chave ou URL da tarefa no Jira (ex: `FROTA-27`, `27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- A descrição direta da funcionalidade ou correção desejada.

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** É terminantemente proibido iniciar a análise ou gerar qualquer linha do plano sem antes ler e ativar integralmente a skill canônica **`.agents/skills/principios/SKILL.md`**.

1. **Leitura obrigatória imediata:**
   - `.agents/skills/principios/SKILL.md` (Regra da Dúvida, Teste do *"provavelmente"*, ordem de precedência dos 9 princípios, proteção LGPD/SVO e formato de saída);
   - `.agents/skills/principios/references/planejamento.md` (guia canônico de planejamento do Aratu);
   - `.agents/skills/principios/references/camadas.md` e `.agents/skills/principios/references/escopo-impacto.md`;
   - `docs/manuais/padroes-projeto.md` (matriz de Padrões de Projeto: Layered, Repository, State/FSM, Strategy, Chain of Responsibility, Compound Components);
   - `docs/plans/EXEMPLO_PLANO.html` (template estrutural HTML do SDD).
2. **Leitura condicional obrigatória conforme o escopo da tarefa:**
   - Se envolver tabelas, transações ou queries SQL no PostgreSQL 18: leia `.agents/skills/principios/references/dados.md` e `.agents/skills/principios/references/consultas.md`;
   - Se envolver telas React 19, formulários, mensagens de erro ou fluxos operacionais: leia `.agents/skills/principios/references/ux-fluxo.md`, `.agents/skills/principios/references/ui-componentes.md` e `.agents/skills/principios/references/acessibilidade.md`.
3. **Subordinação estrita:** Todas as decisões deste plano devem respeitar a ordem de precedência de `principios/SKILL.md` (`1. Padrões do projeto` → `2. Escopo de impacto` → `3. Compatibilidade de dados e contratos` → `4. Idempotência e atomicidade` → `5. YAGNI` → `6. DRY` → `7. SOLID` → `8. KISS` → `9. Clean Code`) e encerrar a resposta com a assinatura `[código/plano] → [princípio que guiou] · dúvidas: ...`.

---

### Passo 2 — Coletar Dados da Tarefa no Jira e Identificar a Branch do Desenvolvedor (`dev-<nome>`)

1. Se `$ARGUMENTS` contiver uma chave/URL do Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`) ou se precisar listar as tarefas abertas do desenvolvedor, execute o script utilitário documentado em `.agents/skills/buscar-tarefa/SKILL.md`:
   ```bash
   # Buscar issue específica (por chave ou URL completa) e salvar contexto em .tmp/task-FROTA-27/
   node docs/scripts/jira-fetch.mjs https://squad24.atlassian.net/browse/FROTA-27 --save

   # Ou listar issues abertas atribuídas ao usuário atual no Jira
   node docs/scripts/jira-fetch.mjs --mine
   ```
2. Verifique a branch atual do desenvolvedor (`git branch --show-current`, ex: `dev-eliakim`):
   - **Regra do Fluxo Git:** Todo o trabalho permanece sempre na branch fixa do desenvolvedor (`dev-<nome>`), que é **atualizada somente a partir da `main`** (`git pull origin main`) e envia **PR para `develop`** (onde passa pelo **QA** e depois vai para a `main`). **Nunca crie nem sugira criar branches `feature/...` ou `fix/...`.**
   - O que identifica a entrega no histórico é a mensagem do commit: `tipo(escopo): descrição curta (FROTA-XX)`.
3. O arquivo de saída do plano será `docs/plans/<chave-jira-minuscula>-<slug>.html` (ex: `docs/plans/frota-27-controle-sessao-token.html`).

---

### Passo 3 — Explorar o Codebase e a Documentação do Módulo

1. Identifique o módulo em `docs/manuais/modulos.md` (`AUTENTICACAO_RBAC`, `FROTA`, `MOTORISTAS`, `VIAGENS`, `SVO`, `MANUTENCOES`).
2. Se existir `docs/modulos/<MODULO>.html`, leia-o para conhecer as tabelas, rotas e regras já documentadas.
3. Inspecione os arquivos existentes em `backend/src/` (`routes`, `controllers`, `services`, `repositories`, `middlewares`, `types`) e `frontend/src/` (`pages`, `components/ui`, `services`, `hooks`, `types`) para garantir reuso (**DRY**) e aderência às convenções vizinhas.

---

### Passo 4 — Aplicar a Regra Inegociável da Dúvida (Antes de Gerar o SDD)

> **É terminantemente proibido assumir premissas.** Frases mentais como *"provavelmente"*, *"imagino que"*, *"deve ser"* ou *"por padrão"* indicam lacuna de requisito.

Verifique se há qualquer ambiguidade nos seguintes pontos:
- **Escopo de Impacto e RBAC:** está claro quais dos 5 perfis (`ADMIN`, `GESTOR_FROTA`, `SOLICITANTE`, `MOTORISTA`, `OPERADOR_SVO`) podem ver ou executar a ação?
- **Regras de Domínio e Transições de Status:** o comportamento em caso de conflito de horário, CNH vencida, veículo em manutenção ou cancelamento está 100% definido?
- **Compatibilidade de Dados e Contratos:** se alterar tabela ou endpoint existente, o que acontece com os registros já gravados no PostgreSQL 18?
- **UX e Fluxo Operacional:** a ordem dos passos, as confirmações de ações destrutivas e os campos obrigatórios estão claros?

Se houver **qualquer dúvida**, interrompa e pergunte objetivamente ao usuário (apresentando as opções identificadas e a sua recomendação técnica) **antes** de escrever o arquivo HTML do plano.

---

### Passo 5 — Gerar o SDD em `docs/plans/<nome-do-plano>.html`

Crie o arquivo HTML autocontido seguindo exatamente o layout, CSS e as **12 seções** de `docs/plans/EXEMPLO_PLANO.html`:

1. **Contexto, Objetivo e Escopo** (objetivo no domínio FSPH/SVO, delimitação YAGNI e decisões confirmadas pela Regra da Dúvida);
2. **Requisitos e Regras de Negócio (Casos de Borda)** (cenários *Dado / Quando / Então*, requisitos funcionais e não-funcionais);
3. **Estrutura de Arquivos** (novos arquivos, arquivos alterados e referências em `backend/src/` e `frontend/src/`);
4. **Banco de Dados e Migrações (PostgreSQL 18)** (DDL transacional `BEGIN ... COMMIT`, `snake_case` plural, `ON DELETE RESTRICT`, índices sargáveis e **Plano de Rollback obrigatório**);
5. **Back-end — Contratos REST e Detalhamento por Arquivo** (tabela de endpoints, status HTTP, `Types/DTOs`, `Repository` com `$1, $2` e `SELECT ... FOR UPDATE`, `Service` puro sem Express e `Controller`);
6. **Front-end — Telas, Componentes React 19 e Estados Visuais** (reuso de `components/ui/` e tratamento explícito dos **5 estados visuais**: *Ideal*, *Carregando*, *Vazio*, *Erro*, *Parcial*);
7. **Acessibilidade (WCAG 2.2 Nível AA)** (`useId()`, navegação por teclado, `:focus-visible`, alvos mínimos de 44×44px, contraste 4.5:1 e `role="status"` / `aria-live`);
8. **Escopo de Impacto, RBAC e Configuração**;
9. **Casos de Teste e Verificação** (testes unitários de `Service`, integração de `Repository` com rollback e roteiro manual por perfil RBAC com dados 100% fictícios — LGPD);
10. **Checklist Pré-PR**;
11. **Atualização da Documentação do Módulo** (`docs/modulos/<MODULO>.html`);
12. **Princípios de Desenvolvimento e Restrições de Implementação** (ordem de precedência da skill `principios`, Regra da Dúvida e proteção LGPD/SVO).

---

### Passo 6 — Sincronização da Branch `dev-<nome>` (Opcional mediante confirmação)

Após gerar o SDD, mantenha o trabalho sempre na branch do desenvolvedor (`dev-<nome>`, ex: `dev-eliakim`). Caso necessário sincronizar antes de iniciar a implementação, a atualização da `dev-<nome>` deve ser feita **exclusivamente a partir da `main`** (`git pull origin main`). Nunca crie branches `feature/...` ou `fix/...` e nunca faça `git push` ou commits sem confirmação explícita.
