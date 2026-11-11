import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AvailabilityRepository } from '../src/repositories/availability.repository'
import { FuelingsRepository } from '../src/repositories/fuelings.repository'
import { TripsRepository } from '../src/repositories/trips.repository'
import { AvailabilityService } from '../src/services/availability.service'
import { TripsService } from '../src/services/trips.service'
import type { AuditLogger } from '../src/types/audit.types'
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
  linkVehicleToService,
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

async function snapshotHistory(tripId: string, vehicleId: string) {
  const [tripRows, readings, events, audits] = await Promise.all([
    pool.query(
      `SELECT id::text AS id, status, start_km, end_km, started_at, finished_at, revision,
              vehicle_snapshot, driver_snapshot
         FROM trip.trips WHERE id = $1`,
      [tripId],
    ),
    pool.query(
      `SELECT id::text AS id, vehicle_id::text AS vehicle_id, trip_id::text AS trip_id,
              reading_type, odometer_km, occurred_at, reported_by, registered_by::text AS registered_by,
              actor_snapshot, reason
         FROM trip.odometer_readings WHERE vehicle_id = $1 ORDER BY id ASC`,
      [vehicleId],
    ),
    pool.query(
      `SELECT id::text AS id, trip_id::text AS trip_id, event_type, occurred_at,
              reported_by, registered_by::text AS registered_by, actor_snapshot, reason,
              before_state, after_state
         FROM trip.trip_events WHERE trip_id = $1 ORDER BY id ASC`,
      [tripId],
    ),
    pool.query(
      `SELECT id::text AS id, user_id::text AS user_id, table_name, record_id, operation,
              before, after, actor_snapshot, reason, registered_at
         FROM audit.logs WHERE table_name = 'trip.trips' AND record_id = $1 ORDER BY id ASC`,
      [tripId],
    ),
  ])
  return {
    trip: tripRows.rows[0] ?? null,
    readings: readings.rows,
    events: events.rows,
    audits: audits.rows,
  }
}

