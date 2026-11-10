# Integração da develop — FROTA-73 e FROTA-75

- **Data:** 09/11/2026, America/Sao_Paulo.
- **Branch preservada:** `feat/us10-gerenciar-multas`.
- **Implementação anterior:** `1ffb640`, após o commit de API `76952c0`.
- **Develop recebida:** `fbaa22c1f1a68ee78506239eee0859bbd9e11d23` de `origin/develop`.
- **Operação:** fetch seguido de merge, preservando os commits existentes e sem reescrever histórico.

## Conflitos resolvidos

| Arquivo | Resolução |
|---|---|
| `backend/src/app.ts` | Mantidas as rotas de multas e incorporadas as de abastecimentos/documentos. Uma instância do repository de conta atual atende multas e documentos; preservados JWT, RBAC e dependências de cada módulo. |
| `backend/src/middlewares/auth.middleware.ts` | Mantida uma única função `createCurrentUserMiddleware`, com a documentação da develop e a validação de ID positivo dentro de BIGINT da US10 antes de consultar o banco. Preservados conta ativa, perfil atual e propagação de falha. |
| `backend/tests/database.integration.test.ts` | Combinadas as listas de down: vínculos de serviços quando aplicável, chave de multas, extensão de abastecimentos e migrações anteriores, em ordem inversa. Mantidas as novas verificações de imutabilidade de abastecimentos da develop. |
| `docs/modulos/FROTA.html` | Preservado integralmente o conteúdo das três áreas — documentos, abastecimentos e multas — em um único documento HTML, com navegação, IDs únicos e hierarquia de títulos. Removida a duplicação de estrutura HTML presente no conteúdo recebido, sem descartar contratos ou evidências históricas. |

O índice `docs/manuais/modulos.md`, mesclado automaticamente, passou a ter um único link para a documentação consolidada, mencionando todas as áreas. As regras e permissões de cada área foram preservadas.

Comparação binária com o HEAD anterior confirmou que os arquivos de domínio de multas (service, repository, controller, router, types), seus testes de serviço/integração e `auth.test.ts` permaneceram intactos. As duas migrations de multas não foram alteradas. A montagem das rotas foi ajustada apenas para combinar as entregas. Os relatórios originais de revisão foram preservados, com SHA-256 igual antes/depois.

## Validação executada

| Verificação | Resultado | Evidência local |
|---|---|---|
| Suíte completa backend, em base nova | **248 passaram, 0 falhas, 0 cancelados, 0 skips**, 96,860 s | [.tmp/frota-73-75-merge-fresh-backend-tests.log](../../.tmp/frota-73-75-merge-fresh-backend-tests.log) |
| Frontend, via auditor | **110 passaram, 0 falhas** | [.tmp/frota-73-75-merge-audit.log](../../.tmp/frota-73-75-merge-audit.log) |
| Build backend | Exit 0 | [.tmp/frota-73-75-merge-backend-build.log](../../.tmp/frota-73-75-merge-backend-build.log) |
| Build frontend | Exit 0; aviso de tamanho de bundle, sem bloquear build | [.tmp/frota-73-75-merge-frontend-build.log](../../.tmp/frota-73-75-merge-frontend-build.log) |
| Typecheck backend e frontend | Ambos sem erros | Log do auditor |
| Pré-auditoria estática | Exit 0, nenhum bloqueante/aviso | Log do auditor |
| Preservação operacional | Mesmas contagens e colunas consultadas; creation_key continua ausente | [.tmp/frota-73-75-merge-preservation.log](../../.tmp/frota-73-75-merge-preservation.log), [.tmp/frota-73-75-merge-before.json](../../.tmp/frota-73-75-merge-before.json), [.tmp/frota-73-75-merge-after.json](../../.tmp/frota-73-75-merge-after.json) |

