# Módulos do Sistema — Aratu

Este documento apresenta o índice dos módulos funcionais do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Mapa de Módulos Previstos

| # | Chave do Módulo | Nome Funcional | Perfis Operadores (RBAC) | Tabelas Principais (PostgreSQL 18) | Responsabilidade Principal |
|---|---|---|---|---|---|
| 1 | `AUTENTICACAO_RBAC` | Autenticação, Usuários e Setores | `ADMINISTRADOR` (gestão) / Todos os perfis (acesso) | `auth.users`, `auth.sectors`, `audit.logs` | Controle de sessão acessível, cadastro de servidores/setores e autorização baseada em papéis (`ADMINISTRADOR`, `GESTOR`, `SOLICITANTE`, `MOTORISTA`, `ATENDENTE_SVO`, `EQUIPE_SVO`). |
| 2 | `FROTA` | Gestão de Frota, Veículos e Serviços | `GESTOR`, `ADMINISTRADOR`, `ATENDENTE_SVO` | `fleet.vehicles`, `fleet.vehicle_events`, `fleet.services`, `fleet.vehicle_services` | API de cadastro, consulta, edição e controle de situação dos veículos; placa única; capacidades, operação Administrativa/SVO e histórico imutável. A leitura aceita ATENDENTE_SVO; escrita é exclusiva de GESTOR e ADMINISTRADOR. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | `GESTOR`, `MOTORISTA`, `ADMINISTRADOR` | `fleet.drivers`, `fleet.driver_events` | API `/drivers` (GET com filtros `name`/`status`, GET `/:id`, POST, PUT, PATCH `/:id/status`; sem DELETE) restrita a GESTOR e ADMINISTRADOR. CPF com dígitos verificadores (400) e único (409); CNH com categoria e validade; situações `ACTIVE`/`AWAY`/`INACTIVE` com transições livres, mas `ACTIVE` exige CNH válida (422); vínculo opcional com conta `MOTORISTA` (422/409); revisão otimista, histórico imutável e auditoria. `DriversService::isAvailableForAllocation` define a disponibilidade cadastral (ativo e CNH válida). |
| 2 | `FROTA` | Gestão de Frota, Veículos, Serviços e Documentos | `GESTOR`, `ADMINISTRADOR`, `ATENDENTE_SVO`, `SOLICITANTE` | `fleet.vehicles`, `fleet.vehicle_events`, `fleet.services`, `fleet.vehicle_services`, `fleet.vehicle_documents`, `fleet.vehicle_document_events` | API de cadastro, consulta, edição e controle de situação dos veículos; placa única; capacidades, operação Administrativa/SVO e histórico imutável. A leitura de veículos aceita ATENDENTE_SVO; escrita é exclusiva de GESTOR e ADMINISTRADOR. Tipos de serviço: API `/services` (GET, GET `/:id`, POST, PUT, PATCH `/:id/activate` e `/:id/deactivate`; sem DELETE) com nome único sem diferenciar maiúsculas (409), categorias e exigências (`requiresTriage`, `requiresWeight`, `requiresIdentification`), revisão otimista, `reason` obrigatório e auditoria; leitura também para SOLICITANTE e ATENDENTE_SVO, que veem apenas os tipos ativos. Documentos de veículos (FROTA-67): API `/vehicle-documents` (GET, GET `/expiring`, GET `/:id`, POST com renovação `supersedesId`, PUT e PATCH `/:id/annul`; sem DELETE) restrita a GESTOR e ADMINISTRADOR, com cálculo de situação (`VALID`, `EXPIRING`, `EXPIRED`, `RENEWED`, `ANNULLED`), prazo de alerta configurável (`VEHICLE_DOCUMENT_ALERT_DAYS` e `?days=`), eventos append-only e auditoria. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | `GESTOR`, `MOTORISTA`, `ADMINISTRADOR` | `fleet.drivers` | Cadastro de condutores, controle de ativação/revisão, disponibilidade e escala operacional. |
| 2 | `FROTA` | Gestão de Frota, Veículos e Serviços | `GESTOR`, `ADMINISTRADOR`, `ATENDENTE_SVO` | `fleet.vehicles`, `fleet.vehicle_events`, `fleet.services`, `fleet.vehicle_services`, `fleet.fuelings`, `fleet.fueling_events` | API de cadastro, consulta, edição e controle de situação dos veículos; placa única; capacidades, operação Administrativa/SVO e histórico imutável. A leitura de veículos aceita ATENDENTE_SVO; escrita é exclusiva de GESTOR e ADMINISTRADOR. Abastecimentos: registro, filtros, totais e retificação com histórico completo, exclusivamente para GESTOR e ADMINISTRADOR (FROTA-64/FROTA-65). Tipos de serviço: API `/services` (GET, GET `/:id`, POST, PUT, PATCH `/:id/activate` e `/:id/deactivate`; sem DELETE) com nome único sem diferenciar maiúsculas (409), categorias e exigências (`requiresTriage`, `requiresWeight`, `requiresIdentification`), revisão otimista, `reason` obrigatório e auditoria; leitura também para SOLICITANTE e ATENDENTE_SVO, que veem apenas os tipos ativos. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | `GESTOR`, `MOTORISTA`, `ADMINISTRADOR` | `fleet.drivers`, `fleet.driver_events` | API `/drivers` (GET com filtros `name`/`status`, GET `/:id`, POST, PUT, PATCH `/:id/status`; sem DELETE) restrita a GESTOR e ADMINISTRADOR. CPF com dígitos verificadores (400) e único (409); CNH com categoria e validade; situações `ACTIVE`/`AWAY`/`INACTIVE` com transições livres, mas `ACTIVE` exige CNH válida (422); vínculo opcional com conta `MOTORISTA` (422/409); revisão otimista, histórico imutável e auditoria. `DriversService::isAvailableForAllocation` define a disponibilidade cadastral (ativo e CNH válida). Cadastro de condutores, controle de ativação/revisão, disponibilidade e escala operacional. |
| 4 | `VIAGENS` | Solicitações, Políticas e Viagens Institucionais | `SOLICITANTE`, `GESTOR`, `MOTORISTA` | `trip.requests`, `trip.approval_policies`, `trip.trips`, `trip.allocations` | Fluxo completo de pedido de transporte institucional, versionamento, aprovação manual/automática, alocação concorrente em viagens, par ida e volta e registro de hodômetro. Disponibilidade: `GET /vehicles/available?start=&end=&serviceId=` e `GET /drivers/available?start=&end=` (GESTOR e ADMINISTRADOR; período ISO 8601 com fuso) devolvem cada candidato com `available` e `reasons` (`MAINTENANCE`, `INCOMPATIBLE`, `CONFLICT`, `AWAY`, `CNH_EXPIRED`); conflito é sobreposição estrita com viagens `SCHEDULED`/`IN_PROGRESS` e a CNH deve valer até o fim da viagem. `AvailabilityService::assessVehicle`/`assessDriver` aplicam a mesma regra com `FOR UPDATE` dentro do agendamento. Agendamento: `POST /trips` (GESTOR) com `{ requestId, vehicleId, driverId, scheduledStart, scheduledEnd, reason? }` cria a viagem `SCHEDULED` com snapshots de veículo e motorista e muda a solicitação `APPROVED` para `SCHEDULED`, numa transação que trava solicitação, veículo e motorista; não aprovada ou conflito → 409, início no passado ou recurso indisponível/incompatível → 422. Execução: `POST /trips/:id/start` (`{ startKm }`) e `POST /trips/:id/finish` (`{ endKm }`) só pelo MOTORISTA alocado (403 para outros), `SCHEDULED → IN_PROGRESS → FINISHED` (409 fora disso), hora do servidor, `startKm` não menor que a última quilometragem do veículo (mesma linha do tempo do abastecimento) e `endKm` não menor que `startKm` (422); grava leitura `START`/`END` em `trip.odometer_readings`, evento e auditoria. `GET /trips/mine` lista as viagens agendadas e em andamento do motorista logado. |
| 5 | `SVO` | Operações do Serviço de Verificação de Óbito | `ATENDENTE_SVO`, `EQUIPE_SVO`, `GESTOR`, `ADMINISTRADOR` | `svo.occurrences`, `svo.custody_records`, `svo.release_orders` | Triagem obrigatória, despacho prioritário de viatura de remoção cadavérica, eventos de atendimento (coleta, custódia, laudo, liberação) e sigilo operacional estrito. |
| 6 | `MANUTENCOES` | Manutenção Preventiva e Corretiva | `GESTOR`, `ADMINISTRADOR` | `fleet.maintenance_orders`, `fleet.vehicles` | Abertura e acompanhamento de ordens de serviço de manutenção, bloqueio automático de veículos indisponíveis e retorno à frota ativa. |

