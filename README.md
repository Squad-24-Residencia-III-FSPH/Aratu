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

## Solicitações SVO (FROTA-112 / FROTA-111)

A API registra chamados recebidos externamente, inclusive fora do expediente, e confirma a triagem simples. Todas as rotas exigem `Authorization: Bearer <token>` e revalidam o perfil atual da conta.

| Método e endpoint | Perfis | Resultado |
|---|---|---|
| `POST /svo/occurrences` | `ATENDENTE_SVO`, `ADMINISTRADOR` | `201` com `{ id, status: "PENDING", receivedAt, createdAt, revision: 1 }` |
| `GET /svo/occurrences?status=&from=&to=` | Os anteriores e `GESTOR` | `200` com array de resumos; sem resultados retorna `[]` |
| `GET /svo/occurrences/:id` | Os anteriores e `GESTOR` | `200` com detalhe; inexistente retorna `404` |
| `POST /svo/occurrences/:id/confirm` | `ATENDENTE_SVO`, `ADMINISTRADOR` | Sem corpo ou `{}`; `200` com `{ id, status: "CONFIRMED", triagedAt, triagedBy, revision }` |

Exemplo sintético do corpo de criação:

```json
{
  "requesterName": "Solicitante Fictício QA",
  "requesterPhone": "00000000000",
  "requesterType": "FAMILY",
  "location": "Local Fictício de Teste",
  "description": "Chamado sintético sem dados reais.",
  "notes": null,
  "receivedAt": "2020-01-04T02:15:00-03:00",
  "evidenceDescription": "Contato telefônico fictício recebido pela central."
}
```

`requesterType`: `FAMILY`, `HOSPITAL`, `UBS`, `UPA`, `PUBLIC_AGENCY` ou `OTHER`. Os textos obrigatórios são normalizados com `trim`; telefone não exige máscara. `notes` é opcional e valores vazios viram `null`. `receivedAt` é opcional (usa o relógio do banco), exige ISO 8601 com fuso quando informado e não aceita futuro. A evidência textual do canal/meio é obrigatória. Propriedades fora do contrato são rejeitadas.

Os filtros opcionais `from` e `to` aceitam `AAAA-MM-DD`, inclusive ambos os dias em `America/Maceio`, sobre a data de recebimento. `status` aceita `PENDING`, `CONFIRMED` ou `CANCELED`. A ordenação é `receivedAt DESC, id DESC`, sem paginação nesta entrega. Exemplo: `GET /svo/occurrences?status=PENDING&from=2020-01-04&to=2020-01-05`.

O resumo contém somente `id`, `requesterType`, `location`, `status`, `receivedAt`, `createdAt` e `revision`. O detalhe acrescenta `requesterName`, `requesterPhone`, `description`, `notes`, `attendantId`, `triagedAt`, `triagedBy`, `updatedAt` e `evidenceDescription`. Evidência ausente em legado permanece `null`. IDs são strings BIGINT, datas são ISO 8601 e snapshots/eventos brutos não são expostos.

Erros usam `{ "erro": "mensagem orientadora" }`: `400` para entrada inválida, `401` para sessão/conta indisponível, `403` para perfil sem acesso, `404` para ocorrência inexistente, `409` para confirmação repetida/cancelada e `500` genérico para falha inesperada. `EQUIPE_SVO`, `SOLICITANTE` e `MOTORISTA` não acessam essas rotas. `GESTOR` só consulta.

Ocorrência, evento e auditoria são gravados na mesma transação; confirmações concorrentes geram um único efeito. **Criação não oferece chave de idempotência:** após timeout ou resposta incerta, consulte e confira o registro antes de decidir reenviar. A consulta, sozinha, não comprova qual POST originou o chamado. Não há deduplicação por nome/telefone/local nem reenvio automático.

Ver [documentação do SVO](docs/modulos/SVO.html), [plano da API](docs/plans/frota-112-api-registro-solicitacao-svo.html) e [matriz de integração](docs/plans/frota-111-testes-registro-solicitacao-svo.html). Testes: `cd backend`, `npx tsx --test tests/svo-occurrences.service.test.ts` e `npx tsx --test --test-concurrency=1 tests/svo-occurrences.integration.test.ts`, exclusivamente em banco de testes. A tela pertence à FROTA-109.

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
