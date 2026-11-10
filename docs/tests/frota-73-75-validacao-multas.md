# Relatório de Testes — FROTA-73 e FROTA-75

- **Data:** 08/11/2026, America/Sao_Paulo.
- **Branch:** `feat/us10-gerenciar-multas`.
- **HEAD e base develop:** `c9899b83119f83ee7532512d950bcb4b68913fbb`, acrescidos de todos os arquivos locais modificados e não rastreados da entrega. Não se trata apenas do diff de commits.
- **Escopo:** API de multas FROTA-73 e testes backend FROTA-75, conforme os [dois](../plans/frota-73-api-multas-infracoes.html) [SDDs aprovados](../plans/frota-75-testes-multas.html). US10 independente da FROTA-67.
- **Ambiente:** Windows/PowerShell; containers db/backend/frontend ativos nas portas 5432/3000/5173; PostgreSQL **18.6** real. HTTP de validação contra `createApp` em `127.0.0.1` com portas efêmeras, ligado exclusivamente à base de testes.
- **RBAC:** GESTOR e ADMINISTRADOR autorizados; SOLICITANTE, MOTORISTA, ATENDENTE_SVO e EQUIPE_SVO negados. Usuários, senhas e tokens oriundos das fixtures sintéticas existentes, sem credenciais neste relatório.
- **UI:** não executada. FROTA-74 é uma entrega separada; responsividade, cinco estados visuais, teclado, contraste e leitor de tela não foram certificados.

## Parecer por tarefa

| Tarefa | Resultado | Alcance |
|---|---|---|
| FROTA-73 | ✅ Validada no escopo backend | Seis rotas HTTP, PostgreSQL, contratos, autorização atual, eventos e auditoria; nenhum defeito da aplicação identificado nesta validação. |
| FROTA-75 | ✅ Validada no escopo backend | Suíte completa atualizada aprovada; duas melhorias P3 verificadas, com reforço adicional do teste de unicidade descrito abaixo. |
| Repositório global | ❌ Checagem global reprovada | Falhas preexistentes do frontend reproduzidas. Este parecer não aprova o pipeline global nem a interface de multas. |

Nenhuma branch foi trocada, nenhum commit/push foi realizado e nenhum trabalho local foi descartado. A única alteração de código feita neste chat foi no teste `IT-FINE-10` de `backend/tests/fines.integration.test.ts`; o código da aplicação não foi alterado. Os relatórios originais de revisão foram preservados, com igualdade SHA-256 conferida antes/depois.

## Segurança do banco e execução

Antes de qualquer suíte capaz de truncar, a conexão efetiva foi consultada: **aratu_test**, distinta de **meubanco** (base operacional). O helper carrega a configuração existente; nenhuma URL com credenciais foi impressa. As suítes com limpeza rodaram sequencialmente, com `--test-concurrency=1`, sem outra suíte de banco em paralelo. O fluxo HTTP complementar foi executado somente depois da suíte completa e não truncou tabelas.

Na base operacional foram feitas somente leituras de metadados e contagens. Antes/depois: `fleet.fines = 0`, `fleet.fine_events = 0`, `audit.logs = 74`; a lista de colunas de `fleet.fines` permaneceu igual e **creation_key continuou ausente**. Nenhuma migration foi aplicada à base operacional. Essa comparação comprova a preservação dessas contagens/metadados; não é uma auditoria de cada registro de todos os módulos.

As migrations, seus rollbacks e as falhas instrumentadas pertencem exclusivamente a `aratu_test`. Servidores efêmeros e pools encerraram normalmente; ao final não havia conexão de teste ociosa em transação nem a função temporária `fleet.fail_fine_event_qa`.

## Resultados executados

