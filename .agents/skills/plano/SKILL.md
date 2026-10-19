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
   - `docs/manuais/padroes-projeto.md` (matriz de Padrões de Projeto: Layered, Repository, State/FSM, Strategy, Chain of Responsibility, Compound Components).
   - *(Economia de tokens)* **Não** é necessário ler `docs/plans/EXEMPLO_PLANO.html` inteiro no Passo 0: o script `node docs/scripts/gerar-esqueleto.mjs plano <CHAVE>` já injeta automaticamente o `<style>` oficial e as seções fixas (7, 10, 11 e 12).
2. **Leitura condicional obrigatória conforme o escopo da tarefa:**
   - Se envolver tabelas, transações ou queries SQL no PostgreSQL 18: leia `.agents/skills/principios/references/dados.md` e `.agents/skills/principios/references/consultas.md`;
   - Se envolver telas React 19, formulários, mensagens de erro ou fluxos operacionais: leia `.agents/skills/principios/references/ux-fluxo.md`, `.agents/skills/principios/references/ui-componentes.md` e `.agents/skills/principios/references/acessibilidade.md`.
3. **Subordinação estrita:** Todas as decisões deste plano devem respeitar a ordem de precedência de `principios/SKILL.md` (`1. Padrões do projeto` → `2. Escopo de impacto` → `3. Compatibilidade de dados e contratos` → `4. Idempotência e atomicidade` → `5. YAGNI` → `6. DRY` → `7. SOLID` → `8. KISS` → `9. Clean Code`) e encerrar a resposta com a assinatura `[código/plano] → [princípio que guiou] · dúvidas: ...`.

---

### Passo 2 — Coletar Dados da Tarefa no Jira e Identificar a Branch da Tarefa (Gitflow)

