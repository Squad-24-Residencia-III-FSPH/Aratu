# Consultas — escrever e otimizar SQL no PostgreSQL 18

Material de consulta da skill `principios`, par de `dados.md`.
A divisão entre os dois:

- **`dados.md`:** o que se guarda e como muda — tabela, coluna, constraints, concorrência, migrações.
- **este arquivo:** como se lê e filtra — `WHERE`, índices, `JOIN`, ordenação, paginação e plano de execução.

Leia quando a tarefa escrever ou alterar consultas no backend (`SELECT`, e `UPDATE`/`DELETE`
com `WHERE`), listagens de frotas, histórico de viagens, chamados do SVO ou propor novos índices.

A primeira parte reúne princípios fundamentais de performance em bancos relacionais.
A segunda é específica do **PostgreSQL 18** e do driver `pg` (Node.js).

---

## Antes de otimizar: meça

1. **O custo real é o que o banco examina, não o que ele devolve.**
   A consulta lê 10.000 linhas para devolver 5? Isso exige índice ou filtro mais restritivo.
2. **Banco local com poucos registros mascara consultas lentas.**
   Uma query sem índice roda em 1 ms com 20 registros no Docker local, mas trava
   quando a base tiver milhares de viagens e registros operacionais em produção.
3. **Não tente adivinhar: use o `EXPLAIN`.**
   No PostgreSQL, execute `EXPLAIN (ANALYZE, BUFFERS) <query>` para ver o tempo real,
   o custo estimado e a quantidade de buffers (páginas de disco) lidos.
4. **Altere e meça novamente.** Mudança sem comprovação de ganho não é otimização.

---

## O `WHERE` que usa o índice (sargável)

O otimizador de consultas não consegue aplicar o índice de forma direta sobre colunas
envolvidas em funções ou transformações:

- **Não transforme a coluna; transforme o valor:**

  | Em vez de | Escreva |
  |---|---|
  | `DATE(planned_departure) = '2026-05-10'` | `planned_departure >= '2026-05-10T00:00:00Z' AND planned_departure < '2026-05-11T00:00:00Z'` |
  | `EXTRACT(YEAR FROM created_at) = 2026` | `created_at >= '2026-01-01' AND created_at < '2027-01-01'` |
  | `LOWER(license_plate) = 'abc-1234'` | `license_plate = 'ABC-1234'` (armazene normalizado) |
  | `state || category = 'SUBMITTED_BODY'` | `state = 'SUBMITTED' AND category = 'BODY'` |

  Períodos contínuos devem ser expressos como intervalos semiabertos (`>=` início e `<` fim).
- **Tipagem estrita no PostgreSQL:**
  O PostgreSQL não converte strings para inteiros silenciosamente. Passe os tipos
  corretos nos parâmetros do `pg`.
- **Busca por texto com `LIKE`:**
  `license_plate LIKE 'VTR%'` aproveita o índice B-tree padrão (com suporte a `text_pattern_ops`).
  `destination LIKE '%Centro%'` (curinga à esquerda) faz varredura completa (`Seq Scan`), a
  menos que se utilize a extensão `pg_trgm` com índice GIN.

---

## Traga só o necessário e mapeie para `camelCase`

- **Colunas nomeadas, nunca `SELECT *`:**
  O `*` trafega dados desnecessários pela rede, impede o uso de *Index Only Scan* e quebra contratos se a tabela ganhar colunas novas. Mapeie apenas as colunas necessárias com alias `camelCase` quando o nome em `snake_case` divergir (ex: `created_at AS "createdAt"`).
- **Filtre no banco, não na memória do Node.js:**
  Nunca faça `SELECT` de todas as viagens para filtrar por estado com `.filter()`
  no JavaScript. O banco é infinitamente mais rápido para filtrar e ordenar.
- **Evite o problema do N+1:**
  Buscar uma lista de 50 viagens e, para cada uma, disparar uma query individual
  para buscar o motorista e o veículo gera 101 idas ao banco.
  - Faça `JOIN` diretamente no SQL:
    ```sql
    SELECT t.id,
           t.state,
           t.planned_departure AS "plannedDeparture",
           v.license_plate AS "licensePlate",
           d.name AS "driverName"
      FROM trip.trips t
      JOIN fleet.vehicles v ON v.id = t.vehicle_id
      JOIN fleet.drivers d ON d.id = t.driver_id;
    ```
  - Ou agregue dados filhos em formato JSON nativo no PostgreSQL usando
    `jsonb_build_object` e `jsonb_agg`.

---

## Paginação e Ordenação no PostgreSQL 18

- **`OFFSET` elevado degrada performance:**
  `LIMIT 20 OFFSET 50000` obriga o banco a ler e descartar 50.000 linhas antes de
  devolver as 20 desejadas.
- **Keyset Pagination (Busca pela última linha vista):**
  No PostgreSQL, a comparação de tuplas em índices é nativa e eficiente:
  ```sql
  SELECT
    id,
    created_at AS "createdAt",
    state
  FROM trip.requests
  WHERE (created_at, id) < ($1, $2)
  ORDER BY created_at DESC, id DESC
  LIMIT 20;
  ```
  Isso aproveita diretamente o índice composto `(created_at DESC, id DESC)`.

---

## Aratu — práticas com o driver `pg` no Node.js

### 1. Parâmetros sempre com `$1, $2, ...`
- **Regra absoluta de segurança:** Nunca use interpolação de strings (`template literals`)
  para concatenar variáveis recebidas de usuários dentro do SQL.
- **Padrão correto:**
  ```typescript
  const query = `
    SELECT
      id,
      identification,
      seats,
      active
    FROM fleet.vehicles
    WHERE active = $1 AND seats >= $2
    ORDER BY identification ASC;
  `;
  const result = await pool.query(query, [true, minSeats]);
  ```

### 2. Índices Estratégicos para o Domínio Aratu (Sem `idx_` ou `uq_`)
- **Nomenclatura de Índices:** Seguem o padrão `<schema>_<table>_<purpose>` (sem `idx_` nem `uq_`).
- **Chaves estrangeiras e buscas frequentes:**
  ```sql
  CREATE INDEX trip_allocations_by_request ON trip.allocations (request_id);
  CREATE INDEX trip_allocations_by_trip ON trip.allocations (trip_id);
  CREATE INDEX audit_logs_by_table ON audit.logs (table_name, record_id);
  ```
- **Índices Parciais (Recurso Poderoso do PostgreSQL):**
  ```sql
  -- Garante que um veículo ou motorista tenha no máximo uma viagem em andamento
  CREATE UNIQUE INDEX trip_trips_vehicle_in_progress ON trip.trips (vehicle_id) WHERE state = 'IN_PROGRESS';
  CREATE UNIQUE INDEX trip_trips_driver_in_progress ON trip.trips (driver_id) WHERE state = 'IN_PROGRESS';
  ```

### 3. Interpretando o `EXPLAIN` no PostgreSQL
- **Seq Scan:** Varredura sequencial na tabela inteira. Aceitável em tabelas minúsculas;
  alerta vermelho em tabelas volumosas.
- **Index Scan:** Busca na árvore do índice B-tree e leitura das linhas correspondentes na tabela.
- **Index Only Scan:** A consulta é respondida inteiramente pelos dados contidos no índice,
  sem necessidade de tocar na tabela (máxima velocidade).
- **Bitmap Heap Scan / Bitmap Index Scan:** Combinação de índices quando múltiplos filtros são aplicados.