test('IT-EXECUTION-08: histórico cumulativo preserva agendamento e leituras anteriores ao iniciar e finalizar e mantém a viagem no banco após sair de /trips/mine', async () => {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const vehicleId = await insertVehicle(pool, 'EXE1A00')
  await linkVehicleToService(pool, vehicleId, serviceId)
  const driverUser = getUser('MOTORISTA')
  const driverId = await insertDriver(pool, 'Motorista Alocado QA', FICTITIOUS_CPFS[0], '2099-12-31', 'ACTIVE', driverUser.id)

  // Viagem anterior já concluída, gerando leitura prévia na linha do tempo do veículo.
  const priorRequestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'APPROVED')
  const priorScheduled = await call('POST', '/trips', getUser('GESTOR').token, {
    requestId: priorRequestId,
    vehicleId,
    driverId,
    scheduledStart: '2099-11-10T08:00:00-03:00',
    scheduledEnd: '2099-11-10T10:00:00-03:00',
  })
  assert.equal(priorScheduled.status, 201)
  const priorTrip = (await priorScheduled.json()) as Trip
  assert.equal((await call('POST', `/trips/${priorTrip.id}/start`, driverToken(), { startKm: 1400 })).status, 200)
  assert.equal((await call('POST', `/trips/${priorTrip.id}/finish`, driverToken(), { endKm: 1450 })).status, 200)

  // Nova viagem agendada pelo Gestor com histórico inicial de agendamento.
  const requestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'APPROVED')
  const scheduleResponse = await call('POST', '/trips', getUser('GESTOR').token, {
    requestId,
    vehicleId,
    driverId,
    scheduledStart: '2099-12-01T08:00:00-03:00',
    scheduledEnd: '2099-12-01T12:00:00-03:00',
  })
  assert.equal(scheduleResponse.status, 201)
  const scheduledTrip = (await scheduleResponse.json()) as Trip
  const beforeStart = await snapshotHistory(scheduledTrip.id, vehicleId)
  assert.equal(beforeStart.readings.length, 2)
  assert.equal(beforeStart.events.length, 1)
  assert.equal(beforeStart.audits.length, 1)

  const startRes = await call('POST', `/trips/${scheduledTrip.id}/start`, driverToken(), { startKm: 1500 })
  assert.equal(startRes.status, 200)
  const afterStart = await snapshotHistory(scheduledTrip.id, vehicleId)
  assert.deepEqual(afterStart.readings.slice(0, 2), beforeStart.readings, 'leituras anteriores intocadas')
  assert.deepEqual(afterStart.events.slice(0, 1), beforeStart.events, 'evento SCHEDULED intocado')
  assert.deepEqual(afterStart.audits.slice(0, 1), beforeStart.audits, 'auditoria de criação intocada')

  const finishRes = await call('POST', `/trips/${scheduledTrip.id}/finish`, driverToken(), { endKm: 1580 })
  assert.equal(finishRes.status, 200)
  const afterFinish = await snapshotHistory(scheduledTrip.id, vehicleId)

  // Todo o histórico anterior ao término permanece byte a byte idêntico.
  assert.deepEqual(afterFinish.readings.slice(0, 3), afterStart.readings)
  assert.deepEqual(afterFinish.events.slice(0, 2), afterStart.events)
  assert.deepEqual(afterFinish.audits.slice(0, 2), afterStart.audits)
  assert.deepEqual(afterFinish.trip?.vehicle_snapshot, beforeStart.trip?.vehicle_snapshot)
  assert.deepEqual(afterFinish.trip?.driver_snapshot, beforeStart.trip?.driver_snapshot)

  const [startReading, endReading] = afterFinish.readings.slice(2)
  assert.equal(startReading?.reading_type, 'START')
  assert.equal(startReading?.odometer_km, 1500)
  assert.equal(startReading?.registered_by, driverUser.id)
  assert.equal(startReading?.reason, 'Início da viagem')
  assert.equal((startReading?.actor_snapshot as { role?: string })?.role, 'MOTORISTA')
  assert.equal(endReading?.reading_type, 'END')
  assert.equal(endReading?.odometer_km, 1580)
  assert.equal(endReading?.registered_by, driverUser.id)
  assert.equal(endReading?.reason, 'Término da viagem')

  const [, startedEvent, finishedEvent] = afterFinish.events
  assert.equal(startedEvent?.event_type, 'STARTED')
  assert.equal((startedEvent?.before_state as { status?: string })?.status, 'SCHEDULED')
  assert.equal((startedEvent?.after_state as { status?: string; startKm?: number })?.status, 'IN_PROGRESS')
  assert.equal((startedEvent?.after_state as { startKm?: number })?.startKm, 1500)
  assert.equal(finishedEvent?.event_type, 'FINISHED')
  assert.equal((finishedEvent?.before_state as { status?: string; startKm?: number })?.status, 'IN_PROGRESS')
  assert.equal((finishedEvent?.after_state as { status?: string; endKm?: number })?.status, 'FINISHED')
  assert.equal((finishedEvent?.after_state as { endKm?: number })?.endKm, 1580)

  const [, startAudit, finishAudit] = afterFinish.audits
  assert.equal(startAudit?.operation, 'STATUS_CHANGE')
  assert.deepEqual(startAudit?.before, { status: 'SCHEDULED', startKm: null, endKm: null, revision: 1 })
  assert.equal((startAudit?.after as { status?: string; startKm?: number; revision?: number })?.status, 'IN_PROGRESS')
  assert.equal((startAudit?.after as { startKm?: number })?.startKm, 1500)
  assert.equal(finishAudit?.operation, 'STATUS_CHANGE')
  assert.deepEqual(finishAudit?.before, { status: 'IN_PROGRESS', startKm: 1500, endKm: null, revision: 2 })
  assert.equal((finishAudit?.after as { status?: string; endKm?: number; revision?: number })?.status, 'FINISHED')
  assert.equal((finishAudit?.after as { endKm?: number })?.endKm, 1580)

  // Sai da listagem de pendentes do motorista, mas permanece íntegra no banco.
  const mineAfterFinish = (await (await call('GET', '/trips/mine', driverToken())).json()) as DriverTrip[]
  assert.deepEqual(mineAfterFinish, [])
  assert.equal(afterFinish.trip?.status, 'FINISHED')
  assert.equal(afterFinish.trip?.start_km, 1500)
  assert.equal(afterFinish.trip?.end_km, 1580)
  assert.equal(afterFinish.trip?.revision, 3)
})

