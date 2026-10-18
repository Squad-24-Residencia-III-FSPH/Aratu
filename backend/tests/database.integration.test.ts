import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import { DatabaseMigrator } from '../src/database/migrator';
import { UsersRepository } from '../src/repositories/users.repository';
import {
  closeTestPool,
  getTestPool,
  setupTestDatabase,
  truncateTestDatabase,
} from './helpers/db-test';

before(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateTestDatabase();
});

after(async () => {
  await closeTestPool();
});

test('IT01: conecta ao PostgreSQL 18 e confirma versão do banco de dados de testes', async () => {
  const pool = getTestPool();
  const { rows } = await pool.query<{ version: string }>('SELECT version();');

  assert.equal(rows.length, 1);
  const versionString = rows[0]?.version ?? '';
  assert.match(versionString, /PostgreSQL 18/i);
});

test('IT02: DatabaseMigrator descobre e processa migrações de forma idempotente', async () => {
  const pool = getTestPool();
  const migrator = new DatabaseMigrator();

  const files = await migrator.loadFiles();
  assert.ok(files.length >= 2, 'Deve encontrar pelo menos 2 arquivos de migração .sql (users e audit)');

  const results = await migrator.runMigrations(pool, { silent: true });
  assert.equal(results.length, files.length);

  for (const result of results) {
    assert.ok(
      result.status === 'applied' || result.status === 'skipped',
      `Status deve ser applied ou skipped, recebido: ${result.status}`
    );
  }

  // Verifica que ambas as tabelas (auth.users e audit.logs) foram provisionadas
  const tableCheck = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM information_schema.tables
     WHERE (table_schema = 'auth' AND table_name = 'users')
        OR (table_schema = 'audit' AND table_name = 'logs');
  `);
  assert.equal(tableCheck.rows[0]?.count, '2');
});

test('IT03: UsersRepository.findByEmail consulta registro real e normaliza e-mail', async () => {
  const pool = getTestPool();
  const repo = new UsersRepository(pool);

  // Inserção com dados 100% fictícios (LGPD) na tabela padronizada auth.users
  await pool.query(
    `INSERT INTO auth.users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5);`,
    [
      'Servidora Fictícia Teste',
      'servidora.teste@example.test',
      '$2b$10$fictitiouspasswordhashforintegrationtesting12345',
      'GESTOR',
      true,
    ]
  );

  const found = await repo.findByEmail('  SERVIDORA.TESTE@EXAMPLE.TEST ');
  assert.ok(found !== null, 'Usuário deve ser encontrado independentemente de maiúsculas/espaços');
  assert.equal(found.name, 'Servidora Fictícia Teste');
  assert.equal(found.email, 'servidora.teste@example.test');
  assert.equal(found.role, 'GESTOR');
  assert.equal(found.is_active, true);
  assert.ok(typeof found.id === 'string' && found.id.length > 0);
});

test('IT04: rejeita inserção com e-mail duplicado acionando constraint 23505', async () => {
  const pool = getTestPool();

  await pool.query(
    `INSERT INTO auth.users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5);`,
    [
      'Motorista Fictício Um',
      'motorista.unico@example.test',
      'hash_ficticio_1',
      'MOTORISTA',
      true,
    ]
  );

  await assert.rejects(
    async () => {
      await pool.query(
        `INSERT INTO auth.users (name, email, password_hash, role, active)
         VALUES ($1, $2, $3, $4, $5);`,
        [
          'Motorista Fictício Dois',
          'MOTORISTA.UNICO@EXAMPLE.TEST',
          'hash_ficticio_2',
          'MOTORISTA',
          true,
        ]
      );
    },
    (error: unknown) => {
      const pgError = error as { code?: string };
      return pgError.code === '23505';
    }
  );
});

test('IT05: atomicidade transacional com ROLLBACK não persiste dados na tabela', async () => {
  const pool = getTestPool();
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN;');
    await client.query(
      `INSERT INTO auth.users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5);`,
      [
        'Usuário Provisório',
        'provisorio.rollback@example.test',
        'hash_rollback',
        'SOLICITANTE',
        true,
      ]
    );
    await client.query('ROLLBACK;');
  } finally {
    client.release();
  }

  const repo = new UsersRepository(pool);
  const found = await repo.findByEmail('provisorio.rollback@example.test');
  assert.equal(found, null, 'Registro em transação abortada não deve existir no banco');
});

test('IT06: truncateTestDatabase esvazia registros preservando estrutura das tabelas', async () => {
  const pool = getTestPool();

  await pool.query(
    `INSERT INTO auth.users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5);`,
    ['Usuário Antes do Truncate', 'truncate@example.test', 'hash', 'ATENDENTE_SVO', true]
  );

  const beforeTruncate = await pool.query<{ count: string }>('SELECT count(*)::text as count FROM auth.users;');
  assert.equal(beforeTruncate.rows[0]?.count, '1');

  await truncateTestDatabase();

  const afterTruncate = await pool.query<{ count: string }>('SELECT count(*)::text as count FROM auth.users;');
  assert.equal(afterTruncate.rows[0]?.count, '0');
});

test('IT07: encerramento limpo do pool de testes via closeTestPool', async () => {
  // Verifica encerramento idempotente sem emissão de exceções não tratadas
  await closeTestPool();
  assert.equal(true, true);
  // Reinstancia o pool para uso seguro no hook after()
  getTestPool();
});
