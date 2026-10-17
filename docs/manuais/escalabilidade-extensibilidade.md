# Escalabilidade, Parametrização Dinâmica e Extensibilidade — Sistema Aratu

Este documento define a arquitetura oficial do **Sistema Aratu** para **parametrização dinâmica de regras de negócio**, **escalabilidade operacional** e **estratégia de extensibilidade para criação de novos módulos** (Squad 24 — FSPH & SVO).

---

## 1. Visão Geral da Arquitetura

O Sistema Aratu adota um modelo de **Monolito Modular em Camadas**. Esse modelo foi escolhido para equilibrar alta performance, simplicidade operacional e fácil manutenção pela equipe de residentes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          APLICAÇÃO REACT 19                            │
│           (Pages · Custom Hooks · Componentes UI Acessíveis)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (JSON)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    API STATELESS NODE.JS / EXPRESS 5                   │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │         Middlewares Globais (Auth JWT, RBAC, Validação)        │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │                      MÓDULOS DE DOMÍNIO                        │   │
│   │  [AUTENTICACAO_RBAC] [FROTA] [VIAGENS] [SVO] [MANUTENCOES] ... │   │
│   │   Controllers  ──►  Services (Regras Puras)  ──►  Repositories │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │         MÓDULO TRANSVERSAL: PARAMETRIZAÇÃO DO SISTEMA          │   │
│   │      (Cache em Memória + Tabela `par_system_parameter`)        │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ Pool pg ($1, $2, FOR UPDATE)
┌───────────────────────────────────▼────────────────────────────────────┐
│                         POSTGRESQL 18 (ALPINE)                         │
│    (Prefixo de 3 Letras · DDL Transacional · Índices Sargáveis)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Parametrização Dinâmica do Sistema (`par_system_parameter`)

### 2.1 Problema que Resolve
Determinadas regras operacionais da **Fundação de Saúde Parreiras Horta (FSPH)** e do **Serviço de Verificação de Óbito (SVO)** variam conforme portarias, decretos ou mudanças sazonais de demanda. 

Se esses limites forem gravados como constantes fixas no código, qualquer mudança exige que um desenvolvedor altere código, faça commit, execute testes e suba um novo deploy. Com a **parametrização dinâmica**, gestores e administradores autorizados alteram essas regras diretamente na interface administrativa, surtindo efeito imediato e seguro no sistema.

### 2.2 Modelagem no PostgreSQL 18 (Padrão de Prefixo de 3 Letras)

A tabela `par_system_parameter` armazena configurações tipadas em formato JSONB, com auditoria completa de quem alterou e quando:

```sql
CREATE TABLE par_system_parameter (
    par_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    par_key text NOT NULL UNIQUE CHECK (btrim(par_key) <> ''),
    par_module text NOT NULL CHECK (btrim(par_module) <> ''),
    par_value jsonb NOT NULL,
    par_data_type text NOT NULL CHECK (par_data_type IN ('NUMBER', 'TEXT', 'BOOLEAN', 'JSON')),
    par_description text NOT NULL CHECK (btrim(par_description) <> ''),
    par_editable_by_role text NOT NULL DEFAULT 'ADMIN',
    usr_id bigint REFERENCES usr_user,
    par_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    par_revision integer NOT NULL DEFAULT 1 CHECK (par_revision > 0)
);

-- Índice iniciando com o prefixo de 3 letras da tabela (sem idx_)
CREATE INDEX par_by_module ON par_system_parameter (par_module);
```

### 2.3 Catálogo de Parâmetros Oficiais de Domínio

| Chave (`par_key`) | Módulo (`par_module`) | Tipo (`par_data_type`) | Valor Inicial | Descrição Operacional |
|---|---|---|---|---|
| `trips.min_advance_request_hours` | `VIAGENS` | `NUMBER` | `24` | Tempo mínimo em horas para envio de pedido de viagem comum pela FSPH. |
| `trips.max_radius_without_overnight_km` | `VIAGENS` | `NUMBER` | `150` | Distância máxima de ida e volta que não exige justificativa de diária/pernoite. |
| `trips.return_delay_tolerance_minutes` | `VIAGENS` | `NUMBER` | `30` | Tolerância para registro de retorno antes de sinalizar atraso na frota. |
| `fleet.maintenance_alert_mileage` | `FROTA` | `NUMBER` | `500` | Quilômetros de antecedência para disparar aviso preventivo de revisão. |
| `svo.max_body_retention_hours` | `SVO` | `NUMBER` | `72` | Limite de permanência de corpo sem identificação antes do protocolo social. |
| `system.session_expiration_minutes` | `AUTENTICACAO_RBAC` | `NUMBER` | `480` | Tempo de vida padrão da sessão do token JWT (8 horas). |

