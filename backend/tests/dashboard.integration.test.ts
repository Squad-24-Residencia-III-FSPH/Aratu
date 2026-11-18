import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { DashboardIndicators, DashboardSummary } from '../src/types/dashboard.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, RBAC_JWT_SECRET, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import { FICTITIOUS_CPFS, insertDriver, insertRequest, insertService, insertTrip, insertVehicle } from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const PERIOD = 'from=2099-11-01&to=2099-12-01'

interface Dataset { v1: string; v2: string; svo1: string; svo2: string }

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

async function get<T>(path: string, role: UserRole | null = 'GESTOR'): Promise<{ status: number; body: T; ms: number }> {
  const started = Date.now()
  const response = await fetch(`${baseUrl}${path}`, { headers: role ? { Authorization: `Bearer ${getUser(role).token}` } : {} })
  return { status: response.status, body: (await response.json()) as T, ms: Date.now() - started }
}

async function trip(vehicleId: string, driverId: string, serviceId: string, status: string, km: [number | null, number | null], finishedAt: string | null): Promise<void> {
  const requestId = await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'SCHEDULED')
  const tripId = await insertTrip(pool, { requestId, vehicleId, driverId, start: '2099-10-01T08:00:00-03:00', end: '2099-10-01T12:00:00-03:00', status })
  await pool.query(
    `UPDATE trip.trips SET start_km = $2, end_km = $3,
            started_at = CASE WHEN $2::int IS NULL THEN NULL ELSE COALESCE($4::timestamptz, clock_timestamp()) - interval '1 hour' END,
            finished_at = $4::timestamptz
      WHERE id = $1`,
    [tripId, km[0], km[1], finishedAt],
  )
}

async function fueling(vehicleId: string, liters: number, value: number, fueledAt: string, options: { annulled?: boolean; supersedes?: string } = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.fuelings (vehicle_id, fuel_type, liters, total_value, odometer_km, fueled_at, created_by, is_annulled, annulment_reason, supersedes_id)
     VALUES ($1, 'GASOLINE', $2, $3, 1000, $4, $5, $6, CASE WHEN $6 THEN 'Lançamento duplicado' END, $7) RETURNING id::text AS id`,
    [vehicleId, liters, value, fueledAt, getUser('GESTOR').id, options.annulled ?? false, options.supersedes ?? null],
  )
  return String(result.rows[0]?.id)
}

async function maintenance(vehicleId: string, status: string, cost: number | null, closedAt: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO fleet.maintenance_orders (vehicle_id, type, description, status, cost, opened_at, closed_at, created_by)
     VALUES ($1, 'CORRECTIVE', 'Manutenção fictícia', $2, $3, '2099-10-01T08:00:00-03:00', $4, $5)`,
    [vehicleId, status, cost, closedAt, getUser('GESTOR').id],
  )
}

