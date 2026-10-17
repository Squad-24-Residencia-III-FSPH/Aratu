# Infraestrutura, Banco de Dados e Segurança Operacional — Sistema Aratu

Este documento concentra as diretrizes operacionais de banco de dados (**PostgreSQL 18**), concorrência, containers Docker e segurança da informação (LGPD e sigilo do SVO) do **Sistema Aratu**.

---

## 1. Governança de Banco de Dados (PostgreSQL 18)

O banco oficial do projeto é o **PostgreSQL 18** (`postgres:18-alpine`).

### 1.1 Convenções de Modelagem e Nomenclatura

- **Tabelas:** nomes em `snake_case` no plural (`veiculos`, `motoristas`, `solicitacoes_viagem`, `viagens`, `registros_svo`, `manutencoes`).
- **Um significado por tabela:** cada tabela deve representar um único grão claro no domínio (ex: uma solicitação de viagem versus a execução da viagem alocada).
- **Chaves Primárias (PK):**
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` ou
  - `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.
- **Chaves Estrangeiras (FK):**
  - Formato `<tabela_singular>_id` (ex: `veiculo_id`, `motorista_id`, `solicitante_id`).
  - **Restrição de integridade padrão:** utilizar sempre `ON DELETE RESTRICT` para impedir deleções acidentais de registros históricos.
  - É proibido utilizar `ON DELETE CASCADE` ou `ON UPDATE CASCADE` sem justificativa técnica aprovada.
- **Estados e Ciclo de Vida:**
  - Uma informação mora em um só lugar: evite flags booleanas paralelas que possam entrar em contradição (ex: `disponivel` e `em_viagem` ao mesmo tempo). Utilize uma única coluna `status` validada por `CHECK` ou `ENUM`.
- **Campos Booleanos:** tipo nativo `BOOLEAN NOT NULL DEFAULT false` (proibido usar inteiros `0/1` ou strings `'S'/'N'`).
- **Campos Temporais:**
  - `TIMESTAMPTZ` para eventos com data, hora e fuso (ex: `data_saida`, `data_retorno`, `data_acionamento_svo`).
  - `DATE` para datas puras de calendário (ex: `validade_cnh`).
- **Colunas Padrão de Auditoria:**
  ```sql
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  deleted_at TIMESTAMPTZ NULL -- Apenas quando soft delete for requisito explícito
  ```

### 1.2 Migrações e Operações Críticas

- **DDL Transacional:** toda migration no PostgreSQL 18 deve rodar dentro de `BEGIN; ... COMMIT;` para garantir atomicidade.
- Configure as credenciais locais em `.env` usando `.env.example` como referência. `docker-compose.yml` lê `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `POSTGRES_PORT`; a API executada no host usa `DATABASE_URL` apontando para `localhost`, enquanto o Compose injeta a URL com host interno `db`.
- O backend pode ser iniciado diretamente no host com `npm --prefix backend run dev` depois de instalar as dependências; `JWT_SECRET` deve ser exclusivo do ambiente e `JWT_EXPIRES_IN` usa `8h` como padrão.
- A migration inicial de usuários pode ser aplicada na raiz do repositório após iniciar o container do banco:
  ```bash
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backend/src/database/migrations/202610160001_create_users.sql
  ```
  Para reverter essa migration:
  ```bash
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backend/src/database/migrations/202610160001_create_users.down.sql
  ```
- Antes de aplicar qualquer alteração estrutural (`ALTER`, `DROP`) ou atualização em massa:
  1. Avalie o volume de registros afetados e as dependências entre tabelas;
  2. Documente o objetivo, as tabelas/colunas impactadas e o **script de rollback**;
  3. Verifique a compatibilidade com os dados já gravados (nunca assuma que uma regra nova vale apenas dali para frente sem tratar o passivo).

---

## 2. Performance de Consultas e Indexação

- **Proibido usar `SELECT *`:** liste explicitamente todas as colunas esperadas nas queries SQL.
- **Queries Sargáveis (que aproveitam índices):** nunca aplique funções sobre a coluna filtrada no `WHERE`:
  - **Errado:** `WHERE DATE(data_saida) = '2026-10-15'`
  - **Correto:** `WHERE data_saida >= '2026-10-15T00:00:00Z' AND data_saida < '2026-10-16T00:00:00Z'`
- **Índices obrigatórios e parciais:**
  - Toda coluna de chave estrangeira (`veiculo_id`, `motorista_id`, `solicitante_id`) deve possuir índice B-tree.
  - Utilize **índices parciais** para subconjuntos operacionais frequentemente consultados:
    ```sql
    CREATE INDEX idx_veiculos_disponiveis ON veiculos (id) WHERE status = 'disponivel';
    CREATE INDEX idx_svo_chamados_pendentes ON registros_svo (data_registro) WHERE status = 'pendente';
    ```
- **Paginação eficiente:** em tabelas volumosas de histórico, prefira *Keyset Pagination* (`WHERE (data_solicitacao, id) < ($1, $2) ORDER BY data_solicitacao DESC, id DESC LIMIT 20`) em vez de `OFFSET` elevado.
- **Medição real:** antes e depois de otimizar uma query, meça com `EXPLAIN (ANALYZE, BUFFERS)`.

---

## 3. Concorrência e Atomicidade

Operações que leem um estado, tomam uma decisão e gravam no banco (ex: alocar uma viatura ou motorista para uma viagem ou chamado do SVO) estão sujeitas a condições de corrida (*race conditions*).

- **Padrão obrigatório:** execute a leitura e a gravação dentro de uma mesma transação com trava explícita (`SELECT ... FOR UPDATE`):
  ```sql
  BEGIN;
  SELECT id, status FROM veiculos WHERE id = $1 FOR UPDATE;
  -- Valida no Service se status === 'disponivel'
  INSERT INTO viagens (veiculo_id, motorista_id, status, ...) VALUES ($1, $2, 'agendada', ...);
  UPDATE veiculos SET status = 'em_viagem', updated_at = clock_timestamp() WHERE id = $1;
  COMMIT;
  ```
- **Transações curtas:** nunca execute chamadas HTTP externas, geração pesada de arquivos ou envio de notificações dentro de uma transação aberta no PostgreSQL.

---

## 4. Segurança Operacional, LGPD e Sigilo do SVO

- **Zero segredos versionados:** senhas de banco, chaves de token JWT e credenciais externas devem ser injetadas exclusivamente via variáveis de ambiente (`.env` ignorado no Git). Use placeholders em exemplos de documentação.
- Para execução local, copie `.env.example` para `.env` e substitua os placeholders de `POSTGRES_PASSWORD`, `DATABASE_URL` e `JWT_SECRET` por valores correspondentes/exclusivos (por exemplo, gere valores hexadecimais com `openssl rand -hex 32`). `JWT_EXPIRES_IN` aceita segundos (`s`), minutos (`m`), horas (`h`) ou dias (`d`); o padrão é `8h`.
- Em produção, sirva a API somente por HTTPS: bcrypt protege as senhas armazenadas, mas não cifra o tráfego entre o cliente e o servidor.
- **Sigilo de Dados Sensíveis (LGPD / SVO / FSPH):**
  - O SVO lida com informações de óbito, identificação de falecidos, laudos e dados de familiares.
  - A gestão de frota lida com CPF, matrícula e CNH de servidores e motoristas.
  - **Regra absoluta:** nunca utilize dados reais em ambientes de desenvolvimento, seeds, testes, logs ou dumps compartilhados sem autorização formal e anonimização completa.
