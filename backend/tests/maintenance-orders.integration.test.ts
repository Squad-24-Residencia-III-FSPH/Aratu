import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { AuditService } from '../src/services/audit.service'
import { VehiclesService } from '../src/services/vehicles.service'
import type { UserRole } from '../src/types/auth'
import type { MaintenanceDetail, MaintenanceItem, MaintenanceList } from '../src/types/maintenance.types'
import type { Vehicle, VehicleActorSnapshot } from '../src/types/vehicle.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
let failAudit = false
let vehicleSequence = 0
const metadata = { reportedBy: 'Oficina Fictícia QA por telefone', reason: 'Manutenção fictícia de teste' }
const estimate: MaintenanceItem[] = [
  { kind: 'PART', description: 'Filtro fictício', quantity: '2', unitPrice: '18.75' },
  { kind: 'LABOR', description: 'Instalação fictícia', amount: '40.00' },
]
const executed: MaintenanceItem[] = [
  { kind: 'PART', description: 'Filtro fictício', quantity: '1', unitPrice: '18.75' }, estimate[1]!,
]
const openedAt = '2026-10-31T12:00:00.000Z'
const november = '2026-11-01T03:00:00.000Z'
const december = '2026-12-01T03:00:00.000Z'
type Order = Omit<MaintenanceDetail, 'openedAt' | 'closedAt' | 'createdAt' | 'updatedAt'> & {
  openedAt: string; closedAt: string | null; createdAt: string; updatedAt: string
}
type RequestOptions = { body?: unknown; role?: UserRole | null; key?: string }
type StoredEvent = { id: string; event_type: string; registered_by: string; actor_snapshot: VehicleActorSnapshot;
  before_state: Order | null; after_state: Order }
type StoredAudit = { id: string; user_id: string; table_name: string; operation: string;
  before: Order | null; after: Order; actor_snapshot: VehicleActorSnapshot }
