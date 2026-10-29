import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool, PoolClient } from 'pg'
import { DatabaseMigrator } from '../src/database/migrator'
import { seedInitialAdmin, seedInitialFleet, seedRolesAndPermissions } from '../src/database/scripts/seed'
import { RolesRepository } from '../src/repositories/roles.repository'
import { UsersRepository } from '../src/repositories/users.repository'
import {
  closeTestPool,
  getTestPool,
  setupTestDatabase,
  truncateTestDatabase,
} from './helpers/db-test'

const ADMIN_CONFIG = {
  email: 'admin@example.test',
  password: 'senha-ficticia-para-seed',
  name: 'Administradora Fictícia',
}

async function getRoleId(pool: Pool, roleName: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id::text AS id
     FROM auth.roles
     WHERE name = $1`,
    [roleName],
  )
  const role = rows[0]
  if (!role) throw new Error(`Perfil de teste ${roleName} não encontrado.`)
  return role.id
}

before(async () => {
  await setupTestDatabase()
})

beforeEach(async () => {
  const pool = getTestPool()
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
})

after(async () => {
  await closeTestPool()
})

test('IT01: conecta ao PostgreSQL 18 e confirma a versão do banco de testes', async () => {
  const pool = getTestPool()
  const { rows } = await pool.query<{ version: string }>('SELECT version()')

  assert.equal(rows.length, 1)
  assert.match(rows[0]?.version ?? '', /PostgreSQL 18/i)
})

test('IT02: aplica as migrações RBAC e cria tabelas e colunas esperadas', async () => {
  const pool = getTestPool()
  const migrator = new DatabaseMigrator()
  const files = await migrator.loadFiles()
  const results = await migrator.runMigrations(pool, { silent: true })

  assert.equal(results.length, files.length)
  assert.ok(results.every((result) => result.status === 'applied' || result.status === 'skipped'))

  const { rows } = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE (table_schema = 'auth' AND table_name IN ('users', 'roles', 'permissions', 'role_permissions'))
       OR (table_schema = 'audit' AND table_name = 'logs')
  `)
  assert.equal(rows[0]?.count, '5')

  const columns = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.columns
    WHERE table_schema = 'auth'
      AND table_name = 'users'
      AND column_name IN ('role_id', 'updated_at')
  `)
  assert.equal(columns.rows[0]?.count, '2')
})

test('IT03: seed RBAC é idempotente e aplica as permissões iniciais', async () => {
  const pool = getTestPool()

  await seedRolesAndPermissions(pool)
  const firstAdminSeed = await seedInitialAdmin(pool, ADMIN_CONFIG)
  await seedRolesAndPermissions(pool)
  const secondAdminSeed = await seedInitialAdmin(pool, ADMIN_CONFIG)

  const counts = await pool.query<{ roles: string; permissions: string; mappings: string; users: string }>(`
    SELECT
      (SELECT count(*)::text FROM auth.roles) AS roles,
      (SELECT count(*)::text FROM auth.permissions) AS permissions,
      (SELECT count(*)::text FROM auth.role_permissions) AS mappings,
      (SELECT count(*)::text FROM auth.users) AS users
  `)
  assert.equal(firstAdminSeed, true)
  assert.equal(secondAdminSeed, false)
  assert.deepEqual(counts.rows[0], {
    roles: '6',
    permissions: '3',
    mappings: '8',
    users: '1',
  })

  const permissions = await pool.query<{ role: string; permission: string }>(`
    SELECT r.name AS role, p.name AS permission
    FROM auth.role_permissions rp
    JOIN auth.roles r ON r.id = rp.role_id
    JOIN auth.permissions p ON p.id = rp.permission_id
    ORDER BY r.name, p.name
  `)
  const mappingSet = new Set(permissions.rows.map(({ role, permission }) => `${role}:${permission}`))
  assert.ok(mappingSet.has('ADMINISTRADOR:users:manage'))
  assert.ok(mappingSet.has('ADMINISTRADOR:permissions:manage'))
  assert.equal(
    permissions.rows.filter(({ permission }) => permission === 'screens:access').length,
    6,
  )

  const auditLogs = await pool.query<{ operation: string; reason: string; table: string }>(`
    SELECT operation, reason, table_name AS "table"
    FROM audit.logs
    WHERE reason = 'BOOTSTRAP_INITIAL_ADMIN'
  `)
  assert.equal(auditLogs.rows.length, 1)
  assert.equal(auditLogs.rows[0]?.operation, 'INSERT')
  assert.equal(auditLogs.rows[0]?.table, 'auth.users')
})

test('IT04: RolesRepository lista perfis e recupera permissões por perfil', async () => {
  const pool = getTestPool()
  const repository = new RolesRepository(pool)
  const roles = await repository.findAll()
  const administrator = await repository.findByName('ADMINISTRADOR')

  assert.equal(roles.length, 6)
  assert.ok(administrator)
  if (!administrator) return

  const permissions = await repository.findPermissionsByRoleId(administrator.id)
  assert.deepEqual(permissions.map((permission) => permission.name), [
    'permissions:manage',
    'screens:access',
    'users:manage',
  ])
})

test('IT05: UsersRepository encontra usuário por e-mail sem perder o perfil', async () => {
  const pool = getTestPool()
  const repository = new UsersRepository(pool)
  const roleId = await getRoleId(pool, 'GESTOR')

  await repository.create({
    name: 'Servidora Fictícia Teste',
    email: 'servidora.teste@example.test',
    passwordHash: 'hash-ficticio-para-teste',
    roleId,
  })
  const found = await repository.findByEmail('  SERVIDORA.TESTE@EXAMPLE.TEST ')

  assert.ok(found)
  assert.equal(found?.role, 'GESTOR')
  assert.equal(found?.roleId, roleId)
  assert.equal(found?.is_active, true)
})

test('IT06: findById retorna somente a projeção pública de usuário', async () => {
  const pool = getTestPool()
  const repository = new UsersRepository(pool)
  const roleId = await getRoleId(pool, 'MOTORISTA')
  const created = await repository.create({
    name: 'Motorista Fictício',
    email: 'motorista@example.test',
    passwordHash: 'hash-ficticio',
    roleId,
  })
  const found = await repository.findById(created.id)

  assert.ok(found)
  assert.equal(found?.role, 'MOTORISTA')
  assert.equal('passwordHash' in (found ?? {}), false)
  assert.equal('password_hash' in (found ?? {}), false)
})

test('IT07: list filtra por perfil, status e termo sem expor hashes', async () => {
  const pool = getTestPool()
  const repository = new UsersRepository(pool)
  const driverRoleId = await getRoleId(pool, 'MOTORISTA')
  const managerRoleId = await getRoleId(pool, 'GESTOR')

  await repository.create({ name: 'Ana Silva', email: 'ana.silva@example.test', passwordHash: 'hash-a', roleId: driverRoleId })
  await repository.create({ name: 'Bruno Silva', email: 'bruno.silva@example.test', passwordHash: 'hash-b', roleId: driverRoleId })
  await repository.create({ name: 'Carla Silva', email: 'carla.silva@example.test', passwordHash: 'hash-c', roleId: managerRoleId, active: false })

  const result = await repository.list({ role: 'MOTORISTA', active: true, search: 'silva', page: 1, pageSize: 1 })

  assert.equal(result.total, 2)
  assert.equal(result.users.length, 1)
  assert.equal(result.totalPages, 2)
  assert.equal('passwordHash' in result.users[0]!, false)
})

test('IT08: create normaliza e-mail e respeita a unicidade case-insensitive', async () => {
  const pool = getTestPool()
  const repository = new UsersRepository(pool)
  const roleId = await getRoleId(pool, 'SOLICITANTE')

  const created = await repository.create({
    name: 'Solicitante Fictícia',
    email: '  SOLICITANTE@EXAMPLE.TEST ',
    passwordHash: 'hash-ficticio',
    roleId,
  })
  assert.equal(created.email, 'solicitante@example.test')

  await assert.rejects(
    repository.create({
      name: 'Solicitante Duplicada',
      email: 'solicitante@example.test',
      passwordHash: 'hash-ficticio',
      roleId,
    }),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )
})

test('IT09: update altera somente os campos informados e incrementa a revisão', async () => {
  const pool = getTestPool()
  const repository = new UsersRepository(pool)
  const roleId = await getRoleId(pool, 'ATENDENTE_SVO')
  const created = await repository.create({
    name: 'Atendente Fictícia',
    email: 'atendente@example.test',
    passwordHash: 'hash-ficticio',
    roleId,
  })

  const updated = await repository.update(created.id, {
    name: 'Atendente Atualizada',
    expectedRevision: created.revision,
  })

  assert.equal(updated.kind, 'updated')
  if (updated.kind !== 'updated') throw new Error('A atualização deveria ter sido aceita.')
  assert.equal(updated.user.name, 'Atendente Atualizada')
  assert.equal(updated.user.revision, 2)
  assert.ok(updated.user.updatedAt.getTime() >= created.createdAt.getTime())

  const conflict = await repository.update(created.id, {
    name: 'Atendente Desatualizada',
    expectedRevision: created.revision,
  })
  assert.equal(conflict.kind, 'revision-conflict')
})

test('IT10: transação revertida não persiste usuário', async () => {
  const pool = getTestPool()
  const roleId = await getRoleId(pool, 'SOLICITANTE')
  const client: PoolClient = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO auth.users (name, email, password_hash, role_id, active)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Usuário Provisório', 'provisorio.rollback@example.test', 'hash-ficticio', roleId, true],
    )
    await client.query('ROLLBACK')
  } finally {
    client.release()
  }

  const repository = new UsersRepository(pool)
  assert.equal(await repository.findByEmail('provisorio.rollback@example.test'), null)
})

test('IT11: rollback restaura as invariantes da coluna role legada', async () => {
  const pool = getTestPool()
  const rollbackPath = path.resolve(
    __dirname,
    '../src/database/migrations/202610180001_create_roles_permissions_and_update_users.down.sql',
  )
  const rollbackSql = await fs.readFile(rollbackPath, 'utf8')

  await pool.query(rollbackSql)
  await pool.query(`DELETE FROM schema_migrations WHERE version = '202610180001'`)

  try {
    const column = await pool.query<{ isNullable: string }>(`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'role'
    `)
    const constraint = await pool.query<{ definition: string }>(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint AS c
      JOIN pg_class AS relation ON relation.oid = c.conrelid
      JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
      WHERE schema.nspname = 'auth'
        AND relation.relname = 'users'
        AND c.conname = 'auth_users_role_check'
    `)

    assert.equal(column.rows[0]?.isNullable, 'NO')
    assert.match(constraint.rows[0]?.definition ?? '', /ADMINISTRADOR/)
  } finally {
    const migrator = new DatabaseMigrator()
    await migrator.runMigrations(pool, { silent: true })
  }
})

