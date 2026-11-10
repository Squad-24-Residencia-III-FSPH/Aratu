import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { Trip } from '../src/types/trip.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, RBAC_JWT_SECRET, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import {
  FICTITIOUS_CPFS,
  insertDriver,
  insertRequest,
  insertService,
  insertTrip,
  insertVehicle,
  linkVehicleToService,
} from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const START = '2099-12-01T08:00:00-03:00'
const END = '2099-12-01T12:00:00-03:00'
const OVERLAP_START = '2099-12-01T11:00:00-03:00'
const OVERLAP_END = '2099-12-01T13:00:00-03:00'

interface Scenario {
  serviceId: string
  vehicleId: string
  driverId: string
  requester: string
  requestId: string
}

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

function schedule(body: Record<string, unknown>, role: UserRole = 'GESTOR'): Promise<Response> {
  return fetch(`${baseUrl}/trips`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getUser(role).token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function scenario(): Promise<Scenario> {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const vehicleId = await insertVehicle(pool, 'AGE1A00')
  await linkVehicleToService(pool, vehicleId, serviceId)
  const driverId = await insertDriver(pool, 'Motorista Fictício QA', FICTITIOUS_CPFS[0])
  const requester = getUser('SOLICITANTE').id
  const requestId = await insertRequest(pool, requester, serviceId, 'APPROVED')
  return { serviceId, vehicleId, driverId, requester, requestId }
}

async function compatibleVehicle(serviceId: string, plate: string, status = 'AVAILABLE'): Promise<string> {
  const id = await insertVehicle(pool, plate, status)
  await linkVehicleToService(pool, id, serviceId)
  return id
}

async function existingTrip(base: Scenario, vehicleId: string, driverId: string): Promise<void> {
  await insertTrip(pool, {
    requestId: await insertRequest(pool, base.requester, base.serviceId, 'SCHEDULED'),
    vehicleId, driverId, start: START, end: END,
  })
}

async function expectUnchanged(requestId: string): Promise<void> {
  const request = await pool.query('SELECT status FROM trip.requests WHERE id = $1', [requestId])
  assert.equal(request.rows[0]?.status, 'APPROVED')
  const trips = await pool.query('SELECT count(*)::int AS total FROM trip.trips WHERE request_id = $1', [requestId])
  assert.equal(trips.rows[0]?.total, 0)
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

test('IT-SCHEDULING-01: agendamento válido retorna 201, viagem SCHEDULED e solicitação SCHEDULED', async () => {
  const { vehicleId, driverId, requestId } = await scenario()
  const response = await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })
  assert.equal(response.status, 201)
  const trip = (await response.json()) as Trip
  assert.equal(trip.status, 'SCHEDULED')
  assert.equal(new Date(trip.scheduledStart).toISOString(), '2099-12-01T11:00:00.000Z')

  const stored = await pool.query(
    `SELECT vehicle_snapshot->>'licensePlate' AS plate, driver_snapshot->>'name' AS driver FROM trip.trips WHERE id = $1`,
    [trip.id],
  )
  assert.deepEqual(stored.rows[0], { plate: 'AGE1A00', driver: 'Motorista Fictício QA' })
  const request = await pool.query('SELECT status FROM trip.requests WHERE id = $1', [requestId])
  assert.equal(request.rows[0]?.status, 'SCHEDULED')
  const tripEvents = await pool.query('SELECT event_type FROM trip.trip_events WHERE trip_id = $1', [trip.id])
  const requestEvents = await pool.query('SELECT event_type FROM trip.request_events WHERE request_id = $1', [requestId])
  const audits = await pool.query(`SELECT 1 FROM audit.logs WHERE table_name = 'trip.trips' AND record_id = $1`, [trip.id])
  assert.deepEqual([tripEvents.rows, requestEvents.rows, audits.rowCount], [[{ event_type: 'SCHEDULED' }], [{ event_type: 'SCHEDULED' }], 1])
})

test('IT-SCHEDULING-02: solicitação não aprovada retorna 409 (pendente, rejeitada ou já agendada)', async () => {
  const { serviceId, vehicleId, driverId, requester, requestId } = await scenario()
  const pending = await insertRequest(pool, requester, serviceId, 'PENDING')
  const rejected = await insertRequest(pool, requester, serviceId, 'PENDING')
  await pool.query(
    `UPDATE trip.requests SET status = 'REJECTED', decided_by = $2, decided_at = clock_timestamp(), decision_reason = 'Rejeição de teste'
      WHERE id = $1`,
    [rejected, getUser('GESTOR').id],
  )
  for (const notApproved of [pending, rejected]) {
    assert.equal((await schedule({ requestId: notApproved, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })).status, 409)
  }
  assert.equal((await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })).status, 201)
  assert.equal((await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })).status, 409)
})

test('IT-SCHEDULING-03: veículo já alocado em período sobreposto retorna 409', async () => {
  const base = await scenario()
  const otherDriver = await insertDriver(pool, 'Motorista Ocupante', FICTITIOUS_CPFS[1])
  await existingTrip(base, base.vehicleId, otherDriver)
  const response = await schedule({
    requestId: base.requestId, vehicleId: base.vehicleId, driverId: base.driverId, scheduledStart: OVERLAP_START, scheduledEnd: OVERLAP_END,
  })
  assert.equal(response.status, 409)
  assert.match(((await response.json()) as { erro: string }).erro, /veículo já tem viagem/)
  await expectUnchanged(base.requestId)
})