async function api(path: string, method = 'GET', options: RequestOptions = {}): Promise<Response> {
  const role = options.role === undefined ? 'GESTOR' : options.role
  return fetch(`${baseUrl}${path}`, { method, headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': options.key ?? randomUUID(),
    ...(role ? { Authorization: `Bearer ${users.get(role)!.token}` } : {}),
  }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
}
async function json<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body as T
}
async function expectError(response: Response, status: number, message: RegExp): Promise<void> {
  const body = await json<{ erro: string }>(response, status)
  assert.deepEqual(Object.keys(body), ['erro'])
  assert.match(body.erro, message)
  assert.doesNotMatch(body.erro, /SELECT|INSERT|UPDATE|stack|postgres|example\.test|at \w+\./i)
}
async function createVehicle(): Promise<Vehicle> {
  return json(await api('/vehicles', 'POST', { body: {
    ...metadata, licensePlate: `QAT${++vehicleSequence}A61`, brand: 'Marca Fictícia', model: 'Modelo QA',
    year: 2024, vehicleType: 'PICKUP_SVO', ownership: 'OWNED', categories: ['BODY'],
    seats: 2, bodyLimit: 2, weightLimit: null, operationType: 'SVO',
  } }), 201)
}
function opening(vehicleId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...metadata, vehicleId, type: 'PREVENTIVE', description: 'Revisão fictícia',
    blocksVehicle: false, openedAt, workshop: 'Oficina Fictícia QA', ...overrides }
}
async function openOrder(vehicleId: string, overrides: Record<string, unknown> = {}, role: UserRole = 'GESTOR'): Promise<Order> {
  return json(await api('/maintenance-orders', 'POST', { body: opening(vehicleId, overrides), role }), 201)
}
async function getOrder(id: string): Promise<Order> {
  return json(await api(`/maintenance-orders/${id}`))
}
async function closeOrder(order: Order, overrides: Record<string, unknown> = {}, role: UserRole = 'GESTOR'): Promise<Order> {
  return json(await api(`/maintenance-orders/${order.id}/close`, 'PATCH', { role,
    body: { ...metadata, expectedRevision: order.revision, actualItems: [], closedAt: november, ...overrides } }))
}
/** Compara dados e trilhas persistidos, incluindo efeitos laterais de requisições recusadas. */
async function ledger() {
  const [orders, events, vehicles, vehicleEvents, audits] = await Promise.all([
    pool.query<Record<string, unknown>>('SELECT id, vehicle_id, status, cost, estimate_items, actual_items, revision FROM fleet.maintenance_orders ORDER BY id'),
    pool.query<StoredEvent>('SELECT id, event_type, registered_by, actor_snapshot, before_state, after_state FROM fleet.maintenance_order_events ORDER BY id'),
    pool.query<Record<string, unknown>>('SELECT id, status, revision FROM fleet.vehicles ORDER BY id'),
    pool.query<Record<string, unknown>>('SELECT id, event_type, before_state, after_state FROM fleet.vehicle_events ORDER BY id'),
    pool.query<StoredAudit>('SELECT id, user_id, table_name, operation, before, after, actor_snapshot FROM audit.logs ORDER BY id'),
  ])
  return [orders.rows, events.rows, vehicles.rows, vehicleEvents.rows, audits.rows] as const
}
async function assertAvailability(vehicleId: string, expected: boolean): Promise<void> {
  const vehicles = await json<Vehicle[]>(await api('/vehicles?status=AVAILABLE'))
  assert.equal(vehicles.some(vehicle => vehicle.id === vehicleId), expected)
  const service = new VehiclesService(new VehiclesRepository(pool), new AuditService(new AuditRepository(pool)))
  assert.equal(await service.isAvailableForAllocation(vehicleId), expected)
}
/** Retém a viatura até comprovar duas conexões HTTP concorrentes esperando pelo mesmo lock. */
async function race(vehicleId: string, requests: (() => Promise<Response>)[]): Promise<Response[]> {
  const client = await pool.connect()
  let pending: Promise<PromiseSettledResult<Response>[]> | undefined
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', [vehicleId])
    pending = Promise.allSettled(requests.map(request => request()))
    const deadline = Date.now() + 5000
    let waiting = 0
    while (waiting < requests.length && Date.now() < deadline) {
      const result = await pool.query<{ total: number }>(
        `SELECT count(DISTINCT pid)::int AS total FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`,
        ['%FROM fleet.vehicles%FOR UPDATE%'])
      waiting = result.rows[0]!.total
      if (waiting < requests.length) await delay(20)
    }
    assert.equal(waiting, requests.length, 'As requisições devem disputar a viatura em conexões distintas')
  } finally {
    await client.query('ROLLBACK')
    client.release()
    if (pending) await pending
  }
  return (await pending!).map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
}
async function createActiveTrip(vehicleId: string): Promise<void> {
  await pool.query(`WITH service AS (
    INSERT INTO fleet.services (name, categories) VALUES ($1, ARRAY['BODY']::text[]) RETURNING id
  ), driver AS (
    INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
    VALUES ($2, $3, $4, 'B', '2030-01-01') RETURNING id
  ), request AS (
    INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose)
    SELECT $5, service.id, '2026-10-31', '10:00', $6, $7, $8 FROM service RETURNING id
  ) INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status)
    SELECT request.id, $9, driver.id, '2026-10-31T10:00:00Z', '2026-10-31T12:00:00Z', 'IN_PROGRESS'
    FROM request CROSS JOIN driver`, ['Serviço Fictício QA', 'Motorista Fictício QA', '11122233344',
    '11122233344', users.get('SOLICITANTE')!.id, 'Origem Fictícia', 'Destino Fictício', 'Transporte fictício', vehicleId])
}
before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const audits = new AuditRepository(pool)
  server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, audits: { async create(input, client) {
    if (failAudit && input.table === 'fleet.maintenance_orders') throw new Error('Falha fictícia de auditoria QA')
    return audits.create(input, client)
  } } }).listen(0)
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
  try {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  } finally { await closeTestPool() }
})