test('IT12: evolução de fleet.vehicles e unicidade case-insensitive da placa (FROTA-42)', async () => {
  const pool = getTestPool()

  const inserted = await pool.query<{
    id: string
    brand: string | null
    model: string | null
    year: number | null
    vehicleType: string | null
    ownership: string
  }>(
    `INSERT INTO fleet.vehicles (
       license_plate, brand, model, year, vehicle_type, categories, seats, body_limit, operation_type
     )
     VALUES ($1, $2, $3, $4, $5, ARRAY['BODY']::TEXT[], 2, 2, 'SVO')
     RETURNING id::text AS id, brand, model, year, vehicle_type AS "vehicleType", ownership`,
    ['ABC1D23', 'Chevrolet', 'S10', 2024, 'PICKUP_SVO'],
  )

  assert.equal(inserted.rows[0]?.brand, 'Chevrolet')
  assert.equal(inserted.rows[0]?.model, 'S10')
  assert.equal(inserted.rows[0]?.year, 2024)
  assert.equal(inserted.rows[0]?.vehicleType, 'PICKUP_SVO')
  assert.equal(inserted.rows[0]?.ownership, 'OWNED')

  await assert.rejects(
    pool.query(
      `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type)
       VALUES ($1, ARRAY['PASSENGER']::TEXT[], 4, 0, 'ADMINISTRATIVE')`,
      ['abc1d23'],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO fleet.vehicles (license_plate, year, categories, seats, body_limit, operation_type)
       VALUES ($1, 1950, ARRAY['PASSENGER']::TEXT[], 4, 0, 'ADMINISTRATIVE')`,
      ['XYZ9A88'],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )
})

test('IT13: tabela fleet.drivers e fleet.driver_events append-only (FROTA-48)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const driverRoleId = await getRoleId(pool, 'MOTORISTA')

  const user = await usersRepository.create({
    name: 'Condutora Autenticada Fictícia',
    email: 'condutora.ficticia@example.test',
    passwordHash: 'hash-ficticio',
    roleId: driverRoleId,
  })

  const firstDriver = await pool.query<{ id: string; status: string; revision: number }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at, phone, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id::text AS id, status, revision`,
    ['Maria Condutora Teste', '11122233344', '99887766554', 'D', '2028-12-31', '79999990000'],
  )
  assert.equal(firstDriver.rows[0]?.status, 'ACTIVE')
  assert.equal(firstDriver.rows[0]?.revision, 1)

  const secondDriver = await pool.query<{ id: string }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at, user_id)
     VALUES ($1, $2, $3, $4, $5, NULL)
     RETURNING id::text AS id`,
    ['João Condutor Teste', '55566677788', '11223344556', 'B', '2029-06-30'],
  )
  assert.ok(secondDriver.rows[0]?.id)

  await assert.rejects(
    pool.query(
      `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Duplicado CPF', '11122233344', '00001111222', 'B', '2028-12-31'],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await pool.query(`UPDATE fleet.drivers SET user_id = $1 WHERE id = $2`, [user.id, firstDriver.rows[0]!.id])
  await assert.rejects(
    pool.query(`UPDATE fleet.drivers SET user_id = $1 WHERE id = $2`, [user.id, secondDriver.rows[0]!.id]),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  const eventInsert = await pool.query<{ id: string }>(
    `INSERT INTO fleet.driver_events (
       driver_id, event_type, reported_by, registered_by, actor_snapshot, reason, before_state, after_state
     )
     VALUES ($1, 'CREATED', 'RH Fictício', $2, $3::jsonb, 'Admissão inicial', NULL, $4::jsonb)
     RETURNING id::text AS id`,
    [
      firstDriver.rows[0]!.id,
      user.id,
      JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }),
      JSON.stringify({ id: firstDriver.rows[0]!.id, status: 'ACTIVE' }),
    ],
  )
  const eventId = eventInsert.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE fleet.driver_events SET reason = 'Alteração proibida' WHERE id = $1`, [eventId]),
    /fleet\.driver_events is append-only/i,
  )
  await assert.rejects(
    pool.query(`DELETE FROM fleet.driver_events WHERE id = $1`, [eventId]),
    /fleet\.driver_events is append-only/i,
  )
})

test('IT14: tabelas fleet.services e fleet.vehicle_services (FROTA-165)', async () => {
  const pool = getTestPool()

  const vehicleRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type)
     VALUES ('VTR1A01', ARRAY['PASSENGER']::TEXT[], 4, 0, 'ADMINISTRATIVE')
     RETURNING id::text AS id`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const serviceRes = await pool.query<{ id: string; active: boolean; revision: number }>(
    `INSERT INTO fleet.services (name, description, categories, requires_triage)
     VALUES ('Transporte de Pacientes', 'Deslocamento assistencial', ARRAY['PASSENGER']::TEXT[], true)
     RETURNING id::text AS id, active, revision`,
  )
  const serviceId = serviceRes.rows[0]!.id
  assert.equal(serviceRes.rows[0]?.active, true)
  assert.equal(serviceRes.rows[0]?.revision, 1)

  await assert.rejects(
    pool.query(
      `INSERT INTO fleet.services (name, categories)
       VALUES ('  transporte de pacientes ', ARRAY['PASSENGER']::TEXT[])`,
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await pool.query(
    `INSERT INTO fleet.vehicle_services (vehicle_id, service_id) VALUES ($1, $2)`,
    [vehicleId, serviceId],
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO fleet.vehicle_services (vehicle_id, service_id) VALUES ($1, $2)`,
      [vehicleId, serviceId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await assert.rejects(
    pool.query(`DELETE FROM fleet.vehicles WHERE id = $1`, [vehicleId]),
    (error: unknown) => ['23001', '23503'].includes((error as { code?: string }).code ?? ''),
  )
})

test('IT15: seed inicial da frota (seedInitialFleet) é idempotente', async () => {
  const pool = getTestPool()

  await seedInitialAdmin(pool, ADMIN_CONFIG)
  await seedInitialFleet(pool, ADMIN_CONFIG.email)
  await seedInitialFleet(pool, ADMIN_CONFIG.email)

  const counts = await pool.query<{
    vehicles: string
    events: string
    services: string
    links: string
  }>(`
    SELECT
      (SELECT count(*)::text FROM fleet.vehicles) AS vehicles,
      (SELECT count(*)::text FROM fleet.vehicle_events WHERE reason = 'BOOTSTRAP_INITIAL_FLEET') AS events,
      (SELECT count(*)::text FROM fleet.services) AS services,
      (SELECT count(*)::text FROM fleet.vehicle_services) AS links
  `)

  assert.deepEqual(counts.rows[0], {
    vehicles: '3',
    events: '3',
    services: '3',
    links: '3',
  })
})

test('IT16: rollbacks (.down.sql) das 3 novas migrations do schema fleet restauram o estado e permitem reaplicar', async () => {
  const pool = getTestPool()
  const downFiles = [
    '202610280003_create_services.down.sql',
    '202610280002_create_drivers.down.sql',
    '202610280001_alter_vehicles_add_details.down.sql',
  ]

  try {
    for (const fileName of downFiles) {
      const sql = await fs.readFile(
        path.resolve(__dirname, '../src/database/migrations', fileName),
        'utf8',
      )
      await pool.query(sql)
      const version = fileName.slice(0, 12)
      await pool.query(`DELETE FROM schema_migrations WHERE version = $1`, [version])
    }

    const removedTables = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'fleet'
        AND table_name IN ('drivers', 'driver_events', 'services', 'vehicle_services')
    `)
    assert.equal(removedTables.rows[0]?.count, '0')

    const removedColumns = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = 'fleet'
        AND table_name = 'vehicles'
        AND column_name IN ('brand', 'model', 'year', 'vehicle_type', 'ownership')
    `)
    assert.equal(removedColumns.rows[0]?.count, '0')
  } finally {
    const migrator = new DatabaseMigrator()
    await migrator.runMigrations(pool, { silent: true })
  }

  const restoredTables = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'fleet'
      AND table_name IN ('vehicles', 'vehicle_events', 'drivers', 'driver_events', 'services', 'vehicle_services')
  `)
  assert.equal(restoredTables.rows[0]?.count, '6')
})

