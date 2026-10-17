# Padrão de Commits, Branches e Pull Requests — Sistema Aratu

O repositório do **Sistema Aratu** adota um fluxo de trabalho baseado em **Gitflow** (conforme `README.md`) e **Conventional Commits**, garantindo histórico legível, rastreabilidade de entregas e revisões seguras pela **Squad 24**.

---

## 1. Fluxo de Branches (Gitflow)

### Estrutura de Branches

| Branch / Prefixo | Finalidade | Exemplo |
|---|---|---|
| `main` | Versões estáveis e entregas validadas. | `main` |
| `develop` | Integração das funcionalidades em desenvolvimento. | `develop` |
| `feat/` ou `feature/` | Nova funcionalidade criada a partir de `develop`. | `feat/controle-sessao-token`, `feature/login` |
| `fix/` | Correção de defeito criada a partir de `develop`. | `fix/vehicle-validation` |
| `hotfix/` | Correção urgente em produção ou versão estável. | `hotfix/auth-error` |
| `release/` | Preparação de uma entrega. | `release/v1.0.0` |

### Ciclo completo de uma tarefa no dia a dia

1. **Atualizar a branch `develop` e criar uma branch específica para a tarefa:**
   ```bash
   git switch develop
   git pull origin develop
   git switch -c feat/controle-sessao-token
   ```
2. **Implementar, testar e registrar os commits seguindo Conventional Commits:**
   ```bash
   git add .
   git commit -m "feat(auth): implementar controle de sessao e token (FROTA-27)"
   ```
3. **Enviar a branch para o GitHub e abrir Pull Request para `develop`:**
   ```bash
   git push -u origin feat/controle-sessao-token
   # Abrir PR: feat/controle-sessao-token -> develop
   ```
4. **Após a revisão e merge em `develop`, atualizar a branch local:**
   ```bash
   git switch develop
   git pull origin develop
   ```

### Regras inegociáveis de branch

- **Não desenvolver diretamente em `main` ou `develop`:** toda tarefa deve ter sua própria branch (`feat/...`, `feature/...`, `fix/...`, `hotfix/...`).
- **Escopo isolado por branch:** não trabalhar na mesma branch para funcionalidades sem relação entre si.
- **Revisão obrigatória:** não realizar merge de uma funcionalidade sem revisão e sem resolver eventuais conflitos antes de concluir o Pull Request.
- **Um diff muda comportamento ou estrutura, nunca os dois:** refatorações amplas devem vir em commit/PR separado de novas features ou correções de bugs.

---

## 2. Padrão de Commits (Conventional Commits)

### Formato

```text
tipo(escopo): descrição curta e objetiva (FROTA-XX)
```

- **`tipo`**: natureza da alteração (ver tabela abaixo).
- **`escopo`**: módulo ou camada afetada (ex: `frota`, `viagens`, `svo`, `motoristas`, `manutencoes`, `auth`, `db`, `ui`, `docs`, `docker`).
- **`descrição curta`**: em letras minúsculas, no infinitivo ou imperativo, sem ponto final, com até 72 caracteres (incluindo opcionalmente a chave da issue no Jira para rastreabilidade direta).

### Tipos permitidos

| Tipo | Quando utilizar | Exemplo |
|---|---|---|
| `feat` | Nova funcionalidade visível ou de domínio | `feat(frota): adicionar cadastro de veiculos` |
| `fix` | Correção de bug na causa raiz | `fix(viagens): corrigir conflito de horario na alocacao` |
| `refactor` | Melhoria interna de código sem alterar comportamento | `refactor(svo): extrair validacao de liberacao para service` |
| `test` | Adição ou ajuste de testes automatizados | `test(frota): cobrir transacao de alocacao de viatura` |
| `docs` | Criação ou atualização de documentação | `docs(modulos): atualizar template de documentacao` |
| `chore` | Configuração de build, dependências ou Docker | `chore(docker): ajustar healthcheck do postgres 18` |
| `style` | Formatação, lint ou espaçamento sem mudança semântica | `style(ui): aplicar regras do eslint nos formularios` |

### Escopo e tamanho do commit

- Faça commits pequenos, coesos e que mantenham o projeto compilando (`tsc` sem erros).
- Limite recomendado por Pull Request: **até 400 linhas novas ou alteradas** (acima disso aciona agravante na política de revisão).

---

## 3. Padrão de Pull Requests (PR)

Todo Pull Request aberto para `develop` deve conter:

1. **Título claro** seguindo o formato Conventional Commits.
2. **Contexto e História de Usuário:** qual necessidade operacional da FSPH ou do SVO está sendo atendida.
3. **Resumo Técnico:** o que foi alterado em cada camada (`routes`, `controllers`, `services`, `repositories`, `pages`, `components`).
4. **Roteiro de Testes:** passo a passo reproduzível informando endpoints REST, telas React, perfil RBAC utilizado e estado esperado no PostgreSQL.
5. **Acessibilidade e UI:** confirmação de conformidade com a **WCAG 2.2 Nível AA** e capturas de tela quando houver mudança visual.
6. **Limitações ou Pendências:** qualquer item fora do escopo (YAGNI) ou decisão confirmada com o usuário.

---

## 4. Proteção de Dados e LGPD nos Commits

- É **terminantemente proibido** incluir dados reais de pessoas (nomes de falecidos, familiares, números de Declaração de Óbito do SVO, CPF ou CNH reais de motoristas e servidores da FSPH) em mensagens de commit, descrições de PR, seeds, migrations ou capturas de tela.
- Nunca envie arquivos `.env`, dumps de produção, chaves privadas ou diretórios `node_modules/`.
