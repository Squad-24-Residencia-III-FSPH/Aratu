---
name: buscar-tarefa
description: >
  Coleta e estrutura todos os dados de uma tarefa ou história de usuário do Jira
  (via API REST v3 com docs/scripts/jira-fetch.mjs) ou do contexto local da
  branch da tarefa para o Sistema Aratu (Squad 24 — FSPH / SVO). Use
  quando o usuário pedir para buscar, consultar ou listar tarefas do Jira
  (/buscar-tarefa), informar uma chave ou URL de issue (ex: FROTA-27 ou
  https://squad24.atlassian.net/browse/FROTA-27) ou como etapa inicial das
  skills plano, implementar, revisar e testar.
argument-hint: "[chave ou URL da issue no Jira, ex: FROTA-27 ou https://squad24.atlassian.net/browse/FROTA-27]"
license: MIT
---

# Coletar Dados de Tarefa no Jira — Sistema Aratu

Sub-skill utilitária da **Squad 24** para buscar e estruturar todos os dados de uma issue/história de usuário do **Jira** (`https://squad24.atlassian.net/browse/FROTA-<ID>`) ou consolidar o contexto local da branch no **Sistema Aratu**.

Pode ser invocada diretamente (`/buscar-tarefa`) ou chamada pelas skills `plano` (`.agents/skills/plano/SKILL.md`), `implementar` (`.agents/skills/implementar/SKILL.md`), `revisar` (`.agents/skills/revisar/SKILL.md`) e `testar` (`.agents/skills/testar/SKILL.md`).

---

## 1. Configuração e Segurança de Credenciais (`.credentials`)

Quando a consulta for realizada via **Jira Cloud REST API v3**, as credenciais nunca devem ser hardcoded no código, expostas na conversa ou lidas com ferramentas que exibam o arquivo inteiro no log. Elas residem no arquivo `.credentials` na raiz do repositório (ignorado pelo Git, com modelo em `.credentials.example`):

```ini
JIRA_BASE_URL="https://squad24.atlassian.net"
JIRA_PROJECT_KEY="FROTA"
JIRA_EMAIL="seu-email@dominio.com"
JIRA_API_TOKEN="seu-token-jira"
```

### Regras inegociáveis de segurança

- Nunca exiba o valor de `JIRA_API_TOKEN` na conversa, em relatórios, planos SDD ou commits.
- Nunca execute comandos que imprimam cabeçalhos `Authorization`.
- Caso o arquivo `.credentials` não exista localmente, **não bloqueie o trabalho à toa**: solicite ao desenvolvedor que cole a descrição/critérios da tarefa do Jira na conversa (ou configure o `.credentials` a partir de `.credentials.example`, se preferir consulta automática).

---

## 2. Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A URL completa da tarefa no Jira (ex: `https://squad24.atlassian.net/browse/FROTA-27`), a chave (`FROTA-27`) ou apenas o número (`27`);
- `--mine` / `--list`: para listar todas as tarefas abertas atribuídas ao desenvolvedor no projeto `FROTA` do Jira;
- Vazio: a skill verifica a branch atual (`git branch --show-current`, ex: `feat/controle-sessao-token` ou `feature/login`) e consulta o desenvolvedor caso a chave do Jira não tenha sido informada.

---

## 3. Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Obedecer à Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** Esta skill opera sob subordinação direta a **`.agents/skills/principios/SKILL.md`** e `.agents/skills/principios/references/escopo-impacto.md`. Aplique a **Regra da Dúvida** (não assuma qual tarefa ou perfil RBAC é o correto quando houver ambiguidade) e a **Proteção LGPD/SVO** (anonimize qualquer dado pessoal real eventualmente presente em cards ou anexos do Jira).

---

### Passo 1 — Identificar a Tarefa e a Branch Gitflow

1. Verifique a branch atual e o estado do repositório:
   ```bash
   git branch --show-current
   git status --short
   ```
2. Determine a chave da tarefa no Jira a partir de `$ARGUMENTS`, do nome da branch ou perguntando ao desenvolvedor.

---

### Passo 2 — Obter Dados da Issue no Jira (`docs/scripts/jira-fetch.mjs`)

Utilize o utilitário multiplataforma em Node.js (`docs/scripts/jira-fetch.mjs`), que lê `.credentials` sem expor o token no terminal, consulta a API REST v3 do Jira (`/rest/api/3/issue/{ISSUE_KEY}`), converte os blocos ADF (*Atlassian Document Format*) para Markdown limpo e salva o artefato em `.tmp/task-<ISSUE_KEY>/`:

1. **Para buscar uma issue específica (por chave, URL ou detectando pela branch atual):**
   ```bash
   node docs/scripts/jira-fetch.mjs <ISSUE_KEY> --save
   ```
2. **Para listar as tarefas abertas atribuídas ao desenvolvedor no Jira (quando a chave não foi informada):**
   ```bash
   node docs/scripts/jira-fetch.mjs --mine
   ```

- **Tratamento de retorno do script:**
  - Código `0`: dados coletados e gravados em `.tmp/task-<ISSUE_KEY>/context.md` e `.tmp/task-<ISSUE_KEY>/issue.json`.
  - Código `2` (`.credentials` ausente ou incompleto): avise o desenvolvedor que ele pode copiar `.credentials.example` para `.credentials` ou colar a descrição/critérios da tarefa diretamente na conversa.
  - Código `1` (`401/403/404` no Jira): confirme a chave da issue ou a validade do token com o desenvolvedor.

---

### Passo 3 — Identificar o Módulo e Perfis RBAC Relacionados

Cruze o título e a descrição da tarefa com o mapa oficial em `docs/manuais/modulos.md`:
- **Módulos do Aratu:** `AUTENTICACAO_RBAC`, `FROTA`, `MOTORISTAS`, `VIAGENS`, `SVO`, `MANUTENCOES`.
- **Perfis RBAC:** `ADMIN`, `GESTOR_FROTA`, `SOLICITANTE`, `MOTORISTA`, `OPERADOR_SVO`.

---

### Passo 4 — Emitir o Bloco de Contexto Estruturado

Apresente a saída padronizada abaixo (utilizada pelas skills `plano`, `revisar` e `testar`):

```markdown
## Contexto da Tarefa — {ISSUE_KEY ou IDENTIFICADOR}

- **Chave Jira / ID:** {ISSUE_KEY ou "informada na conversa"}
- **Título:** {summary / título}
- **Tipo:** {História / Tarefa / Bug / Hotfix}
- **Status no Jira:** {status}
- **Prioridade:** {priority}
- **Módulo Aratu:** {FROTA | VIAGENS | SVO | MOTORISTAS | MANUTENCOES | AUTENTICACAO_RBAC}
- **Perfis RBAC Envolvidos:** {perfis identificados ou "a confirmar"}
- **Responsável:** {assignee ou "não atribuído"}

### Descrição e Critérios de Aceite
{descrição completa e critérios de aceite, sem truncar}

### Comentários e Observações Relevantes
{lista de comentários ou "- (nenhum)"}

### Situação no Git (Gitflow)
- **Branch base:** `develop`
- **Branch atual:** `{branch_atual}`
- **Branch sugerida para a tarefa:** `{feat/<nome-da-tarefa> | feature/<nome-da-tarefa> | fix/<nome-da-tarefa>}`
- **Sugestão de Commit:** `{tipo(escopo): descrição curta (FROTA-XX)}`
- **Plano SDD (`docs/plans/<chave-tarefa>-<slug>.html`):** `{encontrado | ainda não gerado}`
```

> **Proteção de Dados (LGPD / SVO):** Se a descrição ou anexo de uma tarefa contiver qualquer dado pessoal real de servidor, motorista ou registro do SVO, anonimize imediatamente antes de transcrever para planos, testes ou commits.