test('IT-EXECUTION-09: envios concorrentes e repetidos produzem uma única transição, uma leitura e um evento/auditoria por ato', async () => {
  const { tripId, vehicleId } = await scenario()
  const startResponses = await Promise.all([
    call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 }),
    call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1505 }),
  ])
  assert.deepEqual(startResponses.map((res) => res.status).sort(), [200, 409])
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1510 })).status, 409)

  const afterStart = await snapshotHistory(tripId, vehicleId)
  assert.equal(afterStart.readings.length, 1)
  assert.equal(afterStart.events.length, 1)
  assert.equal(afterStart.audits.length, 1)
  assert.equal(afterStart.trip?.revision, 2)

  const finishResponses = await Promise.all([
    call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1580 }),
    call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1590 }),
  ])
  assert.deepEqual(finishResponses.map((res) => res.status).sort(), [200, 409])
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1600 })).status, 409)

  const afterFinish = await snapshotHistory(tripId, vehicleId)
  assert.equal(afterFinish.readings.length, 2)
  assert.equal(afterFinish.events.length, 2)
  assert.equal(afterFinish.audits.length, 2)
  assert.equal(afterFinish.trip?.revision, 3)
  assert.deepEqual(afterFinish.readings[0], afterStart.readings[0], 'leitura START não foi alterada')
  assert.deepEqual(afterFinish.events[0], afterStart.events[0], 'evento STARTED não foi alterado')
  assert.deepEqual(afterFinish.audits[0], afterStart.audits[0], 'auditoria do início não foi alterada')
})

test('IT-EXECUTION-10: atomicidade reverte estado, revisão, leitura e evento se a auditoria falhar, e rejeições 403/409/422 não geram rastros', async () => {
  const { tripId, vehicleId, otherDriverToken } = await scenario()
  const initial = await snapshotHistory(tripId, vehicleId)

  // Rejeições 403, 409 e 422 antes do início deixam tudo intacto.
  assert.equal((await call('POST', `/trips/${tripId}/start`, otherDriverToken, { startKm: 1500 })).status, 403)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1500 })).status, 409)
  assert.deepEqual(await snapshotHistory(tripId, vehicleId), initial)

  // Falha na auditoria durante startTrip reverte trip.trips, odometer_readings e trip_events.
  const failingAudit: AuditLogger = {
    async recordAudit() {
      throw new Error('Falha simulada na gravação de auditoria')
    },
  }
  const failingService = new TripsService(
    new TripsRepository(pool),
    new AvailabilityService(new AvailabilityRepository(pool)),
    failingAudit,
    new FuelingsRepository(pool),
  )
  await assert.rejects(
    failingService.startTrip(tripId, { startKm: 1500 }, getUser('MOTORISTA').id),
    /Falha simulada na gravação de auditoria/,
  )
  assert.deepEqual(await snapshotHistory(tripId, vehicleId), initial, 'rollback integral do início')

  // Início válido; em seguida, rejeição 422 e falha de auditoria no término preservam o histórico do início.
  assert.equal((await call('POST', `/trips/${tripId}/start`, driverToken(), { startKm: 1500 })).status, 200)
  const afterStart = await snapshotHistory(tripId, vehicleId)
  assert.equal((await call('POST', `/trips/${tripId}/finish`, driverToken(), { endKm: 1499 })).status, 422)
  assert.deepEqual(await snapshotHistory(tripId, vehicleId), afterStart)

  await assert.rejects(
    failingService.finishTrip(tripId, { endKm: 1580 }, getUser('MOTORISTA').id),
    /Falha simulada na gravação de auditoria/,
  )
  assert.deepEqual(await snapshotHistory(tripId, vehicleId), afterStart, 'rollback integral do término')
})