1. Se `$ARGUMENTS` contiver uma chave/URL do Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`) ou se precisar listar as tarefas abertas do desenvolvedor, execute o script utilitário documentado em `.agents/skills/buscar-tarefa/SKILL.md`:
   ```bash
   # Buscar issue específica (por chave ou URL completa) e salvar contexto em .tmp/task-FROTA-27/
   node docs/scripts/jira-fetch.mjs https://squad24.atlassian.net/browse/FROTA-27 --save

   # Ou listar issues abertas atribuídas ao usuário atual no Jira
   node docs/scripts/jira-fetch.mjs --mine
   ```
2. Verifique a branch atual (`git branch --show-current`) e defina a branch da tarefa seguindo o Gitflow do `README.md` (criada a partir de `develop` atualizada):
   - Novas funcionalidades: `feat/<nome-da-tarefa>` ou `feature/<nome-da-tarefa>` (ex: `feat/controle-sessao-token`, `feature/login`);
   - Correções de defeito: `fix/<nome-da-tarefa>` (ex: `fix/vehicle-validation`);
   - Padrão de commits: `tipo(escopo): descrição curta (FROTA-XX)`.
3. O arquivo de saída do plano será `docs/plans/<chave-jira-minuscula>-<slug>.html` (ex: `docs/plans/frota-27-controle-sessao-token.html`).

---

### Passo 3 — Explorar o Codebase e a Documentação do Módulo (Via Script de Mapa)

1. Execute o mapeador estático para obter em um único comando a árvore completa de arquivos, símbolos exportados, rotas e tabelas de `backend/src/` e `frontend/src/`:
   ```bash
   node docs/scripts/mapa-codigo.mjs
   ```
2. Identifique o módulo em `docs/manuais/modulos.md` (`AUTENTICACAO_RBAC`, `FROTA`, `MOTORISTAS`, `VIAGENS`, `SVO`, `MANUTENCOES`). Se existir `docs/modulos/<MODULO>.html`, leia-o.
3. Abra e leia apenas os arquivos específicos de `backend/src/` e `frontend/src/` que serão diretamente impactados ou reutilizados pela tarefa (**DRY**).

---

### Passo 4 — Aplicar a Regra Inegociável da Dúvida (Antes de Gerar o SDD)

> **É terminantemente proibido assumir premissas.** Frases mentais como *"provavelmente"*, *"imagino que"*, *"deve ser"* ou *"por padrão"* indicam lacuna de requisito.

Verifique se há qualquer ambiguidade nos seguintes pontos:
- **Escopo de Impacto e RBAC:** está claro quais perfis (`ADMIN`, `MANAGER`, `OPERATOR`, `REQUESTER`, `TRIAGE`, `DRIVER`) podem ver ou executar a ação?
- **Regras de Domínio e Transições de Estado:** o comportamento em caso de conflito de horário, capacidade de veículo, triagem obrigatória ou cancelamento está 100% definido?
- **Compatibilidade de Dados e Contratos:** se alterar tabela ou endpoint existente, o que acontece com os registros já gravados no PostgreSQL 18?
- **UX e Fluxo Operacional:** a ordem dos passos, as confirmações de ações destrutivas e os campos obrigatórios estão claros?

Se houver **qualquer dúvida**, interrompa e pergunte objetivamente ao usuário (apresentando as opções identificadas e a sua recomendação técnica) **antes** de escrever o arquivo HTML do plano.

---

### Passo 5 — Gerar o Esqueleto e Preencher o SDD em `docs/plans/<nome-do-plano>.html`

1. **Gere o esqueleto HTML pré-preenchido** (com o CSS oficial de `EXEMPLO_PLANO.html`, metadados do Jira de `.tmp/task-<KEY>/issue.json` e as seções fixas 7, 10, 11 e 12 já prontas):
   ```bash
   node docs/scripts/gerar-esqueleto.mjs plano FROTA-27 --modulo AUTENTICACAO_RBAC
   ```
2. **Edite cirurgicamente o arquivo gerado** substituindo os marcadores `<!-- PREENCHER_SECAO_X -->` para completar as **12 seções**:

1. **Contexto, Objetivo e Escopo** (objetivo no domínio FSPH/SVO, delimitação YAGNI e decisões confirmadas pela Regra da Dúvida);
2. **Requisitos e Regras de Negócio (Casos de Borda)** (cenários *Dado / Quando / Então*, requisitos funcionais e não-funcionais);
3. **Estrutura de Arquivos** (novos arquivos e arquivos alterados com nomes em inglês em `backend/src/` e `frontend/src/`);
4. **Banco de Dados e Migrações (PostgreSQL 18)** (DDL transacional `BEGIN ... COMMIT`, padrão de prefixo de 3 letras em inglês `<pre>_<singular_entity>`, PK `<pre>_id`, FKs `<ref_pre>_id` com `ON DELETE RESTRICT`, índices `<pre>_<name>` sem `idx_`/`uq_` e **Plano de Rollback obrigatório**);
5. **Back-end — Contratos REST e Detalhamento por Arquivo** (tabela de endpoints em inglês, status HTTP, `Types/DTOs` em inglês, `Repository` com `$1, $2`, `<pre>_id AS id` e `SELECT ... FOR UPDATE`, `Service` puro sem Express e `Controller`);
6. **Front-end — Telas, Componentes React 19 e Estados Visuais** (reuso de `components/ui/` e tratamento explícito dos **5 estados visuais**: *Ideal*, *Carregando*, *Vazio*, *Erro*, *Parcial*);
7. **Acessibilidade (WCAG 2.2 Nível AA)** *(pré-preenchida pelo script — complemente com especificidades da tela)*;
8. **Escopo de Impacto, RBAC e Configuração**;
9. **Casos de Teste e Verificação** (testes unitários de `Service`, integração de `Repository` com rollback e roteiro manual por perfil RBAC com dados 100% fictícios — LGPD);
10. **Checklist Pré-PR** *(pré-preenchida pelo script)*;
11. **Atualização da Documentação do Módulo** (`docs/modulos/<MODULO>.html`);
12. **Princípios de Desenvolvimento e Restrições de Implementação** *(pré-preenchida pelo script)*.

3. **Abertura Automática do HTML no Navegador:**
   - Assim que o arquivo HTML do plano (`docs/plans/<nome-do-plano>.html`) for gerado e preenchido, **abra-o imediatamente no navegador padrão do desenvolvedor** para conferência visual:
     - No Windows (PowerShell/CMD): `cmd.exe /c start "" "$((Resolve-Path docs/plans/<nome-do-plano>.html).Path)"` (ou `explorer.exe "$((Resolve-Path docs/plans/<nome-do-plano>.html).Path)"`)
     - No macOS: `open "docs/plans/<nome-do-plano>.html"`
     - No Linux: `xdg-open "docs/plans/<nome-do-plano>.html"`

---

### Passo 6 — Criação da Branch da Tarefa e Próximo Passo (`/implementar`)

Após gerar o SDD, caso o desenvolvedor ainda esteja em `develop` ou deseje criar a branch específica da tarefa, ofereça criar a branch a partir de `develop` atualizada (`git switch develop && git pull origin develop && git switch -c feat/<nome-da-tarefa>`) e informe que, após revisar o SDD, a implementação pode ser iniciada com `/implementar` (`.agents/skills/implementar/SKILL.md`). Nunca faça `git push` ou commits sem confirmação explícita.