| Verificação | Resultado real | Evidência local |
|---|---|---|
| Suíte completa backend após o reforço P3 | ✅ **177 passaram**, 0 falhas, 0 cancelados, 0 skips, 0 todo; **64,534 s** do runner | [.tmp/frota-73-75-qa-backend-tests.log](../../.tmp/frota-73-75-qa-backend-tests.log) |
| Cenários P3 isolados | ✅ 2 passaram, 0 falhas/skips; 2,359 s | [.tmp/frota-73-75-qa-p3-tests.log](../../.tmp/frota-73-75-qa-p3-tests.log) |
| Build backend local | ✅ Exit 0 | [.tmp/frota-73-75-qa-backend-build.log](../../.tmp/frota-73-75-qa-backend-build.log) |
| Typecheck backend local, incluindo testes | ✅ Exit 0 | [.tmp/frota-73-75-qa-backend-typecheck.log](../../.tmp/frota-73-75-qa-backend-typecheck.log) e auditoria final |
| Build e typecheck backend no container | ✅ Ambos exit 0 | [.tmp/frota-73-75-qa-container-build.log](../../.tmp/frota-73-75-qa-container-build.log), [.tmp/frota-73-75-qa-container-typecheck.log](../../.tmp/frota-73-75-qa-container-typecheck.log) |
| Fluxo HTTP complementar + SQL | ✅ Login, sugestão, identificação/troca, pagamento/reabertura, histórico, 401/403 e down protegido | [.tmp/frota-73-75-qa-http.log](../../.tmp/frota-73-75-qa-http.log) |
| Pré-auditoria `aratu-check.mjs` | ❌ Exit 1; frontend 91 passaram e 3 suítes falharam; typecheck frontend falhou | [.tmp/frota-73-75-qa-audit.log](../../.tmp/frota-73-75-qa-audit.log) |
| Build frontend local | ❌ Exit 2; erros preexistentes descritos abaixo | [.tmp/frota-73-75-qa-frontend-build.log](../../.tmp/frota-73-75-qa-frontend-build.log) |
| Isolamento e conferência posterior | ✅ Bancos distintos, resumo operacional e revisões preservados | [.tmp/frota-73-75-qa-before.json](../../.tmp/frota-73-75-qa-before.json), [.tmp/frota-73-75-qa-after.json](../../.tmp/frota-73-75-qa-after.json), [.tmp/frota-73-75-qa-isolation.log](../../.tmp/frota-73-75-qa-isolation.log) |
| UI, responsividade e WCAG visual | ⚠️ Não executados, fora do escopo aprovado | Responsabilidade da FROTA-74; nenhuma evidência de navegador da aplicação é alegada. |

Os 177 testes incluem os módulos preexistentes. Na entrega de multas há **18 testes de integração** e **8 testes de serviço**, além da cobertura de conta atual em `auth.test.ts`. IDs IT-FINE agrupam múltiplas verificações; a matriz FSM percorre 16 pares dentro de um teste, sem inflar a contagem do runner. Uma primeira execução antes do reforço também passou 177/177 em 70,709 s; o aceite usa a execução final acima.

## Matriz dos cenários dos SDDs

Todos os 19 IDs foram exercitados; as observações distinguem a regressão versionável do complemento HTTP/SQL local. A aprovação de um cenário se limita às verificações descritas, sem alegar cobertura percentual de linhas ou de todos os interleavings possíveis.

