import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { FinesRepository } from '../src/repositories/fines.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { DriversRepository } from '../src/repositories/drivers.repository'
import { UsersRepository } from '../src/repositories/users.repository'
import { AuditService } from '../src/services/audit.service'
import { FinesService } from '../src/services/fines.service'
import type { UserRole } from '../src/types/auth'
import type { Fine, FineDetail, FineDriverSuggestion } from '../src/types/fine.types'
import type { Vehicle } from '../src/types/vehicle.types'
import type { Driver } from '../src/types/driver.types'
import { closeTestPool, getTestPool, getTestDatabaseUrl, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, seedRbacTestUsers, generateRbacUserToken } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
let failAudit = false
let vehicleSequence = 0
const at = '2026-11-01T14:00:00.000Z'
const end = '2026-11-01T15:00:00.000Z'
const source = { reportedBy: 'Protocolo Fictício QA', reason: 'Registro fictício de notificação', evidenceDescription: 'Documento sintético QA' }
type Options = { body?: unknown; role?: UserRole | null; key?: string; token?: string }
async function api(route: string, method = 'GET', options: Options = {}): Promise<Response> {
  const role = options.role === undefined ? 'GESTOR' : options.role
  const token = options.token ?? (role ? users.get(role)!.token : undefined)
  return fetch(`${baseUrl}${route}`, { method, headers: { 'Content-Type': 'application/json',
    'Idempotency-Key': options.key ?? randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
}
async function json<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body as T
}
async function error(response: Response, status: number): Promise<void> {
  const body = await json<{ erro: string }>(response, status)
  assert.deepEqual(Object.keys(body), ['erro'])
  assert.equal(typeof body.erro, 'string')
  assert.doesNotMatch(body.erro, /SELECT|INSERT|UPDATE|stack|postgres|example\.test|at \w+\./i)
}
async function vehicle(): Promise<Vehicle> {
  return json(await api('/vehicles', 'POST', { body: { ...source, licensePlate: `QAT${++vehicleSequence}A73`,
    brand: 'Marca Fictícia', model: 'Modelo Fictício QA', year: 2024, vehicleType: 'VAN', ownership: 'OWNED',
    categories: ['PASSENGER'], seats: 8, bodyLimit: 0, weightLimit: null, operationType: 'ADMINISTRATIVE' } }), 201)
}
async function driver(): Promise<Driver> {
  return json(await api('/drivers', 'POST', { body: { ...source, name: 'Motorista Fictício QA 01', cpf: '52998224725',
    cnhNumber: '12345678901', cnhCategory: 'B', cnhExpiresAt: '2035-01-01' } }), 201)
}
function registration(vehicleId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...source, vehicleId, infractionAt: at, infractionCode: 'QA-001', description: 'Infração fictícia QA', amount: '195.23', ...overrides }
}
async function create(vehicleId: string, overrides: Record<string, unknown> = {}, key?: string): Promise<Fine> {
  return json(await api('/fines', 'POST', { body: registration(vehicleId, overrides), ...(key ? { key } : {}) }), 201)
}
async function update(fine: Fine, overrides: Record<string, unknown>): Promise<Fine> {
  return json(await api(`/fines/${fine.id}`, 'PUT', { body: { ...source, expectedRevision: fine.revision, occurredAt: end, ...overrides } }))
}
async function status(fine: Fine, next: string): Promise<Fine> {
  return json(await api(`/fines/${fine.id}/status`, 'PATCH', { body: { ...source, expectedRevision: fine.revision,
    status: next, ...(next === 'PAID' ? { paidAt: end } : { occurredAt: end }) } }))
}
async function detail(id: string): Promise<FineDetail> { return json(await api(`/fines/${id}`)) }
/** Comprova efeitos nas três tabelas, incluindo a chave e os snapshots internos. */
async function ledger() {
  const [fines, events, audits] = await Promise.all([
    pool.query('SELECT id, vehicle_id, driver_id, trip_id, infraction_at, amount, status, paid_at, cancellation_reason, revision, creation_key, vehicle_snapshot, driver_snapshot, trip_snapshot FROM fleet.fines ORDER BY id'),
    pool.query('SELECT id, fine_id, event_type, before_state, after_state, actor_snapshot, supersedes_id FROM fleet.fine_events ORDER BY id'),
    pool.query("SELECT id, record_id, operation, before, after, actor_snapshot FROM audit.logs WHERE table_name = 'fleet.fines' ORDER BY id"),
  ])
  return [fines.rows, events.rows, audits.rows]
}
async function trip(vehicleId: string, driverId: string, overrides: { status?: string; start?: string | null; finish?: string | null; snapshots?: boolean } = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(`WITH service AS (
    INSERT INTO fleet.services (name, categories) VALUES ($1, ARRAY['PASSENGER']::text[]) RETURNING id
  ), request AS (
    INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose)
    SELECT $2, service.id, '2026-11-01', '14:00', 'Origem fictícia', 'Destino fictício', 'Viagem fictícia QA' FROM service RETURNING id
  ) INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status,
    started_at, finished_at, vehicle_snapshot, driver_snapshot)
    SELECT request.id, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb FROM request RETURNING id::text AS id`,
  [`Serviço fictício ${randomUUID()}`, users.get('SOLICITANTE')!.id, vehicleId, driverId, at, end,
    overrides.status ?? 'FINISHED', overrides.start === undefined ? at : overrides.start,
    overrides.finish === undefined ? end : overrides.finish,
    overrides.snapshots ? JSON.stringify({ licensePlate: 'QAH1A73', model: 'Modelo histórico', privateField: 'restrito' }) : null,
    overrides.snapshots ? JSON.stringify({ name: 'Motorista Fictício Histórico QA', cpf: 'restrito', cnhNumber: 'restrito' }) : null])
  return result.rows[0]!.id
}
/** Retém a viatura até ambas as conexões HTTP estarem esperando pelo lock real no PostgreSQL. */
async function race(vehicleIds: string | readonly string[], requests: (() => Promise<Response>)[]): Promise<Response[]> {
  const client = await pool.connect()
  let pending: Promise<PromiseSettledResult<Response>[]> | undefined
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM fleet.vehicles WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
      [typeof vehicleIds === 'string' ? [vehicleIds] : vehicleIds])
    pending = Promise.allSettled(requests.map(request => request()))
    const deadline = Date.now() + 5000
    let waiting = 0
    while (waiting < requests.length && Date.now() < deadline) {
      const result = await pool.query<{ total: number }>(`SELECT count(DISTINCT pid)::int AS total FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`, ['%FROM fleet.vehicles%FOR UPDATE%'])
      waiting = result.rows[0]!.total
      if (waiting < requests.length) await delay(20)
    }
    assert.equal(waiting, requests.length)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    if (pending) await pending
  }
  return (await pending!).map(result => { if (result.status === 'rejected') throw result.reason; return result.value })
}
before(async () => {
  const target = new URL(getTestDatabaseUrl())
  assert.match(target.pathname, /(?:test|teste)/i, 'A base deve ser explicitamente dedicada a testes')
  if (process.env.DATABASE_URL) assert.notEqual(target.pathname, new URL(process.env.DATABASE_URL).pathname, 'Nunca limpar a base operacional')
  await setupTestDatabase()
  pool = getTestPool()
  assert.equal((await pool.query<{ name: string }>('SELECT current_database() AS name')).rows[0]!.name, decodeURIComponent(target.pathname.slice(1)))
  const audits = new AuditRepository(pool)
  server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, audits: { async create(input, client) {
    if (failAudit && input.table === 'fleet.fines') throw new Error('Falha fictícia de auditoria QA')
    return audits.create(input, client)
  } } }).listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
