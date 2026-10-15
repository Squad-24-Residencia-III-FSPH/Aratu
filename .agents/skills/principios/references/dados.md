# Dados — modelagem e PostgreSQL 18

Material de consulta dos princípios 3 (compatibilidade) e 4 (idempotência e
atomicidade) da skill `principios`. Leia quando a tarefa criar ou alterar
tabela, coluna, índice ou migration, escrever consulta que **lê, decide e
grava**, ou implementar rotinas de alocação e processamento em lote no sistema Aratu.

A primeira parte reúne as diretrizes fundamentais de modelagem relacional.
A segunda é específica do **PostgreSQL 18** no ecossistema do Aratu.

---

## Antes de criar tabela ou coluna

1. **Escreva a frase da linha.** "Uma linha desta tabela registra que o veículo V
   foi alocado para a viagem X com o motorista M no período de A até B." Se não sai
   uma frase clara, a tabela mistura dois grãos distintos. Um significado por tabela
   (Date 9.6; Kimball p.39).
2. **Uma informação, um lugar.** Evite flags paralelas que possam se contradizer
   (ex: `em_viagem` e `disponivel` simultâneos). O estado do ciclo de vida deve ser
   expresso em **uma** coluna de status com valores controlados via enum ou constraint `CHECK`.
3. **Tipo é regra de negócio.** Quilometragem, placa de veículo, CPF, CNH e status
   não são simples strings ou inteiros genéricos: são tipos de domínio. Use constraints
   declarativas no banco e types/enums no TypeScript.
4. **Histórico e auditoria:**
   - Datas de eventos operacionais reais (saída da viatura, despacho do SVO, conclusão)
     são dados de domínio; não confunda com `created_at` (carimbo de inserção técnica).
   - O que muda com o tempo (status da viagem, hodômetro do veículo) exige registro histórico
     ou tabela de eventos/intercorrências quando houver necessidade de rastreabilidade.

---

## Tratamento de Nulos

- **O nulo não diz por que falta.** Se uma coluna é anulável, o motivo deve ser único
  (ex: `data_retorno` é nula enquanto a viagem está em andamento). Se puder faltar
  por motivos diferentes, separe em campos explícitos ou status de domínio.
- **Medida numérica não informada é nula, não zero.** Zero distorce médias de
  consumo de combustível e contagens de quilometragem.
- **Armadilhas do nulo no SQL:**
  - `col <> 'ativo'` descarta as linhas onde `col` é nula;
  - `UNIQUE` no PostgreSQL permite múltiplos nulos (salvo com `UNIQUE NULLS NOT DISTINCT` a partir do PG 15);
  - Funções de agregação como `SUM()` e `AVG()` ignoram nulos.

---

## Concorrência: Ler, Decidir, Gravar

**O risco clássico no Aratu:** duas requisições simultâneas tentam alocar a mesma viatura
ou o mesmo motorista para o mesmo horário. Um `SELECT` confere que o veículo está
"disponível", o serviço aprova ambos e grava dois registros conflitantes.

No PostgreSQL, previna nesta ordem:

1. **Transação com trava explícita (`SELECT ... FOR UPDATE`):**
   Ao avaliar a disponibilidade de um veículo ou motorista dentro de uma transação no `pg`:
   ```sql
   BEGIN;
   SELECT id, status FROM veiculos WHERE id = $1 FOR UPDATE;
   -- Valida se o status é 'disponivel' e se não há viagens sobrepostas
   INSERT INTO viagens (veiculo_id, ...) VALUES ($1, ...);
   UPDATE veiculos SET status = 'em_viagem' WHERE id = $1;
   COMMIT;
   ```
2. **Restrições de chave única ou exclusão (`EXCLUDE`):**
   Quando a regra puder ser garantida declarativamente pelo PostgreSQL (ex: uma mesma placa
   não pode ter duas viagens ativas simultâneas), utilize constraints no banco.
3. **Transação curta e atômica:**
   Nunca coloque chamadas a APIs externas, envio de e-mails ou processamento pesado dentro
   da transação do banco. A transação deve ser aberta, executar os comandos SQL e fazer commit
   no menor tempo possível para evitar retenção de locks.

---

## Aratu — convenções e práticas no PostgreSQL 18

O banco de dados oficial do projeto é o **PostgreSQL 18** (imagem Docker `postgres:18-alpine`).

### 1. Migrações e DDL Transacional
- O PostgreSQL suporta DDL transacional: comandos como `CREATE TABLE`, `ALTER TABLE` e
  `ADD COLUMN` rodam dentro de transações (`BEGIN; ... COMMIT;`). Se uma instrução falhar,
  a migração inteira sofre rollback de forma limpa.

### 2. Nomenclatura Padrão
- **Tabelas:** snake_case no plural (`veiculos`, `motoristas`, `solicitacoes_viagem`, `viagens`, `registros_svo`, `manutencoes`).
- **Chaves Primárias:** `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` ou `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.
- **Chaves Estrangeiras:** `<tabela_singular>_id` (ex: `veiculo_id`, `motorista_id`, `solicitante_id`) com constraint explícita e `ON DELETE RESTRICT` como proteção padrão contra deleções acidentais.
- **Campos Booleanos:** tipo nativo `BOOLEAN DEFAULT true / false` (proibido usar 0/1 ou 1/2 numéricos).
- **Campos Temporais:**
  - `TIMESTAMPTZ` para instantes no tempo com fuso horário (ex: `data_saida`, `data_chegada`, `created_at`, `updated_at`).
  - `DATE` para datas puras de calendário (ex: `validade_cnh`).
- **Colunas Padrão de Auditoria:**
  ```sql
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  deleted_at TIMESTAMPTZ NULL -- Para soft delete quando expressamente requerido
  ```

### 3. Proteção e Sigilo de Dados (LGPD e SVO)
- O Serviço de Verificação de Óbito (SVO) trata dados extremamente delicados (registros
  de falecidos, declarações de óbito, dados de familiares). A gestão de frota trata dados
  de motoristas (CPF, CNH).
- **Proibição absoluta:** É terminantemente proibido inserir dados reais em migrações,
  scripts de seed, testes, fixtures ou commits. Utilize exclusivamente dados fictícios e
  geradores de dados sintéticos.