A execução completa inclui os 18 testes de integração de multas, os 8 de serviço, os testes de conta atual, as quatro sequências de rollback/reaplicação e os módulos recebidos da develop. Os dois cenários P3 de concorrência continuam passando, inclusive a prova de erro real 23505 entre veículos diferentes e as trocas opostas com snapshots/revisões preservados.

As falhas de frontend registradas na validação de 08/11 foram corrigidas pelos commits recebidos da develop; não representam o estado atual após este merge. O [relatório anterior](frota-73-75-validacao-multas.md) permanece como evidência histórica, sem alteração retroativa.

## Bancos e limitação encontrada

O Docker estava desligado; foi iniciado, seguido somente do serviço `db`. PostgreSQL 18.6 confirmado. Não foi aplicada migration na base operacional `meubanco`, nem foram iniciados backend/frontend para executar mutações operacionais. Testes HTTP usam seus próprios servidores efêmeros.

Antes da limpeza, `aratu_test` foi confirmada distinta de `meubanco`. A primeira execução nessa base reutilizada terminou com **216 aprovações e 32 falhas**, causadas por incompatibilidade do schema existente: `202611050001` constava aplicada, mas `fleet.fuelings` não tinha `request_key`/`request_payload`. Também havia uma versão `202611030001` no controle do banco sem arquivo correspondente no checkout. Essas evidências constam de [.tmp/frota-73-75-merge-backend-tests.log](../../.tmp/frota-73-75-merge-backend-tests.log). Não foi alterada a lógica da aplicação ou enfraquecida uma asserção para acomodar esse estado.

A regressão conclusiva usou **`aratu_us10_merge_20261109_test`**, criada exclusivamente para esta integração e provisionada pelas migrations do checkout. A variável existente `DATABASE_URL_TEST` foi configurada apenas no processo de testes, sem expor conexão/credenciais ou criar configuração de produção. O runner confirmou o nome efetivo, a diferença da base operacional e a presença das duas colunas antes de executar `npm test`. A suíte de migrations de abastecimentos usa sua base separada já definida no código, `aratu_fueling_migrations_test`; ambas são distintas de `meubanco`. Nenhuma suíte que limpa banco foi executada em paralelo a outra.

A base reutilizada não foi removida nem teve seu controle de migrations reparado nesta integração. Para repetições, usar uma base dedicada coerente com as migrations. Nunca apontar a limpeza para a base operacional.

Na base operacional, as leituras antes/depois mantiveram `fleet.fines = 0`, `fleet.fine_events = 0`, `audit.logs = 74` e as mesmas colunas de multas, sem `creation_key`. Isso verifica essas contagens/metadados; não é uma auditoria de cada linha de todos os módulos. Todos os dados criados pelos testes são fictícios.

## Reprodução e limites

Com PostgreSQL ativo, configurar `DATABASE_URL_TEST` para uma base exclusiva de testes, derivando a conexão local existente sem imprimir credenciais. Confirmar `SELECT current_database()` e sua diferença da conexão operacional antes de qualquer limpeza. Executar na pasta `backend`, sem outra suíte de banco em paralelo:

```powershell
npm test
npm run build
npx tsc --noEmit
```

Na pasta `frontend`, `npm run build`; na raiz, `node docs/scripts/aratu-check.mjs`. Nesta estação, `.tmp/frota-73-75-merge-fresh-tests.ts` reproduz a configuração isolada e chama `npm test`. Arquivos `.tmp/` são evidências locais e não acompanham automaticamente um clone.

Esta foi uma regressão de integração de código. Não houve ensaio visual de navegador, certificação WCAG, lint completo ou teste de carga. A tela de multas continua sendo responsabilidade da FROTA-74; nenhuma tela foi criada nesta resolução.

**Resultado:** integração validada pelas verificações acima, com a implementação de multas preservada e sem conflitos pendentes. Princípios aplicados: compatibilidade de contratos, reuso da autenticação, atomicidade, histórico preservado e isolamento de dados de testes.
