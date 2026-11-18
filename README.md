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

### Publicação para homologação

O fluxo é `feature/fix → develop → main`, por Pull Requests revisados. A `main` publica a versão de homologação do cliente em Cloudflare Pages (frontend), Render Free (API) e Neon Free (PostgreSQL 18). Não há branch `staging` nem dependência do VPS anterior.

O CI executa lint, testes, tipos e builds; `ci-required` exige sucesso de todas as validações. A publicação executa o mesmo CI antes de migrations e deploy. Siga o passo a passo em [`docs/manuais/deploy.md`](docs/manuais/deploy.md) para cadastrar o Environment `homologation`, os secrets e os serviços gratuitos.

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

## Geração de ordens SVO (FROTA-115 / FROTA-117)

`POST /svo/orders`, com JWT Bearer de `ATENDENTE_SVO` ou `ADMINISTRADOR`. Depende da API de ocorrências (FROTA-112) e das migrations de equipes e ordens já existentes. Envie exatamente os três IDs como strings decimais positivas canônicas até o limite BIGINT:

```json
{ "occurrenceId": "101", "teamId": "12", "vehicleId": "30" }
```

Sucesso `201`:

```json
{ "id": "55", "status": "OPEN" }
```

A ocorrência precisa estar `CONFIRMED` e nunca ter recebido uma ordem, inclusive cancelada ou encerrada. A equipe precisa estar ativa; membros e motorista não são exigidos nesta criação. O veículo precisa estar `AVAILABLE`, ser da operação `SVO`, incluir a categoria `BODY` e ter uma vaga livre. Cada ordem reserva uma vaga: contam `OPEN`, `IN_TRANSIT`, `IN_SERVICE` e `IN_PROGRESS`; `COMPLETED`, `NOT_PERFORMED` e `CANCELED` liberam a reserva. A soma considera todas as equipes e ordens legadas, com capacidade vigente. Essa reserva não representa ocupação física por corpos coletados.

Manutenção impeditiva `OPEN` ou `IN_PROGRESS` também torna o veículo indisponível, inclusive quando o cadastro legado ainda está `AVAILABLE`. A verificação usa a regra existente da frota, no mesmo cliente transacional após travar a viatura, e retorna `409` sem gerar ordem, evento ou auditoria. Manutenções não impeditivas, `DONE`/`CANCELED` ou de outro veículo não impedem a criação por si só.

Erros usam `{ "erro": "mensagem orientadora" }`: `400` para contrato/JSON inválido ou ocorrência não confirmada; `401` para sessão/conta indisponível; `403` para perfil atual sem permissão; `404` para solicitação, equipe ou veículo inexistente; `409` para duplicidade histórica, equipe inativa, veículo inelegível ou capacidade esgotada; `500` sanitizado para falha inesperada.

A criação trava conta/perfil, ocorrência, equipe e veículo nessa ordem. Ordem, evento `OPENED` e auditoria `CREATE` usam a mesma transação; qualquer falha causa rollback integral. Snapshots preservam o contexto da decisão no domínio SVO. A auditoria transversal inclui somente IDs, estado, abertura, revisão e autoria, sem conteúdo pessoal do chamado. Ocorrência e veículo mantêm seu estado e revisão.

**Reenvio:** uma segunda criação retorna `409`, sem duplicar trilhas. Após timeout, confirme o resultado com a central antes de tentar novamente. A FROTA-118 acrescenta consulta e confirmação de saída/chegada, descritas abaixo; geração pela interface (FROTA-116) e consulta de agenda de viagens continuam fora desta entrega.

Validação com PostgreSQL real em base sintética exclusiva, a partir da raiz:

```bash
docker compose exec -T -e POSTGRES_DB_TEST=aratu_svo_115_117_20261115_test backend npx tsx --test --test-concurrency=1 tests/svo-orders.service.test.ts tests/svo-orders.integration.test.ts
docker compose exec -T -e POSTGRES_DB_TEST=aratu_svo_115_117_20261115_test backend npm test
docker compose exec -T backend npx tsc --noEmit
docker compose exec -T backend npm run build
node docs/scripts/aratu-check.mjs
```

