import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool, PoolClient } from 'pg'
import { DatabaseMigrator } from '../src/database/migrator'
import {
  seedInitialAdmin,
  seedInitialFleet,
  seedInitialSvoTeam,
  seedRolesAndPermissions,
} from '../src/database/scripts/seed'
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
    '202610280008_create_svo_execution_orders.down.sql',
    '202610280007_create_svo_teams.down.sql',
    '202610280006_create_svo_occurrences.down.sql',
    '202610280005_create_trips.down.sql',
    '202610280004_create_trip_requests.down.sql',
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

test('IT17: criação de trip.requests, exigência de justificativa na rejeição e imutabilidade de trip.request_events (FROTA-77)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const requesterRoleId = await getRoleId(pool, 'SOLICITANTE')
  const managerRoleId = await getRoleId(pool, 'GESTOR')

  const requester = await usersRepository.create({
    name: 'Solicitante FSPH Fictícia',
    email: 'solicitante.viagem@example.test',
    passwordHash: 'hash-ficticio',
    roleId: requesterRoleId,
  })
  const manager = await usersRepository.create({
    name: 'Gestor Frota Fictício',
    email: 'gestor.viagem@example.test',
    passwordHash: 'hash-ficticio',
    roleId: managerRoleId,
  })

  const serviceRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name, description, categories)
     VALUES ('Transporte Institucional de Passageiros', 'Deslocamento entre unidades FSPH', ARRAY['PASSENGER']::TEXT[])
     RETURNING id::text AS id`,
  )
  const serviceId = serviceRes.rows[0]!.id

  const requestRes = await pool.query<{ id: string; status: string; passengers: number; revision: number }>(
    `INSERT INTO trip.requests (
       requester_id, service_id, requested_date, requested_time, origin, destination, purpose, passengers,
       requester_snapshot, service_snapshot
     )
     VALUES ($1, $2, '2026-11-10', '08:30:00', 'Sede FSPH', 'Hemose', 'Reunião técnica laboratorial', 3, $3::jsonb, $4::jsonb)
     RETURNING id::text AS id, status, passengers, revision`,
    [
      requester.id,
      serviceId,
      JSON.stringify({ id: requester.id, name: requester.name, role: requester.role }),
      JSON.stringify({ id: serviceId, name: 'Transporte Institucional de Passageiros' }),
    ],
  )
  const requestId = requestRes.rows[0]!.id
  assert.equal(requestRes.rows[0]?.status, 'PENDING')
  assert.equal(requestRes.rows[0]?.passengers, 3)
  assert.equal(requestRes.rows[0]?.revision, 1)

  await assert.rejects(
    pool.query(
      `UPDATE trip.requests
       SET status = 'REJECTED', decided_by = $1, decided_at = clock_timestamp(), decision_reason = NULL
       WHERE id = $2`,
      [manager.id, requestId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  await assert.rejects(
    pool.query(
      `UPDATE trip.requests
       SET status = 'REJECTED', decided_by = $1, decided_at = clock_timestamp(), decision_reason = '   '
       WHERE id = $2`,
      [manager.id, requestId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  const rejectedRes = await pool.query<{ status: string; decisionReason: string }>(
    `UPDATE trip.requests
     SET status = 'REJECTED',
         decided_by = $1,
         decided_at = clock_timestamp(),
         decision_reason = 'Indisponibilidade de frota no turno solicitado',
         revision = revision + 1
     WHERE id = $2
     RETURNING status, decision_reason AS "decisionReason"`,
    [manager.id, requestId],
  )
  assert.equal(rejectedRes.rows[0]?.status, 'REJECTED')
  assert.equal(rejectedRes.rows[0]?.decisionReason, 'Indisponibilidade de frota no turno solicitado')

  const eventRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.request_events (
       request_id, event_type, reported_by, registered_by, actor_snapshot, reason,
       evidence_description, before_state, after_state
     )
     VALUES ($1, 'REJECTED', 'Gestão de Frota FSPH', $2, $3::jsonb, 'Indisponibilidade de frota no turno solicitado',
             'Análise da escala diária no painel operacional', $4::jsonb, $5::jsonb)
     RETURNING id::text AS id`,
    [
      requestId,
      manager.id,
      JSON.stringify({ id: manager.id, name: manager.name, email: manager.email, role: manager.role }),
      JSON.stringify({ status: 'PENDING' }),
      JSON.stringify({ status: 'REJECTED', decisionReason: 'Indisponibilidade de frota no turno solicitado' }),
    ],
  )
  const eventId = eventRes.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE trip.request_events SET reason = 'Mutação proibida' WHERE id = $1`, [eventId]),
    /trip\.request_events is append-only/i,
  )
  await assert.rejects(
    pool.query(`DELETE FROM trip.request_events WHERE id = $1`, [eventId]),
    /trip\.request_events is append-only/i,
  )
})

test('IT18: criação de trip.trips, bloqueio de período invertido, km regressivo e duplicidade de viagem IN_PROGRESS (FROTA-93)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const requesterRoleId = await getRoleId(pool, 'SOLICITANTE')

  const requester = await usersRepository.create({
    name: 'Solicitante Agendamento Fictício',
    email: 'solicitante.agenda@example.test',
    passwordHash: 'hash-ficticio',
    roleId: requesterRoleId,
  })

  const serviceRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name, categories)
     VALUES ('Coleta de Amostras Lacen', ARRAY['OTHER']::TEXT[])
     RETURNING id::text AS id`,
  )
  const serviceId = serviceRes.rows[0]!.id

  const vehicleRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type)
     VALUES ('VTR2B01', ARRAY['PASSENGER', 'OTHER']::TEXT[], 5, 0, 'ADMINISTRATIVE')
     RETURNING id::text AS id`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const driverRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
     VALUES ('Carlos Condutor Teste', '22233344455', '55443322110', 'B', '2029-10-15')
     RETURNING id::text AS id`,
  )
  const driverId = driverRes.rows[0]!.id

  const req1Res = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, status)
     VALUES ($1, $2, '2026-11-12', '10:00:00', 'Lacen', 'Hospital Regional', 'Transporte de kits', 'APPROVED')
     RETURNING id::text AS id`,
    [requester.id, serviceId],
  )
  const req1Id = req1Res.rows[0]!.id

  const req2Res = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, status)
     VALUES ($1, $2, '2026-11-12', '14:00:00', 'Hemose', 'Sede FSPH', 'Retorno de malote', 'APPROVED')
     RETURNING id::text AS id`,
    [requester.id, serviceId],
  )
  const req2Id = req2Res.rows[0]!.id

  await assert.rejects(
    pool.query(
      `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, '2026-11-12T12:00:00Z', '2026-11-12T10:00:00Z')`,
      [req1Id, vehicleId, driverId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, start_km, end_km)
       VALUES ($1, $2, $3, '2026-11-12T10:00:00Z', '2026-11-12T12:00:00Z', 50000, 49950)`,
      [req1Id, vehicleId, driverId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  const trip1Res = await pool.query<{ id: string; status: string }>(
    `INSERT INTO trip.trips (
       request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status,
       started_at, start_km, vehicle_snapshot, driver_snapshot
     )
     VALUES (
       $1, $2, $3, '2026-11-12T10:00:00Z', '2026-11-12T12:00:00Z', 'IN_PROGRESS',
       '2026-11-12T10:05:00Z', 50000, $4::jsonb, $5::jsonb
     )
     RETURNING id::text AS id, status`,
    [
      req1Id,
      vehicleId,
      driverId,
      JSON.stringify({ id: vehicleId, licensePlate: 'VTR2B01', seats: 5 }),
      JSON.stringify({ id: driverId, name: 'Carlos Condutor Teste', cnhCategory: 'B' }),
    ],
  )
  assert.equal(trip1Res.rows[0]?.status, 'IN_PROGRESS')

  await assert.rejects(
    pool.query(
      `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, '2026-11-12T15:00:00Z', '2026-11-12T16:00:00Z')`,
      [req1Id, vehicleId, driverId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status)
       VALUES ($1, $2, $3, '2026-11-12T14:00:00Z', '2026-11-12T16:00:00Z', 'IN_PROGRESS')`,
      [req2Id, vehicleId, driverId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )
})

