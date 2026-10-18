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

### 2.1 Padrão de Nomenclatura no PostgreSQL 18 (Schemas Nativos de Domínio em Inglês)

O banco de dados oficial é estruturado em **Schemas Nativos de Domínio**, eliminando prefixos húngaros redundantes e espelhando diretamente o modelo TypeScript:

1. **Schemas de Domínio:**
   - `auth`: Autenticação, controle de usuários, setores, sessões e parâmetros do sistema.
   - `audit`: Trilha de auditoria transversal e imutável.
   - `fleet`: Gestão de viaturas, serviços, motoristas e ordens de manutenção.
   - `trip`: Solicitações de transporte institucional FSPH, aprovações, alocações e viagens.
   - `svo`: Atendimento de óbitos, remoções cadavéricas, custódia e laudos.
2. **Tabelas (`<schema>.<plural_entity>`):**
   - Sempre no **plural**, em `snake_case` em inglês, qualificadas pelo schema (evitando colisões com palavras reservadas do SQL como `USER`, `ORDER`, `GROUP` e representando a coleção de registros).
   - Exemplos: `auth.users`, `auth.sectors`, `audit.logs`, `fleet.vehicles`, `fleet.drivers`, `fleet.maintenance_orders`, `trip.requests`, `trip.trips`, `trip.allocations`, `svo.occurrences`.
3. **Chave Primária (`id`):**
   - Na definição da tabela (`CREATE TABLE`), a chave primária é sempre:
     ```sql
     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
     ```
   - Nas consultas `SELECT` do Repository para o TypeScript, a projeção é limpa e direta:
     ```sql
     SELECT
       id,
       license_plate AS "licensePlate",
       seats,
       body_limit AS "bodyLimit",
       weight_limit AS "weightLimit",
       is_active AS "isActive",
       revision
     FROM fleet.vehicles;
     ```
4. **Colunas Próprias:**
   - Nomes substantivos em inglês `snake_case` sem prefixos redundantes (ex: `name`, `email`, `password_hash`, `role`, `active` / `is_active`, `planned_departure`, `planned_end`, `state`, `created_at`).
5. **Chaves Estrangeiras (`<entity>_id` ou `<entity>_id_<role>`):**
   - Seguem o padrão `<entity>_id` **no singular** referenciando a tabela de origem (ex: `user_id REFERENCES auth.users(id)`, `vehicle_id REFERENCES fleet.vehicles(id)`, `driver_id REFERENCES fleet.drivers(id)`).
   - Quando uma tabela possui múltiplas FKs para a mesma entidade, adiciona-se o papel semântico em inglês: `user_id_requester`, `user_id_manager`, `request_id_outbound`, `request_id_return`.
6. **Objetos Auxiliares do Banco:**
   - **Índices Únicos e de Busca:** `<schema>_<table>_<purpose>` (ex: `auth_users_email_lower_unique`, `audit_logs_by_user`, `trip_trips_vehicle_in_progress`, `trip_allocations_by_request`).
   - **Triggers:** nomes descritivos em inglês em `snake_case` (ex: `preserve`, `prevent_delete`, `audit_trigger`).
   - **Funções SQL:** funções internas iniciam com `_` (ex: `_actor_snapshot()`, `_audit()`) e funções de comando públicas usam `verb_noun` em inglês (ex: `create_trip()`, `allocate_request()`).
   - **Views:** qualificadas no schema ou com `vw_` em inglês (ex: `trip.vw_active_allocations`).
   - **Migrations:** `YYYYMMDDNNNN_<description_in_english>.sql` (ex: `202610160001_create_users.sql`).

#### Tabela Canônica de Entidades por Schema no PostgreSQL 18

| Schema | Entidade (Domínio) | Tabela SQL (EN) | PK | Colunas Próprias e FKs Principais |
| :--- | :--- | :--- | :---: | :--- |
| `auth` | Setor | `auth.sectors` | `id` | `code`, `name`, `is_active`, `revision`, `created_at` |
| `auth` | Usuário | `auth.users` | `id` | `name`, `email`, `password_hash`, `role`, `active`, `revision`, `created_at` |
| `audit` | Log de Auditoria | `audit.logs` | `id` | FK: `user_id` · Próprias: `table_name`, `record_id`, `operation`, `before`, `after`, `actor_snapshot`, `reason`, `registered_at` |
| `fleet` | Serviço | `fleet.services` | `id` | `name`, `categories`, `requires_triage`, `requires_weight`, `requires_identification`, `is_active`, `revision` |
| `fleet` | Veículo | `fleet.vehicles` | `id` | `license_plate`, `categories`, `seats`, `body_limit`, `weight_limit`, `is_active`, `revision` |
| `fleet` | Motorista | `fleet.drivers` | `id` | `name`, `cnh_number`, `cnh_category`, `cnh_expiration`, `is_active`, `revision` |
| `fleet` | Veículo × Serviço | `fleet.vehicle_services` | `(vehicle_id, service_id)` | FKs: `vehicle_id`, `service_id` · Próprias: `is_active`, `revision` |
| `fleet` | Manutenção | `fleet.maintenance_orders` | `id` | FK: `vehicle_id` · Próprias: `type`, `description`, `state`, `started_at`, `finished_at`, `revision` |
| `trip` | Política de Aprovação | `trip.approval_policies` | `id` | FKs: `sector_id`, `service_id`, `user_id` · Próprias: `description`, `actor_snapshot`, `registered_at`, `reason` |
| `trip` | Solicitação | `trip.requests` | `id` | FKs: `user_id_requester`, `sector_id`, `service_id` · Próprias: `origin`, `destination`, `purpose`, `desired_departure`, `desired_end`, `category`, `quantity`, `total_weight`, `state`, `version`, `revision`, `created_at` |
| `trip` | Alocação | `trip.allocations` | `id` | FKs: `request_id`, `trip_id`, `user_id` · Próprias: `actor_snapshot`, `registered_at`, `reason` |
| `trip` | Viagem | `trip.trips` | `id` | FKs: `vehicle_id`, `driver_id` · Próprias: `planned_departure`, `planned_end`, `state`, `odometer_start`, `odometer_end`, `revision`, `created_at` |
| `svo` | Chamado / Ocorrência | `svo.occurrences` | `id` | FKs: `user_id_operator`, `vehicle_id`, `driver_id` · Próprias: `protocol_number`, `deceased_name`, `death_date`, `location`, `state`, `created_at` |
| `svo` | Custódia e Laudo | `svo.custody_records` | `id` | FKs: `occurrence_id`, `user_id_responsible` · Próprias: `custody_state`, `report_summary`, `registered_at` |

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