test('IT-MNT-01: tipos, valores e datas inválidos não deixam gravações', async () => {
  const vehicle = await createVehicle()
  for (const type of ['PREVENTIVE', 'CORRECTIVE']) {
    const order = await openOrder(vehicle.id, { type })
    assert.equal((await getOrder(order.id)).type, type)
  }
  const invalid: [Record<string, unknown>, RegExp][] = [
    [{ type: undefined }, /tipo/], [{ type: 'UNKNOWN' }, /tipo/],
    [{ estimateItems: [{ ...estimate[0], unitPrice: '-0.01' }] }, /reais/],
    [{ estimateItems: [{ ...estimate[1], amount: '-1.00' }] }, /reais/],
    [{ estimateItems: [{ ...estimate[0], quantity: '0' }] }, /quantidade/],
    [{ odometerKm: -1 }, /quilometragem/], [{ expectedCompletionDate: '2026-10-30' }, /previsão/],
    [{ openedAt: '2026-02-30T12:00:00Z' }, /data e hora/],
  ]
  const before = await ledger()
  for (const [overrides, message] of invalid) {
    await expectError(await api('/maintenance-orders', 'POST', { body: opening(vehicle.id, overrides) }), 400, message)
    assert.deepEqual(await ledger(), before)
  }
})
test('IT-MNT-02: a mesma peça é registrada antes, no marco e depois de 12.000 km', async () => {
  for (const odometerKm of [11700, 12000, 12400]) {
    const vehicle = await createVehicle()
    const order = await openOrder(vehicle.id, { odometerKm, estimateItems: estimate })
    const detail = await getOrder(order.id)
    assert.equal(detail.odometerKm, odometerKm)
    assert.deepEqual(detail.estimateItems, [{ ...estimate[0], subtotal: '37.50' }, { ...estimate[1], subtotal: '40.00' }])
    assert.equal(detail.vehicleSnapshot?.licensePlate, vehicle.licensePlate)
  }
})
test('IT-MNT-03: orçamento preservado com execução parcial ou confirmação integral', async () => {
  const vehicle = await createVehicle()
  for (const [actualItems, expected] of [[executed, '58.75'], [undefined, '77.50']] as const) {
    const order = await openOrder(vehicle.id, { estimateItems: estimate })
    const closed = await closeOrder(order, actualItems ? { actualItems } : { actualItems: undefined, confirmEstimate: true })
    assert.equal(closed.status, 'DONE')
    assert.equal(closed.estimatedTotal, '77.50')
    assert.equal(closed.finalCost, expected)
    assert.deepEqual(closed.actualItems?.map(({ subtotal: _subtotal, ...item }) => item), actualItems ?? estimate)
    assert.deepEqual(closed.estimateItems, order.estimateItems)
    assert.deepEqual(await getOrder(order.id), closed)
    const event = await pool.query<{ items: MaintenanceItem[] }>(
      "SELECT after_state->'estimateItems' AS items FROM fleet.maintenance_order_events WHERE maintenance_order_id = $1 AND event_type = $2",
      [order.id, 'OPENED'])
    assert.deepEqual(event.rows[0]!.items, estimate)
  }
})
test('IT-MNT-04: precisão, custo zero, desconhecido e rejeição de fechamento inválido', async () => {
  const order = await openOrder((await createVehicle()).id)
  assert.equal(order.estimatedTotal, null)
  assert.equal(order.actualItems, null)
  assert.equal(order.finalCost, null)
  const before = await ledger()
  for (const [overrides, message] of [
    [{ cost: '-1.00' }, /reais/], [{ cost: '1.00' }, /difere/],
    [{ actualItems: [{ ...estimate[1], amount: '10000000000.00' }] }, /excede/],
    [{ actualItems: [{ ...estimate[0], quantity: '1.0001' }] }, /quantidade/],
    [{ actualItems: [{ ...estimate[0], unitPrice: '0.001' }] }, /reais/],
    [{ closedAt: '2026-10-30T12:00:00Z' }, /anteceder/],
  ] as [Record<string, unknown>, RegExp][]) {
    await expectError(await api(`/maintenance-orders/${order.id}/close`, 'PATCH', {
      body: { ...metadata, expectedRevision: order.revision, actualItems: [], ...overrides } }), 400, message)
    assert.deepEqual(await ledger(), before)
  }
  const free = await closeOrder(order)
  assert.equal(free.finalCost, '0.00')
  assert.deepEqual(free.actualItems, [])
  const fractional = await openOrder(order.vehicleId)
  const closed = await closeOrder(fractional, { actualItems: [
    { ...estimate[0], quantity: '1.500', unitPrice: '0.05' }, { ...estimate[1], amount: '1.00' },
  ] })
  assert.equal(closed.actualItems?.[0]?.subtotal, '0.08')
  assert.equal(closed.finalCost, '1.08')
})
test('IT-MNT-05: disponibilidade acompanha impeditiva e viagem impede abertura', async () => {
  const vehicle = await createVehicle()
  await assertAvailability(vehicle.id, true)
  const order = await openOrder(vehicle.id, { blocksVehicle: true })
  assert.equal((await json<Vehicle>(await api(`/vehicles/${vehicle.id}`))).status, 'IN_MAINTENANCE')
  await assertAvailability(vehicle.id, false)
  await closeOrder(order)
  await assertAvailability(vehicle.id, true)
  await openOrder(vehicle.id)
  await assertAvailability(vehicle.id, true)
  await createActiveTrip(vehicle.id)
  const before = await ledger()
  await expectError(await api('/maintenance-orders', 'POST', { body: opening(vehicle.id, { blocksVehicle: true }) }), 422, /viagem/)
  assert.deepEqual(await ledger(), before)
})
test('IT-MNT-06: concorrência e reenvio preservam uma única abertura e bloqueio', async () => {
  const vehicle = await createVehicle()
  const body = opening(vehicle.id, { blocksVehicle: true })
  const keys = [randomUUID(), randomUUID()]
  const responses = await race(vehicle.id, keys.map(key => () => api('/maintenance-orders', 'POST', { body, key })))
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409])
  const winner = responses.findIndex(response => response.status === 201)
  const order = await json<Order>(responses[winner]!, 201)
  const counts = await ledger()
  assert.equal(counts[0]!.length, 1)
  assert.equal(counts[1]!.length, 1)
  assert.equal(counts[3]!.length, 2)
  const key = keys[winner]!
  assert.equal((await json<Order>(await api('/maintenance-orders', 'POST', { body, key }), 201)).id, order.id)
  assert.deepEqual(await ledger(), counts)
  await json(await api(`/maintenance-orders/${order.id}`, 'PUT', { body: { ...metadata, expectedRevision: 1, description: 'Revisão editada' } }))
  const edited = await ledger()
  assert.equal((await json<Order>(await api('/maintenance-orders', 'POST', { body, key }), 201)).description, 'Revisão editada')
  await expectError(await api('/maintenance-orders', 'POST', { key, body: { ...body, description: 'Outro pedido' } }), 409, /chave/)
  assert.deepEqual(await ledger(), edited)
})
test('IT-MNT-07: alteração do impedimento, liberação manual recusada e inativação preservada', async () => {
  const vehicle = await createVehicle()
  let order = await openOrder(vehicle.id)
  order = await json(await api(`/maintenance-orders/${order.id}`, 'PUT', { body: { ...metadata, expectedRevision: order.revision, blocksVehicle: true } }))
  await assertAvailability(vehicle.id, false)
  const blocked = await json<Vehicle>(await api(`/vehicles/${vehicle.id}`))
  const before = await ledger()
  await expectError(await api(`/vehicles/${vehicle.id}/status`, 'PATCH', { body: {
    ...metadata, expectedRevision: blocked.revision, status: 'AVAILABLE',
  } }), 422, /manutenção/)
  assert.deepEqual(await ledger(), before)
  await json(await api(`/maintenance-orders/${order.id}`, 'PUT', { body: { ...metadata, expectedRevision: order.revision, blocksVehicle: false } }))
  await assertAvailability(vehicle.id, true)
  const second = await openOrder(vehicle.id, { blocksVehicle: true })
  const current = await json<Vehicle>(await api(`/vehicles/${vehicle.id}`))
  await json(await api(`/vehicles/${vehicle.id}/status`, 'PATCH', { body: { ...metadata, expectedRevision: current.revision, status: 'INACTIVE' } }))
  await closeOrder(second)
  assert.equal((await json<Vehicle>(await api(`/vehicles/${vehicle.id}`))).status, 'INACTIVE')
  await assertAvailability(vehicle.id, false)
})
test('IT-MNT-08: listagem pela abertura e gasto pelo encerramento no intervalo semiaberto', async () => {
  const vehicle = await createVehicle()
  await closeOrder(await openOrder(vehicle.id), { actualItems: executed })
  const second = await openOrder(vehicle.id, { openedAt: november })
  await closeOrder(second, { closedAt: december, actualItems: estimate })
  await closeOrder(await openOrder((await createVehicle()).id), { actualItems: estimate })
  await closeOrder(await openOrder(vehicle.id, { type: 'CORRECTIVE' }), { actualItems: estimate })
  const active = await openOrder(vehicle.id, { openedAt: november, estimateItems: estimate })
  const query = new URLSearchParams({ vehicleId: vehicle.id, type: 'PREVENTIVE', from: november, to: december })
  const list = await json<MaintenanceList>(await api(`/maintenance-orders?${query}`))
  assert.deepEqual(list.items.map(item => item.id), [active.id, second.id])
  assert.equal(list.totalSpent, '58.75')
  const onlyOpen = await json<MaintenanceList>(await api(`/maintenance-orders?${query}&status=OPEN`))
  assert.deepEqual(onlyOpen.items.map(item => item.id), [active.id])
  assert.equal(onlyOpen.totalSpent, '0.00')
  assert.deepEqual(await json(await api('/maintenance-orders?vehicleId=999999')), { items: [], totalSpent: '0.00' })
})
test('IT-MNT-09: revisão concorrente, encerramento único e autoria imutável da sessão', async () => {
  const order = await openOrder((await createVehicle()).id)
  const original = await ledger()
  const responses = await race(order.vehicleId, ['A', 'B'].map(description => () => api(`/maintenance-orders/${order.id}`, 'PUT', {
    body: { ...metadata, expectedRevision: 1, description, registeredBy: users.get('ADMINISTRADOR')!.id },
  })))
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  const winner = await json<Order>(responses.find(response => response.status === 200)!)
  assert.deepEqual(await getOrder(order.id), winner)
  assert.equal(winner.revision, 2)
  const closed = await closeOrder(winner)
  const before = await ledger()
  await expectError(await api(`/maintenance-orders/${order.id}/close`, 'PATCH', { body: { ...metadata, expectedRevision: winner.revision, actualItems: [] } }), 409, /alterada ou encerrada/)
  assert.deepEqual(await ledger(), before)
  assert.deepEqual(before[1]![0], original[1]![0])
  const events = before[1]!
  assert.deepEqual(events.map(event => event.event_type), ['OPENED', 'UPDATED', 'CLOSED'])
  assert.equal(events[1]!.before_state?.description, order.description)
  assert.equal(events[1]!.after_state.description, winner.description)
  assert.equal(events[2]!.after_state.cost, closed.finalCost)
  const actor = users.get('GESTOR')!
  for (const event of events) assert.deepEqual(event.actor_snapshot, { id: actor.id, name: actor.name, email: actor.email, role: actor.role })
  for (const event of events) assert.equal(event.registered_by, actor.id)
  const audits = before[4]!.filter(row => row.table_name === 'fleet.maintenance_orders')
  assert.deepEqual(audits.map(row => row.operation), ['OPENED', 'UPDATED', 'CLOSED'])
  for (const audit of audits) assert.equal(audit.user_id, actor.id)
  assert.deepEqual(audits.map(row => row.actor_snapshot), events.map(event => event.actor_snapshot))
  assert.deepEqual(audits.map(row => [row.before, row.after]), events.map(event => [event.before_state,
    Object.fromEntries(Object.entries(event.after_state).filter(([key]) => key !== 'openingRequest'))]))
  await assert.rejects(pool.query('UPDATE fleet.maintenance_order_events SET reason = $1 WHERE maintenance_order_id = $2', ['Tentativa fictícia', order.id]), /append-only/)
  await assert.rejects(pool.query('DELETE FROM fleet.maintenance_order_events WHERE maintenance_order_id = $1', [order.id]), /append-only/)
  assert.deepEqual(await ledger(), before)
})
test('IT-MNT-10: falha de auditoria desfaz abertura e encerramento completos', async () => {
  const vehicle = await createVehicle()
  const before = await ledger()
  failAudit = true
  await expectError(await api('/maintenance-orders', 'POST', { body: opening(vehicle.id, { blocksVehicle: true }) }), 500, /^Erro interno do servidor\.$/)
  assert.deepEqual(await ledger(), before)
  await assertAvailability(vehicle.id, true)
  failAudit = false
  const order = await openOrder(vehicle.id, { blocksVehicle: true })
  const blocked = await ledger()
  failAudit = true
  await expectError(await api(`/maintenance-orders/${order.id}/close`, 'PATCH', { body: { ...metadata, expectedRevision: 1, actualItems: executed } }), 500, /^Erro interno do servidor\.$/)
  assert.deepEqual(await ledger(), blocked)
  assert.deepEqual(await getOrder(order.id), order)
  await assertAvailability(vehicle.id, false)
})
test('IT-MNT-11: RBAC nas cinco rotas, perfis autorizados, 404 e custo legado', async () => {
  const vehicle = await createVehicle()
  const order = await openOrder(vehicle.id)
  for (const role of [null, 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    for (const [method, path, body] of [
      ['GET', '/maintenance-orders', undefined], ['GET', `/maintenance-orders/${order.id}`, undefined],
      ['POST', '/maintenance-orders', opening(vehicle.id)],
      ['PUT', `/maintenance-orders/${order.id}`, { ...metadata, expectedRevision: 1, description: 'Edição fictícia' }],
      ['PATCH', `/maintenance-orders/${order.id}/close`, { ...metadata, expectedRevision: 1, actualItems: [] }],
    ] as const) {
      const before = await ledger()
      await expectError(await api(path, method, { body, role }), role === null ? 401 : 403, /autenticação|acesso|permissão/i)
      assert.deepEqual(await ledger(), before)
    }
  }
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const created = await openOrder(vehicle.id, { estimateItems: estimate }, role)
    const closed = await closeOrder(created, { actualItems: executed }, role)
    assert.equal(closed.createdBy, users.get(role)!.id)
    assert.equal(closed.closedBy, users.get(role)!.id)
    assert.equal(closed.status, 'DONE')
  }
  await expectError(await api('/maintenance-orders/999999'), 404, /não encontrada/)
  const legacy = await pool.query<{ id: string }>(`INSERT INTO fleet.maintenance_orders
    (vehicle_id, type, description, status, cost, opened_at, closed_at, created_by, closed_by)
    VALUES ($1, 'CORRECTIVE', $2, 'DONE', $3, $4, $5, $6, $6) RETURNING id::text AS id`,
    [vehicle.id, 'Ordem legada fictícia', '123.45', openedAt, november, users.get('GESTOR')!.id])
  const detail = await getOrder(legacy.rows[0]!.id)
  assert.equal(detail.finalCost, '123.45')
  assert.equal(detail.estimatedTotal, null)
  assert.equal(detail.estimateItems, null)
  assert.equal(detail.actualItems, null)
  const list = await json<MaintenanceList>(await api(`/maintenance-orders?vehicleId=${vehicle.id}&type=CORRECTIVE`))
  assert.equal(list.totalSpent, '123.45')
})