| ID | Camada/perfil e cenário | Resultado | Verificação/evidência |
|---|---|---|---|
| IT-FINE-01 | API/DB, GESTOR: cadastro com e sem motorista | ✅ | POST 201, PENDING, revision 1, driverId nulo preservado; multa, REGISTERED e auditoria atômicos; autoria e tempos distintos. |
| IT-FINE-02 | Serviço/API: obrigatoriedade e moeda | ✅ | Ausentes, nulos, espaços, número JSON, negativo, vírgula, excesso de casas e overflow rejeitados; 0.00 e 9999999999.99 aceitos; inválidos não deixam efeitos. |
| IT-FINE-03 | Serviço/API: IDs, instantes, filtros | ✅ | BIGINT excedido, data impossível, ausência de fuso, status inválido, query repetida e período vazio rejeitados; referências inexistentes retornam 404; normalização de instantes equivalentes. |
| IT-FINE-04 | API/DB: sugestões temporais | ✅ | Início incluído, fim excluído; em andamento até relógio injetado; sem início/agendada/cancelada excluídas; zero/múltiplos na integração e candidato único no complemento; nenhuma associação automática. |
| IT-FINE-05 | API/DB: confirmação do vínculo | ✅ | Candidato válido aceito; veículo/horário incompatível e viagem sem motorista retornam 422; viagem cancelada depois da sugestão revalidada. Motorista divergente entre dois IDs distintos conferido também no fluxo complementar, com revisão inalterada após 422. |
| IT-FINE-06 | API/DB: identificação e retificação | ✅ | Identificação/remoção, before/after, revisão e supersedesId na integração. Troca entre dois motoristas não nulos, com retirada explícita da viagem anterior, confirmada no complemento HTTP e no histórico. |
| IT-FINE-07 | Serviço/API: FSM, pagamento, cancelamento e reabertura | ✅ | Matriz dos 16 pares; PAID exige instante; fechada não edita; motivo cancelado e pagamento anterior preservados no histórico, limpando apenas estado vigente ao reabrir. |
| IT-FINE-08 | API/DB: consultas | ✅ | Filtros individuais/combinados, from incluído/to excluído, ordem estável por instante/id, vazio 200, detalhe; GET preserva entidade/eventos/auditorias. |
| IT-FINE-09 | API: seis rotas e seis perfis RBAC | ✅ | Gestor/admin executam seis rotas; demais quatro perfis recebem 403 inclusive motorista vinculado; token ausente/inválido/expirado e conta inexistente/inativa recebem 401; papel revogado após emissão recebe 403. |
| IT-FINE-10 | API/PostgreSQL: replay e chave concorrente | ✅ | Mesmo pedido/chave retorna mesmo id; comparação com pedido inicial após edição; autor diferente independente; payload/veículo diferente retorna 409. P3 reforçado comprova 23505 real e exatamente uma criação/evento/auditoria. |
| IT-FINE-11 | API/PostgreSQL: revisão e troca concorrente | ✅ | Mesma revisão concorrente resulta em 200/409, incrementa uma vez; no-op não grava e revisão antiga conflita. Troca válida e trocas opostas A→B/B→A passam sem deadlock, com revisões, snapshots e contagens exatas. |
| IT-FINE-12 | API/PostgreSQL: falha transacional | ✅ | Falha de auditoria e de evento em POST/PUT/PATCH retorna 500 genérico e preserva estado/revisão/chave/eventos/auditoria; retry cria uma vez; conexões liberadas e trigger/função temporárias removidos. |
| IT-FINE-13 | API/DB: snapshots e privacidade | ✅ | Alterações cadastrais não reescrevem retratos; origem cadastral identificada; projeção pública restrita inclusive before/after e snapshots legados, sem CPF/CNH/e-mail do ator/dados SVO/pedido técnico. |
| IT-FINE-14 | API/DB: histórico imutável | ✅ | UPDATE/DELETE de fine_events rejeitados; nenhuma rota DELETE; timeline e pagamento antigo preservados; occurredAt distinto de registeredAt e ordenação da timeline por registeredAt/id no repository. |
| IT-FINE-15 | PostgreSQL: migration, legado e down | ✅ | Down antes do uso, legado sem snapshots/chave e reaplicação em transação isolada; recusa após chave usada. Complemento SQL comprovou também guarda por registrationRequest com todas as chaves NULL, sem perder coluna/histórico. Unicidade entre autores é exercitada em IT-FINE-10. |
| IT-FINE-16 | API/DB: referências históricas hoje inativas | ✅ | Veículo/motorista inativos e CNH vencida aceitos no registro histórico; disponibilidade não é alterada. |
| IT-FINE-17 | Serviço/API: contrato e dados malformados | ✅ | Campos controlados/desconhecidos, body estrutural inválido, UUID inválido, nulabilidade, SQL injection e anexos indevidos rejeitados; erros textuais sem SQL/stack e sem efeito parcial. |
| IT-FINE-18 | Middleware/API/DB: conta atual | ✅ | Ausência/inativação/id inválido, perfil atual diferente do JWT, erro de findById e handler bloqueado cobertos; erro real de repository de conta gera 500 sem persistir multa. |
| IT-FINE-19 | Composição/regressão: independência da FROTA-67 | ✅ | createApp e seis rotas de multas na base develop + US10; build/typecheck; mocks de login enxutos preservados. Suíte completa dos módulos preexistentes aprovada sem importar arquivos de documentos novos. |