test('IT19: preservação histórica bi-temporal, retificação de hodômetro (supersedes_id), parada cancelada sem DELETE e snapshots da época', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const managerRoleId = await getRoleId(pool, 'GESTOR')

  const operatorAna = await usersRepository.create({
    name: 'Ana Operadora Fictícia',
    email: 'ana.operadora@example.test',
    passwordHash: 'hash-ficticio',
    roleId: managerRoleId,
  })
  const anaSnapshot = JSON.stringify({
    id: operatorAna.id,
    name: operatorAna.name,
    email: operatorAna.email,
    role: operatorAna.role,
  })

  const serviceRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name, categories)
     VALUES ('Rota Interunidades FSPH', ARRAY['PASSENGER']::TEXT[])
     RETURNING id::text AS id`,
  )
  const serviceId = serviceRes.rows[0]!.id

  const vehicleRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type)
     VALUES ('VTR3C16', ARRAY['PASSENGER']::TEXT[], 16, 0, 'ADMINISTRATIVE')
     RETURNING id::text AS id`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const driverRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
     VALUES ('João Condutor Fictício', '33344455566', '66554433221', 'D', '2030-05-20')
     RETURNING id::text AS id`,
  )
  const driverId = driverRes.rows[0]!.id

  const reqRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, status)
     VALUES ($1, $2, '2026-11-15', '07:00:00', 'Sede FSPH', 'Hemose / Lacen', 'Transporte de equipe técnica', 'SCHEDULED')
     RETURNING id::text AS id`,
    [operatorAna.id, serviceId],
  )
  const requestId = reqRes.rows[0]!.id

  const tripRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.trips (
       request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status,
       vehicle_snapshot, driver_snapshot
     )
     VALUES (
       $1, $2, $3, '2026-11-15T07:00:00Z', '2026-11-15T11:00:00Z', 'IN_PROGRESS',
       $4::jsonb, $5::jsonb
     )
     RETURNING id::text AS id`,
    [
      requestId,
      vehicleId,
      driverId,
      JSON.stringify({ id: vehicleId, licensePlate: 'VTR3C16', seats: 16 }),
      JSON.stringify({ id: driverId, name: 'João Condutor Fictício', cnhCategory: 'D' }),
    ],
  )
  const tripId = tripRes.rows[0]!.id

  // 1. Leitura de hodômetro inicial informada por telefone (52.000 km) e retificada após foto do painel (51.200 km)
  const reading1Res = await pool.query<{ id: string; odometerKm: number }>(
    `INSERT INTO trip.odometer_readings (
       vehicle_id, trip_id, reading_type, odometer_km, occurred_at, reported_by,
       registered_by, actor_snapshot, reason, evidence_description
     )
     VALUES (
       $1, $2, 'END', 52000, '2026-11-15T10:40:00Z', 'Condutor João Fictício via telefone',
       $3, $4::jsonb, 'Encerramento informado por ligação', 'Relato verbal por telefone'
     )
     RETURNING id::text AS id, odometer_km AS "odometerKm"`,
    [vehicleId, tripId, operatorAna.id, anaSnapshot],
  )
  const reading1Id = reading1Res.rows[0]!.id

  const reading2Res = await pool.query<{ id: string; odometerKm: number; supersedesId: string }>(
    `INSERT INTO trip.odometer_readings (
       vehicle_id, trip_id, reading_type, odometer_km, occurred_at, reported_by,
       registered_by, actor_snapshot, reason, evidence_description, attachment_url, supersedes_id
     )
     VALUES (
       $1, $2, 'END', 51200, '2026-11-15T10:40:00Z', 'Condutor João Fictício via mensagem com foto',
       $3, $4::jsonb, 'Condutor digitou 52.000 por engano; corrigido após envio da foto do painel',
       'Foto do painel do veículo', 'https://storage.example.test/painel-51200.jpg', $5
     )
     RETURNING id::text AS id, odometer_km AS "odometerKm", supersedes_id::text AS "supersedesId"`,
    [vehicleId, tripId, operatorAna.id, anaSnapshot, reading1Id],
  )
  assert.equal(reading2Res.rows[0]?.odometerKm, 51200)
  assert.equal(reading2Res.rows[0]?.supersedesId, reading1Id)

  await assert.rejects(
    pool.query(`DELETE FROM trip.odometer_readings WHERE id = $1`, [reading1Id]),
    /trip\.odometer_readings is append-only/i,
  )

  // 2. Paradas de viagem: cancelamento exige motivo e DELETE físico é proibido
  const stopRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.trip_stops (trip_id, sequence_order, stop_type, location, status)
     VALUES ($1, 1, 'PICKUP', 'Unidade Hemose', 'PLANNED')
     RETURNING id::text AS id`,
    [tripId],
  )
  const stopId = stopRes.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE trip.trip_stops SET status = 'CANCELED' WHERE id = $1`, [stopId]),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  await pool.query(
    `UPDATE trip.trip_stops
     SET status = 'CANCELED',
         cancelled_at = clock_timestamp(),
         cancelled_by = $1,
         cancellation_reason = 'Coleta transferida para a rota da tarde',
         revision = revision + 1
     WHERE id = $2`,
    [operatorAna.id, stopId],
  )

  await assert.rejects(
    pool.query(`DELETE FROM trip.trip_stops WHERE id = $1`, [stopId]),
    /trip\.trip_stops cannot be physically deleted/i,
  )

  // 3. Alteração posterior na capacidade do veículo (16 -> 12 lugares) não altera o snapshot da viagem passada
  await pool.query(`UPDATE fleet.vehicles SET seats = 12, revision = revision + 1 WHERE id = $1`, [vehicleId])

  const preservedTrip = await pool.query<{ snapshotSeats: number; currentSeats: number }>(
    `SELECT (t.vehicle_snapshot->>'seats')::int AS "snapshotSeats",
            v.seats AS "currentSeats"
     FROM trip.trips t
     JOIN fleet.vehicles v ON v.id = t.vehicle_id
     WHERE t.id = $1`,
    [tripId],
  )
  assert.equal(preservedTrip.rows[0]?.snapshotSeats, 16)
  assert.equal(preservedTrip.rows[0]?.currentSeats, 12)

  // 4. Evento de viagem (STOP_CANCELED / ODOMETER_RECTIFIED) e bloqueio append-only
  const tripEventRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.trip_events (
       trip_id, event_type, reported_by, registered_by, actor_snapshot, reason,
       evidence_description, attachment_url, before_state, after_state
     )
     VALUES (
       $1, 'ODOMETER_RECTIFIED', 'Condutor João Fictício', $2, $3::jsonb,
       'Retificação de 52.000 km para 51.200 km mediante foto',
       'Foto do painel', 'https://storage.example.test/painel-51200.jpg',
       '{"endKm": 52000}'::jsonb, '{"endKm": 51200}'::jsonb
     )
     RETURNING id::text AS id`,
    [tripId, operatorAna.id, anaSnapshot],
  )
  const tripEventId = tripEventRes.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE trip.trip_events SET reason = 'Alteração proibida' WHERE id = $1`, [tripEventId]),
    /trip\.trip_events is append-only/i,
  )
  await assert.rejects(
    pool.query(`DELETE FROM trip.trip_events WHERE id = $1`, [tripEventId]),
    /trip\.trip_events is append-only/i,
  )
})

test('IT20: consulta de conflito de agenda por período usando os índices de trip.trips', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const requesterRoleId = await getRoleId(pool, 'SOLICITANTE')

  const requester = await usersRepository.create({
    name: 'Solicitante Escala Fictícia',
    email: 'escala.conflito@example.test',
    passwordHash: 'hash-ficticio',
    roleId: requesterRoleId,
  })

  const serviceRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name, categories)
     VALUES ('Serviço Escala Administrativa', ARRAY['PASSENGER']::TEXT[])
     RETURNING id::text AS id`,
  )
  const serviceId = serviceRes.rows[0]!.id

  const vehicleRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type)
     VALUES ('VTR9Z99', ARRAY['PASSENGER']::TEXT[], 4, 0, 'ADMINISTRATIVE')
     RETURNING id::text AS id`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const driverRes = await pool.query<{ id: string }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
     VALUES ('Marcos Escala Fictício', '77788899900', '12312312300', 'B', '2029-12-31')
     RETURNING id::text AS id`,
  )
  const driverId = driverRes.rows[0]!.id

  const reqRes = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, status)
     VALUES ($1, $2, '2026-11-20', '14:00:00', 'Sede FSPH', 'Secretaria de Saúde', 'Entrega documental', 'SCHEDULED')
     RETURNING id::text AS id`,
    [requester.id, serviceId],
  )

  await pool.query(
    `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status)
     VALUES ($1, $2, $3, '2026-11-20T14:00:00Z', '2026-11-20T16:00:00Z', 'SCHEDULED')`,
    [reqRes.rows[0]!.id, vehicleId, driverId],
  )

  const conflictQuery = `
    SELECT id::text AS id
    FROM trip.trips
    WHERE vehicle_id = $1
      AND status IN ('SCHEDULED', 'IN_PROGRESS')
      AND scheduled_start < $3
      AND scheduled_end > $2
  `

  const overlapping = await pool.query<{ id: string }>(conflictQuery, [
    vehicleId,
    '2026-11-20T15:00:00Z',
    '2026-11-20T17:00:00Z',
  ])
  assert.equal(overlapping.rows.length, 1)

  const adjacent = await pool.query<{ id: string }>(conflictQuery, [
    vehicleId,
    '2026-11-20T16:00:00Z',
    '2026-11-20T18:00:00Z',
  ])
  assert.equal(adjacent.rows.length, 0)
})

test('IT21: rollbacks (.down.sql) das migrations 202610280005 e 202610280004 e reaplicação limpa', async () => {
  const pool = getTestPool()
  const downFiles = [
    '202610280008_create_svo_execution_orders.down.sql',
    '202610280007_create_svo_teams.down.sql',
    '202610280006_create_svo_occurrences.down.sql',
    '202610280005_create_trips.down.sql',
    '202610280004_create_trip_requests.down.sql',
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

    const removedTripTables = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'trip'
        AND table_name IN ('requests', 'request_events', 'trips', 'trip_stops', 'odometer_readings', 'trip_events')
    `)
    assert.equal(removedTripTables.rows[0]?.count, '0')

    const removedEventCols = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = 'fleet'
        AND table_name IN ('vehicle_events', 'driver_events')
        AND column_name IN ('evidence_description', 'attachment_url', 'supersedes_id', 'is_annulled')
    `)
    assert.equal(removedEventCols.rows[0]?.count, '0')
  } finally {
    const migrator = new DatabaseMigrator()
    await migrator.runMigrations(pool, { silent: true })
  }

  const restoredTripTables = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'trip'
      AND table_name IN ('requests', 'request_events', 'trips', 'trip_stops', 'odometer_readings', 'trip_events')
  `)
  assert.equal(restoredTripTables.rows[0]?.count, '6')
})

