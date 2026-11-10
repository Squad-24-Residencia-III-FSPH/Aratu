import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { DriverTrip, Trip } from '../src/types/trip.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { generateRbacUserToken, RBAC_JWT_CONFIG, RBAC_JWT_SECRET, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import {
  FICTITIOUS_CPFS,
  insertDriver,
  insertRequest,
  insertService,
  insertTrip,
  insertVehicle,
} from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

interface ExecutionScenario {
  tripId: string
  vehicleId: string
  serviceId: string
  driverId: string
  otherDriverToken: string
  otherDriverId: string
}

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const driverToken = () => getUser('MOTORISTA').token

async function createSecondDriverUser(): Promise<{ id: string; token: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO auth.users (name, email, password_hash, role_id)
     SELECT 'Segundo Motorista QA', 'motorista2.qa@example.test', 'hash-ficticio-sem-uso', id FROM auth.roles WHERE name = 'MOTORISTA'
     RETURNING id::text AS id`,
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error('Falha ao criar o segundo motorista de teste.')
  return { id, token: generateRbacUserToken({ id, role: 'MOTORISTA' }) }
}

async function scenario(status = 'SCHEDULED'): Promise<ExecutionScenario> {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const vehicleId = await insertVehicle(pool, 'EXE1A00')
  const driverId = await insertDriver(pool, 'Motorista Alocado QA', FICTITIOUS_CPFS[0], '2099-12-31', 'ACTIVE', getUser('MOTORISTA').id)
  const second = await createSecondDriverUser()
  const otherDriverId = await insertDriver(pool, 'Segundo Motorista QA', FICTITIOUS_CPFS[1], '2099-12-31', 'ACTIVE', second.id)
  const requestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'SCHEDULED')
  const tripId = await insertTrip(pool, {
    requestId, vehicleId, driverId, start: '2099-12-01T08:00:00-03:00', end: '2099-12-01T12:00:00-03:00', status,
  })
  return { tripId, vehicleId, serviceId, driverId, otherDriverToken: second.token, otherDriverId }
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

test('IT-EXECUTION-01: motorista alocado inicia viagem SCHEDULED → 200 IN_PROGRESS com leitura, evento e auditoria', async () => {
  const { tripId } = await scenario()
  const before = Date.now()
  const response = await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })
  assert.equal(response.status, 200)
  const trip = (await response.json()) as Trip
  assert.equal(trip.status, 'IN_PROGRESS')
  assert.equal(trip.startKm, 1500)
  assert.ok(trip.startedAt && new Date(trip.startedAt).getTime() >= before - 1000, 'a hora de início vem do servidor')

  const reading = await pool.query(`SELECT reading_type, odometer_km FROM trip.odometer_readings WHERE trip_id = $1`, [tripId])
  assert.deepEqual(reading.rows, [{ reading_type: 'START', odometer_km: 1500 }])
  const events = await pool.query('SELECT event_type, reason FROM trip.trip_events WHERE trip_id = $1', [tripId])
  assert.deepEqual(events.rows, [{ event_type: 'STARTED', reason: 'Início da viagem' }])
  const audits = await pool.query(`SELECT 1 FROM audit.logs WHERE table_name = 'trip.trips' AND record_id = $1`, [tripId])
  assert.equal(audits.rowCount, 1)
})

test('IT-EXECUTION-02: motorista alocado finaliza viagem IN_PROGRESS → 200 FINISHED com leitura END', async () => {
  const { tripId } = await scenario()
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 200)
  const response = await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1580 })
  assert.equal(response.status, 200)
  const trip = (await response.json()) as Trip
  assert.equal(trip.status, 'FINISHED')
  assert.equal(trip.endKm, 1580)
  assert.ok(trip.finishedAt)
  const readings = await pool.query(`SELECT reading_type, odometer_km FROM trip.odometer_readings WHERE trip_id = $1 ORDER BY id`, [tripId])
  assert.deepEqual(readings.rows, [{ reading_type: 'START', odometer_km: 1500 }, { reading_type: 'END', odometer_km: 1580 }])
})

test('IT-EXECUTION-03: outro motorista tenta iniciar ou finalizar → 403; outro perfil → 403; sem token → 401', async () => {
  const { tripId, otherDriverToken } = await scenario()
  assert.equal((await call('POST', `/trips/${tripId}/start`, otherDriverToken, { startKm: 1500 })).status, 403)
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 200)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, otherDriverToken, { endKm: 1600 })).status, 403)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, getUser('GESTOR').token, { endKm: 1600 })).status, 403)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, null, { endKm: 1600 })).status, 401)
  const stored = await pool.query('SELECT status FROM trip.trips WHERE id = $1', [tripId])
  assert.equal(stored.rows[0]?.status, 'IN_PROGRESS')
})

test('IT-EXECUTION-04: iniciar viagem não agendada ou finalizar viagem não iniciada → 409', async () => {
  const { tripId } = await scenario()
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1600 })).status, 409)
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 200)
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 409)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1600 })).status, 200)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1700 })).status, 409)
})

test('IT-EXECUTION-05: km final menor que o inicial → 422', async () => {
  const { tripId } = await scenario()
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 200)
  const response = await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1499 })
  assert.equal(response.status, 422)
  const stored = await pool.query('SELECT status, end_km FROM trip.trips WHERE id = $1', [tripId])
  assert.deepEqual(stored.rows[0], { status: 'IN_PROGRESS', end_km: null })
})

test('IT-EXECUTION-06: km inicial menor que a última quilometragem do veículo → 422', async () => {
  const base = await scenario()
  const previousRequest = await insertRequest(pool, getUser('SOLICITANTE').id, base.serviceId, 'SCHEDULED')
  const previousTrip = await insertTrip(pool, {
    requestId: previousRequest, vehicleId: base.vehicleId, driverId: base.otherDriverId,
    start: '2099-11-20T08:00:00-03:00', end: '2099-11-20T12:00:00-03:00', status: 'FINISHED',
  })
  await pool.query(
    `UPDATE trip.trips SET start_km = 51900, end_km = 52000, started_at = clock_timestamp(), finished_at = clock_timestamp() WHERE id = $1`,
    [previousTrip],
  )
  const response = await call('POST', `/trips/${base.tripId}/start`, driverToken(), { startKm: 51999 })
  assert.equal(response.status, 422)
  assert.match(((await response.json()) as { erro: string }).erro, /52000 km/)
  assert.equal((await call('POST', `/trips/${base.tripId}/start`, driverToken(), { startKm: 52000 })).status, 200)
})

test('IT-EXECUTION-07: GET /trips/mine traz só as viagens agendadas e em andamento do motorista logado', async () => {
  const base = await scenario()
  const otherRequest = await insertRequest(pool, getUser('SOLICITANTE').id, base.serviceId, 'SCHEDULED')
  const otherVehicle = await insertVehicle(pool, 'OUT1A00')
  await insertTrip(pool, {
    requestId: otherRequest, vehicleId: otherVehicle, driverId: base.otherDriverId,
    start: '2099-12-02T08:00:00-03:00', end: '2099-12-02T12:00:00-03:00',
  })
  const finishedRequest = await insertRequest(pool, getUser('SOLICITANTE').id, base.serviceId, 'SCHEDULED')
  await insertTrip(pool, {
    requestId: finishedRequest, vehicleId: otherVehicle, driverId: base.driverId,
    start: '2099-11-01T08:00:00-03:00', end: '2099-11-01T12:00:00-03:00', status: 'FINISHED',
  })

  const response = await call('GET', '/trips/mine', driverToken())
  assert.equal(response.status, 200)
  const trips = (await response.json()) as DriverTrip[]
  assert.deepEqual(trips.map((item) => [item.id, item.status, item.vehicleLicensePlate, item.destination]), [
    [base.tripId, 'SCHEDULED', 'EXE1A00', 'Unidade fictícia'],
  ])
  const otherDriverTrips = (await (await call('GET', '/trips/mine', base.otherDriverToken)).json()) as DriverTrip[]
  assert.equal(otherDriverTrips.length, 1)
  assert.notEqual(otherDriverTrips[0]?.id, base.tripId)
  assert.equal((await call('GET', '/trips/mine', getUser('GESTOR').token)).status, 403)
})