async function document(vehicleId: string, daysFromToday: number, options: { annulled?: boolean; supersedes?: string } = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicle_documents (vehicle_id, document_type, expires_at, created_by, is_annulled, annulment_reason, supersedes_id)
     VALUES ($1, 'CRLV', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Maceio')::date + $2::int, $3, $4, CASE WHEN $4 THEN 'Cadastro indevido' END, $5)
     RETURNING id::text AS id`,
    [vehicleId, daysFromToday, getUser('GESTOR').id, options.annulled ?? false, options.supersedes ?? null],
  )
  return String(result.rows[0]?.id)
}

async function svoOrder(teamId: string, vehicleId: string, status: string, receivedAt: string, openedAt: string, collectedAt: string | null): Promise<void> {
  const occurrence = await pool.query<{ id: string }>(
    `INSERT INTO svo.occurrences (attendant_id, requester_name, requester_phone, requester_type, location, description, status, received_at, triaged_at, triaged_by)
     VALUES ($1, 'Solicitante Fictício', '(79) 90000-0000', 'HOSPITAL', 'Local fictício', 'Ocorrência fictícia', 'CONFIRMED', $2, $2, $1)
     RETURNING id::text AS id`,
    [getUser('ATENDENTE_SVO').id, receivedAt],
  )
  await pool.query(
    `INSERT INTO svo.execution_orders (occurrence_id, team_id, vehicle_id, status, opened_at, collected_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [occurrence.rows[0]?.id, teamId, vehicleId, status, openedAt, collectedAt, getUser('GESTOR').id],
  )
}

/**
 * Massa conhecida (novembro/2099, `to` excluído):
 * - DSH1A11: viagens T6 (00:00 de 01/11, entra), T1 e T2 (23:59:59 de 30/11, entra) = 3 viagens, 100+100+50 = 250 km;
 *   T3 termina 00:00 de 01/12 (fora), em andamento e cancelada não contam; abastecimentos vigentes 20 L/R$ 120 e 16 L/R$ 96
 *   (anulado e retificado não contam, o de 01/12 fica fora) → 36 L, R$ 216, 250/36 = 6,94 km/L.
 * - DSH2B22 (em manutenção): 1 viagem confirmada de 60 km, sem abastecimento (consumo nulo), manutenção DONE de R$ 500 no período.
 * - Totais: 4 viagens, 310 km, 36 L, R$ 216, 310/36 = 8,61 km/L, manutenção R$ 500.
 */
async function dataset(): Promise<Dataset> {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const v1 = await insertVehicle(pool, 'DSH1A11')
  const v2 = await insertVehicle(pool, 'DSH2B22', 'IN_MAINTENANCE')
  await insertVehicle(pool, 'DSH3C33', 'INACTIVE')
  const svo1 = await insertVehicle(pool, 'SVO1A11')
  const svo2 = await insertVehicle(pool, 'SVO2B22')
  await pool.query(`UPDATE fleet.vehicles SET operation_type = 'SVO' WHERE id = ANY($1::bigint[])`, [[svo1, svo2]])
  const d1 = await insertDriver(pool, 'Motorista Dashboard A', FICTITIOUS_CPFS[0])
  const d2 = await insertDriver(pool, 'Motorista Dashboard B', FICTITIOUS_CPFS[1])

  await trip(v1, d1, serviceId, 'FINISHED', [900, 1000], '2099-11-01T00:00:00-03:00')
  await trip(v1, d1, serviceId, 'CONFIRMED', [1000, 1100], '2099-11-05T10:00:00-03:00')
  await trip(v1, d1, serviceId, 'FINISHED', [1100, 1150], '2099-11-30T23:59:59-03:00')
  await trip(v1, d1, serviceId, 'FINISHED', [1150, 1300], '2099-12-01T00:00:00-03:00')
  await trip(v1, d1, serviceId, 'IN_PROGRESS', [1300, null], null)
  await trip(v1, d2, serviceId, 'CANCELED', [null, null], null)
  await trip(v2, d2, serviceId, 'CONFIRMED', [500, 560], '2099-11-10T15:00:00-03:00')

  await fueling(v1, 20, 120, '2099-11-03T09:00:00-03:00')
  await fueling(v1, 10, 60, '2099-11-20T09:00:00-03:00', { annulled: true })
  const original = await fueling(v1, 15, 90, '2099-11-21T09:00:00-03:00')
  await fueling(v1, 16, 96, '2099-11-21T09:00:00-03:00', { supersedes: original })
  await fueling(v1, 5, 30, '2099-12-01T00:00:00-03:00')

  await maintenance(v2, 'DONE', 500, '2099-11-15T17:00:00-03:00')
  await maintenance(v2, 'DONE', 300, '2099-12-02T17:00:00-03:00')
  await maintenance(v1, 'OPEN', null, null)
  await maintenance(v1, 'DONE', null, '2099-11-16T17:00:00-03:00')

  await document(v1, 10)
  await document(v1, -5)
  await document(v1, 100)
  await document(v1, 3, { annulled: true })
  const renewed = await document(v1, 5)
  await document(v1, 400, { supersedes: renewed })

  await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'PENDING')
  await insertRequest(pool, getUser('SOLICITANTE').id, serviceId, 'PENDING')

  const team = await pool.query<{ id: string }>(`INSERT INTO svo.teams (name) VALUES ('Equipe Fictícia QA') RETURNING id::text AS id`)
  const teamId = String(team.rows[0]?.id)
  await svoOrder(teamId, svo1, 'IN_TRANSIT', '2099-11-10T07:30:00-03:00', '2099-11-10T08:00:00-03:00', null)
  await svoOrder(teamId, svo2, 'COMPLETED', '2099-11-12T08:00:00-03:00', '2099-11-12T09:00:00-03:00', '2099-11-12T09:30:00-03:00')
  await svoOrder(teamId, svo2, 'COMPLETED', '2099-11-20T09:45:00-03:00', '2099-11-20T10:00:00-03:00', '2099-11-20T10:15:00-03:00')
  await svoOrder(teamId, svo2, 'COMPLETED', '2099-12-05T09:00:00-03:00', '2099-12-05T09:10:00-03:00', '2099-12-05T09:40:00-03:00')
  return { v1, v2, svo1, svo2 }
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

test('IT-DASHBOARD-01: indicadores por veículo batem com os valores calculados à mão', async () => {
  const data = await dataset()
  const { status, body } = await get<DashboardIndicators>(`/dashboard/indicators?${PERIOD}`)
  assert.equal(status, 200)
  assert.deepEqual(body.period, { from: '2099-11-01', to: '2099-12-01' })
  assert.deepEqual(body.vehicles, [
    { vehicleId: data.v1, licensePlate: 'DSH1A11', tripsCount: 3, kmDriven: 250, litersFueled: 36, fuelCost: 216, averageConsumptionKmPerLiter: 6.94, maintenanceCost: 0 },
    { vehicleId: data.v2, licensePlate: 'DSH2B22', tripsCount: 1, kmDriven: 60, litersFueled: 0, fuelCost: 0, averageConsumptionKmPerLiter: null, maintenanceCost: 500 },
    { vehicleId: data.svo1, licensePlate: 'SVO1A11', tripsCount: 0, kmDriven: 0, litersFueled: 0, fuelCost: 0, averageConsumptionKmPerLiter: null, maintenanceCost: 0 },
    { vehicleId: data.svo2, licensePlate: 'SVO2B22', tripsCount: 0, kmDriven: 0, litersFueled: 0, fuelCost: 0, averageConsumptionKmPerLiter: null, maintenanceCost: 0 },
  ])
  assert.deepEqual(body.totals, { tripsCount: 4, kmDriven: 310, litersFueled: 36, fuelCost: 216, averageConsumptionKmPerLiter: 8.61, maintenanceCost: 500 })
  assert.deepEqual(body.pendingValidation, ['averageConsumptionKmPerLiter', 'svo.averageMinutesToCollection'])
})

test('IT-DASHBOARD-02: viagem em andamento (km final nulo) não entra no km nem na média', async () => {
  const data = await dataset()
  const { body } = await get<DashboardIndicators>(`/dashboard/indicators?${PERIOD}&vehicleId=${data.v1}`)
  assert.equal(body.vehicles.length, 1)
  assert.equal(body.vehicles[0]?.tripsCount, 3)
  assert.equal(body.vehicles[0]?.kmDriven, 250)
  assert.equal(body.totals.averageConsumptionKmPerLiter, 6.94)
})

test('IT-DASHBOARD-03: o período inclui o início e exclui o fim', async () => {
  const data = await dataset()
  const novemberFirstOnly = await get<DashboardIndicators>(`/dashboard/indicators?from=2099-11-01&to=2099-11-02&vehicleId=${data.v1}`)
  assert.equal(novemberFirstOnly.body.vehicles[0]?.tripsCount, 1, 'viagem às 00:00 do início entra')
  const decemberFirstOnly = await get<DashboardIndicators>(`/dashboard/indicators?from=2099-12-01&to=2099-12-02&vehicleId=${data.v1}`)
  assert.deepEqual([decemberFirstOnly.body.vehicles[0]?.tripsCount, decemberFirstOnly.body.vehicles[0]?.litersFueled], [1, 5], 'fatos às 00:00 do fim pertencem ao período seguinte')
})

test('IT-DASHBOARD-04: período ou veículo inválido → 400 com { erro }; veículo inexistente → 404', async () => {
  for (const query of ['', 'from=2099-11-01', 'from=2099-12-01&to=2099-11-01', 'from=2099-11-01&to=2099-11-01', 'from=2099-02-30&to=2099-03-10', 'from=2098-01-01&to=2099-01-03', 'from=01/11/2099&to=2099-12-01', `${PERIOD}&vehicleId=abc`]) {
    const response = await get<{ erro?: string }>(`/dashboard/indicators?${query}`)
    assert.equal(response.status, 400, query)
    assert.equal(typeof response.body.erro, 'string')
  }
  assert.equal((await get(`/dashboard/indicators?${PERIOD}&vehicleId=999999`)).status, 404)
})

test('IT-DASHBOARD-05: cards de situação atual (frota, pendências e documentos vigentes)', async () => {
  await dataset()
  const { status, body } = await get<DashboardSummary>('/dashboard/summary', 'ADMINISTRADOR')
  assert.equal(status, 200)
  assert.deepEqual(body.fleet, { available: 3, inMaintenance: 1, inactive: 1, total: 5 })
  assert.equal(body.pendingRequests, 2)
  assert.equal(body.tripsToConfirm, 3)
  assert.deepEqual(body.documents, { expiring: 1, expired: 1, alertDays: 30 })
})

test('IT-DASHBOARD-06: indicadores do SVO (ordens, ocupação e tempo até a coleta)', async () => {
  await dataset()
  const summary = await get<DashboardSummary>('/dashboard/summary')
  assert.deepEqual(summary.body.svo, { ordersInProgress: 1, vehicles: { total: 2, busy: 1, occupancyRate: 50 } })
  const indicators = await get<DashboardIndicators>(`/dashboard/indicators?${PERIOD}`)
  assert.deepEqual(indicators.body.svo, { ordersOpened: 3, ordersCollected: 2, averageMinutesToCollection: 60 })
})

test('IT-DASHBOARD-07: só GESTOR e ADMINISTRADOR acessam; demais perfis 403 e sem token 401', async () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    assert.equal((await get(`/dashboard/indicators?${PERIOD}`, role)).status, 200, role)
  }
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await get('/dashboard/summary', role)).status, 403, role)
    assert.equal((await get(`/dashboard/indicators?${PERIOD}`, role)).status, 403, role)
  }
  assert.equal((await get('/dashboard/summary', null)).status, 401)
})

