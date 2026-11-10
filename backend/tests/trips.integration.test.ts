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
  insertVehicle,
  linkVehicleToService,
} from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const START = '2099-12-01T08:00:00-03:00'
const END = '2099-12-01T12:00:00-03:00'

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

async function scenario() {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const vehicleId = await insertVehicle(pool, 'AGE1A00')
  await linkVehicleToService(pool, vehicleId, serviceId)
  const driverId = await insertDriver(pool, 'Motorista Fictício QA', FICTITIOUS_CPFS[0])
  const requester = getUser('SOLICITANTE').id
  const requestId = await insertRequest(pool, requester, serviceId, 'APPROVED')
  return { serviceId, vehicleId, driverId, requester, requestId }
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

test('IT-TRIPS-01: agendamento cria a viagem, agenda a solicitação e grava histórico e auditoria', async () => {
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

  const again = await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })
  assert.equal(again.status, 409)
})

test('IT-TRIPS-02: solicitação pendente 409, incompatível 422 e conflito 409', async () => {
  const { serviceId, vehicleId, driverId, requester, requestId } = await scenario()
  const pending = await insertRequest(pool, requester, serviceId, 'PENDING')
  assert.equal((await schedule({ requestId: pending, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })).status, 409)

  const otherVehicle = await insertVehicle(pool, 'SEM1A00')
  const incompatible = await schedule({ requestId, vehicleId: otherVehicle, driverId, scheduledStart: START, scheduledEnd: END })
  assert.equal(incompatible.status, 422)

  assert.equal((await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END })).status, 201)
  const second = await insertRequest(pool, requester, serviceId, 'APPROVED')
  const conflict = await schedule({
    requestId: second, vehicleId, driverId, scheduledStart: '2099-12-01T11:00:00-03:00', scheduledEnd: '2099-12-01T13:00:00-03:00',
  })
  assert.equal(conflict.status, 409)
  const touching = await schedule({
    requestId: second, vehicleId, driverId, scheduledStart: END, scheduledEnd: '2099-12-01T14:00:00-03:00',
  })
  assert.equal(touching.status, 201)
})

test('IT-TRIPS-03: dois agendamentos simultâneos sobrepostos resultam em um 201 e um 409', async () => {
  const { serviceId, vehicleId, requester, requestId } = await scenario()
  const secondRequest = await insertRequest(pool, requester, serviceId, 'APPROVED')
  const driverA = await insertDriver(pool, 'Motorista Concorrente A', FICTITIOUS_CPFS[1])
  const driverB = await insertDriver(pool, 'Motorista Concorrente B', FICTITIOUS_CPFS[2])
  const responses = await Promise.all([
    schedule({ requestId, vehicleId, driverId: driverA, scheduledStart: START, scheduledEnd: END }),
    schedule({ requestId: secondRequest, vehicleId, driverId: driverB, scheduledStart: '2099-12-01T09:00:00-03:00', scheduledEnd: '2099-12-01T10:00:00-03:00' }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  const trips = await pool.query('SELECT count(*)::int AS total FROM trip.trips WHERE vehicle_id = $1', [vehicleId])
  assert.equal(trips.rows[0]?.total, 1)
})

test('IT-TRIPS-04: início no passado 422 e somente GESTOR agenda', async () => {
  const { vehicleId, driverId, requestId } = await scenario()
  const past = await schedule({
    requestId, vehicleId, driverId, scheduledStart: '2020-01-01T08:00:00-03:00', scheduledEnd: '2020-01-01T10:00:00-03:00',
  })
  assert.equal(past.status, 422)
  for (const role of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA'] as const) {
    assert.equal((await schedule({ requestId, vehicleId, driverId, scheduledStart: START, scheduledEnd: END }, role)).status, 403, role)
  }
  const anonymous = await fetch(`${baseUrl}/trips`, { method: 'POST' })
  assert.equal(anonymous.status, 401)
})