## Fechamento das melhorias P3 da revisão

### QA-01 — colisão determinística da chave entre veículos diferentes

A melhoria recebida trava os dois veículos e consulta `pg_stat_activity` até comprovar **duas conexões esperando por locks reais**. Ela demonstrava sobreposição, mas a reconsulta da chave dentro da transação ainda poderia observar o vencedor já confirmado e evitar a violação de unicidade. Isso era uma limitação da prova, sem defeito observado na aplicação.

Nesta validação, o próprio teste foi reforçado com a instrumentação nativa `context.mock.method`: delega consultas e INSERTs aos métodos reais do repository e suspende as duas transações **depois de ambas consultarem a ausência da chave**, antes do INSERT. Há prazo de 5 s para a barreira. O wrapper do INSERT observa e relança o erro real do PostgreSQL; a asserção exige **um 23505**, duas leituras sem registro e respostas **201/409**. Confere também exatamente uma multa, um evento e uma auditoria, com a chave e o veículo associados ao vencedor. Os wrappers são restaurados em finally. Não há repository em memória nem modificação de código de produção.

**Resultado: P3 encerrado**, no teste isolado e na suíte completa final.

### QA-02 — troca válida e trocas opostas de veículo

O novo teste recebido foi executado sem alteração: troca A→B sem viagem, novo snapshot de veículo, preservação do snapshot do motorista e before histórico. Depois executa B→A e A→B simultâneos, com barreira de locks e timeout de 15 s. Confirma revisões 3/2, snapshots finais corretos e contagens finais **2 multas / 5 eventos / 5 auditorias**; o histórico da primeira multa mantém os dois retratos anteriores. O cenário preexistente de revisão concorrente comprova separadamente a mutação obsoleta 409.

O complemento HTTP ainda confirmou a troca entre dois motoristas não nulos, mencionada na revisão como limite de cobertura: evento DRIVER_CHANGED e snapshots before/after corretos.

**Resultado: P3 encerrado**, no teste isolado e na suíte completa final. Não se alega ensaio de carga nem prova de todos os escalonamentos possíveis.

## Fluxo HTTP e persistência complementares

O cliente `fetch` autenticou pelo login real com e-mail fictício normalizado, criou veículo/dois motoristas sintéticos e uma multa sem motorista, consultou candidato único e rejeitou motorista divergente com 422 sem avançar revisão. Confirmou o candidato por PUT, trocou para o segundo motorista removendo tripId, pagou por PATCH, reabriu e leu a timeline. SOLICITANTE recebeu 403 e acesso sem token recebeu 401.

Resultado final da multa: **revision 5**, cinco eventos e cinco auditorias nas mesmas operações: REGISTERED, DRIVER_IDENTIFIED, DRIVER_CHANGED, PAID, REOPENED. A data do pagamento continua no evento e paidAt vigente voltou a NULL. SQL confirmou as seis colunas de instantes de multas/eventos como `timestamp with time zone`. A guarda de down por pedido técnico original foi exercitada dentro de BEGIN/SAVEPOINT/ROLLBACK, preservando a estrutura e os registros fora da transação. Não houve limpeza de dados operacionais.

As verificações adicionais de dois motoristas distintos e da guarda exclusiva por registrationRequest são evidências locais complementares; ainda não constituem testes de regressão próprios versionados. O roteiro fica registrado aqui para repetição.

## Limitações e falhas externas à US10