### 2.4 Camada de Serviço e Cache em Memória com Invalidação

Para não sobrecarregar o PostgreSQL com consultas repetitivas de parâmetros a cada requisição HTTP, o serviço `SystemParameterService` mantém um cache em memória com recarga automática ou invalidação imediata após atualização:

```typescript
// backend/src/services/system-parameter.service.ts
import { Pool } from 'pg';

export class SystemParameterService {
  private cache = new Map<string, unknown>();
  private lastLoadedAt = 0;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutos de TTL

  constructor(private readonly pool: Pool) {}

  /**
   * Obtém o valor tipado de um parâmetro de sistema.
   * Consulta primeiro o cache em memória; em caso de miss ou expiração, busca no PostgreSQL.
   */
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const now = Date.now();
    if (this.cache.has(key) && now - this.lastLoadedAt < this.TTL_MS) {
      return this.cache.get(key) as T;
    }

    const { rows } = await this.pool.query<{ value: T }>(
      'SELECT par_value AS value FROM par_system_parameter WHERE par_key = $1 LIMIT 1;',
      [key]
    );

    if (rows.length === 0) {
      return defaultValue;
    }

    const value = rows[0].value;
    this.cache.set(key, value);
    return value;
  }

  /**
   * Atualiza o valor de um parâmetro (restrito a administradores) e invalida o cache.
   */
  async updateParameter(
    key: string,
    newValue: unknown,
    userId: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE par_system_parameter
          SET par_value = $1::jsonb,
              usr_id = $2,
              par_updated_at = clock_timestamp(),
              par_revision = par_revision + 1
        WHERE par_key = $3;`,
      [JSON.stringify(newValue), userId, key]
    );

    // Invalidação imediata do cache local
    this.cache.delete(key);
  }
}
```

### 2.5 Exemplo de Uso no Serviço de Negócio

No `TripService`, a regra de antecedência passa a consumir o parâmetro de forma desacoplada:

```typescript
// backend/src/services/trip.service.ts
export class TripService {
  constructor(
    private readonly tripRepository: TripRepository,
    private readonly parameterService: SystemParameterService
  ) {}

  async validateAdvanceNotice(desiredDeparture: Date): Promise<void> {
    const minHours = await this.parameterService.get<number>(
      'trips.min_advance_request_hours',
      24
    );

    const hoursDiff = (desiredDeparture.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursDiff < minHours) {
      throw new Error(
        `Solicitações de viagem devem ser realizadas com no mínimo ${minHours} horas de antecedência.`
      );
    }
  }
}
```

---

## 3. Estratégia de Extensibilidade de Novos Módulos

Quando a FSPH ou o SVO demandar uma nova frente de trabalho (ex: módulo `ABASTECIMENTO`, `MULTAS` ou `REGULACAO`), a equipe deve seguir rigorosamente o roteiro abaixo. Cada módulo opera como um contexto delimitado (*Bounded Context*) dentro do monolito.

### 3.1 Roteiro de 7 Passos para Criação de Novo Módulo

```
1. Mapeamento & SDD      ──► 2. Migração PostgreSQL ──► 3. Camadas Backend (TS)
   (docs/manuais/modulos.md +  (DDL Transacional +         (Routes + Controllers +
    /plano <CHAVE>)             Rollback Obrigatório)       Services + Repositories)
                                                                   │
                                                                   ▼
7. Pull Request & QA     ◄── 6. Documentação HTML   ◄── 4. Telas React 19 (UI)
   (feat/<tarefa> -> develop   (docs/modulos/<CHAVE>.html  (5 Estados Visuais +
    após /revisar)              via /documentar-modulo)     WCAG 2.2 AA)
                                        ▲
                                        │
                                5. Bateria de Testes
                                  (Unitários + Integração
                                   via /testar com dados fictícios)
