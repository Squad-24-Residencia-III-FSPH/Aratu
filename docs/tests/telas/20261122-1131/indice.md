# QA de telas e fluxos do Aratu

- Execução iniciada em 22/11/2026, America/Sao_Paulo, identificador 20261122-1131. Fichas concluídas em 23/11/2026
- Versão c1b3233, branch feat/qa-telas-e-fluxos baseada em develop
- Ambiente de QA isolado em Docker, projeto aratu-qa-20261122-1131, banco aratu_qa em PostgreSQL 18.6
- UI http://127.0.0.1:15173/#/login · API http://127.0.0.1:13000
- [Plano da campanha](../../../plans/qa-telas-e-fluxos.html)
- [Lotes de correção e prompts para os chats](../../../plans/qa-lotes-de-correcoes.html)

## Ordem de execução e memória da jornada

A coordenação executa uma ficha por vez. Os chats abertos na primeira tentativa são retomados na ordem da fila, preservando os relatórios e as evidências existentes. Marcar “Em execução” apenas na ficha autorizada.

| Jornada | Último resultado confirmado | Objetos e origem | Bloqueio ou próxima ação | Fonte |
| --- | --- | --- | --- | --- |
| Acesso | Login, troca de perfil, inativação e reativação verificados no mesmo objeto. T04 percorreu os menus expandido e compacto dos seis perfis seed e da conta 11 | Conta 11 criada na UI em T02, ativa como `SOLICITANTE`, revisão 9 | O alias de solicitações mostrou conteúdo demonstrativo ao Motorista e a API negou acesso. T13 confere os dois caminhos com as contas de Solicitante | [T01](T01.md) · [T02](T02.md) · [T03](T03.md) · [T04](T04.md) |
| Frota | T10 confirmou os vencimentos na API e a lacuna na UI. O retorno de T11 sugeriu o motorista 1 somente dentro do intervalo efetivo e vinculou a multa #2 à viagem #1 | Veículo 4 disponível, rev. 7, 1.025 km após T16. Documentos #1–7. Multa #1 paga. Multa #2 pendente, rev. 2, evento #6 e auditoria #716 | T04/T23 reconsultaram vencimentos pela data efetiva. T26 conciliou a auditoria da multa | [T10](T10.md) · [T11](T11.md) · [T16](T16.md) · [T26](T26.md) |
| Viagens | O Gestor confirmou a viagem #1 pela UI. O retorno de T13 constatou que a confirmação fica no detalhe REST e no banco, mas a tela do titular segue demonstrativa | Viagem #1 `CONFIRMED`, rev. 4, pedido #1 `SCHEDULED`, rev. 3, veículo 4, motorista 1. Término efetivo em 23/11, 25 km. Evento #7 e auditoria #718 | Jornada de ponta a ponta interrompida na criação e consulta do Solicitante. T23 recebe a viagem e T26 recebe a auditoria | [T12](T12.md) · [T13](T13.md) · [T16](T16.md) · [T17](T17.md) |
| SVO | A Central encontrou os mesmos dois desfechos pela UI. O retorno de T19 confirmou as vagas livres. O Administrador obteve leitura pela API e foi redirecionado a Usuários pela UI | Ordem #1 `COMPLETED`, rev. 4. Ordem #2 `NOT_PERFORMED`, rev. 3. Ordem #3 auxiliar não realizada. 3 aberturas, 1 coleta, média 3.335,1 min e ocupação final 0/4 | Jornada de ponta a ponta interrompida no registro e no despacho visual. T23/T24 conciliaram os valores com a massa das ordens reais | [T18](T18.md) · [T19](T19.md) · [T21](T21.md) · [T22](T22.md) · [T23](T23.md) · [T24](T24.md) |
| Gestão | T24 validou prévia e CSV. T25 salvou o mesmo recorte em PDF nativo. T26 conciliou 17 eventos de referência com o PostgreSQL e encontrou a Auditoria sem página | Abastecimento #3, 26,375 L, R$ 154,60 e 421 km. CSV #1072, preparo do PDF salvo #1106, cancelado #1108 e vazio #1112. Demais trilhas em T26 | O Dashboard continua demonstrativo. O reteste de Auditoria pela UI depende de FROTA-142. T26 registra as pendências da consulta e da regra de justificativa SVO | [T23](T23.md) · [T24](T24.md) · [T25](T25.md) · [T26](T26.md) |