1. **Frontend preexistente reprovado:** ConfirmDialog.tsx possui SxProps/Theme duplicados e sx não declarado; MaintenanceDetailDialog usa sx fora do contrato do componente. Build e typecheck falham. Na suíte frontend, 91 testes passam e três suítes falham: driversPage, sidebarNavigation e userManagementPage.
2. **Origem comprovada:** `git diff develop -- frontend` vazio e HEAD = develop. Hash Git no disco/HEAD de ConfirmDialog: `3b9fc280c07ccae0db362960e7da3d9d3643bff7`; de sidebarNavigation: `46e5a285e49976a68d85d1088cd30c019c277bed`. O frontend não foi corrigido nesta validação.
3. **Limite do auditor:** `aratu-check.mjs` recorta o primeiro caminho como `ackend/src/app.ts` por aplicar trim antes de ler as colunas do status. Não é uma violação nova da US10. O diff real de app.ts e a composição de /fines foram lidos diretamente, e o arquivo foi compilado/testado. O auditor não executa a suíte backend por conta própria; ela foi executada explicitamente neste chat.
4. **WCAG visual não certificada:** mensagens textuais e contratos de erro foram exercitados. Não houve navegador da aplicação, redimensionamentos ou capturas de tela, pois não há entrega visual destas tarefas. Testar FROTA-74 na entrega correspondente.
5. **Logs locais não versionados:** os links para `.tmp/` são evidências desta estação e não acompanham automaticamente um clone/PR. O relatório, comandos, contagens e resultados permanecem documentados aqui. As revisões originais continuam em [FROTA-73](../reviews/frota-73-api-multas-infracoes.html) e [FROTA-75](../reviews/frota-75-testes-multas.html), sem reescrever seus pareceres históricos.

## Reprodução

Primeiro confirmar o alvo com `getTestDatabaseUrl()` e `SELECT current_database()`, comparar com a conexão operacional e interromper se forem iguais ou se o alvo não for uma base dedicada. Não imprimir URLs/segredos. Usar a configuração de testes existente e somente dados fictícios.

```powershell
# Na raiz, serviços já ativos; inspeção não reinicia containers:
docker compose ps

# Na pasta backend, executar suites de banco uma por vez:
npm test
npm run build
npx tsc --noEmit

# Reproduzir apenas os dois P3, sem outra suíte de banco em execução:
npx tsx --test --test-concurrency=1 --test-name-pattern="chave concorrente com veículos diferentes|troca válida de veículo" tests/fines.integration.test.ts

# Na raiz:
docker compose exec -T backend npm run build
docker compose exec -T backend npx tsc --noEmit
node docs/scripts/aratu-check.mjs

# Na pasta frontend, confirma a limitação global:
npm run build
```

Os SDDs também permitem os recortes `npx tsx --test tests/auth.test.ts tests/fines.service.test.ts` e `npx tsx --test --test-concurrency=1 tests/fines.integration.test.ts`; ambos estão incluídos na execução completa de npm test registrada acima.

Nesta estação, a conferência segura e o fluxo complementar podem ser repetidos pelos scripts locais `.tmp/frota-73-75-qa-preflight.ts` e `.tmp/frota-73-75-qa-http.ts`, com o executável `backend/node_modules/.bin/tsx.cmd`. O fluxo utiliza placas/CPFs sintéticos fixos e requer base de testes preparada sem colisão com execução anterior; não executar novamente sobre as mesmas fixtures sem preparar exclusivamente a base isolada. Nunca adaptar a limpeza para a base operacional.

## Encaminhamento

**Backend das duas tarefas validado; nenhum bloqueante da aplicação encontrado.** QA-01/QA-02 encerrados com a evidência acima. Permanecem a revisão humana, o tratamento separado das falhas preexistentes do frontend e a futura validação visual da FROTA-74. Não há aprovação global de release nem commit/push nesta etapa.

Validação → padrões do projeto, compatibilidade, idempotência e atomicidade, preservação histórica e dados fictícios · dúvidas: nenhuma pendente no escopo aprovado.
