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
  | `DATE(data_viagem) = '2026-05-10'` | `data_viagem >= '2026-05-10T00:00:00Z' AND data_viagem < '2026-05-11T00:00:00Z'` |
  | `EXTRACT(YEAR FROM data_saida) = 2026` | `data_saida >= '2026-01-01' AND data_saida < '2027-01-01'` |
  | `LOWER(placa) = 'abc1234'` | `placa = 'ABC1234'` (armazene normalizado em maiúsculo) |
  | `status || tipo = 'aberto_urgente'` | `status = 'aberto' AND tipo = 'urgente'` |

  Períodos contínuos devem ser expressos como intervalos semiabertos (`>=` início e `<` fim).
- **Tipagem estrita no PostgreSQL:**
  O PostgreSQL não converte strings para inteiros silenciosamente. Comparar `id = '42'`
  quando `id` é numérico ou UUID pode exigir cast ou gerar erro de tipo. Passe os tipos
  corretos nos parâmetros do `pg`.
- **Busca por texto com `LIKE`:**
  `placa LIKE 'ABC%'` aproveita o índice B-tree padrão (com suporte a text_pattern_ops).
  `destino LIKE '%Centro%'` (curinga à esquerda) faz varredura completa (`Seq Scan`), a
  menos que se utilize a extensão `pg_trgm` com índice GIN.

---

## Traga só o necessário

- **Colunas nomeadas, nunca `SELECT *`:**
  O `*` trafega dados desnecessários pela rede, impede o uso de *Index Only Scan*
  e quebra contratos se a tabela ganhar colunas novas.
- **Filtre no banco, não na memória do Node.js:**
  Nunca faça `SELECT` de todas as viagens para filtrar por status com `.filter()`
  no JavaScript. O banco é infinitamente mais rápido para filtrar e ordenar.
- **Evite o problema do N+1:**
  Buscar uma lista de 50 viagens e, para cada uma, disparar uma query individual
  para buscar o motorista e o veículo gera 101 idas ao banco.
  - Faça `JOIN` diretamente no SQL;
  - Ou agregue dados filhos em formato JSON nativo no PostgreSQL usando
    `json_build_object` e `json_agg`.

---

## Paginação e Ordenação no PostgreSQL 18

- **`OFFSET` elevado degrada performance:**
  `LIMIT 20 OFFSET 50000` obriga o banco a ler e descartar 50.000 linhas antes de
  devolver as 20 desejadas.
- **Keyset Pagination (Busca pela última linha vista):**
  No PostgreSQL, a comparação de tuplas em índices é nativa e eficiente:
  ```sql
  SELECT id, data_solicitacao, status
  FROM solicitacoes_viagem
  WHERE (data_solicitacao, id) < ($1, $2)
  ORDER BY data_solicitacao DESC, id DESC
  LIMIT 20;
  ```
  Isso aproveita diretamente o índice composto `(data_solicitacao DESC, id DESC)`.

---

## Aratu — práticas com o driver `pg` no Node.js

### 1. Parâmetros sempre com `$1, $2, ...`
- **Regra absoluta de segurança:** Nunca use interpolação de strings (`template literals`)
  para concatenar variáveis recebidas de usuários dentro do SQL.
- **Padrão correto:**
  ```typescript
  const query = `
    SELECT id, placa, modelo, status
    FROM veiculos
    WHERE status = $1 AND capacidade >= $2
    ORDER BY modelo ASC;
  `;
  const result = await pool.query(query, [status, capacidadeMinima]);
  ```

### 2. Índices Estratégicos para o Domínio Aratu
- **Chaves estrangeiras:** Toda coluna FK (`veiculo_id`, `motorista_id`, `solicitante_id`)
  deve possuir índice B-tree para garantir `JOINs` rápidos e integridade referencial eficiente.
- **Índices Parciais (Recurso Poderoso do PostgreSQL):**
  Grande parte das operações do Aratu busca apenas veículos ou chamados ativos.
  Um índice parcial indexa apenas o subconjunto relevante, ocupando uma fração da memória:
  ```sql
  -- Indexa apenas veículos que estão aptos para novas viagens
  CREATE INDEX idx_veiculos_disponiveis ON veiculos (id) WHERE status = 'disponivel';

  -- Indexa apenas chamados pendentes do SVO
  CREATE INDEX idx_svo_chamados_abertos ON registros_svo (data_registro) WHERE status = 'pendente';
  ```

### 3. Interpretando o `EXPLAIN` no PostgreSQL
- **Seq Scan:** Varredura sequencial na tabela inteira. Aceitável em tabelas minúsculas;
  alerta vermelho em tabelas volumosas.
- **Index Scan:** Busca na árvore do índice B-tree e leitura das linhas correspondentes na tabela.
- **Index Only Scan:** A consulta é respondida inteiramente pelos dados contidos no índice,
  sem necessidade de tocar na tabela (máxima velocidade).
- **Bitmap Heap Scan / Bitmap Index Scan:** Combinação de índices quando múltiplos filtros são aplicados.