beforeEach(async () => {
  failAudit = false
  vehicleSequence = 0
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  users = await seedRbacTestUsers(pool)
})
after(async () => {
  try { if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())) }
  finally { await closeTestPool() }
})

test('IT-FINE-01 cadastro sem/com motorista e autoria/evento/auditoria atômicos', async () => {
  const v = await vehicle()
  const d = await driver()
  const first = await create(v.id)
  assert.equal(first.driverId, null)
  assert.equal(first.status, 'PENDING')
  assert.equal(first.revision, 1)
  const second = await create(v.id, { driverId: d.id })
  assert.equal(second.driverSnapshot?.name, d.name)
  const stored = await ledger()
  assert.deepEqual(stored.map(rows => rows.length), [2, 2, 2])
  const history = await detail(first.id)
  assert.equal(history.events[0]!.eventType, 'REGISTERED')
  assert.equal(history.events[0]!.actor.id, users.get('GESTOR')!.id)
  assert.equal(history.events[0]!.occurredAt, at)
  assert.notEqual(history.events[0]!.registeredAt, at)
})
test('IT-FINE-02/03/17 entradas inválidas não deixam efeitos', async () => {
  const v = await vehicle()
  const baseline = await ledger()
  for (const fields of [{ amount: -1 }, { amount: '-1.00' }, { amount: '1,00' }, { amount: '1.001' },
    { amount: '10000000000.00' }, { vehicleId: '9223372036854775808' }, { vehicleId: "1' OR '1'='1" },
    { infractionAt: '2026-02-30T10:00:00Z' }, { infractionAt: '2026-11-01T10:00:00' },
    { dueAt: '2026-02-29' }, { status: 'PAID' }, { revision: 1 }, { createdBy: '1' }, { reason: ' ' },
    { driverId: '' }, { svoExecutionOrderId: '1' }, { attachmentUrl: 'file:///private' }]) {
    await error(await api('/fines', 'POST', { body: registration(v.id, fields) }), 400)
  }
  for (const field of ['vehicleId', 'infractionAt', 'infractionCode', 'description', 'amount', 'reportedBy', 'reason', 'evidenceDescription']) {
    const body = registration(v.id)
    delete body[field]
    await error(await api('/fines', 'POST', { body }), 400)
  }
  for (const body of [null, [], 'invalid']) await error(await api('/fines', 'POST', { body }), 400)
  await error(await api('/fines', 'POST', { body: registration(v.id), key: 'invalid' }), 400)
  for (const filter of ['status=UNKNOWN', 'vehicleId=1&vehicleId=2', 'extra=1', 'from=2026-11-01T14:00:00Z&to=2026-11-01T14:00:00Z']) await error(await api(`/fines?${filter}`), 400)
  await error(await api('/fines/9223372036854775808'), 400)
  await error(await api('/fines/99999'), 404)
  await error(await api('/fines', 'POST', { body: registration('99999') }), 404)
  await error(await api('/fines', 'POST', { body: registration(v.id, { driverId: '99999' }) }), 404)
  assert.deepEqual(await ledger(), baseline)
  assert.equal((await create(v.id, { amount: '0.00' })).amount, '0.00')
  assert.equal((await create(v.id, { amount: '9999999999.99' })).amount, '9999999999.99')
})
test('IT-FINE-04/05 sugestões pelos limites reais e confirmação revalidada', async () => {
  const v = await vehicle(); const other = await vehicle(); const d = await driver()
  const a = await trip(v.id, d.id, { snapshots: true })
  await trip(v.id, d.id)
  await trip(v.id, d.id, { status: 'SCHEDULED' })
  await trip(v.id, d.id, { status: 'CANCELED' })
  await trip(v.id, d.id, { start: null })
  await trip(v.id, d.id, { finish: null })
  const service = new FinesService(new FinesRepository(pool), new VehiclesRepository(pool), new DriversRepository(pool),
    new AuditService(new AuditRepository(pool)), () => new Date('2026-11-01T16:00:00Z'))
  const get = (time: string) => service.suggestDrivers(v.id, time)
  assert.equal((await get(at)).items.length, 2)
  assert.equal((await get(end)).items.length, 0)
  assert.equal((await service.suggestDrivers(other.id, at)).items.length, 0)
  const ongoing = await trip(v.id, d.id, { status: 'IN_PROGRESS', start: end, finish: null })
  assert.equal((await get('2026-11-01T16:00:00Z')).items[0]!.tripId, ongoing)
  assert.equal((await get('2026-11-01T16:00:01Z')).items.length, 0)
  const result = await json<{ items: FineDriverSuggestion[] }>(await api(`/fines/driver-suggestions?vehicleId=${v.id}&infractionAt=${at}`))
  assert.equal(result.items.length, 2)
  assert.equal(result.items.find(item => item.tripId === a)!.nameSource, 'TRIP_SNAPSHOT')
  assert.equal((await create(v.id)).driverId, null)
  for (const fields of [{ tripId: a }, { tripId: a, driverId: d.id, vehicleId: other.id }, { tripId: a, driverId: d.id, infractionAt: end }]) {
    await error(await api('/fines', 'POST', { body: registration(v.id, fields) }), 422)
  }
  const confirmed = await create(v.id, { tripId: a, driverId: d.id })
  assert.equal(confirmed.vehicleSnapshot?.licensePlate, 'QAH1A73')
  assert.equal(confirmed.driverSnapshot?.name, 'Motorista Fictício Histórico QA')
  assert.equal(confirmed.tripSnapshot?.id, a)
  await error(await api(`/fines/${confirmed.id}`, 'PUT', { body: { ...source, expectedRevision: 1, occurredAt: end, vehicleId: other.id } }), 422)
  await pool.query("UPDATE trip.trips SET status = 'CANCELED' WHERE id = $1", [a])
  await error(await api('/fines', 'POST', { body: registration(v.id, { tripId: a, driverId: d.id }) }), 422)
  await error(await api('/fines', 'POST', { body: registration(v.id, { tripId: '99999', driverId: d.id }) }), 404)
})
test('IT-FINE-06 retificação identifica/remove motorista e preserva before/after e predecessor', async () => {
  const v = await vehicle(); const d = await driver()
  const first = await create(v.id)
  const identified = await update(first, { driverId: d.id, amount: '25.00' })
  assert.equal(identified.revision, 2)
  const cleared = await update(identified, { driverId: null, tripId: null, notes: null })
  const corrected = await update(cleared, { description: 'Descrição retificada fictícia' })
  const history = (await detail(corrected.id)).events
  assert.deepEqual(history.map(e => e.eventType), ['REGISTERED', 'DRIVER_IDENTIFIED', 'DRIVER_CHANGED', 'RECTIFIED'])
  assert.equal(history[1]!.before!.driverId, null)
  assert.equal(history[1]!.after.driverId, d.id)
  assert.equal(history[2]!.before!.driverId, d.id)
  assert.equal(history[1]!.supersedesId, history[0]!.id)
  assert.equal(history[3]!.supersedesId, history[2]!.id)
  assert.equal(corrected.vehicleSnapshot?.capturedAt, first.vehicleSnapshot?.capturedAt)
})
test('IT-FINE-07/14 pagamento/reabertura preservam trilha e eventos são imutáveis', async () => {
  const first = await create((await vehicle()).id)
  await error(await api(`/fines/${first.id}/status`, 'PATCH', { body: { ...source, expectedRevision: 1, status: 'PAID' } }), 400)
  const paid = await status(first, 'PAID')
  await error(await api(`/fines/${paid.id}`, 'PUT', { body: { ...source, occurredAt: end, expectedRevision: 2, amount: '1.00' } }), 409)
  await error(await api(`/fines/${paid.id}/status`, 'PATCH', { body: { ...source, occurredAt: end, expectedRevision: 2, status: 'CANCELED' } }), 422)
  const reopened = await status(paid, 'PENDING')
  assert.equal(reopened.paidAt, null)
  const canceled = await status(reopened, 'CANCELED')
  assert.equal(canceled.cancellationReason, source.reason)
  assert.equal((await status(canceled, 'PENDING')).cancellationReason, null)
  const history = await detail(first.id)
  assert.equal(history.events[1]!.after.paidAt, end)
  assert.equal(history.events[3]!.after.cancellationReason, source.reason)
  const snapshot = await ledger()
  await assert.rejects(pool.query("UPDATE fleet.fine_events SET reason = 'alteração fictícia' WHERE fine_id = $1", [first.id]), /append-only/)
  await assert.rejects(pool.query('DELETE FROM fleet.fine_events WHERE fine_id = $1', [first.id]), /append-only/)
  assert.equal((await api(`/fines/${first.id}`, 'DELETE')).status, 404)
  assert.deepEqual(await ledger(), snapshot)
})
test('IT-FINE-08 filtros individuais/combinados e ordenação estável sem mutação no GET', async () => {
  const v = await vehicle(); const d = await driver(); const other = await vehicle()
  const a = await create(v.id, { driverId: d.id })
  const b = await create(v.id, { driverId: d.id })
  await create(other.id, { infractionAt: end })
  await status(a, 'CONTESTED')
  const snapshot = await ledger()
  const list = async (filters: string) => (await json<{ items: Fine[] }>(await api(`/fines?${filters}`))).items
  assert.deepEqual((await list(`vehicleId=${v.id}&driverId=${d.id}&status=PENDING&from=${at}&to=${end}`)).map(f => f.id), [b.id])
  assert.deepEqual((await list(`driverId=${d.id}`)).map(f => f.id), [b.id, a.id])
  assert.equal((await list('status=CONTESTED')).length, 1)
  assert.equal((await list(`from=${end}`)).length, 1)
  assert.deepEqual(await list('vehicleId=99999'), [])
  await detail(a.id)
  assert.deepEqual(await ledger(), snapshot)
})
test('IT-FINE-09/18 JWT e RBAC atual em todas as seis rotas', async () => {
  const v = await vehicle(); const first = await create(v.id)
  const routes: [string, string, unknown][] = [
    ['/fines', 'GET', undefined], [`/fines/${first.id}`, 'GET', undefined],
    [`/fines/driver-suggestions?vehicleId=${v.id}&infractionAt=${at}`, 'GET', undefined],
    ['/fines', 'POST', registration(v.id)], [`/fines/${first.id}`, 'PUT', { ...source, expectedRevision: 1, occurredAt: end, amount: '1.00' }],
    [`/fines/${first.id}/status`, 'PATCH', { ...source, expectedRevision: 1, occurredAt: end, status: 'CONTESTED' }],
  ]
  const baseline = await ledger()
  for (const [route, method, body] of routes) {
    for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) await error(await api(route, method, { role, body }), 403)
    for (const token of ['', 'invalid', generateRbacUserToken(users.get('GESTOR')!, undefined, { expiresIn: -1 }),
      generateRbacUserToken({ id: '99999', role: 'GESTOR' })]) {
      await error(await api(route, method, { role: null, token, body }), 401)
    }
  }
  const manager = users.get('GESTOR')!
  await pool.query('UPDATE auth.users SET role_id = $2 WHERE id = $1', [manager.id, users.get('SOLICITANTE')!.roleId])
  for (const [route, method, body] of routes) await error(await api(route, method, { body }), 403)
  await pool.query('UPDATE auth.users SET role_id = $2, active = false WHERE id = $1', [manager.id, manager.roleId])
  for (const [route, method, body] of routes) await error(await api(route, method, { body }), 401)
  assert.deepEqual(await ledger(), baseline)
  await pool.query('UPDATE auth.users SET active = true WHERE id = $1', [manager.id])
  assert.equal((await api('/fines', 'GET', { role: 'ADMINISTRADOR' })).status, 200)
  assert.equal((await api('/fines', 'POST', { role: 'ADMINISTRADOR', body: registration(v.id) })).status, 201)
})
test('IT-FINE-10 replay sequencial/concorrente e comparação com pedido original após edição', async () => {
  const v = await vehicle(); const key = randomUUID()
  const responses = await race(v.id, [() => api('/fines', 'POST', { body: registration(v.id), key }),
    () => api('/fines', 'POST', { body: registration(v.id), key })])
  const [a, b] = await Promise.all(responses.map(res => json<Fine>(res, 201)))
  assert.equal(a!.id, b!.id)
  assert.deepEqual((await ledger()).map(rows => rows.length), [1, 1, 1])
  const edited = await update(a!, { amount: '1.00' })
  const replay = await json<Fine>(await api('/fines', 'POST', { body: registration(v.id, { infractionAt: '2026-11-01T11:00:00-03:00', reason: ` ${source.reason} ` }), key }), 201)
  assert.equal(replay.id, edited.id)
  assert.equal(replay.amount, '1.00')
  const baseline = await ledger()
  await error(await api('/fines', 'POST', { body: registration(v.id, { amount: '1.00' }), key }), 409)
  const other = await vehicle()
  await error(await api('/fines', 'POST', { body: registration(other.id), key }), 409)
  assert.deepEqual(await ledger(), baseline)
  assert.equal((await api('/fines', 'POST', { body: registration(v.id), key, role: 'ADMINISTRADOR' })).status, 201)
})
test('IT-FINE-11 duas mutações com revisão igual: só uma confirmada; no-op não incrementa', async () => {
  const v = await vehicle(); const fine = await create(v.id)
  const replies = await race(v.id, [
    () => api(`/fines/${fine.id}`, 'PUT', { body: { ...source, expectedRevision: 1, occurredAt: end, amount: '1.00' } }),
    () => api(`/fines/${fine.id}/status`, 'PATCH', { body: { ...source, expectedRevision: 1, occurredAt: end, status: 'CONTESTED' } }),
  ])
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 409])
  const current = await detail(fine.id)
  assert.equal(current.revision, 2)
  assert.equal(current.events.length, 2)
  const baseline = await ledger()
  assert.equal((await status(current, current.status)).revision, 2)
  assert.equal((await update(current, { amount: current.amount })).revision, 2)
  await error(await api(`/fines/${fine.id}/status`, 'PATCH', { body: { ...source, expectedRevision: 1, occurredAt: end, status: current.status } }), 409)
  assert.deepEqual(await ledger(), baseline)
})
test('IT-FINE-12 falha de auditoria ou evento em POST/PUT/PATCH reverte toda a transação', async () => {
  const v = await vehicle()
  const key = randomUUID()
  const first = await create(v.id)
  const baseline = await ledger()
  const requests = [
    () => api('/fines', 'POST', { body: registration(v.id), key }),
    () => api(`/fines/${first.id}`, 'PUT', { body: { ...source, expectedRevision: 1, occurredAt: end, amount: '1.00' } }),
    () => api(`/fines/${first.id}/status`, 'PATCH', { body: { ...source, expectedRevision: 1, occurredAt: end, status: 'CONTESTED' } }),
  ]
  failAudit = true
  try { for (const request of requests) { await error(await request(), 500); assert.deepEqual(await ledger(), baseline) } }
  finally { failAudit = false }
  await pool.query(`CREATE FUNCTION fleet.fail_fine_event_qa() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Falha fictícia de evento QA'; END; $$;
    CREATE TRIGGER fine_event_failure_qa BEFORE INSERT ON fleet.fine_events FOR EACH ROW EXECUTE FUNCTION fleet.fail_fine_event_qa()`)
  try { for (const request of requests) { await error(await request(), 500); assert.deepEqual(await ledger(), baseline) } }
  finally { await pool.query('DROP TRIGGER fine_event_failure_qa ON fleet.fine_events; DROP FUNCTION fleet.fail_fine_event_qa()') }
  const retry = await create(v.id, {}, key)
  assert.notEqual(retry.id, first.id)
  assert.deepEqual((await ledger()).map(rows => rows.length), [2, 2, 2])
  assert.equal(pool.waitingCount, 0)
})
test('IT-FINE-13/16 snapshots preservados, privacidade e referências hoje inativas', async () => {
  const v = await vehicle(); const d = await driver()
  await pool.query("UPDATE fleet.vehicles SET status = 'INACTIVE' WHERE id = $1", [v.id])
  await pool.query("UPDATE fleet.drivers SET status = 'INACTIVE', cnh_expires_at = '2020-01-01' WHERE id = $1", [d.id])
  const fine = await create(v.id, { driverId: d.id })
  await pool.query("UPDATE fleet.vehicles SET model = 'Modelo alterado fictício' WHERE id = $1", [v.id])
  await pool.query("UPDATE fleet.drivers SET name = 'Nome alterado fictício' WHERE id = $1", [d.id])
  const corrected = await update(fine, { amount: '0.00' })
  assert.deepEqual(corrected.vehicleSnapshot, fine.vehicleSnapshot)
  assert.deepEqual(corrected.driverSnapshot, fine.driverSnapshot)
  assert.equal(corrected.driverSnapshot?.source, 'CURRENT_REGISTRY')
  const history = await detail(fine.id)
  const serialized = JSON.stringify(history)
  assert.doesNotMatch(serialized, /cpf|cnh|password|registrationRequest|actorSnapshot|example\.test|svoExecution/i)
  assert.equal(history.events[0]!.after.driverSnapshot?.name, d.name)
  assert.equal((await pool.query<{ status: string }>('SELECT status FROM fleet.vehicles WHERE id = $1', [v.id])).rows[0]!.status, 'INACTIVE')
})
test('IT-FINE-15 compatibilidade legada e down protegido em transação isolada', async () => {
  const v = await vehicle()
  const client = await pool.connect()
  const load = async (name: string) => (await readFile(path.resolve(__dirname, '../src/database/migrations', name), 'utf8'))
    .replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '')
  const up = await load('202611080001_add_fine_creation_key.sql')
  const down = await load('202611080001_add_fine_creation_key.down.sql')
  try {
    await client.query('BEGIN')
    await client.query(down)
    const inserted = await client.query<{ id: string }>(`INSERT INTO fleet.fines
      (vehicle_id, infraction_at, infraction_code, description, amount, created_by)
      VALUES ($1, $2, 'QA-LEGACY', 'Multa fictícia legada', 0, $3) RETURNING id::text AS id`, [v.id, at, users.get('GESTOR')!.id])
    await client.query(up)
    const legacy = await new FinesRepository(pool).findById(inserted.rows[0]!.id, client)
    assert.equal(legacy!.vehicleSnapshot, null)
    assert.equal(legacy!.driverSnapshot, null)
    assert.equal(legacy!.paidAt, null)
    assert.equal((await client.query('SELECT creation_key FROM fleet.fines WHERE id = $1', [legacy!.id])).rows[0]!.creation_key, null)
    await client.query('UPDATE fleet.fines SET creation_key = $2 WHERE id = $1', [legacy!.id, randomUUID()])
    await client.query('SAVEPOINT protected_down')
    await assert.rejects(client.query(down), /Rollback recusado/)
    await client.query('ROLLBACK TO SAVEPOINT protected_down')
    assert.notEqual((await client.query('SELECT creation_key FROM fleet.fines WHERE id = $1', [legacy!.id])).rows[0]!.creation_key, null)
  } finally { await client.query('ROLLBACK'); client.release() }
  assert.deepEqual((await ledger()).map(rows => rows.length), [0, 0, 0])
})
test('IT-FINE-19 composição independente de documentos preserva login com mock enxuto', async () => {
  assert.doesNotThrow(() => createApp({ jwtConfig: RBAC_JWT_CONFIG, users: { findByEmail: async () => null } }))
  assert.equal((await api('/fines')).status, 200)
  assert.equal((await api('/fines/driver-suggestions?vehicleId=99999&infractionAt=2026-11-01T14:00:00Z')).status, 404)
})