Se `DATABASE_URL_TEST` estiver definida, ela tem precedência sobre `POSTGRES_DB_TEST`: direcione-a à base de testes desejada. O teste de ordens exige nome terminado em `_test`, diferente da base operacional e igual a `current_database()` antes da limpeza. Consulte o [SDD conjunto](docs/plans/frota-115-117-geracao-ordens-svo.html) e a [documentação SVO](docs/modulos/SVO.html#orders).

## Acompanhamento do atendimento SVO (FROTA-118)

Com JWT Bearer, `GET /svo/orders?status=OPEN` retorna um array de resumos ordenado por abertura e ID decrescentes. O filtro é opcional e aceita `OPEN`, `IN_TRANSIT`, `IN_SERVICE`, `IN_PROGRESS`, `COMPLETED`, `NOT_PERFORMED` ou `CANCELED`; parâmetros desconhecidos/repetidos são rejeitados com `400`. Sem ordens/vínculo vigente, retorna `[]`. `GET /svo/orders/:id` acrescenta os snapshots do despacho; `404` para ordem inexistente e `403` para ordem existente fora do escopo do integrante.

`EQUIPE_SVO` consulta a união das equipes com vínculo vigente: ativo, início até o instante atual e fim ausente ou futuro. A consulta preserva ordens de equipes inativas enquanto o vínculo do integrante permanecer vigente. `ATENDENTE_SVO`, `GESTOR` e `ADMINISTRADOR` consultam todas as ordens. Os demais perfis não têm acesso. O perfil atual da conta é revalidado; informar IDs de usuário/equipe na requisição não concede autorização.

Somente `EQUIPE_SVO`, com vínculo vigente e equipe ativa, executa `PATCH /svo/orders/:id/status`. Envie exatamente a situação de destino e a revisão vista na consulta:

```http
PATCH /svo/orders/42/status
Content-Type: application/json

{ "status": "IN_TRANSIT", "revision": 1 }
```

Resposta `200` ilustrativa, com IDs e local inteiramente fictícios:

```json
{
  "id": "42", "occurrenceId": "41", "teamId": "7", "vehicleId": "9",
  "status": "IN_TRANSIT", "revision": 2,
  "openedAt": "2026-11-15T12:00:00.000Z", "departedAt": "2026-11-15T12:05:00.000Z",
  "arrivedAt": null, "collectedAt": null, "closedAt": null,
  "dispatch": { "location": "Local Fictício QA", "teamName": "Equipe Fictícia QA", "vehicleLicensePlate": "FIC0A01" },
  "current": { "location": "Local Fictício QA", "teamName": "Equipe Fictícia QA", "vehicleLicensePlate": "FIC0A01" },
  "allowedTransitions": ["IN_SERVICE"]
}
```

Fluxo `OPEN → IN_TRANSIT → IN_SERVICE`: hora do servidor, revisão +1, evento `DEPARTED`/`ARRIVED` e auditoria `UPDATE` na mesma transação. A próxima chamada usa `{ "status": "IN_SERVICE", "revision": 2 }`. Estados legados/encerrados não avançam. Revisão antiga, repetição, salto, retrocesso ou carimbo incompatível retornam `409`, sem novos efeitos. IDs são strings canônicas até o limite BIGINT; payload inválido retorna `400`, sessão/conta indisponível `401`, acesso negado `403` e falha inesperada `500` sanitizada. Erros mantêm `{ "erro": "mensagem orientadora" }`.

Os resumos distinguem `dispatch` (somente snapshots) de `current` (cadastros atuais). Snapshots ausentes continuam nulos e são apresentados como “Não registrado no despacho”; não há preenchimento retroativo. Detalhes incluem `occurrenceSnapshot`, `teamSnapshot` e `vehicleSnapshot`. Somente o detalhe autorizado contém contato/descrição/notas do chamado; a auditoria de atualização guarda IDs, estado, revisão, horários e autoria. Saída/chegada preservam reserva, alocação e snapshots. O encerramento pertence à FROTA-124.

Interface: `/svo/ordens` é a home exclusiva da equipe, com cards, filtro, detalhe e confirmação. `/svo/acompanhamento` é a consulta exclusiva do atendente, com botão **Atualizar** e sem comandos de escrita; sua home `/svo/solicitacoes` permanece para a FROTA-109. Gestor/admin consultam pela API, sem nova tela. Em perda de resposta após PATCH, a interface bloqueia reenvio até **Consultar situação** executar GET; não anuncia sucesso sem confirmação. Uma mutação confirmada cuja recarga falha mantém o card e sinaliza lista desatualizada, bloqueando novos avanços até atualização. Conteúdo operacional fica apenas em memória e é removido ao trocar sessão.

Ver [SDD FROTA-118](docs/plans/frota-118-acompanhar-atendimento-svo.html) e [documentação e validação SVO](docs/modulos/SVO.html#tracking).

## Registro de resultado e encerramento SVO (FROTA-122 / FROTA-123 / FROTA-124 / FROTA-125)

Somente `EQUIPE_SVO`, com conta ativa, vínculo vigente na equipe da ordem e equipe ativa, executa `POST /svo/orders/:id/result` para encerrar o atendimento:

- `IN_SERVICE → COMPLETED`: define `status = result = "COMPLETED"`, grava `collectedAt = closedAt` com o instante do servidor, `closedBy` com o usuário autenticado, `failureReason = null` e incrementa `revision`.
- `IN_TRANSIT` ou `IN_SERVICE → NOT_PERFORMED`: exige `failureReason` não vazio (normalizado com `trim`), define `status = result = "NOT_PERFORMED"`, `collectedAt = null`, `closedAt` do servidor, `closedBy` e incrementa `revision`.
- `notes` é opcional (vazio/omitido vira `null`). Informar `failureReason` não vazio para `COMPLETED` ou omiti-lo em `NOT_PERFORMED` retorna `400` (`"Informe o motivo da não realização."`).
- `OPEN`, `IN_PROGRESS` (legado), `COMPLETED`, `NOT_PERFORMED` e `CANCELED`, bem como conclusão em `IN_TRANSIT` ou revisão divergente, retornam `409` sem escrita. `PATCH /svo/orders/:id/status` permanece restrito a saída/chegada.

Exemplo sintético de requisição:

```http
POST /svo/orders/42/result
Content-Type: application/json

{
  "result": "NOT_PERFORMED",
  "revision": 2,
  "failureReason": "Atendimento fictício impossibilitado no local.",
  "notes": "Central informada pela equipe de teste."
}
```

A listagem (`GET /svo/orders`) acrescenta `result` e `allowedResults` aos resumos; o detalhe (`GET /svo/orders/:id` e a resposta `200` do `POST /:id/result`) acrescenta `failureReason`, `notes` e `closedBy`. O encerramento grava evento imutável (`COMPLETED` ou `NOT_PERFORMED`) em `svo.execution_order_events`, auditoria `UPDATE` em `audit.logs` na mesma transação e libera imediatamente uma vaga na reserva derivada de capacidade do veículo.

Na interface, `/svo/ordens` abre com o recorte inicial **Ativas** (filtrando localmente os estados ocupantes sem enviar `status=ACTIVE`), exibe **Encerrar** quando `allowedResults` possui opções e conduz preenchimento e revisão em dois passos no mesmo diálogo (`SvoOrderResultDialog`), preservando o rascunho ao acionar **Voltar ao formulário**. `/svo/acompanhamento` fica disponível em leitura para `ATENDENTE_SVO` e `GESTOR` (incluindo atalho no menu lateral do gestor). Em perda de resposta após o POST, o reenvio fica bloqueado até **Consultar situação** reconciliar via `GET /svo/orders/:id`.

Ver [SDD FROTA-122](docs/plans/frota-122-registrar-resultado-svo.html) e [documentação SVO](docs/modulos/SVO.html#results).

## Consulta de auditoria (FROTA-141)

`GET /audit-logs` exige Bearer JWT de uma conta ativa com perfil Gestor ou Administrador.

- Filtros opcionais `inicio` e `fim` no formato `AAAA-MM-DD`. As duas datas são inclusivas no fuso operacional `America/Maceio`.
- `usuario_id` aceita um ID positivo. `acao` e `entidade` correspondem aos valores registrados, como `UPDATE` e `fleet.vehicles`.
- `page` começa em 1. Cada página retorna até 25 itens, do mais recente ao mais antigo.
- Resposta `200` com `{ rows, total }`. Cada item contém `id`, `created_at`, `usuario`, `acao`, `entidade`, `resumo` e `detalhes_mascarados`. Snapshots, justificativas e identificadores do alvo são ocultados.
- Filtro inválido retorna `400` com `{ erro }`. Sessão inválida retorna `401` e perfil sem acesso retorna `403`.

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
