---
name: testar
description: >
  Executa e valida a bateria de testes funcionais de uma tarefa do Sistema Aratu
  no navegador (React 19 em localhost:5173), na API REST (Express 5 em
  localhost:3000) e no PostgreSQL 18, auditando perfis RBAC, 5 estados visuais e
  acessibilidade WCAG 2.2 Nível AA com dados 100% fictícios (LGPD). Use quando o
  usuário pedir /testar ou solicitar a verificação prática de uma funcionalidade.
argument-hint: "[nome da branch, chave da issue no Jira ou vazio para testar a branch atual]"
license: MIT
---

# Testar Tarefa no Ambiente Local — Sistema Aratu

Obtém o contexto da tarefa (plano SDD em `docs/plans/` ou dados do Jira via `.agents/skills/buscar-tarefa/SKILL.md`), verifica a saúde dos containers Docker (`db`, `backend`, `frontend`), executa os cenários de teste de ponta a ponta (interface React 19 em `http://localhost:5173`, API Express 5 em `http://localhost:3000` e persistência no **PostgreSQL 18**) e audita os critérios de acessibilidade (**WCAG 2.2 Nível AA**) e controle de acesso (**RBAC**).

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A chave ou URL da tarefa no Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- O nome da branch do desenvolvedor (ex: `dev-eliakim`);
- Vazio: utiliza a branch atual (`git branch --show-current`).

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** Antes de executar a bateria de testes ou julgar o comportamento de uma tela/endpoint, leia e aplique obrigatoriamente **`.agents/skills/principios/SKILL.md`** e as referências `.agents/skills/principios/references/acessibilidade.md`, `ui-componentes.md`, `ux-fluxo.md`, `escopo-impacto.md` e `dados.md`. Aplique a **Regra da Dúvida** (nunca assuma credenciais ou regras não documentadas em silêncio) e a **Proteção LGPD/SVO** (dados 100% fictícios).

---

### Passo 1 — Levantar Contexto, Plano SDD e Diff Real

1. Identifique a branch atual e os arquivos alterados em relação à `develop`:
   ```bash
   git branch --show-current
   git diff --name-only develop...HEAD
   ```
2. Se existir plano técnico em `docs/plans/<nome-do-plano>.html`, leia as seções **2 (Requisitos)**, **5 (Contratos REST)**, **6 (Front-end e 5 Estados Visuais)**, **7 (Acessibilidade WCAG 2.2 AA)** e **9 (Casos de Teste)**.
3. Caso não haja plano local e tenha sido informada uma chave do Jira, execute `.agents/skills/buscar-tarefa/SKILL.md`.

---

### Passo 2 — Verificar Saúde do Ambiente Docker (`docker-compose.yml`)

Confirme se os três serviços essenciais estão em execução:

```bash
docker compose ps
```

Serviços esperados:
- **`db` (`postgres:18-alpine`):** porta `5432`
- **`backend` (Node.js / Express 5 / TS):** `http://localhost:3000`
- **`frontend` (React 19 / Vite):** `http://localhost:5173`

Se algum serviço estiver parado, avise o desenvolvedor antes de subir ou reiniciar containers.

---

### Passo 3 — Credenciais e Perfis de Teste (RBAC e LGPD)

- **Nunca assuma credenciais em silêncio:** verifique as seeds de desenvolvimento do projeto ou pergunte ao desenvolvedor quais credenciais de teste utilizar para cada perfil **RBAC** envolvido na tarefa:
  1. `ADMIN` (Administrador)
  2. `GESTOR_FROTA` (Gestor de Frota / Aprovador)
  3. `SOLICITANTE` (Solicitante de Viagem — FSPH)
  4. `MOTORISTA` (Motorista)
  5. `OPERADOR_SVO` (Operador / Equipe SVO)
- **Proteção de Dados (LGPD):** utilize exclusivamente dados fictícios e sintéticos ao preencher formulários durante a bateria de testes.

---

### Passo 4 — Executar Bateria de Testes (API, Banco e Navegador)

Monte e execute a lista de cenários cobrindo:

