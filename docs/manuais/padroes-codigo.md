# Padrões de Codificação e Clean Code — Sistema Aratu

Este documento estabelece as convenções de escrita de código, nomenclatura, tipagem e boas práticas de engenharia para todo o código TypeScript, React 19, API REST e SQL (PostgreSQL 18) do **Sistema Aratu**.

---

## 1. Ordem de Precedência dos Princípios

Em qualquer decisão técnica ou refatoração, os princípios do projeto valem nesta exata ordem:

1. **Padrões do Projeto Aratu:** a convenção existente na camada (`routes`, `controllers`, `services`, `repositories`, `components`, `pages`) vence preferências individuais.
2. **Escopo de Impacto (RBAC e Dados):** condicione comportamentos pelo dado de domínio existente ou pelo perfil RBAC. Não crie feature flags sem autorização expressa.
3. **Compatibilidade de Dados e Contratos:** preserve contratos JSON entre frontend e backend e respeite dados históricos já gravados no PostgreSQL.
4. **Idempotência e Atomicidade:** operações críticas não duplicam registros ao serem reenviadas e utilizam transações (`BEGIN ... COMMIT / ROLLBACK`).
5. **YAGNI (*You Aren't Gonna Need It*):** não implemente parâmetros, colunas ou abstrações especulativas.
6. **DRY (*Don't Repeat Yourself*):** cada regra de negócio mora em um único lugar (`Service`, helper ou componente UI compartilhado).
7. **SOLID com pragmatismo:** responsabilidade única e baixo acoplamento sem criar camadas artificiais (*over-engineering*).
8. **KISS (*Keep It Simple, Stupid*):** entre duas soluções corretas, escolha a mais direta e legível em manutenção sob pressão.
9. **Clean Code:** vocabulário claro do domínio de frotas e saúde (FSPH / SVO), identificadores em inglês, tipagem estrita e zero código morto.

---

## 2. Convenções de Nomenclatura (Código, API e Banco em Inglês)

Todo o código-fonte (**classes, métodos, funções, interfaces, types, enums, variáveis, constantes, componentes, hooks, arquivos `.ts`/`.tsx`, endpoints REST, rotas e schema SQL**) deve ser escrito em **inglês** para manter 100% de consistência com a sintaxe da linguagem. Apenas os **comentários TSDoc (`/** ... */`)**, a documentação técnica e os **textos/mensagens exibidos ao usuário final na interface** são escritos em **português (PT-BR)**.

Não utilizamos notação húngara em variáveis TypeScript (como `sName` ou `iAge`), pois o **TypeScript estrito** garante a verificação estática de tipos.

| Elemento | Convenção | Exemplos no Domínio Aratu |
|---|---|---|
| **Variáveis e parâmetros** | `camelCase` em inglês (substantivos descritivos) | `availableVehicle`, `initialMileage`, `tripRequest`, `plannedDeparture` |
| **Booleanos (TS/JS)** | `camelCase` em inglês com prefixo `is`, `has`, `can`, `should` | `isAvailable`, `hasValidLicense`, `canApproveRequest`, `requiresTriage` |
| **Funções e métodos** | `camelCase` em inglês (verbo + substantivo) | `allocateVehicle()`, `registerTripDeparture()`, `decideRequest()`, `findByIdForUpdate()` |
| **Classes, Interfaces, Types e Enums** | `PascalCase` em inglês | `TripService`, `VehicleRepository`, `RequestState`, `CreateRequestInput` |
| **Valores de Enums / Estados / Papéis** | `UPPER_SNAKE_CASE` em inglês (traduzidos para PT-BR apenas na UI) | `'SUBMITTED'`, `'APPROVED'`, `'IN_PROGRESS'`, `'PASSENGER'`, `'BODY'`, `'REQUESTER'`, `'MANAGER'` |
| **Componentes React** | `PascalCase` em inglês | `StatusBadge`, `TextInput`, `TripRequestForm`, `ConfirmModal` |
| **Hooks customizados React** | `camelCase` em inglês iniciando com `use` | `useAvailableVehicles`, `useAuth`, `useTrips` |
| **Constantes globais / limites** | `UPPER_SNAKE_CASE` em inglês | `MIN_TARGET_SIZE_PX`, `DEFAULT_PAGE_LIMIT`, `VEHICLE_COLUMNS` |
| **Arquivos Backend** | `kebab-case` em inglês ou `<entity>.<layer>.ts` | `vehicle.service.ts`, `vehicle.controller.ts`, `vehicle.repository.ts`, `trip.routes.ts` |
| **Arquivos de Componentes React** | `PascalCase.tsx` em inglês | `StatusBadge.tsx`, `ConfirmModal.tsx`, `VehiclesPage.tsx` |
| **Endpoints REST e Rotas Frontend** | `kebab-case` em inglês no plural | `/api/vehicles`, `/api/trips`, `/api/requests`, `/api/round-trip-events`, `/vehicles`, `/trips` |

---

### 2.1 Padrão de Nomenclatura no PostgreSQL 18 (Prefixo de 3 Letras em Inglês)

O schema do banco de dados segue o modelo canônico de **prefixo único de 3 letras** adaptado para o inglês:

1. **Tabelas (`<pre>_<singular_entity>`):**
   - Sempre no **singular**, em `snake_case` em inglês, iniciadas por um prefixo exclusivo de 3 letras da entidade.
   - Exemplos: `veh_vehicle`, `drv_driver`, `usr_user`, `sec_sector`, `srv_service`, `req_request`, `trp_trip`, `tre_trip_event`, `ral_request_allocation`, `aud_audit`.
2. **Chave Primária na Tabela (`<pre>_id`) e Mapeamento no `SELECT` (`<pre>_id AS id`):**
   - Na definição da tabela (`CREATE TABLE`), a chave primária é sempre `<pre>_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (ex: `veh_id`, `drv_id`, `trp_id`, `req_id`, `usr_id`).
   - Nas consultas `SELECT` do Repository para o TypeScript/JSON, o prefixo de 3 letras é removido via alias SQL para produzir DTOs `camelCase` limpos:
     ```sql
     SELECT
       veh_id AS id,
       veh_identification AS identification,
       veh_categories AS categories,
       veh_seats AS seats,
       veh_body_limit AS "bodyLimit",
       veh_weight_limit AS "weightLimit",
       veh_active AS active,
       veh_revision AS revision
     FROM veh_vehicle;
     ```
3. **Colunas Próprias (`<pre>_<column_name>`):**
   - Todas as colunas próprias da tabela levam o prefixo de 3 letras da própria tabela (ex: `veh_identification`, `veh_seats`, `veh_active`, `veh_revision`, `trp_planned_departure`, `trp_planned_end`, `trp_state`, `trp_created_at`).
4. **Chaves Estrangeiras (`<ref_pre>_id` ou `<ref_pre>_id_<role>`):**
   - Preservam exatamente o nome da PK da tabela referenciada **sem** o prefixo da tabela filha (ex: dentro de `trp_trip`, as FKs são `veh_id` e `drv_id`; nos eventos de auditoria, `usr_id`).
   - No `SELECT` do Repository, FKs recebem alias descritivo em `camelCase` (ex: `veh_id AS "vehicleId"`, `drv_id AS "driverId"`, `usr_id_requester AS "requesterUserId"`).
   - Quando uma tabela possui múltiplas FKs para a mesma tabela ou papel específico, adiciona-se o sufixo do papel em inglês: `<ref_pre>_id_<role>` (ex: `usr_id_requester` em `req_request`; `req_id_outbound` e `req_id_return` em `rte_round_trip_event`).
5. **Objetos Auxiliares do Banco (sem `idx_`, `uq_`, `trg_`, `fn_`):**
   - **Índices e Unique Indexes:** iniciam diretamente pelo prefixo de 3 letras da tabela `<pre>_<descriptive_name>` sem usar `idx_` ou `uq_` (ex: `rqe_unique_decision`, `rqe_unique_triage`, `trp_vehicle_in_progress`, `trp_driver_in_progress`, `ral_by_request`, `ral_by_trip`, `aud_by_table`).
   - **Triggers:** nomes descritivos em inglês em `snake_case` sem `trg_` (ex: `preserve`, `preserve_truncate`, `prevent_delete`, `prevent_truncate`, `audit`).
   - **Funções SQL:** sem `fn_`; funções auxiliares internas iniciam com `_` (ex: `_barrier()`, `_actor()`, `_actor_snapshot()`, `_reason()`, `_immutable()`, `_audit()`, `_validate_trip()`) e funções de comando públicas usam `verb_noun` em inglês (ex: `save_sector()`, `create_trip()`, `allocate_request()`, `decide_request()`).
   - **Views:** iniciam com `vw_` em inglês (ex: `vw_active_allocations`, `vw_round_trip_pairs`, `vw_active_policies`).
   - **Migrations:** `NNN_<description_in_english>.sql` (ex: `001_initial_schema.sql`).

#### Tabela Canônica de Entidades e Prefixos SQL do Aratu

| Entidade (Domínio) | Tabela SQL (EN) | Prefixo | PK na Tabela | Colunas Próprias e FKs Principais |
| :--- | :--- | :---: | :--- | :--- |
| Setor | `sec_sector` | `sec_` | `sec_id` | `sec_code`, `sec_name`, `sec_active`, `sec_revision` |
| Usuário | `usr_user` | `usr_` | `usr_id` | `usr_name`, `usr_login`, `usr_password_hash`, `usr_roles`, `usr_active`, `usr_revision` |
| Serviço | `srv_service` | `srv_` | `srv_id` | `srv_name`, `srv_categories`, `srv_requires_triage`, `srv_requires_weight`, `srv_requires_identification`, `srv_active`, `srv_revision` |
| Veículo | `veh_vehicle` | `veh_` | `veh_id` | `veh_identification`, `veh_categories`, `veh_seats`, `veh_body_limit`, `veh_weight_limit`, `veh_active`, `veh_revision` |
| Motorista | `drv_driver` | `drv_` | `drv_id` | `drv_name`, `drv_active`, `drv_revision` |
| Veículo × Serviço | `vhs_vehicle_service` | `vhs_` | `(veh_id, srv_id)` | FKs: `veh_id`, `srv_id` · Próprias: `vhs_active`, `vhs_revision` |
| Auditoria | `aud_audit` | `aud_` | `aud_id` | FK: `usr_id` · Próprias: `aud_table`, `aud_operation`, `aud_before`, `aud_after`, `aud_actor_snapshot`, `aud_registered_at`, `aud_reason` |
| Política de Aprovação | `apo_approval_policy` | `apo_` | `apo_id` | FKs: `sec_id`, `srv_id`, `usr_id` · Próprias: `apo_description`, `apo_actor_snapshot`, `apo_registered_at`, `apo_reason` |
| Evento de Política | `ape_policy_event` | `ape_` | `ape_id` | FKs: `apo_id`, `usr_id` · Próprias: `ape_type`, `ape_actor_snapshot`, `ape_registered_at`, `ape_reason` |
| Solicitação | `req_request` | `req_` | `req_id` | FKs: `usr_id_requester`, `sec_id`, `srv_id` · Próprias: `req_origin`, `req_destination`, `req_purpose`, `req_desired_departure`, `req_desired_end`, `req_category`, `req_quantity`, `req_total_weight`, `req_identification`, `req_state`, `req_version`, `req_revision`, `req_created_at` |
| Versão da Solicitação | `rqv_request_version` | `rqv_` | `rqv_id` | FKs: `req_id`, `usr_id` · Próprias: `rqv_number`, `rqv_snapshot`, `rqv_actor_snapshot`, `rqv_registered_at` |
| Evento da Solicitação | `rqe_request_event` | `rqe_` | `rqe_id` | FKs: `req_id`, `rqv_id`, `ape_id`, `usr_id` · Próprias: `rqe_type`, `rqe_modality`, `rqe_actor_snapshot`, `rqe_registered_at`, `rqe_reason` |
| Viagem | `trp_trip` | `trp_` | `trp_id` | FKs: `veh_id`, `drv_id` · Próprias: `trp_planned_departure`, `trp_planned_end`, `trp_state`, `trp_revision`, `trp_created_at` |
| Evento da Viagem | `tre_trip_event` | `tre_` | `tre_id` | FKs: `trp_id`, `usr_id` · Próprias: `tre_type`, `tre_occurred_at`, `tre_odometer`, `tre_actor_snapshot`, `tre_registered_at`, `tre_reason`, `tre_snapshot` |
| Alocação de Solicitação | `ral_request_allocation` | `ral_` | `ral_id` | FKs: `req_id`, `rqv_id`, `trp_id`, `usr_id` · Próprias: `ral_actor_snapshot`, `ral_registered_at`, `ral_reason`, `ral_snapshot` |
| Evento de Atendimento | `fve_fulfillment_event` | `fve_` | `fve_id` | FKs: `ral_id`, `usr_id` · Próprias: `fve_type`, `fve_occurred_at`, `fve_location`, `fve_actor_snapshot`, `fve_registered_at`, `fve_report` |
| Evento de Ida e Volta | `rte_round_trip_event` | `rte_` | `rte_id` | FKs: `req_id_outbound`, `req_id_return`, `rte_id_link`, `usr_id` · Próprias: `rte_type`, `rte_actor_snapshot`, `rte_registered_at`, `rte_reason` |
| Parâmetro do Sistema | `par_system_parameter` | `par_` | `par_id` | FK: `usr_id` · Próprias: `par_key`, `par_module`, `par_value`, `par_data_type`, `par_description`, `par_editable_by_role`, `par_updated_at` |
| Manutenção | `mnt_maintenance` | `mnt_` | `mnt_id` | FK: `veh_id` · Próprias: `mnt_type`, `mnt_description`, `mnt_state`, `mnt_started_at`, `mnt_finished_at`, `mnt_revision` |

---

## 3. Regras para Funções, Métodos e Tipagem TypeScript

- **Tipagem explícita e estrita:**
  - Declare explicitamente os tipos de todos os parâmetros e o tipo de retorno de funções/métodos públicos (`Promise<Vehicle>`, `boolean`, `void`).
  - É proibido utilizar `any`. Quando o tipo de uma entrada externa ainda não foi validado (ex: bloco `catch` ou payload bruto), utilize `unknown` e faça o estreitamento de tipo (*type narrowing*).
- **Responsabilidade Única e Tamanho:**
  - Uma função deve fazer apenas uma coisa e ter apenas um motivo para mudar.
  - Utilize *Early Return* (cláusulas de guarda no início da função) para evitar aninhamento de `if/else` com mais de 2 ou 3 níveis de indentação.
- **Sem valores mágicos:**
  - Estados de viagem (`'PLANNED'`, `'IN_PROGRESS'`, `'COMPLETED'`, `'CANCELED'`), estados de solicitação (`'DRAFT'`, `'SUBMITTED'`, `'APPROVED'`, `'REJECTED'`, `'IN_EXECUTION'`, `'COMPLETED'`, `'RETURNED'`, `'CANCELED'`), categorias (`'PASSENGER'`, `'BODY'`, `'OTHER'`) e papéis de usuário (`'REQUESTER'`, `'MANAGER'`, `'OPERATOR'`, `'ADMIN'`, `'TRIAGE'`) devem ser representados por union types ou constantes tipadas em inglês.
- **Tratamento de Exceções:**
  - Nunca engula exceções com blocos `catch {}` vazios.
  - Lance erros com classes em inglês (`NotFoundError`, `InvalidStateError`, `AllocationConflictError`) e mensagens em português claro que expliquem o motivo da falha no domínio e orientem o próximo passo.

---

## 4. Comentários e Documentação no Código (TSDoc)

- **Guia oficial de DocBlocks:** siga rigorosamente as diretrizes e exemplos de [`docs/manuais/padroes-docblocks.md`](padroes-docblocks.md).
- **Código em inglês, explicação TSDoc em português:** identificadores de código são em inglês, mas o texto explicativo dentro de `/** ... */` é escrito em português claro.
- **Comente o "porquê", não o "o quê":** use blocos TSDoc (`/** ... */`) para registrar regras de negócio não óbvias da FSPH/SVO, restrições de concorrência (ex: motivo de um `SELECT ... FOR UPDATE`), exceções lançadas (`@throws`) e critérios de acessibilidade em componentes React.
- **Não duplique tipagem:** é proibido usar `@param {tipo}` ou `@author` / `@since` (o Git já rastreia histórico e autoria).
- **Regra do Escoteiro:** ao alterar um arquivo existente, deixe-o mais limpo, bem tipado e documentado conforme [`docs/manuais/padroes-docblocks.md`](padroes-docblocks.md).
