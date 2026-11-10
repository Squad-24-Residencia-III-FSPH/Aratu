import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { TripConfirmation, TripSummary } from '../src/types/trip.types'
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
} from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>
let sequence = 0

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

async function tripWith(status: string, km: { start: number | null; end: number | null }, start = '2099-12-01T08:00:00-03:00'): Promise<string> {
  sequence += 1
  const serviceId = await insertService(pool, `Transporte Fictício QA ${sequence}`)
  const vehicleId = await insertVehicle(pool, `CNF${sequence}A00`)
  const driverId = await insertDriver(pool, `Motorista Fictício ${sequence}`, FICTITIOUS_CPFS[sequence % FICTITIOUS_CPFS.length] ?? FICTITIOUS_CPFS[0])
  const requestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'SCHEDULED')
  const end = new Date(new Date(start).getTime() + 4 * 60 * 60 * 1000).toISOString()
  const tripId = await insertTrip(pool, { requestId, vehicleId, driverId, start, end, status })
  await pool.query('UPDATE trip.trips SET start_km = $2, end_km = $3 WHERE id = $1', [tripId, km.start, km.end])
  return tripId
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
  sequence = 0
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

test('IT-CONFIRMATION-01: viagem FINISHED com evidências → 200 CONFIRMED, com responsável, data, evento e auditoria', async () => {
  const tripId = await tripWith('FINISHED', { start: 1500, end: 1580 })
  const gestor = getUser('GESTOR')
  const before = Date.now()
  const response = await call('POST', `/trips/${tripId}/confirm`)
  assert.equal(response.status, 200)
  const body = (await response.json()) as TripConfirmation
  assert.equal(body.status, 'CONFIRMED')
  assert.equal(body.confirmedBy, gestor.id)
  assert.ok(new Date(body.confirmedAt).getTime() >= before - 1000, 'a data da confirmação vem do servidor')

  const stored = await pool.query('SELECT status, confirmed_by::text AS confirmed_by FROM trip.trips WHERE id = $1', [tripId])
  assert.deepEqual(stored.rows[0], { status: 'CONFIRMED', confirmed_by: gestor.id })
  const events = await pool.query('SELECT event_type, reason FROM trip.trip_events WHERE trip_id = $1', [tripId])
  assert.deepEqual(events.rows, [{ event_type: 'CONFIRMED', reason: 'Viagem confirmada' }])
  const audits = await pool.query(`SELECT 1 FROM audit.logs WHERE table_name = 'trip.trips' AND record_id = $1`, [tripId])
  assert.equal(audits.rowCount, 1)
})

test('IT-CONFIRMATION-02: viagem em outro status → 409', async () => {
  for (const status of ['SCHEDULED', 'IN_PROGRESS', 'CANCELED']) {
    const tripId = await tripWith(status, { start: status === 'SCHEDULED' ? null : 1500, end: null })
    assert.equal((await call('POST', `/trips/${tripId}/confirm`)).status, 409, status)
  }
})

test('IT-CONFIRMATION-03: viagem sem evidências obrigatórias → 422', async () => {
  const tripId = await tripWith('FINISHED', { start: null, end: null })
  const response = await call('POST', `/trips/${tripId}/confirm`)
  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), { erro: 'Viagem sem evidências do odômetro não pode ser confirmada' })
  const stored = await pool.query('SELECT status, confirmed_by FROM trip.trips WHERE id = $1', [tripId])
  assert.deepEqual(stored.rows[0], { status: 'FINISHED', confirmed_by: null })
})

test('IT-CONFIRMATION-04: confirmar duas vezes → 409, inclusive em simultâneo', async () => {
  const tripId = await tripWith('FINISHED', { start: 1500, end: 1580 })
  assert.equal((await call('POST', `/trips/${tripId}/confirm`)).status, 200)
  assert.equal((await call('POST', `/trips/${tripId}/confirm`)).status, 409)

  const concurrent = await tripWith('FINISHED', { start: 2000, end: 2050 })
  const responses = await Promise.all([call('POST', `/trips/${concurrent}/confirm`), call('POST', `/trips/${concurrent}/confirm`)])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  const events = await pool.query(`SELECT count(*)::int AS total FROM trip.trip_events WHERE trip_id = $1`, [concurrent])
  assert.equal(events.rows[0]?.total, 1)
})

test('IT-CONFIRMATION-05: perfil diferente de GESTOR → 403; sem token → 401', async () => {
  const tripId = await tripWith('FINISHED', { start: 1500, end: 1580 })
  for (const role of ['ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await call('POST', `/trips/${tripId}/confirm`, role)).status, 403, role)
    assert.equal((await call('GET', '/trips?status=FINISHED', role)).status, 403, role)
  }
  assert.equal((await call('POST', `/trips/${tripId}/confirm`, null)).status, 401)
})

test('IT-CONFIRMATION-06: listagem de conferência filtra por status e período agendado', async () => {
  const finishedInRange = await tripWith('FINISHED', { start: 1500, end: 1580 }, '2099-12-10T08:00:00-03:00')
  await tripWith('FINISHED', { start: 1600, end: 1650 }, '2099-11-10T08:00:00-03:00')
  await tripWith('SCHEDULED', { start: null, end: null }, '2099-12-11T08:00:00-03:00')

  const response = await call('GET', '/trips?status=FINISHED&from=2099-12-01&to=2099-12-31')
  assert.equal(response.status, 200)
  const trips = (await response.json()) as TripSummary[]
  assert.deepEqual(trips.map((item) => [item.id, item.status, item.startKm, item.endKm]), [[finishedInRange, 'FINISHED', 1500, 1580]])
  assert.equal(trips[0]?.destination, 'Unidade fictícia')

  const lastDay = (await (await call('GET', '/trips?from=2099-12-10&to=2099-12-10')).json()) as TripSummary[]
  assert.deepEqual(lastDay.map((item) => item.id), [finishedInRange])
  assert.equal((await call('GET', '/trips?status=FINALIZADA')).status, 400)
  assert.equal((await call('GET', '/trips?from=2099-12-31&to=2099-12-01')).status, 400)
})