#### 4.1 Validação de Contratos da API e Segurança RBAC (`http://localhost:3000`)
- **Caminho Feliz:** envie payload válido e confirme status HTTP (`200`/`201`) e formato JSON retornado.
- **Validação de Domínio e Entrada Inválida:** envie campos obrigatórios vazios, formatos inválidos (ex: placa fora do padrão, km final menor que km inicial, CNH vencida) e confirme retorno `400` ou `422` com mensagem orientadora em português (sem expor stack trace do banco).
- **Controle de Acesso (RBAC):** teste o endpoint sem autenticação (`401 Unauthorized`) e autenticado com um perfil sem permissão para aquela rota (`403 Forbidden`).
- **Concorrência / Idempotência (quando aplicável):** verifique que a repetição ou envio concorrente de uma alocação não duplica registros no PostgreSQL 18.

#### 4.2 Validação na Interface Web React 19 (`http://localhost:5173`)
Quando a tarefa tiver impacto visual no frontend:
1. Navegue até a página da funcionalidade e verifique a ausência de erros no console JavaScript e de requisições HTTP quebradas.
2. Exercite o fluxo principal de preenchimento, submissão e atualização da listagem.
3. Verifique o comportamento dos **5 estados visuais**: *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*.
4. **Auditoria prática de Acessibilidade (WCAG 2.2 Nível AA):**
   - Associação programática `<label htmlFor>` + `<input id>` (gerado via `useId()`);
   - Navegação completa por teclado (`Tab`, `Shift+Tab`, `Enter`, `Espaço`, `Esc` para fechar modais) e foco visível (`:focus-visible`) sem obstrução por barras fixas;
   - Alvos de toque/clique com no mínimo **44×44px** nas telas operacionais móveis (motoristas/pátio);
   - Anúncio de mensagens de feedback via `role="status"`, `role="alert"` ou `aria-live="polite"`;
   - Status que combinam cor + texto explícito + ícone.

#### 4.3 Conferência de Persistência no PostgreSQL 18
Confirme no container `db` que os registros foram gravados corretamente (colunas de domínio, `status`, `created_at` e `updated_at` com `TIMESTAMPTZ`):
```bash
docker compose exec db psql -U admin -d meubanco -c "SELECT id, status, created_at FROM <tabela> ORDER BY created_at DESC LIMIT 5;"
```

---

### Passo 5 — Emitir Relatório de Testes

Apresente o resultado de forma estruturada e transparente (cenários que não puderam ser executados devem ser marcados como ⚠️, nunca como ✅):

```markdown
## Relatório de Testes — Sistema Aratu

- **Tarefa / Branch:** `{identificador / branch}`
- **Ambiente:** Frontend (`http://localhost:5173`) · Backend (`http://localhost:3000`) · DB (`PostgreSQL 18`)
- **Perfis RBAC Testados:** `{lista de perfis}`
- **Data:** `{YYYY-MM-DD}`

### Cenários Executados

| # | Camada / Perfil | Cenário | Resultado | Observação / Evidência |
|---|---|---|---|---|
| 1 | UI + API (`SOLICITANTE`) | Fluxo principal (caminho feliz) | ✅ / ❌ / ⚠️ | {status HTTP, feedback na tela e registro no banco} |
| 2 | UI + API | Validação de campos obrigatórios e regras de domínio | ✅ / ❌ / ⚠️ | {mensagem de erro orientadora + `role="alert"`} |
| 3 | API (`RBAC`) | Bloqueio de acesso deslogado (`401`) e perfil não autorizado (`403`) | ✅ / ❌ / ⚠️ | {resposta verificada} |
| 4 | UI (`WCAG 2.2 AA`) | Navegação por teclado, `useId()`, 5 estados visuais e alvos 44×44px | ✅ / ❌ / ⚠️ | {detalhes da inspeção} |

### Resumo
- ✅ Passou: {N} · ❌ Falhou: {N} · ⚠️ Não conclusivo / Pendente: {N}

### Problemas Encontrados e Próximos Passos
{Descrição objetiva de qualquer falha encontrada (rota, payload, console, query) ou confirmação de aptidão para abertura do Pull Request em `develop`}
```