```

#### Passo 1 — Mapeamento no Índice e Planejamento SDD
1. Adicione a chave do novo módulo em [`docs/manuais/modulos.md`](modulos.md) com sua descrição e entidades principais.
2. Execute o comando `/plano <CHAVE_TAREFA>` para gerar o Plano Técnico em `docs/plans/<chave-tarefa>-<slug>.html`.
3. Após aprovar o SDD, execute `/implementar` para codificar os passos 2 a 4 em conformidade estrita com a skill `principios`.

#### Passo 2 — Banco de Dados e Migrações (PostgreSQL 18)
1. Crie a migration em bloco transacional seguindo o padrão de prefixo de 3 letras em inglês (`fll_fuel_log`) e índice sem `idx_`:
   ```sql
   BEGIN;
   CREATE TABLE fll_fuel_log (
       fll_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       veh_id bigint NOT NULL REFERENCES veh_vehicle ON DELETE RESTRICT,
       drv_id bigint NOT NULL REFERENCES drv_driver ON DELETE RESTRICT,
       fll_liters numeric(8, 2) NOT NULL CHECK (fll_liters > 0),
       fll_odometer numeric(12, 1) NOT NULL CHECK (fll_odometer >= 0),
       fll_fueled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
       fll_revision integer NOT NULL DEFAULT 1 CHECK (fll_revision > 0)
   );
   CREATE INDEX fll_by_vehicle ON fll_fuel_log (veh_id);
   COMMIT;
   ```

#### Passo 3 — Implementação das Camadas Backend (Express 5)
1. Crie os arquivos em inglês em `backend/src/`:
   - `types/<entity>.types.ts` (interfaces e DTOs explícitos em inglês, zero `any`);
   - `repositories/<entity>.repository.ts` (queries com `$1, $2`, projeções explícitas `<pre>_id AS id`, sem `SELECT *`);
   - `services/<entity>.service.ts` (regras puras de negócio em inglês com TSDoc semântico em português conforme [`docs/manuais/padroes-docblocks.md`](padroes-docblocks.md));
   - `controllers/<entity>.controller.ts` (validação de I/O HTTP e tratamento semântico de erros);
   - `routes/<entity>.routes.ts` (endpoints REST em inglês no plural protegidos com middlewares de autenticação e RBAC).
2. Conecte a nova rota no arquivo principal de roteamento (`app.ts`):
   ```typescript
   app.use('/api/fuel-logs', authenticate, fuelLogRouter);
   ```

#### Passo 4 — Implementação das Camadas Frontend (React 19)
1. Crie o cliente de API tipado em `frontend/src/services/<entity>.api.ts`.
2. Construa a tela em `frontend/src/pages/<Entity>/` garantindo:
   - Reuso dos componentes acessíveis de `frontend/src/components/ui/`;
   - Associação de formulários com `useId()`;
   - Alvos mínimos de toque de **44×44px** e `:focus-visible`;
   - Tratamento explícito dos **5 estados visuais** (*Ideal*, *Carregando com `aria-busy="true"`*, *Vazio*, *Erro com ação orientadora* e *Parcial*).

#### Passo 5 — Bateria de Testes Funcionais (`/testar`)
1. Escreva testes automatizados para o `Service` cobrindo cenários felizes e de erro (com dados 100% sintéticos — LGPD).
2. Valide o comportamento dos endpoints e telas via comando `/testar`.

#### Passo 6 — Documentação Técnica do Módulo (`/documentar-modulo`)
1. Execute `/documentar-modulo <CHAVE_MODULO>` para gerar o arquivo autocontido `docs/modulos/<CHAVE_MODULO>.html` a partir de `docs/modulos/EXEMPLO_MODULO.html`.

#### Passo 7 — Revisão Automatizada e Pull Request (`/revisar`)
1. Crie e mantenha as alterações na branch da tarefa a partir de `develop` (`feat/<nome-da-tarefa>` ou `feature/<nome-da-tarefa>`).
2. Execute `/revisar` para auditar conformidade de camadas, SQL injection, WCAG 2.2 AA e ausência de dados pessoais.
3. Abra o Pull Request para `develop`.

---

## 4. Diretrizes de Escalabilidade Concorrente

Para suportar aumentos de escala de demanda sem alterações estruturais no código:

1. **Escalabilidade Horizontal do Backend (Stateless):**
   - Como os tokens de sessão JWT são stateless e assinados criptograficamente, instâncias adicionais do container `backend` podem ser adicionadas instantaneamente atrás de um balanceador Nginx (`docker compose up --scale backend=3`) sem necessidade de replicação de sessão em memória.
2. **Escalabilidade Concorrente no PostgreSQL 18:**
   - Todo processo de alocação de frota ou despacho de equipe SVO deve utilizar **lock pessimista** (`SELECT ... FOR UPDATE`) ou controle de revisão otimista (`<pre>_revision`), evitando deadlocks mantendo a ordem de ID ao travar mais de uma tabela.
3. **Escalabilidade de Dados Históricos:**
   - Tabelas operacionais com alto volume de inserção diária (ex: `req_request`, `trp_trip`, `aud_audit`) devem utilizar **Keyset Pagination** em vez de `OFFSET` para manter tempos de resposta constantes (< 50ms) mesmo após anos de registros hospitalares acumulados.
