import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { AuditLogPage } from '../src/types/audit-log.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_FIXTURE_PASSWORD, RBAC_JWT_CONFIG, RBAC_JWT_SECRET, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import { insertRequest, insertService, linkVehicleToService } from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const FICTITIOUS_CPF = '12345678909'
const meta = { reportedBy: 'Coordenação fictícia', reason: 'Cenário de auditoria' }

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

function call(method: string, path: string, role: UserRole | null = 'GESTOR', body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(role ? { Authorization: `Bearer ${getUser(role).token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function logs(query = '', role: UserRole = 'GESTOR'): Promise<AuditLogPage> {
  const response = await call('GET', `/audit-logs${query}`, role)
  assert.equal(response.status, 200)
  return (await response.json()) as AuditLogPage
}

async function civilDate(offsetDays: number): Promise<string> {
  const result = await pool.query<{ day: string }>(
    `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'America/Maceio')::date + $1::int, 'YYYY-MM-DD') AS day`, [offsetDays])
  return String(result.rows[0]?.day)
}

/** Gera operações reais pela API (login, criação, mudança de status, agendamento) e registros sensíveis. */
async function operations(): Promise<{ vehicleId: string; requestId: string; tripId: string }> {
  const login = await call('POST', '/auth/login', null, { email: getUser('GESTOR').email, senha: RBAC_FIXTURE_PASSWORD })
  assert.equal(login.status, 200)

  const vehicle = await call('POST', '/vehicles', 'GESTOR', {
    licensePlate: 'AUD1A00', categories: ['PASSENGER'], seats: 4, bodyLimit: 0, weightLimit: null, operationType: 'ADMINISTRATIVE', ...meta,
  })
  assert.equal(vehicle.status, 201)
  const vehicleId = String(((await vehicle.json()) as { id: string }).id)
  assert.equal((await call('PATCH', `/vehicles/${vehicleId}/status`, 'GESTOR', { status: 'IN_MAINTENANCE', expectedRevision: 1, ...meta })).status, 200)

  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const schedulingVehicle = await call('POST', '/vehicles', 'GESTOR', {
    licensePlate: 'AUD1A01', categories: ['PASSENGER'], seats: 4, bodyLimit: 0, weightLimit: null, operationType: 'ADMINISTRATIVE', ...meta,
  })
  assert.equal(schedulingVehicle.status, 201)
  const schedulingVehicleId = String(((await schedulingVehicle.json()) as { id: string }).id)
  await linkVehicleToService(pool, schedulingVehicleId, serviceId)
  const requestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'PENDING')

  const driver = await call('POST', '/drivers', 'ADMINISTRADOR', {
    name: 'Motorista Fictício QA', cpf: FICTITIOUS_CPF, cnhNumber: '00000000001', cnhCategory: 'D', cnhExpiresAt: '2099-12-31', userId: getUser('MOTORISTA').id, ...meta,
  })
  assert.equal(driver.status, 201)
  const driverId = String(((await driver.json()) as { id: string }).id)
  const scheduled = await fetch(`${baseUrl}/trips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getUser('GESTOR').token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      requestId,
      expectedRevision: 1,
      serviceId,
      vehicleId: schedulingVehicleId,
      driverId,
      scheduledStart: '2099-12-01T08:00:00-03:00',
      scheduledEnd: '2099-12-01T12:00:00-03:00',
    }),
  })
  const tripResult = await scheduled.json() as { id?: string; erro?: string }
  assert.equal(scheduled.status, 201, tripResult.erro ?? '')
  const tripId = String(tripResult.id)

  await pool.query(
    `INSERT INTO audit.logs (user_id, table_name, record_id, operation, after, actor_snapshot, reason)
     VALUES ($1, 'svo.occurrences', '1', 'CREATE', $2::jsonb, $3::jsonb, 'Chamado recebido')`,
    [getUser('ADMINISTRADOR').id, JSON.stringify({ requesterName: 'Familiar Fictício', location: 'Endereço fictício' }), JSON.stringify({ id: getUser('ADMINISTRADOR').id, name: 'Administrador Fictício QA' })],
  )
  await pool.query(
    `INSERT INTO audit.logs (user_id, table_name, record_id, operation, after, actor_snapshot, reason, registered_at)
     VALUES ($1, 'auth.users', $4, 'UPDATE', $2::jsonb, $3::jsonb, 'Registro legado', '2020-01-15T12:00:00Z')`,
    [getUser('ADMINISTRADOR').id, JSON.stringify({ password_hash: 'hash-ficticio', session: { token: 'token-ficticio' } }), JSON.stringify({ id: getUser('ADMINISTRADOR').id }), getUser('ADMINISTRADOR').id],
  )
  return { vehicleId, requestId, tripId }
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG })
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  testUsers = await seedRbacTestUsers(pool, RBAC_JWT_SECRET)
})

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await closeTestPool()
})