test('IT22: criação de svo.occurrences, exigência de motivo no cancelamento, consistência de triagem e imutabilidade de svo.occurrence_events (FROTA-110)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  const attendantRoleId = await getRoleId(pool, 'ATENDENTE_SVO')

  const attendant = await usersRepository.create({
    name: 'Atendente SVO Fictícia',
    email: 'atendente.svo@example.test',
    passwordHash: 'hash-ficticio',
    roleId: attendantRoleId,
  })
  const attendantSnapshot = JSON.stringify({
    id: attendant.id,
    name: attendant.name,
    email: attendant.email,
    role: 'ATENDENTE_SVO',
  })

  const occRes = await pool.query<{
    id: string
    status: string
    requesterType: string
    revision: number
  }>(
    `INSERT INTO svo.occurrences (
       attendant_id, requester_name, requester_phone, requester_type,
       location, description, attendant_snapshot
     )
     VALUES (
       $1, 'Hospital Regional Fictício', '7932001000', 'HOSPITAL',
       'Av. Tancredo Neves, 1000 - Aracaju/SE', 'Solicitação de remoção hospitalar para verificação de óbito', $2::jsonb
     )
     RETURNING id::text AS id, status, requester_type AS "requesterType", revision`,
    [attendant.id, attendantSnapshot],
  )
  const occurrence = occRes.rows[0]!
  assert.equal(occurrence.status, 'PENDING')
  assert.equal(occurrence.requesterType, 'HOSPITAL')
  assert.equal(occurrence.revision, 1)

  // Cancelar sem motivo deve violar svo_occurrences_cancellation_requires_reason (23514)
  await assert.rejects(
    pool.query(`UPDATE svo.occurrences SET status = 'CANCELED' WHERE id = $1`, [occurrence.id]),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  // Preencher triaged_at mantendo status PENDING deve violar svo_occurrences_triage_consistency (23514)
  await assert.rejects(
    pool.query(`UPDATE svo.occurrences SET triaged_at = clock_timestamp() WHERE id = $1`, [occurrence.id]),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  // Confirmar na triagem sucede
  await pool.query(
    `UPDATE svo.occurrences
     SET status = 'CONFIRMED',
         triaged_at = clock_timestamp(),
         triaged_by = $1,
         revision = revision + 1,
         updated_at = clock_timestamp()
     WHERE id = $2`,
    [attendant.id, occurrence.id],
  )

  // Registra evento de confirmação e valida proteção append-only
  const eventRes = await pool.query<{ id: string }>(
    `INSERT INTO svo.occurrence_events (
       occurrence_id, event_type, reported_by, registered_by, actor_snapshot,
       reason, before_state, after_state
     )
     VALUES (
       $1, 'CONFIRMED', 'Plantão Hospital Regional Fictício', $2, $3::jsonb,
       'Triagem confirmada após conferência de documentação médica',
       '{"status": "PENDING"}'::jsonb, '{"status": "CONFIRMED"}'::jsonb
     )
     RETURNING id::text AS id`,
    [occurrence.id, attendant.id, attendantSnapshot],
  )
  const eventId = eventRes.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE svo.occurrence_events SET reason = 'Tentativa de alteração' WHERE id = $1`, [eventId]),
    /svo\.occurrence_events is append-only/i,
  )
  await assert.rejects(
    pool.query(`DELETE FROM svo.occurrence_events WHERE id = $1`, [eventId]),
    /svo\.occurrence_events is append-only/i,
  )
})

test('IT23: criação de svo.teams, svo.team_members, unicidade de nome/vínculo, preservação de histórico de saída e seed idempotente (FROTA-168)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  await seedInitialAdmin(pool, ADMIN_CONFIG)

  // 1. Executa seedInitialSvoTeam duas vezes e garante idempotência
  await seedInitialSvoTeam(pool, ADMIN_CONFIG.email)
  await seedInitialSvoTeam(pool, ADMIN_CONFIG.email)

  const seededTeams = await pool.query<{ id: string; name: string; active: boolean }>(
    `SELECT id::text AS id, name, active FROM svo.teams WHERE lower(btrim(name)) = lower('Equipe Plantão SVO 01')`,
  )
  assert.equal(seededTeams.rows.length, 1)
  const teamId = seededTeams.rows[0]!.id

  const seededEvents = await pool.query<{ id: string; eventType: string }>(
    `SELECT id::text AS id, event_type AS "eventType" FROM svo.team_events WHERE team_id = $1`,
    [teamId],
  )
  assert.equal(seededEvents.rows.length, 1)
  assert.equal(seededEvents.rows[0]?.eventType, 'CREATED')

  // 2. Duplicidade case-insensitive de nome da equipe deve falhar com 23505
  await assert.rejects(
    pool.query(`INSERT INTO svo.teams (name) VALUES ('  equipe plantão svo 01  ')`),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  // 3. Vincula membro à equipe e valida unicidade (team_id, user_id) e período (left_at >= joined_at)
  const teamRoleId = await getRoleId(pool, 'EQUIPE_SVO')
  const memberUser = await usersRepository.create({
    name: 'Integrante Equipe SVO Fictício',
    email: 'integrante.svo@example.test',
    passwordHash: 'hash-ficticio',
    roleId: teamRoleId,
  })

  await pool.query(
    `INSERT INTO svo.team_members (team_id, user_id, joined_at)
     VALUES ($1, $2, '2026-10-01T08:00:00Z')`,
    [teamId, memberUser.id],
  )

  await assert.rejects(
    pool.query(`INSERT INTO svo.team_members (team_id, user_id) VALUES ($1, $2)`, [teamId, memberUser.id]),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  await assert.rejects(
    pool.query(
      `UPDATE svo.team_members SET left_at = '2026-09-30T08:00:00Z' WHERE team_id = $1 AND user_id = $2`,
      [teamId, memberUser.id],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  await pool.query(
    `UPDATE svo.team_members
     SET active = false, left_at = '2026-10-28T18:00:00Z', updated_at = clock_timestamp()
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, memberUser.id],
  )

  await assert.rejects(
    pool.query(`DELETE FROM svo.team_events WHERE id = $1`, [seededEvents.rows[0]!.id]),
    /svo\.team_events is append-only/i,
  )
})

