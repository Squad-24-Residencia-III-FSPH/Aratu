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
  | `DATE(trp_planned_departure) = '2026-05-10'` | `trp_planned_departure >= '2026-05-10T00:00:00Z' AND trp_planned_departure < '2026-05-11T00:00:00Z'` |
  | `EXTRACT(YEAR FROM req_created_at) = 2026` | `req_created_at >= '2026-01-01' AND req_created_at < '2027-01-01'` |
  | `LOWER(veh_identification) = 'vtr-01'` | `veh_identification = 'VTR-01'` (armazene normalizado) |
  | `req_state || req_category = 'SUBMITTED_BODY'` | `req_state = 'SUBMITTED' AND req_category = 'BODY'` |

  Períodos contínuos devem ser expressos como intervalos semiabertos (`>=` início e `<` fim).
- **Tipagem estrita no PostgreSQL:**
  O PostgreSQL não converte strings para inteiros silenciosamente. Passe os tipos
  corretos nos parâmetros do `pg`.
- **Busca por texto com `LIKE`:**
  `veh_identification LIKE 'VTR%'` aproveita o índice B-tree padrão (com suporte a `text_pattern_ops`).
  `req_destination LIKE '%Centro%'` (curinga à esquerda) faz varredura completa (`Seq Scan`), a
  menos que se utilize a extensão `pg_trgm` com índice GIN.

---

## Traga só o necessário e mapeie para `camelCase` sem prefixo

- **Colunas nomeadas com alias `<pre>_id AS id`, nunca `SELECT *`:**
  O `*` trafega dados desnecessários pela rede, vaza o prefixo SQL de 3 letras para o JSON, impede o uso de *Index Only Scan* e quebra contratos se a tabela ganhar colunas novas.
- **Filtre no banco, não na memória do Node.js:**
  Nunca faça `SELECT` de todas as viagens para filtrar por estado com `.filter()`
  no JavaScript. O banco é infinitamente mais rápido para filtrar e ordenar.
- **Evite o problema do N+1:**
  Buscar uma lista de 50 viagens e, para cada uma, disparar uma query individual
  para buscar o motorista e o veículo gera 101 idas ao banco.
  - Faça `JOIN` diretamente no SQL (ex: `FROM trp_trip JOIN veh_vehicle USING (veh_id) JOIN drv_driver USING (drv_id)`);
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
    req_id AS id,
    req_created_at AS "createdAt",
    req_state AS state
  FROM req_request
  WHERE (req_created_at, req_id) < ($1, $2)
  ORDER BY req_created_at DESC, req_id DESC
  LIMIT 20;
  ```
  Isso aproveita diretamente o índice composto `(req_created_at DESC, req_id DESC)`.

---

## Aratu — práticas com o driver `pg` no Node.js

### 1. Parâmetros sempre com `$1, $2, ...`
- **Regra absoluta de segurança:** Nunca use interpolação de strings (`template literals`)
  para concatenar variáveis recebidas de usuários dentro do SQL.
- **Padrão correto:**
  ```typescript
  const query = `
    SELECT
      veh_id AS id,
      veh_identification AS identification,
      veh_seats AS seats,
      veh_active AS active
    FROM veh_vehicle
    WHERE veh_active = $1 AND veh_seats >= $2
    ORDER BY veh_identification ASC;
  `;
  const result = await pool.query(query, [true, minSeats]);
  ```

### 2. Índices Estratégicos para o Domínio Aratu (Sem `idx_` ou `uq_`)
- **Nomenclatura de Índices:** Iniciam diretamente pelo prefixo de 3 letras da tabela `<pre>_<descriptive_name>` (sem `idx_` nem `uq_`).
- **Chaves estrangeiras e buscas frequentes:**
  ```sql
  CREATE INDEX ral_by_request ON ral_request_allocation (req_id);
  CREATE INDEX ral_by_trip ON ral_request_allocation (trp_id);
  CREATE INDEX rqe_by_request ON rqe_request_event (req_id, rqv_id);
  CREATE INDEX aud_by_table ON aud_audit (aud_table, aud_id);
  ```
- **Índices Parciais (Recurso Poderoso do PostgreSQL):**
  ```sql
  -- Garante que um veículo ou motorista tenha no máximo uma viagem em andamento
  CREATE UNIQUE INDEX trp_vehicle_in_progress ON trp_trip (veh_id) WHERE trp_state = 'IN_PROGRESS';
  CREATE UNIQUE INDEX trp_driver_in_progress ON trp_trip (drv_id) WHERE trp_state = 'IN_PROGRESS';
  ```

### 3. Interpretando o `EXPLAIN` no PostgreSQL
- **Seq Scan:** Varredura sequencial na tabela inteira. Aceitável em tabelas minúsculas;
  alerta vermelho em tabelas volumosas.
- **Index Scan:** Busca na árvore do índice B-tree e leitura das linhas correspondentes na tabela.
- **Index Only Scan:** A consulta é respondida inteiramente pelos dados contidos no índice,
  sem necessidade de tocar na tabela (máxima velocidade).
- **Bitmap Heap Scan / Bitmap Index Scan:** Combinação de índices quando múltiplos filtros são aplicados.
