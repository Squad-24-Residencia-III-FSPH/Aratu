# Padrão de Commits, Branches e Pull Requests — Sistema Aratu

O repositório do **Sistema Aratu** adota um fluxo de trabalho com **Branch por Desenvolvedor (`dev-<nome>`)**, **estágio de QA em `develop`** e **Conventional Commits**, garantindo histórico legível, rastreabilidade de entregas e revisões seguras pela **Squad 24**.

---

## 1. Fluxo de Branches (`dev-<nome>` → `develop` (QA) → `main`)

### Estrutura de Branches

| Branch | Finalidade e Regra de Atualização |
|---|---|
| `main` | Versão estável e homologada. Recebe código exclusivamente da `develop` após aprovação do QA. |
| `develop` | Ambiente de integração e **QA (Homologação)**. Recebe Pull Requests das branches `dev-<nome>` e, após validação no QA, é promovida para a `main`. |
| `dev-<nome>` | Branch fixa individual de cada desenvolvedor (ex: `dev-eliakim`, `dev-arthur`). Todo o trabalho do dev permanece nesta branch, **atualizada somente a partir da `main`** (`git pull origin main`). |

### Ciclo completo de uma tarefa no dia a dia

1. **Manter-se na branch do desenvolvedor (`dev-<nome>`) e atualizar somente da `main`:**
   ```bash
   git switch dev-eliakim
   git pull origin main
   ```
2. **Implementar, testar e diferenciar a tarefa pelo comentário do commit:**
   ```bash
   git add .
   git commit -m "feat(auth): implementar controle de sessao e token (FROTA-27)"
   ```
3. **Publicar na branch do dev e abrir Pull Request para `develop` (QA):**
   ```bash
   git push origin dev-eliakim
   # Abrir PR: dev-eliakim -> develop
   ```
4. **Homologação em QA e promoção para `main`:**
   - A entrega é testada e validada pelo **QA** na branch `develop`.
   - Após aprovação no QA, a `develop` é mesclada na `main` (`develop` → `main`).
   - Os desenvolvedores atualizam suas branches `dev-<nome>` novamente a partir da `main` (`git pull origin main`).

### Regras inegociáveis de branch

- **Sempre manter na branch `dev-<nome>`:** não criar branches `feature/...` ou `fix/...` avulsas; o que identifica cada tarefa entregue é a mensagem do commit.
- **`dev-<nome>` só puxa da `main`:** nunca faça `git pull origin develop` para dentro da sua `dev-<nome>` (evitando trazer código ainda não aprovado pelo QA).
- **Fluxo de PR obrigatório:** `dev-<nome>` abre PR para `develop` → passa pelo QA → vai para `main`. Nunca realizar commits diretos na `main` ou na `develop`.
- **Um diff muda comportamento ou estrutura, nunca os dois:** refatorações amplas devem vir em commit/PR separado de novas features ou correções de bugs.

---

## 2. Padrão de Commits (Conventional Commits)

### Formato

```text
tipo(escopo): descrição curta e objetiva (FROTA-XX)
```

- **`tipo`**: natureza da alteração (ver tabela abaixo).
- **`escopo`**: módulo ou camada afetada (ex: `frota`, `viagens`, `svo`, `motoristas`, `manutencoes`, `auth`, `db`, `ui`, `docs`, `docker`).
- **`descrição curta`**: em letras minúsculas, no infinitivo ou imperativo, sem ponto final, com até 72 caracteres (incluindo opcionalmente a chave da issue no Jira para rastreabilidade direta na branch `dev-<nome>`).

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