test('IT-DASHBOARD-08: respostas em até 2s com volume de dados acima do seed', async () => {
  const data = await dataset()
  await pool.query(
    `WITH requests AS (
       INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, status)
       SELECT $1, (SELECT id FROM fleet.services LIMIT 1), '2098-06-01', '08:00', 'Sede', 'Unidade', 'Carga de teste', 'SCHEDULED'
         FROM generate_series(1, 3000)
       RETURNING id
     )
     INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status, start_km, end_km, started_at, finished_at)
     SELECT r.id, $2, (SELECT id FROM fleet.drivers LIMIT 1), '2098-06-01T08:00:00-03:00', '2098-06-01T12:00:00-03:00',
            'CONFIRMED', 1, 2, '2098-06-01T08:00:00-03:00', '2098-06-01T12:00:00-03:00'
       FROM requests r`,
    [getUser('SOLICITANTE').id, data.v2],
  )
  await pool.query(
    `INSERT INTO fleet.fuelings (vehicle_id, fuel_type, liters, total_value, odometer_km, fueled_at, created_by)
     SELECT $1, 'DIESEL', 10, 50, 1000, timestamptz '2098-01-01T00:00:00Z' + (g * interval '1 hour'), $2
       FROM generate_series(1, 3000) g`,
    [data.v2, getUser('GESTOR').id],
  )
  const summary = await get('/dashboard/summary')
  const indicators = await get(`/dashboard/indicators?${PERIOD}`)
  assert.equal(summary.status, 200)
  assert.equal(indicators.status, 200)
  assert.ok(summary.ms < 2000, `summary levou ${summary.ms} ms`)
  assert.ok(indicators.ms < 2000, `indicators levou ${indicators.ms} ms`)
})