test('IT-AUDIT-01: login, criação, agendamento e mudança de status aparecem com usuário, ação, entidade e data', async () => {
  const { vehicleId, tripId } = await operations()
  const page = await logs(`?userId=${getUser('GESTOR').id}&pageSize=100`)
  const entries = page.logs.map((entry) => [entry.operation, entry.table, entry.recordId])
  assert.ok(entries.some(([operation, table]) => operation === 'LOGIN_SUCCESS' && table === 'auth.users'), 'login')
  assert.ok(entries.some(([operation, table, record]) => operation === 'CREATE' && table === 'fleet.vehicles' && record === vehicleId), 'criação')
  assert.ok(entries.some(([operation, table, record]) => operation === 'STATUS_CHANGE' && table === 'fleet.vehicles' && record === vehicleId), 'mudança de status')
  assert.ok(entries.some(([operation, table, record]) => operation === 'CREATE' && table === 'trip.trips' && record === tripId), 'agendamento')
  for (const entry of page.logs) {
    assert.equal(entry.userId, getUser('GESTOR').id)
    assert.ok(entry.registeredAt && Number.isFinite(Date.parse(String(entry.registeredAt))))
  }
  const dates = page.logs.map((entry) => Date.parse(String(entry.registeredAt)))
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'ordenado do mais recente para o mais antigo')
})

test('IT-AUDIT-02: filtros por período, usuário e operação', async () => {
  await operations()
  const today = await civilDate(0)
  const tomorrow = await civilDate(1)
  const current = await logs(`?from=${today}&to=${tomorrow}&pageSize=100`)
  assert.ok(current.logs.every((entry) => !(entry.reason === 'Registro legado')), 'registro de 2020 fora do período')
  const legacy = await logs('?from=2020-01-15&to=2020-01-16')
  assert.deepEqual(legacy.logs.map((entry) => entry.reason), ['Registro legado'])

  const adminOnly = await logs(`?userId=${getUser('ADMINISTRADOR').id}&pageSize=100`)
  assert.ok(adminOnly.total >= 3 && adminOnly.logs.every((entry) => entry.userId === getUser('ADMINISTRADOR').id))

  const logins = await logs('?operation=LOGIN_SUCCESS')
  assert.equal(logins.total, 1)
  assert.equal(logins.logs[0]?.userId, getUser('GESTOR').id)

  const vehicles = await logs('?table=fleet.vehicles')
  assert.deepEqual(vehicles.logs.map((entry) => entry.operation).sort(), ['CREATE', 'CREATE', 'STATUS_CHANGE'])

  for (const query of ['?from=2026-13-01', '?from=2026-12-01&to=2026-11-01', '?userId=abc', '?operation=drop', '?pageSize=500']) {
    const response = await call('GET', `/audit-logs${query}`)
    assert.equal(response.status, 400, query)
    assert.equal(typeof ((await response.json()) as { erro?: string }).erro, 'string')
  }
})

test('IT-AUDIT-03: paginação', async () => {
  await operations()
  const all = await logs('?pageSize=100')
  const second = await logs('?pageSize=2&page=2')
  assert.equal(second.page, 2)
  assert.equal(second.pageSize, 2)
  assert.equal(second.total, all.total)
  assert.equal(second.totalPages, Math.ceil(all.total / 2))
  assert.deepEqual(second.logs.map((entry) => entry.id), all.logs.slice(2, 4).map((entry) => entry.id))
  assert.deepEqual((await logs(`?pageSize=2&page=${second.totalPages + 1}`)).logs, [])
})

test('IT-AUDIT-04: GESTOR e ADMINISTRADOR consultam; demais perfis 403; sem token 401', async () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    assert.equal((await call('GET', '/audit-logs', role)).status, 200, role)
  }
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await call('GET', '/audit-logs', role)).status, 403, role)
  }
  assert.equal((await call('GET', '/audit-logs', null)).status, 401)
})

test('IT-AUDIT-05: não existe rota para criar, alterar ou apagar logs (404)', async () => {
  await operations()
  const before = await logs('?pageSize=100')
  const anyId = before.logs[0]?.id ?? '1'
  for (const [method, path] of [['PUT', `/audit-logs/${anyId}`], ['PATCH', `/audit-logs/${anyId}`], ['DELETE', `/audit-logs/${anyId}`], ['DELETE', '/audit-logs'], ['POST', '/audit-logs']] as const) {
    assert.equal((await call(method, path, 'ADMINISTRADOR', {})).status, 404, `${method} ${path}`)
  }
  assert.equal((await logs('?pageSize=100')).total, before.total)
})

test('IT-AUDIT-06: retorno sem senha, token nem dado sensível sem máscara', async () => {
  await operations()
  const response = await call('GET', '/audit-logs?pageSize=100', 'ADMINISTRADOR')
  const raw = await response.text()
  for (const forbidden of [RBAC_FIXTURE_PASSWORD, 'hash-ficticio', 'token-ficticio', 'password', 'passwordHash', 'password_hash', FICTITIOUS_CPF, '00000000001', 'Familiar Fictício']) {
    assert.equal(raw.includes(forbidden), false, `não deve expor ${forbidden}`)
  }
  const page = JSON.parse(raw) as AuditLogPage
  const driverLog = page.logs.find((entry) => entry.table === 'fleet.drivers')
  assert.equal((driverLog?.after as { cpf?: string } | null)?.cpf, '***.***.***-09')
  const svoLog = page.logs.find((entry) => entry.table === 'svo.occurrences')
  assert.deepEqual([svoLog?.before, svoLog?.after, svoLog?.sensitiveDataHidden, svoLog?.operation], [null, null, true, 'CREATE'])
  const stored = await pool.query(`SELECT after->>'cpf' AS cpf FROM audit.logs WHERE table_name = 'fleet.drivers'`)
  assert.equal(stored.rows[0]?.cpf, FICTITIOUS_CPF, 'a máscara não altera o registro gravado')
})