test('IT-FINE-18 falha real na consulta de conta interrompe a API antes de persistir', async () => {
  const v = await vehicle()
  const baseline = await ledger()
  class FailingUsersRepository extends UsersRepository {
    override async findById(): Promise<never> { throw new Error('Falha fictícia QA na consulta de conta') }
  }
  const isolated = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, users: new FailingUsersRepository(pool) }).listen(0, '127.0.0.1')
  try {
    await new Promise<void>(resolve => isolated.once('listening', resolve))
    const response = await fetch(`http://127.0.0.1:${(isolated.address() as AddressInfo).port}/fines`, {
      method: 'POST', headers: { Authorization: `Bearer ${users.get('GESTOR')!.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify(registration(v.id)),
    })
    await error(response, 500)
    assert.deepEqual(await ledger(), baseline)
  } finally { await new Promise<void>((resolve, reject) => isolated.close(err => err ? reject(err) : resolve())) }
})

test('IT-FINE-09 gestor e administrador executam as seis rotas; vínculo de motorista não concede acesso', async () => {
  const v = await vehicle(); const d = await driver()
  await pool.query('UPDATE fleet.drivers SET user_id = $2 WHERE id = $1', [d.id, users.get('MOTORISTA')!.id])
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const fine = await json<Fine>(await api('/fines', 'POST', { role, body: registration(v.id, { driverId: d.id }) }), 201)
    await json(await api('/fines', 'GET', { role }))
    await json(await api(`/fines/${fine.id}`, 'GET', { role }))
    await json(await api(`/fines/driver-suggestions?vehicleId=${v.id}&infractionAt=${at}`, 'GET', { role }))
    await json(await api(`/fines/${fine.id}`, 'PUT', { role, body: { ...source, expectedRevision: 1, occurredAt: end, amount: '1.00' } }))
    await json(await api(`/fines/${fine.id}/status`, 'PATCH', { role, body: { ...source, expectedRevision: 2, occurredAt: end, status: 'CONTESTED' } }))
    await error(await api(`/fines/${fine.id}`, 'GET', { role: 'MOTORISTA' }), 403)
  }
})

test('IT-FINE-10 chave concorrente com veículos diferentes e payloads diferentes cria uma só multa', async (context) => {
  const a = await vehicle(); const b = await vehicle(); const key = randomUUID()
  let checkedAbsent = 0
  let uniqueViolations = 0
  let release!: () => void
  let reject!: (error: Error) => void
  const bothAbsent = new Promise<void>((resolve, fail) => { release = resolve; reject = fail })
  const deadline = setTimeout(() => reject(new Error('As duas transações devem consultar a ausência da chave antes do INSERT')), 5000)
  const findRegistration = FinesRepository.prototype.findRegistration
  const insert = FinesRepository.prototype.create
  // As consultas e INSERTs continuam reais; a barreira controla somente a ordem das duas transações.
  const lookup = context.mock.method(FinesRepository.prototype, 'findRegistration', async function (
    this: FinesRepository, ...args: Parameters<FinesRepository['findRegistration']>
  ) {
    const result = await findRegistration.apply(this, args)
    if (args[2] && args[1] === key && result === null) {
      if (++checkedAbsent === 2) release()
      await bothAbsent
    }
    return result
  })
  const creation = context.mock.method(FinesRepository.prototype, 'create', async function (
    this: FinesRepository, ...args: Parameters<FinesRepository['create']>
  ) {
    try { return await insert.apply(this, args) }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') uniqueViolations++
      throw error
    }
  })
  let responses: Response[]
  try {
    responses = await race([a.id, b.id], [() => api('/fines', 'POST', { body: registration(a.id), key }),
      () => api('/fines', 'POST', { body: registration(b.id), key })])
  } finally { clearTimeout(deadline); release(); lookup.mock.restore(); creation.mock.restore() }
  assert.equal(checkedAbsent, 2)
  assert.equal(uniqueViolations, 1)
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409])
  const winner = await json<Fine>(responses.find(response => response.status === 201)!, 201)
  await error(responses.find(response => response.status === 409)!, 409)
  const stored = await ledger()
  assert.deepEqual(stored.map(rows => rows.length), [1, 1, 1])
  assert.equal(stored[0]![0]!.id, winner.id)
  assert.equal(stored[0]![0]!.vehicle_id, winner.vehicleId)
  assert.equal(stored[0]![0]!.creation_key, key)
})

test('IT-FINE-11 troca válida de veículo e trocas opostas concorrentes preservam revisão e snapshots', { timeout: 15000 }, async () => {
  const a = await vehicle(); const b = await vehicle(); const d = await driver()
  const first = await create(a.id, { driverId: d.id })
  const moved = await update(first, { vehicleId: b.id })
  assert.equal(moved.vehicleId, b.id)
  assert.equal(moved.revision, 2)
  assert.equal(moved.vehicleSnapshot!.id, b.id)
  assert.deepEqual(moved.driverSnapshot, first.driverSnapshot)
  const initialHistory = await detail(first.id)
  assert.deepEqual(initialHistory.events[1]!.before!.vehicleSnapshot, first.vehicleSnapshot)
  assert.deepEqual(initialHistory.events[1]!.after.vehicleSnapshot, moved.vehicleSnapshot)
  const second = await create(a.id)
  const responses = await race([a.id, b.id], [
    () => api(`/fines/${first.id}`, 'PUT', { body: { ...source, occurredAt: end, expectedRevision: 2, vehicleId: a.id } }),
    () => api(`/fines/${second.id}`, 'PUT', { body: { ...source, occurredAt: end, expectedRevision: 1, vehicleId: b.id } }),
  ])
  const [back, forward] = await Promise.all(responses.map(response => json<Fine>(response)))
  assert.equal(back!.revision, 3)
  assert.equal(forward!.revision, 2)
  assert.equal(back!.vehicleSnapshot!.id, a.id)
  assert.equal(forward!.vehicleSnapshot!.id, b.id)
  assert.deepEqual(back!.driverSnapshot, first.driverSnapshot)
  assert.deepEqual((await ledger()).map(rows => rows.length), [2, 5, 5])
  const history = await detail(first.id)
  assert.equal(history.events.length, 3)
  assert.deepEqual(history.events[2]!.before!.vehicleSnapshot, moved.vehicleSnapshot)
  assert.deepEqual(history.events[2]!.after.vehicleSnapshot, back!.vehicleSnapshot)
})

test('IT-FINE-13 legado: projeção pública remove dados privados inclusive dos snapshots antigos', async () => {
  const v = await vehicle(); const d = await driver()
  const { rows } = await pool.query<{ id: string }>(`INSERT INTO fleet.fines
    (vehicle_id, driver_id, infraction_at, infraction_code, description, amount, created_by, driver_snapshot, vehicle_snapshot, trip_snapshot)
    VALUES ($1, $2, $3, 'QA-LEGACY', 'Registro fictício antigo', 1, $4, $5::jsonb, $6::jsonb, $7::jsonb) RETURNING id::text AS id`,
  [v.id, d.id, at, users.get('GESTOR')!.id, JSON.stringify({ id: d.id, name: d.name, cpf: 'privado', cnhNumber: 'privado' }),
    JSON.stringify({ id: v.id, licensePlate: v.licensePlate, model: v.model, internalSecret: 'privado' }),
    JSON.stringify({ id: '1', vehicleId: v.id, driverId: d.id, passengers: 'privado', deceased: 'privado' })])
  const fineId = rows[0]!.id
  const legacyState = { id: fineId, driver: { id: d.id, name: d.name, cpf: 'privado' },
    driverSnapshot: { id: d.id, name: d.name, cnhNumber: 'privado' }, tripSnapshot: { id: '1', deceased: 'privado' },
    registrationRequest: { private: 'privado' }, actorSnapshot: { email: 'privado' } }
  await pool.query(`INSERT INTO fleet.fine_events
    (fine_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot, reason, before_state, after_state)
    VALUES ($1, 'RECTIFIED', $2, $3, $4, $5::jsonb, $6, $7::jsonb, $7::jsonb)`,
  [fineId, at, source.reportedBy, users.get('GESTOR')!.id, JSON.stringify(users.get('GESTOR')), source.reason, JSON.stringify(legacyState)])
  const value = await detail(fineId)
  assert.doesNotMatch(JSON.stringify(value), /privado|cpf|cnh|internalSecret|passengers|deceased|registrationRequest|actorSnapshot|email|token/i)
  assert.equal(value.driverSnapshot!.name, d.name)
  assert.equal(value.events[0]!.before!.driver!.name, d.name)
})
