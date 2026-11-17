import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { ReportRegistry } from '../src/services/reports/report-registry'
import { ReportsRepository } from '../src/repositories/reports.repository'
import type { ReportPreviewResult, ReportPrintPayload } from '../src/types/report.types'
import type { UserRole } from '../src/types/auth'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import { FICTITIOUS_CPFS, insertDriver, insertRequest, insertService, insertTrip, insertVehicle } from './fixtures/scheduling.fixture'
import { insertLegacySvo } from './fixtures/svo-occurrences.fixture'
import { insertLegacySvoOrder, insertSvoTeam } from './fixtures/svo-orders.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
const period = 'from=2026-11-01&to=2026-11-30'
async function api(path: string, role: UserRole | null = 'ADMINISTRADOR'): Promise<Response> {
  return fetch(baseUrl + path, { headers: role ? { Authorization: `Bearer ${users.get(role)!.token}` } : {} })
}
async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json() as T
  assert.equal(response.status, status, JSON.stringify(body))
  return body
}
before(async () => {
  await setupTestDatabase(); pool = getTestPool()
  assert.match((await pool.query<{ name: string }>('SELECT current_database() AS name')).rows[0]!.name, /test/i)
  await truncateTestDatabase(); await seedRolesAndPermissions(pool); users = await seedRbacTestUsers(pool)
  const adminId = users.get('ADMINISTRADOR')!.id
  const vehicleId = await insertVehicle(pool, 'QAF1A32')
  const driverId = await insertDriver(pool, 'Motorista Fictício Relatórios', FICTITIOUS_CPFS[0], '2027-01-01')
  await pool.query("UPDATE fleet.drivers SET cnh_number = 'CNH-FICTICIA-132' WHERE id = $1", [driverId])
  const serviceId = await insertService(pool, 'Serviço Fictício Relatórios')
  const requestId = await insertRequest(pool, users.get('SOLICITANTE')!.id, serviceId)
  await pool.query(`UPDATE trip.requests SET requested_date = '2026-11-01', requester_snapshot = $2::jsonb, service_snapshot = $3::jsonb WHERE id = $1`,
    [requestId, JSON.stringify({ name: 'Solicitante Histórico Fictício' }), JSON.stringify({ name: 'Serviço Histórico Fictício' })])
  const tripId = await insertTrip(pool, { requestId, vehicleId, driverId, start: '2026-11-01T12:00:00Z', end: '2026-11-01T14:00:00Z', status: 'FINISHED' })
  await pool.query(`UPDATE trip.trips SET start_km = 100, end_km = 250, vehicle_snapshot = $2::jsonb, driver_snapshot = $3::jsonb WHERE id = $1`,
    [tripId, JSON.stringify({ licensePlate: 'HIS1A32' }), JSON.stringify({ name: 'Motorista Histórico Fictício' })])
  await pool.query(`INSERT INTO fleet.fuelings (vehicle_id, driver_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by, vehicle_snapshot)
    SELECT $1, $2, '2026-11-01T12:00:00Z', 'DIESEL', 10, 60, 1000 + n, $3, $4::jsonb FROM generate_series(1,55) n`,
    [vehicleId, driverId, adminId, JSON.stringify({ licensePlate: 'HIS1A32' })])
  const original = await pool.query<{ id: string }>(`INSERT INTO fleet.fuelings (vehicle_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by)
    VALUES ($1,'2026-11-01T03:00:00Z','DIESEL',999,999,2000,$2) RETURNING id::text`, [vehicleId, adminId])
  await pool.query(`INSERT INTO fleet.fuelings (vehicle_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by, supersedes_id)
    VALUES ($1,'2026-11-02T02:59:59Z','DIESEL',20,120,2000,$2,$3)`, [vehicleId, adminId, original.rows[0]!.id])
  await pool.query(`INSERT INTO fleet.fuelings (vehicle_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by, is_annulled, annulment_reason)
    VALUES ($1,'2026-11-01T12:00:00Z','DIESEL',999,999,2000,$2,true,'Anulação fictícia')`, [vehicleId, adminId])
  // UTC 02:59 do dia inicial ainda pertence ao dia civil anterior e fica fora.
  await pool.query(`INSERT INTO fleet.fuelings (vehicle_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by)
    VALUES ($1,'2026-11-01T02:59:59Z','ETHANOL',777,777,2000,$2)`, [vehicleId, adminId])
  await pool.query(`INSERT INTO fleet.vehicle_documents (vehicle_id, document_type, document_number, expires_at, created_by)
    VALUES ($1,'CRLV','DOC-FICTICIO','2026-11-25',$2)`, [vehicleId, adminId])
  await pool.query(`INSERT INTO fleet.fines (vehicle_id, driver_id, infraction_at, infraction_code, description, amount, created_by)
    VALUES ($1,$2,'2026-11-01T12:00:00Z','QA-001','Infração fictícia',123.45,$3)`, [vehicleId, driverId, adminId])
  await pool.query(`INSERT INTO fleet.maintenance_orders (vehicle_id, type, description, opened_at, status, cost, created_by, estimate_items)
    VALUES ($1,'PREVENTIVE','Manutenção fictícia','2026-11-01T12:00:00Z','DONE',150.25,$2,$3::jsonb)`,
    [vehicleId, adminId, JSON.stringify([{ kind: 'PART', description: 'Peça fictícia', quantity: '2.500', unitPrice: '10.01' }, { kind: 'LABOR', description: 'Serviço fictício', amount: '50.00' }])])
  const occurrenceId = await insertLegacySvo(pool, users.get('ATENDENTE_SVO')!.id, 'CONFIRMED', '2026-11-01T12:00:00Z')
  const teamId = await insertSvoTeam(pool)
  const orderId = await insertLegacySvoOrder(pool, { occurrenceId, teamId, vehicleId, actorId: adminId, status: 'OPEN' })
  await pool.query("UPDATE svo.execution_orders SET opened_at = '2026-11-01T12:00:00Z' WHERE id = $1", [orderId])
  server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG }).listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await closeTestPool() })

