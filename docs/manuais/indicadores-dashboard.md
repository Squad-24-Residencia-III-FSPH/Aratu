# Indicadores do Dashboard — Sistema Aratu (FROTA-128)

Definição única dos indicadores do dashboard gerencial (US21), usada pelo backend (FROTA-129), pelo frontend (FROTA-130) e pelos testes (FROTA-131).

**Pergunta principal do cliente:** *"Quais veículos estão disponíveis no período necessário?"* — respondida diretamente pelas consultas de disponibilidade (`GET /vehicles/available`, FROTA-96). O dashboard complementa essa resposta com a situação da frota e os indicadores de uso e custo.

**Perfis:** `GESTOR` e `ADMINISTRADOR`. Os blocos do SVO seguem a mesma regra dos relatórios do SVO (`SVO_REPORT_ROLES`): dos perfis do dashboard, ambos os recebem.

---

## 1. Convenções

| Item | Regra |
|---|---|
| Período | `from` (incluído) e `to` (excluído), datas `AAAA-MM-DD` interpretadas no fuso `America/Maceio` (Aracaju/SE). `to` deve ser posterior a `from`; intervalo máximo de 366 dias (mesmo limite dos relatórios). |
| Data de referência | Data em que o fato aconteceu: viagens pelo término (`finished_at`), abastecimentos por `fueled_at`, manutenção pelo fechamento (`closed_at`), SVO pela abertura da ordem (`opened_at`). |
| Medidas ausentes | Ficam `null` e não entram em médias (ex.: consumo de veículo sem litros abastecidos). |
| Versões vigentes | Abastecimentos e documentos retificados ou anulados não contam; vale só a versão vigente. |
| Cálculo | Sempre agregado no PostgreSQL (`COUNT`, `SUM`, `AVG`), com filtros sargáveis `>= início AND < fim`. |

---

## 2. Cards de situação (retrato do momento) — `GET /dashboard/summary`

Não dependem de período: mostram a situação atual.

| Indicador | Fórmula | Fonte | Perfil |
|---|---|---|---|
| Frota disponível / em manutenção / inativa | Contagem de veículos por `status` (`AVAILABLE`, `IN_MAINTENANCE`, `INACTIVE`) | `fleet.vehicles.status` | GESTOR, ADMINISTRADOR |
| Solicitações pendentes | Contagem de solicitações com `status = 'PENDING'` | `trip.requests.status` | GESTOR, ADMINISTRADOR |
| Viagens a confirmar | Contagem de viagens com `status = 'FINISHED'` (finalizadas e ainda não conferidas) | `trip.trips.status` | GESTOR, ADMINISTRADOR |
| Documentos a vencer | Documentos vigentes com validade entre hoje e hoje + 30 dias (janela `DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS`) | `fleet.vehicle_documents.expires_at` | GESTOR, ADMINISTRADOR |
| Documentos vencidos | Documentos vigentes com validade anterior a hoje | `fleet.vehicle_documents.expires_at` | GESTOR, ADMINISTRADOR |
| SVO: ordens em andamento | Contagem de ordens com `status` em `OPEN`, `IN_TRANSIT`, `IN_SERVICE`, `IN_PROGRESS` | `svo.execution_orders.status` | perfis com acesso ao SVO |
| SVO: ocupação dos veículos | Veículos SVO não inativos com ordem em andamento ÷ veículos SVO não inativos (percentual; `null` sem veículos) | `fleet.vehicles.operation_type = 'SVO'`, `svo.execution_orders` | perfis com acesso ao SVO |

---

## 3. Indicadores por veículo e período — `GET /dashboard/indicators?from=&to=&vehicleId=`

Uma linha por veículo (todos, ou só `vehicleId`) mais os totais do período.

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| Viagens concluídas | Contagem de viagens `FINISHED` ou `CONFIRMED` com `finished_at` no período | `trip.trips` | Em andamento (sem km final) e canceladas não entram. |
| Km percorrido | Soma de `end_km − start_km` das mesmas viagens | `trip.trips.start_km`, `end_km` | Mesmo conjunto da contagem, para os dois números serem coerentes. |
| Litros abastecidos | Soma de `liters` dos abastecimentos vigentes no período | `fleet.fuelings` | |
| Gasto com combustível | Soma de `total_value` dos abastecimentos vigentes no período | `fleet.fuelings` | Em reais. |
| Consumo médio (km/L) | Km percorrido ÷ litros abastecidos | `trip.trips`, `fleet.fuelings` | **Proposta — aguarda confirmação do cliente.** `null` sem km ou sem litros. |
| Gasto com manutenção | Soma de `cost` das ordens `DONE` fechadas no período | `fleet.maintenance_orders` | Em reais; ordens sem custo informado não entram. |

### SVO no período (perfis com acesso ao SVO)

| Indicador | Fórmula | Fonte | Observação |
|---|---|---|---|
| Ordens abertas | Contagem de ordens com `opened_at` no período | `svo.execution_orders` | |
| Tempo médio até a coleta | Média, em minutos, de `collected_at` da ordem − `received_at` do chamado, para ordens abertas no período e já coletadas | `svo.execution_orders`, `svo.occurrences` | **Proposta — eventos de início e fim ainda a validar com o cliente.** |

---

## 4. Pendências com o cliente

1. **Consumo médio (km/L):** fórmula proposta; a API a marca em `pendingValidation`.
2. **Tempo até a coleta do SVO:** confirmar se o início é o recebimento do chamado e o fim é a coleta; a API a marca em `pendingValidation`.

Enquanto não houver confirmação, os valores são calculados e exibidos com o aviso de proposta.
