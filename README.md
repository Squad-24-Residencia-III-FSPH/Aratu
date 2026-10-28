## Aratu — Sistema de Gestão de Frota e Operações

Sistema web desenvolvido pela **Squad 24**, no contexto da Residência em Software III, para apoiar a gestão de frota, viagens institucionais e operações do Serviço de Verificação de Óbito (SVO) da Fundação de Saúde Parreiras Horta (FSPH).

O projeto busca centralizar informações, reduzir controles manuais e melhorar o acompanhamento das solicitações, atividades operacionais e indicadores gerenciais.

> **Status:** Em desenvolvimento.

## Stack

| Tecnologia | Utilização |
|---|---|
| React | Construção da interface web. |
| Node.js | Ambiente de execução do backend. |
| Express | Criação da API REST. |
| PostgreSQL | Banco de dados relacional. |
| Docker | Containerização dos serviços. |
| Git e GitHub | Versionamento e colaboração. |


## Documentação e teste da API

O contrato REST fica versionado em [`backend/docs/openapi.yaml`](backend/docs/openapi.yaml) e é a fonte única de verdade da API. Em desenvolvimento, o backend serve o **Swagger UI** em:

```text
http://localhost:3000/docs
```

O contrato bruto também fica disponível em `http://localhost:3000/docs/openapi.json`, podendo ser importado em clientes como Bruno ou Postman.

Para testar uma rota protegida:

1. Execute `POST /auth/login` com o Administrador provisionado pelo seed.
2. Copie o campo `token` da resposta.
3. Clique em **Authorize**, informe o token no esquema `bearerAuth` e confirme.
4. Execute as demais operações pelo botão **Try it out**.

A documentação interativa é habilitada somente quando `NODE_ENV` não é `production`; a imagem de produção não inclui a rota `/docs`. Todos os exemplos usam dados fictícios, em conformidade com a LGPD e o sigilo do SVO.


## Gitflow

Para organizar o trabaho, será adotado um fluxo de branches inspirado no Gitflow.

### Branches principais

| Branch | Finalidade |
|---|---|
| `main` | Versões estáveis e entregas validadas. |
| `develop` | Integração das funcionalidades em desenvolvimento. |

### Branches de trabalho

| Prefixo | Utilização | Exemplo |
|---|---|---|
| `feature/` | Nova funcionalidade | `feature/login` |
| `fix/` | Correção de defeito | `fix/vehicle-validation` |
| `hotfix/` | Correção urgente em produção ou versão estável | `hotfix/auth-error` |
| `release/` | Preparação de uma entrega | `release/v1.0.0` |


### Fluxo de trabalho

```text
main
  |
  └── develop
        |
        ├── feature/login
        ├── feature/fleet-management
        ├── feature/trip-requests
        └── fix/form-validation
```

O fluxo recomendado é:

1. Atualizar a branch `develop`.
2. Criar uma branch específica para a tarefa.
3. Implementar a funcionalidade ou correção.
4. Executar os testes e revisar o código.
5. Enviar a branch para o GitHub.
6. Abrir um Pull Request para `develop`.

### Exemplo prático

Criando uma branch para desenvolver o cadastro de veículos:

```bash
git switch develop
git pull origin develop
git switch -c feature/vehicle-registration
```

Após implementar a funcionalidade:

```bash
git add .
git commit -m "feat(fleet): add vehicle registration"
git push -u origin feature/vehicle-registration
```

Em seguida, abra um Pull Request de `feature/vehicle-registration` para `develop`.

Depois do merge, atualize sua branch local:

```bash
git switch develop
git pull origin develop
```

**Regras importantes:**

- Não desenvolver diretamente em `main`.
- Evitar commits diretamente em `develop`.
- Não trabalhar na mesma branch para funcionalidades sem relação entre si.
- Não realizar merge de uma funcionalidade sem revisão.
- Resolver conflitos antes de concluir o Pull Request.
- Não enviar arquivos `.env`, dependências instaladas ou arquivos temporários.

### Promoção para produção

Após a integração em `develop`, a equipe promove as alterações para `staging` por Pull Request. O workflow executa lint, testes, verificação de tipos e builds; com todos os checks aprovados, abre ou reutiliza um Pull Request de `staging` para `main`. A revisão e o merge em `main` continuam manuais. O merge aprovado aciona o deploy no VPS via SSH e Docker Compose.

Configure as proteções de branch, o ambiente `production`, secrets e variáveis do Actions e o servidor conforme [`docs/manuais/deploy.md`](docs/manuais/deploy.md).

## Padrão de commits

Será utilizado um padrão inspirado em Conventional Commits.

Formato:

```text
tipo(escopo): descrição curta
```

Exemplos:

```bash
git commit -m "feat(auth): implement user login"
git commit -m "feat(fleet): add vehicle registration"
git commit -m "fix(trips): correct request status validation"
git commit -m "test(auth): add login tests"
git commit -m "docs(readme): document local setup"
git commit -m "refactor(api): simplify error handling"
git commit -m "chore(docker): configure development services"
```

Tipos mais utilizados:

| Tipo | Significado |
|---|---|
| `feat` | Nova funcionalidade. |
| `fix` | Correção de defeito. |
| `docs` | Documentação. |
| `test` | Testes. |
| `refactor` | Refatoração sem mudança intencional de comportamento. |
| `chore` | Tarefas de manutenção e configuração. |
| `style` | Alterações de formatação sem mudança de comportamento. |

Os commits devem ser pequenos, objetivos e relacionados à tarefa executada.

## Pull Requests

Todo Pull Request deverá:

- Ter um título claro e descritivo.
- Informar a tarefa ou história de usuário relacionada.
- Explicar o que foi implementado.
- Informar como a alteração foi testada.
- Apontar eventuais limitações ou pendências.
- Incluir capturas de tela quando houver alterações visuais relevantes.