for (const definition of new ReportRegistry().forRole('ADMINISTRADOR')) test(`PostgreSQL: ${definition.key} executa prévia, CSV e impressão`, async () => {
  const query = definition.period.required ? period : ''
  const preview = await json<ReportPreviewResult>(await api(`/reports/${definition.key}/preview?${query}`))
  assert.ok(preview.totalCount > 0)
  assert.ok(preview.rows.length <= 50)
  assert.deepEqual(Object.keys(preview.rows[0]!), preview.columns.map(column => column.key))
  assert.doesNotMatch(JSON.stringify(preview), /password_hash|SENTINELA_NOME|SENTINELA_TELEFONE|SENTINELA_DESCRICAO|12345678909/)
  const csv = await api(`/reports/${definition.key}/export?${query}&format=csv`)
  assert.equal(csv.status, 200)
  const bytes = new Uint8Array(await csv.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191])
  assert.doesNotMatch(new TextDecoder().decode(bytes), /SENTINELA_NOME|SENTINELA_TELEFONE|SENTINELA_DESCRICAO|12345678909/)
  const print = await json<ReportPrintPayload>(await api(`/reports/${definition.key}/export?${query}&format=print`))
  assert.equal(print.rows.length, preview.totalCount)
  assert.equal(print.generatedBy.name, users.get('ADMINISTRADOR')!.name)
  if (definition.key === 'drivers-roster') assert.equal(print.rows[0]!.maskedCpf, '***.456.789-**')
})
test('total global, paginação, retificação e anulação não duplicam litros ou valores', async () => {
  const result = await json<ReportPreviewResult>(await api(`/reports/fleet-fuelings/preview?${period}&columns=licensePlate,liters,isRectified`))
  assert.equal(result.totalCount, 56); assert.equal(result.rows.length, 50); assert.equal(result.totalPages, 2)
  assert.deepEqual(result.totals, { liters: '570.000' })
  assert.equal(result.rows.filter(row => row.isRectified).length, 1)
  assert.equal(result.rows.find(row => row.licensePlate === 'HIS1A32')?.liters, '10.000')
  const second = await json<ReportPreviewResult>(await api(`/reports/fleet-fuelings/preview?${period}&page=2&columns=liters`))
  assert.equal(second.rows.length, 6); assert.equal(second.totals.liters, '570.000')
})
test('fuso civil inclui final do dia e respeita limites semiabertos', async () => {
  const result = await json<ReportPreviewResult>(await api('/reports/fleet-fuelings/preview?from=2026-11-01&to=2026-11-01&columns=liters'))
  assert.equal(result.totalCount, 56); assert.equal(result.totals.liters, '570.000')
})
test('viagens e solicitações preservam o snapshot e manutenção soma os itens com arredondamento monetário', async () => {
  const trips = await json<ReportPreviewResult>(await api(`/reports/trips-executions/preview?${period}`))
  assert.equal(trips.rows[0]!.licensePlate, 'HIS1A32'); assert.equal(trips.totals.distanceKm, '150')
  const requests = await json<ReportPreviewResult>(await api(`/reports/trips-requests/preview?${period}`))
  assert.equal(requests.rows[0]!.requesterName, 'Solicitante Histórico Fictício')
  const orders = await json<ReportPreviewResult>(await api(`/reports/maintenance-orders/preview?${period}`))
  assert.equal(orders.totals.estimatedTotal, '75.03'); assert.equal(orders.totals.finalCost, '150.25')
})
test('todo filtro declarado executa no banco, incluindo situação calculada e configuração de documentos', async () => {
  for (const definition of new ReportRegistry().forRole('ADMINISTRADOR')) {
    for (const filter of definition.filters) {
      const value = filter.options?.[0]?.value ?? 'HIS'
      const query = new URLSearchParams({ from: '2026-11-01', to: '2026-11-30', [filter.key]: value })
      await json(await api(`/reports/${definition.key}/preview?${query}`))
    }
  }
})
test('catálogo e acesso direto aplicam RBAC; JWT ausente e conta desativada são rejeitados', async () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'] as const) {
    const catalog = await json<{ reports: { key: string }[] }[]>(await api('/reports/catalog', role))
    assert.equal(catalog.flatMap(group => group.reports).length, role === 'GESTOR' ? 10 : role === 'ADMINISTRADOR' ? 11 : 2)
  }
  await json(await api('/reports/auth-users/preview', 'GESTOR'), 403)
  await json(await api(`/reports/fleet-fuelings/preview?${period}`, 'ATENDENTE_SVO'), 403)
  for (const role of ['MOTORISTA', 'SOLICITANTE', 'EQUIPE_SVO'] as const) await json(await api('/reports/catalog', role), 403)
  await json(await api('/reports/catalog', null), 401)
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [users.get('MOTORISTA')!.id])
  await json(await api('/reports/catalog', 'MOTORISTA'), 401)
})
test('auditoria preserva emissor, filtros, colunas e contagem e não contém linhas exportadas', async () => {
  await api(`/reports/fleet-fuelings/export?${period}&format=csv&columns=licensePlate,liters&fuelType=DIESEL`)
  const { rows } = await pool.query<{ after: Record<string, unknown>; actor: { name: string } }>(
    `SELECT "after", actor_snapshot AS actor FROM audit.logs WHERE table_name = $1 AND operation = 'EXPORT' ORDER BY id DESC LIMIT 1`, ['reports.fleet-fuelings'])
  assert.equal(rows[0]!.after.rowCount, 56)
  assert.deepEqual(rows[0]!.after.selectedColumns, ['licensePlate', 'liters'])
  assert.deepEqual(rows[0]!.after.filters, { fuelType: 'DIESEL' })
  assert.equal(rows[0]!.actor.name, users.get('ADMINISTRADOR')!.name)
  assert.equal(rows[0]!.after.rows, undefined)
})
test('contagem e linhas mantêm o mesmo snapshot durante inserção concorrente', async () => {
  const repository = new ReportsRepository(pool)
  await repository.withSnapshot(async reader => {
    const before = await reader.executeCountAndTotals('SELECT COUNT(*)::int AS "totalCount" FROM fleet.vehicles', [])
    await insertVehicle(pool, 'QAF9Z32')
    const rows = await reader.executeRows('SELECT id FROM fleet.vehicles ORDER BY id', [])
    assert.equal(rows.length, before.totalCount)
  })
  const after = await repository.executeRows('SELECT id FROM fleet.vehicles ORDER BY id', [])
  assert.equal(after.length, 2)
})
test('índices de período são criados e o rollback permite reaplicação idempotente', async () => {
  const indexNames = ['fleet_fuelings_by_fueled_at', 'fleet_fines_by_infraction_at', 'fleet_maintenance_orders_by_opened_at',
    'trip_requests_by_requested_date', 'trip_trips_by_scheduled_start', 'fleet_drivers_by_cnh_expires_at']
  const count = async () => Number((await pool.query<{ count: string }>('SELECT count(*) FROM pg_indexes WHERE indexname = ANY($1::text[])', [indexNames])).rows[0]!.count)
  const migration = path.resolve(__dirname, '../src/database/migrations/202611160001_add_reports_period_indexes')
  const up = await fs.readFile(migration + '.sql', 'utf8')
  assert.equal(await count(), 6)
  try { await pool.query(await fs.readFile(migration + '.down.sql', 'utf8')); assert.equal(await count(), 0) }
  finally { await pool.query(up) }
  await pool.query(up)
  assert.equal(await count(), 6)
})
