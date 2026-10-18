import dotenv from 'dotenv';
import path from 'node:path';
import { Pool } from 'pg';
import { DatabaseMigrator } from '../../src/database/migrator';

// Carrega variáveis do arquivo .env a partir da raiz do repositório
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let testPool: Pool | null = null;

/**
 * Retorna a URL de conexão oficial do banco de dados de testes no PostgreSQL 18.
 *
 * Prioriza a variável `DATABASE_URL_TEST`. Caso não configurada, deriva a partir
 * de `DATABASE_URL` substituindo o nome do banco pelo valor de `POSTGRES_DB_TEST`
 * (padrão: `aratu_test`). No Windows, normaliza `localhost` para `127.0.0.1` para
 * evitar timeouts de resolução IPv6 com o Docker Desktop.
 *
 * @returns Connection string completa para o PostgreSQL 18 de testes.
 */
export function getTestDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST && process.env.DATABASE_URL_TEST.trim().length > 0) {
    return process.env.DATABASE_URL_TEST.trim();
  }

  const testDbName = process.env.POSTGRES_DB_TEST?.trim() || 'aratu_test';
  const baseUrl = process.env.DATABASE_URL?.trim();

  if (baseUrl && baseUrl.length > 0) {
    try {
      const parsed = new URL(baseUrl);
      parsed.pathname = `/${testDbName}`;
      if (parsed.hostname === 'localhost' && process.platform === 'win32') {
        parsed.hostname = '127.0.0.1';
      }
      return parsed.toString();
    } catch {
      // Prossegue se baseUrl não for uma URL no formato padrão
    }
  }

  throw new Error(
    'DATABASE_URL ou DATABASE_URL_TEST é obrigatória no ambiente para conectar ao PostgreSQL de testes.'
  );
}

/**
 * Obtém a instância singleton do Pool de conexões conectado ao banco de testes.
 *
 * @returns Instância ativa do Pool do pg para o banco aratu_test.
 */
export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 10_000,
    });
  }
  return testPool;
}

/**
 * Encerra com segurança o pool de testes liberando todos os sockets e clientes ativos.
 */
export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

/**
 * Provisiona o banco de dados de testes caso ainda não exista e aplica todas as migrações SQL.
 *
 * Conecta inicialmente ao banco de manutenção padrão (`postgres`), verifica se a base
 * de testes já foi criada (executando `CREATE DATABASE` seguro se necessário) e
 * aciona o `DatabaseMigrator` para executar as migrações pendentes.
 *
 * @throws {Error} Se o nome do banco contiver caracteres não permitidos ou se a conexão falhar.
 */
export async function setupTestDatabase(): Promise<void> {
  const testUrl = new URL(getTestDatabaseUrl());
  const testDbName = testUrl.pathname.replace(/^\//, '') || 'aratu_test';

  if (!/^[a-zA-Z0-9_]+$/.test(testDbName)) {
    throw new Error(`Nome de banco de testes inválido: "${testDbName}".`);
  }

  // 1. Conectar ao banco administrativo 'postgres' para verificar ou criar aratu_test
  const adminUrl = new URL(testUrl.toString());
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 5_000,
  });

  try {
    const checkRes = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1;',
      [testDbName]
    );

    if (checkRes.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${testDbName}";`);
    }
  } finally {
    await adminPool.end();
  }

  // 2. Conectar ao banco de testes e aplicar as migrações pendentes
  const pool = getTestPool();
  const migrator = new DatabaseMigrator();
  await migrator.runMigrations(pool, { silent: true });
}

/**
 * Esvazia os registros de todas as tabelas de domínio via TRUNCATE CASCADE preservando schemas.
 *
 * Consulta dinamicamente o information_schema para truncar com reinício de sequências de identidade,
 * excluindo tabelas de controle de migração (schema_migrations) para manter a idempotência.
 */
export async function truncateTestDatabase(): Promise<void> {
  const pool = getTestPool();
  const { rows } = await pool.query<{ tname: string }>(`
    SELECT quote_ident(table_schema) || '.' || quote_ident(table_name) AS tname
      FROM information_schema.tables
     WHERE table_schema IN ('public', 'auth', 'audit', 'fleet', 'trip', 'svo')
       AND table_type = 'BASE TABLE'
       AND table_name NOT IN ('schema_migrations');
  `);

  if (rows.length > 0) {
    const tableList = rows.map((row) => row.tname).join(', ');
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
  }
}

// Execução direta via CLI para provisionamento avulso (npm run test:db:setup)
if (
  process.argv[1] &&
  (process.argv[1].endsWith('db-test.ts') || process.argv[1].endsWith('db-test.js'))
) {
  void setupTestDatabase()
    .then(async () => {
      process.stdout.write('Banco de dados de testes provisionado com sucesso.\n');
      await closeTestPool();
    })
    .catch(async (error: unknown) => {
      process.stderr.write(`Falha ao provisionar banco de testes: ${String(error)}\n`);
      await closeTestPool();
      process.exit(1);
    });
}