test('IT-SCHEDULING-04: motorista já alocado em período sobreposto retorna 409', async () => {
  const base = await scenario()
  const otherVehicle = await compatibleVehicle(base.serviceId, 'OCU1A00')
  await existingTrip(base, otherVehicle, base.driverId)
  const response = await schedule({
    requestId: base.requestId, vehicleId: base.vehicleId, driverId: base.driverId, scheduledStart: OVERLAP_START, scheduledEnd: OVERLAP_END,
  })
  assert.equal(response.status, 409)
  assert.match(((await response.json()) as { erro: string }).erro, /motorista já tem viagem/)
  await expectUnchanged(base.requestId)
})

test('IT-SCHEDULING-05: períodos que só encostam são permitidos para o mesmo veículo e motorista', async () => {
  const base = await scenario()
  await existingTrip(base, base.vehicleId, base.driverId)
  const after = await schedule({
    requestId: base.requestId, vehicleId: base.vehicleId, driverId: base.driverId, scheduledStart: END, scheduledEnd: '2099-12-01T14:00:00-03:00',
  })
  assert.equal(after.status, 201)
  const second = await insertRequest(pool, base.requester, base.serviceId, 'APPROVED')
  const before = await schedule({
    requestId: second, vehicleId: base.vehicleId, driverId: base.driverId, scheduledStart: '2099-12-01T06:00:00-03:00', scheduledEnd: START,
  })
  assert.equal(before.status, 201)
})

test('IT-SCHEDULING-06: veículo inativo ou em manutenção retorna 422', async () => {
  const base = await scenario()
  for (const [plate, status, message] of [['INA1A00', 'INACTIVE', /inativo/], ['MAN1A00', 'IN_MAINTENANCE', /manutenção/]] as const) {
    const vehicleId = await compatibleVehicle(base.serviceId, plate, status)
    const response = await schedule({ requestId: base.requestId, vehicleId, driverId: base.driverId, scheduledStart: START, scheduledEnd: END })
    assert.equal(response.status, 422, status)
    assert.match(((await response.json()) as { erro: string }).erro, message)
  }
  await expectUnchanged(base.requestId)
})

test('IT-SCHEDULING-07: veículo incompatível com o tipo de serviço retorna 422', async () => {
  const base = await scenario()
  const withoutLink = await insertVehicle(pool, 'SEM1A00')
  const inactiveLink = await insertVehicle(pool, 'DES1A00')
  await linkVehicleToService(pool, inactiveLink, base.serviceId, false)
  for (const vehicleId of [withoutLink, inactiveLink]) {
    const response = await schedule({ requestId: base.requestId, vehicleId, driverId: base.driverId, scheduledStart: START, scheduledEnd: END })
    assert.equal(response.status, 422)
    assert.match(((await response.json()) as { erro: string }).erro, /tipo de serviço/)
  }
  await expectUnchanged(base.requestId)
})

test('IT-SCHEDULING-08: motorista inativo, afastado ou com CNH vencida antes do fim retorna 422', async () => {
  const base = await scenario()
  const cases = [
    ['Motorista Inativo', FICTITIOUS_CPFS[2], '2099-12-31', 'INACTIVE', /inativo/],
    ['Motorista Afastado', FICTITIOUS_CPFS[3], '2099-12-31', 'AWAY', /afastado/],
    ['Motorista CNH Vencendo', FICTITIOUS_CPFS[4], '2099-11-30', 'ACTIVE', /CNH vencida/],
  ] as const
  for (const [name, cpf, cnhExpiresAt, status, message] of cases) {
    const driverId = await insertDriver(pool, name, cpf, cnhExpiresAt, status)
    const response = await schedule({ requestId: base.requestId, vehicleId: base.vehicleId, driverId, scheduledStart: START, scheduledEnd: END })
    assert.equal(response.status, 422, name)
    assert.match(((await response.json()) as { erro: string }).erro, message)
  }
  await expectUnchanged(base.requestId)
})

test('IT-SCHEDULING-09: dois agendamentos simultâneos do mesmo veículo — só um vence', async () => {
  const base = await scenario()
  const secondRequest = await insertRequest(pool, base.requester, base.serviceId, 'APPROVED')
  const driverA = await insertDriver(pool, 'Motorista Concorrente A', FICTITIOUS_CPFS[5])
  const driverB = await insertDriver(pool, 'Motorista Concorrente B', FICTITIOUS_CPFS[6])
  const responses = await Promise.all([
    schedule({ requestId: base.requestId, vehicleId: base.vehicleId, driverId: driverA, scheduledStart: START, scheduledEnd: END }),
    schedule({ requestId: secondRequest, vehicleId: base.vehicleId, driverId: driverB, scheduledStart: '2099-12-01T09:00:00-03:00', scheduledEnd: '2099-12-01T10:00:00-03:00' }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  const trips = await pool.query('SELECT count(*)::int AS total FROM trip.trips WHERE vehicle_id = $1', [base.vehicleId])
  assert.equal(trips.rows[0]?.total, 1)
})

test('IT-SCHEDULING-10: perfil diferente de GESTOR recebe 403; sem token 401; início no passado 422', async () => {
  const { vehicleId, driverId, requestId } = await scenario()
  for (const role of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END }, role)).status, 403, role)
  }
  assert.equal((await fetch(`${baseUrl}/trips`, { method: 'POST' })).status, 401)
  const past = await schedule({
    requestId, vehicleId, driverId, scheduledStart: '2020-01-01T08:00:00-03:00', scheduledEnd: '2020-01-01T10:00:00-03:00',
  })
  assert.equal(past.status, 422)
  await expectUnchanged(requestId)
})