Ao finalizar cada ficha, atualizar a linha da jornada com o estado confirmado. O próximo chat recebe o resultado da ficha anterior e apenas os IDs, bloqueios e referências úteis à sua própria etapa.

## Fichas

| Ficha | Tela | Situação | Chat | Relatório | Objetos | Retorno |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Login e sessão | Concluída com achados | 01a203ae-9923-7340-8957-862f1e88cdae | [T01](T01.md) | Contas seed 1–6 e conta 11 de T02, Solicitante ativo, revisão 7 | Retorno concluído, entregue a T03 |
| T02 | Gerenciamento de usuários | Concluída com achados | 01a203b2-83c8-76f0-a03a-527d054036b1 | [T02](T02.md) | Conta 11, criada na UI, Solicitante ativo, revisão 5 | Entregue a T01 e T03 |
| T03 | Perfis e permissões | Concluída com achados | 01a204f4-c6a3-7d72-9dd7-8737df342723 | [T03](T03.md) | Conta 11, Solicitante ativo, revisão 9 | Entregue a T04 |
| T04 | Início do gestor e navegação | Concluída com achados | 01a203b0-ab3d-7262-ab05-e3cdc022fff4 | [T04](T04.md) | Documentos #1–7, pedido #1, viagem #1 e cifras de T23 | Retorno concluído. Entregue a T24 |
| T05 | Veículos | Concluída com achados | 01a203b0-cb23-7940-99d8-b97191b0051a | [T05](T05.md) | Veículo 4, `TQA5V23`, administrativo, disponível, revisão 7 após manutenção | Retorno concluído. Situação e vínculo conferidos, veículo entregue a T09 |
| T06 | Motoristas | Concluída com achados | 01a203b0-bce1-7922-9a79-5b4c64860254 | [T06](T06.md) | Motorista 1, ativo, categoria D, revisão 4, conta 4. Conta 9 sem vínculo | Propriedade confirmada em T16 |
| T07 | Tipos de serviço | Concluída com achados | 01a20526-32e9-7472-b1d9-b81082aac53a | [T07](T07.md) | Veículo 4, serviço ativo 2, vínculo 4 criado na UI | Entregue a T08, T12 e T15 |
| T08 | Manutenção | Concluída com achados | 01a20534-5406-7370-b6cc-146da8567679 | [T08](T08.md) | Corretiva #1 e preventiva impeditiva #2 concluídas, R$ 136,25 no total. Veículo 4 disponível, revisão 7, serviço 2 | Evidências para T05 registradas. Veículo liberado para T09 e T15. Custos e horários de encerramento para T23 |
| T09 | Abastecimentos | Concluída com achados | 01a2062d-1252-7061-8c08-f1aa37521f2d | [T09](T09.md) | #3 vigente, veículo 4, 26,375 L, R$ 154,60, 421 km. #2 auxiliar, R$ 64,50 | Entregue a T10, T15, T23 e T24 |
| T10 | Documentos e vencimentos | Concluída · fluxo de UI bloqueado, API verificada | 01a203b2-6da2-79e1-aa67-828222303a24 | [T10](T10.md) | Veículo 4, documentos #1–7 criados por API, 100 verificações REST aprovadas | T04/T23 recebem contagens por data. Reteste da UI depende de FROTA-70 |
| T11 | Multas e infrações | Concluída · fluxo de UI bloqueado, API verificada | 01a203b2-609c-7611-bae3-537eef388d1b | [T11](T11.md) | Multa #2 retificada com viagem #1 e motorista 1, auditoria #716 | Retorno concluído. Reteste da UI depende de FROTA-74 |
| T12 | Nova solicitação de viagem | Concluída com achados · ruptura na criação por UI | 01a2064f-7ba9-7933-b354-4cf35782412c | [T12](T12.md) | `SOL-892` temporário. Pedidos reais #1 e #2 criados por API, ambos pendentes | Entregue a T13/T14, com origem por API |
| T13 | Minhas solicitações | Concluída com achados | 01a20661-d4bc-7da3-9220-08d8498000b5 | [T13](T13.md) | Pedido #1 agendado com viagem #1 confirmada no REST e no banco | Retornos concluídos. Aprovação, rejeição e confirmação ausentes da UI do titular |
| T14 | Análise de solicitações | Concluída com achados | 01a2066d-ca4c-7af3-8589-9258a524c560 | [T14](T14.md) | #1 aprovado, evento 3. #2 rejeitado com motivo, evento 4. Revisão 2 | Entregue a T13 e T15 |
| T15 | Agendamento | Concluída com achados | 01a2067d-6616-72d0-85ad-7b0badb2a1a3 | [T15](T15.md) | Pedido #1 e viagem #1 agendada, veículo 4, motorista 1, 30/11 às 09h30 UTC−03:00 | Entregue a T16, sem início, término ou leitura de hodômetro |
| T16 | Minhas viagens e execução | Concluída com achados | 01a207b1-517c-70c3-b62c-bf87d81d1cf9 | [T16](T16.md) | Viagem #1 finalizada, revisão 3, 25 km de diferença, leituras #4 e #5 | Entregue a T11 e T17 |
| T17 | Confirmação de viagens | Concluída com achados | 01a207c1-b11a-7de3-9bd5-9cf8ef62d145 | [T17](T17.md) | Viagem #1 confirmada, rev. 4, evento #7 e auditoria #718 | Entregue a T13, T23 e T26 |
| T18 | Registro e triagem SVO | Concluída · fluxo de UI bloqueado, API verificada | 01a203b0-a076-7de3-be2f-65f06c05c51b | [T18](T18.md) | Ocorrências #1 e #2 confirmadas e #3 pendente, sem ordens | Entregue a T19. Reteste da UI depende de FROTA-109 |
| T19 | Geração de ordem SVO | Concluída · fluxo de UI bloqueado, API verificada | 01a207da-b190-7b30-8548-11b77c8cf684 | [T19](T19.md) | Ordens #1 e #2 encerradas, viaturas 1 e 2 em 0/2 | Retorno concluído. Reteste da geração na UI depende de FROTA-116 |
| T20 | Ordens da equipe SVO | Concluída com achados | 01a207e4-b534-7450-bfa6-f991a5d7fb34 | [T20](T20.md) | #1 em atendimento, rev. 3. #2 em deslocamento, rev. 2. Auditorias #857, #860, #863 | Entregue a T21, T22 e T26 |
| T21 | Resultado do atendimento SVO | Concluída com achados | 01a207f2-85b0-7442-ab12-88fa60ca9cf9 | [T21](T21.md) | #1 realizada, rev. 4, e #2 não realizada, rev. 3. Viaturas 1 e 2 livres | Entregue a T19, T22, T23, T24 e T26 |
| T22 | Acompanhamento de ordens SVO | Concluída com achados | 01a20801-620f-7293-8ade-f20ccfa73630 | [T22](T22.md) | #1 e #2 confirmadas na Central. #3 auxiliar. Auditorias #911 e #914 | Entregue a T23, T24 e T26 |
| T23 | Dashboard | Concluída com achados | 01a208d2-5db2-75d1-a0b9-3ffbebeb720d | [T23](T23.md) | API reconciliada com banco. Dashboard demonstrativo e falha ao limpar datas | Entregue a T04 e T24 |
| T24 | Relatórios operacionais | Concluída com achados | 01a208e6-6f22-7543-8b4a-b8b2e4e96ab9 | [T24](T24.md) | 11 relatórios, 23 CSVs e recorte de abastecimentos com auditoria #1072 | Entregue a T25 e T26 |
| T25 | Impressão do relatório | Concluída com achados | 01a208f9-f6e4-79a3-a967-54cd6ec74e1a | [T25](T25.md) | PDF nativo de uma linha conferido. Multipágina com controle sintético | Entregue a T26, auditorias #1106, #1108 e #1112 |
| T26 | Auditoria | Concluída · fluxo de UI bloqueado, API verificada | 01a2090e-8db5-7d52-acba-07b6ebc05618 | [T26](T26.md) | 17 eventos conciliados com o banco, incluindo #718, #716, #911/#914 e as exportações de T24/T25 | Reteste da UI depende de FROTA-142 |