---

## 2. Documentação Detalhada por Módulo (`docs/modulos/`)

A documentação técnica e funcional aprofundada de cada módulo é mantida em formato HTML estático dentro do diretório `docs/modulos/`.

Atualmente, o repositório dispõe de um **documento genérico de referência e template** que deve ser utilizado como base sempre que um módulo do Aratu for documentado:

- 📄 **[`docs/modulos/EXEMPLO_MODULO.html`](../modulos/EXEMPLO_MODULO.html)** — Template padrão de documentação de módulo do Sistema Aratu.

- 📄 **[`docs/modulos/FROTA.html`](../modulos/FROTA.html)** — Veículos e API de abastecimentos: contratos, precisão decimal, histórico, idempotência, concorrência e rollback seguro.

### O que a documentação HTML de cada módulo deve cobrir

1. **Metadados do Módulo:** chave, diretórios no backend (`routes`, `controllers`, `services`, `repositories`) e no frontend (`pages`, `components`), perfis RBAC envolvidos e banco de dados (`PostgreSQL 18`).
2. **Visão Geral:** objetivo operacional no contexto da FSPH e do SVO.
3. **Regras de Negócio e Transições de Estado:** validações de domínio, invariantes de concorrência e referência aos métodos de `Service` em inglês (`ClassName::methodName`).
4. **Escopo de Impacto e Matriz RBAC:** o que cada perfil pode visualizar ou executar no módulo.
5. **Tabelas do Banco de Dados (PostgreSQL 18):** estrutura das tabelas qualificadas no schema nativo em inglês no plural (`<schema>.<plural_entity>`), chaves primárias (`id`), chaves estrangeiras (`<entity>_id`) e índices (`<schema>_<table>_<purpose>`).
6. **Contratos de API REST (Backend Express 5):** endpoints em inglês (`/api/<entities>`), métodos HTTP, payloads (`camelCase` sem prefixos de banco) e códigos de resposta.
7. **Interface e Acessibilidade (Frontend React 19):** páginas, componentes reutilizados, tratamento dos 5 estados visuais e critérios da **WCAG 2.2 Nível AA**.
8. **Dependências, Integrações e Proteção de Dados (LGPD / Sigilo SVO).**

---

## 3. Criação e Extensibilidade de Novos Módulos

Para adicionar um novo módulo ao Sistema Aratu (ex: `ABASTECIMENTO`, `MULTAS`, `REGULACAO`), siga o roteiro de 7 passos e os padrões de escalabilidade e parametrização dinâmica documentados em:

👉 **[`docs/manuais/escalabilidade-extensibilidade.md`](escalabilidade-extensibilidade.md)**