test('IT24: criação de svo.execution_orders, bloqueio de segunda ordem para mesma solicitação, exigência de failure_reason em NOT_PERFORMED e validação de hodômetro/período (FROTA-114)', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  await seedInitialAdmin(pool, ADMIN_CONFIG)
  await seedInitialFleet(pool, ADMIN_CONFIG.email)
  await seedInitialSvoTeam(pool, ADMIN_CONFIG.email)

  const attendantRoleId = await getRoleId(pool, 'ATENDENTE_SVO')
  const attendant = await usersRepository.create({
    name: 'Atendente Despacho SVO Fictício',
    email: 'despacho.svo@example.test',
    passwordHash: 'hash-ficticio',
    roleId: attendantRoleId,
  })

  const occRes = await pool.query<{ id: string }>(
    `INSERT INTO svo.occurrences (
       attendant_id, requester_name, requester_phone, requester_type,
       location, description, status, triaged_at, triaged_by
     )
     VALUES (
       $1, 'UPA Zona Norte Fictícia', '7932119000', 'UPA',
       'Rua Principal, 250 - Aracaju/SE', 'Óbito natural sem causa definida', 'CONFIRMED', clock_timestamp(), $1
     )
     RETURNING id::text AS id`,
    [attendant.id],
  )
  const occurrenceId = occRes.rows[0]!.id

  const teamRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM svo.teams WHERE lower(btrim(name)) = lower('Equipe Plantão SVO 01') LIMIT 1`,
  )
  const teamId = teamRes.rows[0]!.id

  const vehicleRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM fleet.vehicles WHERE license_plate = 'SVO1A01' LIMIT 1`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const orderRes = await pool.query<{ id: string; status: string }>(
    `INSERT INTO svo.execution_orders (
       occurrence_id, team_id, vehicle_id, opened_at, created_by
     )
     VALUES ($1, $2, $3, '2026-10-28T10:00:00Z', $4)
     RETURNING id::text AS id, status`,
    [occurrenceId, teamId, vehicleId, attendant.id],
  )
  const orderId = orderRes.rows[0]!.id
  assert.equal(orderRes.rows[0]?.status, 'OPEN')

  // Segunda ordem para a mesma solicitação deve falhar com 23505 (occurrence_id UNIQUE)
  await assert.rejects(
    pool.query(
      `INSERT INTO svo.execution_orders (occurrence_id, team_id, vehicle_id, created_by)
       VALUES ($1, $2, $3, $4)`,
      [occurrenceId, teamId, vehicleId, attendant.id],
    ),
    (error: unknown) => (error as { code?: string }).code === '23505',
  )

  // Encerrar como NOT_PERFORMED sem failure_reason deve falhar com 23514
  await assert.rejects(
    pool.query(`UPDATE svo.execution_orders SET status = 'NOT_PERFORMED' WHERE id = $1`, [orderId]),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  // closed_at anterior a opened_at deve falhar com 23514
  await assert.rejects(
    pool.query(
      `UPDATE svo.execution_orders SET closed_at = '2026-10-28T09:00:00Z' WHERE id = $1`,
      [orderId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  // end_km menor que start_km deve falhar com 23514
  await assert.rejects(
    pool.query(
      `UPDATE svo.execution_orders SET start_km = 15000, end_km = 14950 WHERE id = $1`,
      [orderId],
    ),
    (error: unknown) => (error as { code?: string }).code === '23514',
  )

  // Encerrar como NOT_PERFORMED informando failure_reason sucede
  await pool.query(
    `UPDATE svo.execution_orders
     SET status = 'NOT_PERFORMED',
         result = 'NOT_PERFORMED',
         failure_reason = 'Declaração de óbito já emitida pelo médico assistente no local',
         closed_at = '2026-10-28T11:30:00Z',
         closed_by = $1,
         start_km = 15000,
         end_km = 15025,
         revision = revision + 1
     WHERE id = $2`,
    [attendant.id, orderId],
  )
})

test('IT25: preservação histórica no SVO: snapshots da época, retificação de hodômetro (supersedes_id), reabertura excepcional e imutabilidade de svo.execution_order_events', async () => {
  const pool = getTestPool()
  const usersRepository = new UsersRepository(pool)
  await seedInitialAdmin(pool, ADMIN_CONFIG)
  await seedInitialFleet(pool, ADMIN_CONFIG.email)
  await seedInitialSvoTeam(pool, ADMIN_CONFIG.email)

  const teamRoleId = await getRoleId(pool, 'EQUIPE_SVO')
  const operatorSvo = await usersRepository.create({
    name: 'Operadora Equipe SVO Fictícia',
    email: 'operadora.svo@example.test',
    passwordHash: 'hash-ficticio',
    roleId: teamRoleId,
  })
  const operatorSnapshot = JSON.stringify({
    id: operatorSvo.id,
    name: operatorSvo.name,
    email: operatorSvo.email,
    role: 'EQUIPE_SVO',
  })

  const occRes = await pool.query<{ id: string }>(
    `INSERT INTO svo.occurrences (
       attendant_id, requester_name, requester_phone, requester_type,
       location, description, status, triaged_at, triaged_by
     )
     VALUES (
       $1, 'Família Fictícia Silva', '79999001122', 'FAMILY',
       'Bairro Jardins - Aracaju/SE', 'Óbito domiciliar natural', 'CONFIRMED', clock_timestamp(), $1
     )
     RETURNING id::text AS id`,
    [operatorSvo.id],
  )
  const occurrenceId = occRes.rows[0]!.id

  const teamRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM svo.teams WHERE lower(btrim(name)) = lower('Equipe Plantão SVO 01') LIMIT 1`,
  )
  const teamId = teamRes.rows[0]!.id

  const vehicleRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM fleet.vehicles WHERE license_plate = 'SVO1A02' LIMIT 1`,
  )
  const vehicleId = vehicleRes.rows[0]!.id

  const orderRes = await pool.query<{ id: string }>(
    `INSERT INTO svo.execution_orders (
       occurrence_id, team_id, vehicle_id, status, created_by,
       occurrence_snapshot, team_snapshot, vehicle_snapshot
     )
     VALUES (
       $1, $2, $3, 'IN_PROGRESS', $4,
       $5::jsonb, $6::jsonb, $7::jsonb
     )
     RETURNING id::text AS id`,
    [
      occurrenceId,
      teamId,
      vehicleId,
      operatorSvo.id,
      JSON.stringify({ id: occurrenceId, location: 'Bairro Jardins - Aracaju/SE' }),
      JSON.stringify({ id: teamId, name: 'Equipe Plantão SVO 01' }),
      JSON.stringify({ id: vehicleId, licensePlate: 'SVO1A02', bodyLimit: 2 }),
    ],
  )
  const orderId = orderRes.rows[0]!.id

  // 1. Leitura de hodômetro SVO informada por telefone (52.000 km) e retificada via foto (51.200 km)
  const reading1 = await pool.query<{ id: string }>(
    `INSERT INTO trip.odometer_readings (
       vehicle_id, svo_execution_order_id, reading_type, odometer_km, occurred_at,
       reported_by, registered_by, actor_snapshot, reason, evidence_description
     )
     VALUES (
       $1, $2, 'END', 52000, '2026-10-28T15:00:00Z',
       'Equipe SVO por telefone', $3, $4::jsonb,
       'Retorno à base do SVO', 'Informado verbalmente por ligação'
     )
     RETURNING id::text AS id`,
    [vehicleId, orderId, operatorSvo.id, operatorSnapshot],
  )
  const reading1Id = reading1.rows[0]!.id

  const reading2 = await pool.query<{ id: string; supersedesId: string }>(
    `INSERT INTO trip.odometer_readings (
       vehicle_id, svo_execution_order_id, reading_type, odometer_km, occurred_at,
       reported_by, registered_by, actor_snapshot, reason, evidence_description, attachment_url, supersedes_id
     )
     VALUES (
       $1, $2, 'END', 51200, '2026-10-28T15:00:00Z',
       'Equipe SVO via aplicativo', $3, $4::jsonb,
       'Correção de digitação após conferência da foto do painel da viatura SVO1A02',
       'Foto do hodômetro no encerramento', 'https://storage.example.test/svo-51200.jpg', $5
     )
     RETURNING id::text AS id, supersedes_id::text AS "supersedesId"`,
    [vehicleId, orderId, operatorSvo.id, operatorSnapshot, reading1Id],
  )
  assert.equal(reading2.rows[0]?.supersedesId, reading1Id)

  // 2. Mudança posterior do body_limit da viatura (2 -> 4) não altera o vehicle_snapshot da ordem histórica
  await pool.query(`UPDATE fleet.vehicles SET body_limit = 4, revision = revision + 1 WHERE id = $1`, [vehicleId])

  const snapshotCheck = await pool.query<{ snapshotBodyLimit: number; currentBodyLimit: number }>(
    `SELECT (eo.vehicle_snapshot->>'bodyLimit')::int AS "snapshotBodyLimit",
            v.body_limit AS "currentBodyLimit"
     FROM svo.execution_orders eo
     JOIN fleet.vehicles v ON v.id = eo.vehicle_id
     WHERE eo.id = $1`,
    [orderId],
  )
  assert.equal(snapshotCheck.rows[0]?.snapshotBodyLimit, 2)
  assert.equal(snapshotCheck.rows[0]?.currentBodyLimit, 4)

  // 3. Registra evento REOPENED em svo.execution_order_events e garante bloqueio append-only
  const orderEventRes = await pool.query<{ id: string }>(
    `INSERT INTO svo.execution_order_events (
       execution_order_id, event_type, reported_by, registered_by, actor_snapshot,
       reason, evidence_description, before_state, after_state
     )
     VALUES (
       $1, 'REOPENED', 'Coordenação de Plantão SVO', $2, $3::jsonb,
       'Reabertura excepcional para complementar observação e retificar hodômetro final',
       'Despacho administrativo nº 18/2026',
       '{"status": "COMPLETED", "endKm": 52000}'::jsonb,
       '{"status": "IN_PROGRESS", "endKm": 51200}'::jsonb
     )
     RETURNING id::text AS id`,
    [orderId, operatorSvo.id, operatorSnapshot],
  )
  const orderEventId = orderEventRes.rows[0]!.id

  await assert.rejects(
    pool.query(`UPDATE svo.execution_order_events SET reason = 'Mutação proibida' WHERE id = $1`, [orderEventId]),
    /svo\.execution_order_events is append-only/i,
  )
  await assert.rejects(
    pool.query(`DELETE FROM svo.execution_order_events WHERE id = $1`, [orderEventId]),
    /svo\.execution_order_events is append-only/i,
  )
})

test('IT26: rollbacks (.down.sql) das migrations 202610280008, 202610280007 e 202610280006 e reaplicação limpa', async () => {
  const pool = getTestPool()
  const downFiles = [
    '202610280008_create_svo_execution_orders.down.sql',
    '202610280007_create_svo_teams.down.sql',
    '202610280006_create_svo_occurrences.down.sql',
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

    const removedSvoTables = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'svo'
        AND table_name IN (
          'occurrences',
          'occurrence_events',
          'teams',
          'team_members',
          'team_events',
          'execution_orders',
          'execution_order_events'
        )
    `)
    assert.equal(removedSvoTables.rows[0]?.count, '0')

    const removedOdometerCol = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = 'trip'
        AND table_name = 'odometer_readings'
        AND column_name = 'svo_execution_order_id'
    `)
    assert.equal(removedOdometerCol.rows[0]?.count, '0')
  } finally {
    const migrator = new DatabaseMigrator()
    await migrator.runMigrations(pool, { silent: true })
  }

  const restoredSvoTables = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'svo'
      AND table_name IN (
        'occurrences',
        'occurrence_events',
        'teams',
        'team_members',
        'team_events',
        'execution_orders',
        'execution_order_events'
      )
  `)
  assert.equal(restoredSvoTables.rows[0]?.count, '7')
})