## Massa de partida

- Seed fictícia do projeto para os seis perfis, com três veículos SVO, três serviços e equipe 1.
- Segundas contas criadas pela API de usuários: gestor 7, solicitante 8, motorista 9 e equipe SVO 10.
- Vínculos criados como fixture no PostgreSQL descartável: equipe 1 → usuário 6, equipe 2 → usuário 10.
- Os testes automatizados usam o banco aratu_qa_test, distinto de aratu_qa.

## Fechamento da execução

As **26 fichas** têm relatório. Em **5**, a falta de tela bloqueou o fluxo desde a entrada, com cobertura independente da API e do banco. Nas **21** restantes foi possível percorrer as ações disponíveis no navegador, com as falhas e os retestes descritos nos relatórios. A [rastreabilidade do plano](../../../plans/qa-telas-e-fluxos.html#s11) liga os 110 itens funcionais do snapshot do Jira às respectivas fichas. Os critérios exercitados e as lacunas de evidência constam em cada relatório.

### Jornadas

Uma jornada foi percorrida de ponta a ponta com achados e cinco foram interrompidas na interface. As seis foram avaliadas. Os retestes pontuais permanecem nos relatórios.

| Jornada | Resultado | Primeira ruptura, perfis e verificação necessária |
| --- | --- | --- |
| Acesso | Percurso principal completo | Administrador alterou perfil, inativou e reativou a conta #11. O novo login refletiu o estado. A T01 registrou a perda de rascunho ao expirar, e T03/T04 encontraram controles incompatíveis com o acesso do perfil. Retestar a continuidade da sessão e a correspondência entre menu e permissões. [T01](T01.md) · [T02](T02.md) · [T03](T03.md) · [T04](T04.md) |
| Viagem aprovada | Interrompida | Para o Solicitante, `SOL-892` apareceu pendente e desapareceu na recarga. Com pedido #1 criado pela API, Gestor e Motorista conseguiram aprovar, agendar, executar 25 km e confirmar a viagem #1. A confirmação continuou ausente na UI do titular. Retestar criação, recarga e chegada do mesmo ID a cada perfil. [T12](T12.md) · [T13](T13.md) · [T15](T15.md) · [T16](T16.md) · [T17](T17.md) |
| Viagem rejeitada e agenda concorrente | Interrompida | A primeira ruptura foi a criação por UI em T12. O Gestor rejeitou o pedido #2 preparado por API, mas a lista do titular omitiu a justificativa. No controle de agenda, o banco gravou uma única alocação e a UI conservou escolhas indisponíveis. Retestar entrega da rejeição ao titular e recuperação após conflito. [T12](T12.md) · [T13](T13.md) · [T14](T14.md) · [T15](T15.md) |
| Disponibilidade e custos | Interrompida | Manutenção, bloqueio e liberação do veículo #4 chegaram à frota. Abastecimento e custos chegaram ao relatório. Na T10, não foi possível abrir Documentos como Gestor ou Administrador. A T11 encontrou a mesma lacuna para multas e confirmou a sugestão de motorista pelo intervalo efetivo na API. Retestar as telas de documentos e multas e o vínculo a partir do navegador. [T05](T05.md) · [T08](T08.md) · [T09](T09.md) · [T10](T10.md) · [T11](T11.md) |
| SVO | Interrompida | Atendente e Administrador ficaram sem registro e despacho na UI. Com ocorrências e ordens fictícias da API, as equipes concluíram #1 e #2 no celular e a Central viu os desfechos. As viaturas voltaram a 0/2 vagas ocupadas. Retestar a entrada e o despacho, seguindo os mesmos IDs até o encerramento. [T18](T18.md) · [T19](T19.md) · [T20](T20.md) · [T21](T21.md) · [T22](T22.md) |
| Gestão | Interrompida | O Início e o Dashboard mantiveram cifras demonstrativas para o Gestor. A mesma seleção de abastecimentos chegou à prévia, CSV e PDF. Gestor e Administrador não conseguiram abrir Auditoria pelo menu. Os 17 eventos de referência coincidiram no REST e no banco. Retestar atalhos, alimentação do painel e chegada da exportação à tela de auditoria. [T04](T04.md) · [T23](T23.md) · [T24](T24.md) · [T25](T25.md) · [T26](T26.md) |

### Achados por gravidade

Os relatórios contêm **138 IDs de achado**. A consolidação agrupou 30 reincidências de um mesmo comportamento, preservando os casos com efeito ou controle distinto. A contagem final reúne **108 registros**, sendo **0 críticos, 14 altos, 66 médios, 26 baixos e 2 sem classificação**. A coordenação classificou T01-P05 como média pela presença de contexto local após revogação, com os dados protegidos bloqueados na API. T15-P02 depende da regra de lotação, que ficou fora da entrega, e T17-P06 depende da definição de como consultar o recibo e o estado final.

| Achado de referência | Reincidências agrupadas |
| --- | --- |
| T01-P01 · Perda de rascunho na expiração | T02-P04, T05-P04, T06-P06, T07-P05, T08-P05, T09-P08, T12-P06, T13-P06, T14-P05, T15-P03 |
| T02-P07 · Espera na gravação de usuários | T03-P05 |
| T04-P01 · Cifras demonstrativas | T10-P02, T23-P01 |
| T04-P02 · Entrada e alerta de documentos | T10-P01 |
| T04-P04 · Entradas sem ação ou incompatíveis com o perfil | T03-P02, T10-P03, T11-P02, T12-P03, T18-P02, T26-P02 |
| T04-P05, T04-P06, T04-P07 e T04-P08 · Guarda do alias, acesso de Administrador, contraste e menu móvel | T13-P02, T23-P03, T10-P04 e T10-P05, respectivamente |
| T05-P06, T23-P04 e T23-P05 · Datas e perda de recorte em Veículos e Dashboard | T04-P09 |
| T12-P02 · Tipo de serviço ausente no pedido | T07-P01 |
| T18-P03 · Título da aba no SVO | T19-P02 |
| T20-P01 e T20-P02 · Aviso e alvo de toque da lista SVO | T22-P01 e T22-P03, respectivamente |
| T24-P03 · Emitir antes de revisar o recorte alterado | T25-P04 |

### Verificações automatizadas

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| `aratu-check.mjs` com Node.js 24.22.3 | Aprovado no diff da branch, com zero arquivos de código alterados. TypeScript das duas aplicações aprovado. **248 testes de frontend passaram**, zero falhas | [Pré-auditoria final](../../../../.playwright-mcp/20261122-1131/aratu-check-fechamento.log) |
| Compilação e lint no Docker | `tsc --noEmit` do backend, lint e build de produção do frontend passaram. O build sinalizou chunks acima de 500 kB | [Lint](../../../../.playwright-mcp/20261122-1131/frontend-lint-fechamento.log) · [Build](../../../../.playwright-mcp/20261122-1131/frontend-build-fechamento.log) |
| Backend `npm run test:integration` | **317 passaram**, zero falhas ou pulados | [Integração](../../../../.playwright-mcp/20261122-1131/backend-integration-fechamento.log) |
| Backend `npm test` | **508 passaram**, zero falhas ou pulados. A suíte completa inclui a cobertura de integração, repetida no comando anterior | [Suíte completa](../../../../.playwright-mcp/20261122-1131/backend-todos-fechamento.log) |
| Isolamento das suítes de backend | `aratu_qa_test` e base auxiliar de migração. As contagens e assinaturas das 10 tabelas amostradas de `aratu_qa`, incluindo auditoria, coincidiram antes e depois | [Conferência do isolamento](../../../../.playwright-mcp/20261122-1131/isolamento-fechamento.txt) |

A pré-auditoria inicial apresentou cinco falhas de frontend com dependências locais incompletas. A execução final usou as dependências do lockfile e o Node.js 24.22.3 compatível com a suíte. A instalação sinalizou 11 alertas moderados de dependências. [Execução inicial](../../../../.playwright-mcp/20261122-1131/aratu-check-retomada.log) · [Instalação das dependências](../../../../.playwright-mcp/20261122-1131/fe-dependencias-fechamento.log)
