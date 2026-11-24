import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool, PoolClient } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { SvoOccurrencesRepository } from '../src/repositories/svo-occurrences.repository'
import { SvoOrdersRepository } from '../src/repositories/svo-orders.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { AuditService } from '../src/services/audit.service'
import { SvoOrdersService } from '../src/services/svo-orders.service'
import type { AuditRepositoryContract } from '../src/types/audit.types'
import type { UserRole } from '../src/types/auth'
import { SVO_ORDER_OCCUPYING_STATUSES, SvoOrderServiceError } from '../src/types/svo-order.types'
import type { CreateSvoOrderInput, SvoOrderStatus } from '../src/types/svo-order.types'
import { closeTestPool, getTestDatabaseUrl, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, generateRbacUserToken, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import { insertLegacySvo, svoInput } from './fixtures/svo-occurrences.fixture'
import { insertLegacyMaintenance, insertLegacySvoOrder, insertSvoTeam, insertSvoVehicle, insertSvoMembership } from './fixtures/svo-orders.fixture'

type JsonRecord = Record<string, unknown>
let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
const ALL_STATUSES: readonly SvoOrderStatus[] = [...SVO_ORDER_OCCUPYING_STATUSES, 'COMPLETED', 'NOT_PERFORMED', 'CANCELED']
const MISSING_ID = '9223372036854775807'

function track(path = '', role: UserRole | null = 'EQUIPE_SVO', body?: unknown, url = baseUrl, token?: string): Promise<Response> {
  return fetch(`${url}/svo/orders${path}`, { method: body === undefined ? 'GET' : 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token ?? user(role).token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) })
}

async function trackedOrder(member = true): Promise<CreateSvoOrderInput & { id: string }> {
  const input = await eligible()
  const created = await json(await call(input), 201)
  if (member) await insertSvoMembership(pool, input.teamId, user('EQUIPE_SVO').id)
  return { ...input, id: created.id as string }
}

test('TRACK-01: união A/B sem C; detalhe restrito, lista mínima e filtro no banco', async () => {
  const a = await trackedOrder(); const b = await trackedOrder(); const c = await trackedOrder(false)
  const response = await track(); assert.equal(response.status, 200)
  const rows = await response.json() as JsonRecord[]
  assert.deepEqual(rows.map((row) => row.id), [b.id, a.id])
  assert.deepEqual(rows[0]!.allowedTransitions, ['IN_TRANSIT'])
  assert.doesNotMatch(JSON.stringify(rows), /requesterName|requesterPhone|SENTINELA_NOME|SENTINELA_TELEFONE|occurrenceSnapshot|teamActive/)
  await rejectsWithoutWrite(() => track(`/${c.id}`), 403)
  await rejectsWithoutWrite(() => track(`/${c.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 999 }), 403)
  const detail = await json(await track(`/${a.id}`), 200)
  assert.ok(detail.occurrenceSnapshot); assert.ok(detail.teamSnapshot); assert.ok(detail.vehicleSnapshot)
  assert.deepEqual(detail.dispatch, detail.current)
  assert.deepEqual(await (await track('?status=IN_SERVICE')).json(), [])
})

test('TRACK-02: vínculo ausente, futuro, inativo e encerrado não concede leitura/alteração', async () => {
  const order = await trackedOrder(false)
  assert.deepEqual(await (await track()).json(), [])
  const now = new Date()
  await insertSvoMembership(pool, order.teamId, user('EQUIPE_SVO').id)
  for (const options of [
    { active: false, joined: new Date('2025-01-01Z'), left: null },
    { active: true, joined: new Date(now.getTime() + 86_400_000), left: null },
    { active: true, joined: new Date('2025-01-01Z'), left: now },
  ]) {
    await pool.query('UPDATE svo.team_members SET active = $1, joined_at = $2, left_at = $3 WHERE team_id = $4',
      [options.active, options.joined, options.left, order.teamId])
    assert.deepEqual(await (await track()).json(), [])
    await rejectsWithoutWrite(() => track(`/${order.id}`), 403)
    await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 403)
  }
  await pool.query('UPDATE svo.team_members SET active = true, joined_at = $1, left_at = NULL WHERE team_id = $2', [new Date('2025-01-01Z'), order.teamId])
  await pool.query('UPDATE svo.teams SET active = false WHERE id = $1', [order.teamId])
  assert.deepEqual((await json(await track(`/${order.id}`), 200)).allowedTransitions, [])
  assert.equal((await (await track()).json() as unknown[]).length, 1)
  await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 403)
})

test('TRACK-03: RBAC global de leitura, conta atual, token ausente/expirado e escrita exclusiva', async () => {
  const order = await trackedOrder()
  for (const role of ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'] as const) {
    const rows = await (await track('', role)).json() as JsonRecord[]
    assert.equal(rows.length, 1); assert.deepEqual(rows[0]!.allowedTransitions, [])
    await json(await track(`/${order.id}`, role), 200)
    await rejectsWithoutWrite(() => track(`/${order.id}/status`, role, { status: 'IN_TRANSIT', revision: 1 }), 403)
  }
  for (const role of ['SOLICITANTE', 'MOTORISTA'] as const) {
    await rejectsWithoutWrite(() => track('', role), 403)
    await rejectsWithoutWrite(() => track(`/${order.id}`, role), 403)
  }
  await rejectsWithoutWrite(() => track('', null), 401)
  const expired = generateRbacUserToken(user('EQUIPE_SVO'), RBAC_JWT_CONFIG.secret, { expiresIn: -1 })
  await rejectsWithoutWrite(() => track('', 'EQUIPE_SVO', undefined, baseUrl, expired), 401)
  await pool.query('UPDATE auth.users SET role_id = $1 WHERE id = $2', [user('SOLICITANTE').roleId, user('EQUIPE_SVO').id])
  await rejectsWithoutWrite(() => track(), 403)
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [user('ATENDENTE_SVO').id])
  await rejectsWithoutWrite(() => track('', 'ATENDENTE_SVO'), 401)
})

test('TRACK-04: saída/chegada com horário, evento, autoria e auditoria sem perder snapshots/reserva', async () => {
  const order = await trackedOrder()
  const original = await history(order.id)
  // A disponibilidade cadastral posterior não desfaz a decisão de alocação já registrada.
  await pool.query("UPDATE fleet.vehicles SET status = 'IN_MAINTENANCE' WHERE id = $1", [order.vehicleId])
  let departedAt: unknown
  for (const [status, revision, eventType, timestamp] of [
    ['IN_TRANSIT', 1, 'DEPARTED', 'departedAt'], ['IN_SERVICE', 2, 'ARRIVED', 'arrivedAt'],
  ] as const) {
    const beforeCall = Date.now()
    const result = await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status, revision }), 200)
    assert.equal(result.status, status); assert.equal(result.revision, revision + 1)
    assert.ok(Date.parse(result[timestamp] as string) >= beforeCall - 1000)
    assert.ok(Date.parse(result[timestamp] as string) <= Date.now())
    if (status === 'IN_TRANSIT') departedAt = result.departedAt
    else { assert.equal(result.departedAt, departedAt); assert.deepEqual(result.allowedTransitions, []) }
    const stored = await history(order.id)
    const event = stored.events.find((row) => row.event_type === eventType)!
    assert.equal((event.occurred_at as Date).toISOString(), result[timestamp])
    assert.ok((event.registered_at as Date).getTime() >= (event.occurred_at as Date).getTime())
    assert.equal(event.registered_by, user('EQUIPE_SVO').id)
    assert.equal(event.reported_by, user('EQUIPE_SVO').name)
    assert.equal((event.actor_snapshot as JsonRecord).role, 'EQUIPE_SVO')
    assert.ok(event.reason); assert.ok(event.evidence_description)
    assert.equal((event.before_state as JsonRecord).revision, revision)
    assert.equal((event.after_state as JsonRecord).revision, revision + 1)
    assert.deepEqual(stored.order.occurrence_snapshot, original.order.occurrence_snapshot)
    assert.deepEqual(stored.order.team_snapshot, original.order.team_snapshot)
    assert.deepEqual(stored.order.vehicle_snapshot, original.order.vehicle_snapshot)
    const updates = stored.audits.filter((row) => row.operation === 'UPDATE')
    assert.equal(updates.length, revision)
    assert.doesNotMatch(JSON.stringify([updates, event.before_state, event.after_state]), /SENTINELA|requester|description|Snapshot/)
    assert.equal((await pool.query<{ count: number }>(
      'SELECT count(id)::integer AS count FROM svo.execution_orders WHERE vehicle_id = $1 AND status = ANY($2::text[])',
      [order.vehicleId, SVO_ORDER_OCCUPYING_STATUSES])).rows[0]!.count, 1)
  }
  const attended = await (await track('', 'ATENDENTE_SVO')).json() as JsonRecord[]
  assert.equal(attended[0]!.status, 'IN_SERVICE'); assert.ok(attended[0]!.arrivedAt)
})

test('TRACK-05: concorrência e revisão antiga não duplicam eventos nem avançam duas etapas', async () => {
  const order = await trackedOrder()
  const holder = await holdLock('SELECT id FROM svo.execution_orders WHERE id = $1 FOR UPDATE', order.id)
  const first = track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 })
  const second = track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 })
  try {
    await waitForBlocked(2); await holder.query('COMMIT')
    assert.deepEqual((await Promise.all([first, second])).map((response) => response.status).sort(), [200, 409])
    await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 1 }), 409)
    const stored = await history(order.id)
    assert.equal(stored.events.filter((event) => event.event_type === 'DEPARTED').length, 1)
    assert.equal(stored.audits.filter((event) => event.operation === 'UPDATE').length, 1)
  } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([first, second]) }
})

test('TRACK-06: revogação de equipe/vínculo confirmada antes das travas impede alteração', async () => {
  for (const target of ['team', 'membership'] as const) {
    const order = await trackedOrder()
    const holder = await holdLock(target === 'team' ? 'SELECT id FROM svo.teams WHERE id = $1 FOR UPDATE'
      : 'SELECT id FROM svo.team_members WHERE team_id = $1 FOR UPDATE', order.teamId)
    const pending = track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 })
    try {
      await waitForBlocked(1)
      if (target === 'team') await holder.query('UPDATE svo.teams SET active = false WHERE id = $1', [order.teamId])
      else await holder.query('UPDATE svo.team_members SET active = false WHERE team_id = $1', [order.teamId])
      await holder.query('COMMIT')
      await rejectsWithoutWrite(() => pending, 403)
    } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([pending]) }
  }
})

test('TRACK-07: revogação após autorização aguarda commit da mudança operacional', async () => {
  for (const target of ['team', 'membership'] as const) {
    const order = await trackedOrder()
    let enter!: () => void; let resume!: () => void
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const gate = new Promise<void>((resolve) => { resume = resolve })
    class PausedRepository extends SvoOrdersRepository {
      override async updateStatus(...args: Parameters<SvoOrdersRepository['updateStatus']>): Promise<boolean> {
        enter(); await gate; return super.updateStatus(...args)
      }
    }
    const service = new SvoOrdersService(new SvoOccurrencesRepository(pool), new PausedRepository(),
      new VehiclesRepository(pool), new AuditService(new AuditRepository(pool)))
    const pending = service.updateStatus(order.id, { status: 'IN_TRANSIT', revision: 1 }, user('EQUIPE_SVO').id)
    await entered
    const revoke = pool.query(target === 'team' ? 'UPDATE svo.teams SET active = false WHERE id = $1'
      : 'UPDATE svo.team_members SET active = false WHERE team_id = $1', [order.teamId])
    try {
      await waitForBlocked(1); resume()
      assert.equal((await pending).status, 'IN_TRANSIT'); await revoke
      await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 2 }), 403)
    } finally { resume(); await Promise.allSettled([pending, revoke]) }
  }
})

test('TRACK-08: falhas reais de evento e auditoria desfazem estado/carimbos e liberam conexão', async () => {
  const order = await trackedOrder()
  class BrokenStatusEvent extends SvoOrdersRepository {
    override async createStatusEvent(_event: Parameters<SvoOrdersRepository['createStatusEvent']>[0], client: PoolClient): Promise<void> {
      await client.query('SELECT $1::integer', ['Falha sintética no evento'])
    }
  }
  const service = new SvoOrdersService(new SvoOccurrencesRepository(pool), new BrokenStatusEvent(),
    new VehiclesRepository(pool), new AuditService(new AuditRepository(pool)))
  const state = await databaseState()
  for (let attempt = 0; attempt < 11; attempt++) {
    await assert.rejects(service.updateStatus(order.id, { status: 'IN_TRANSIT', revision: 1 }, user('EQUIPE_SVO').id))
  }
  assert.deepEqual(await databaseState(), state)
  const audits = new AuditRepository(pool)
  const broken = await startServer({ async create(data, client) {
    await audits.create(data, client); await client!.query('SELECT $1::integer', ['SENTINELA_LOCAL'])
    throw new Error('Falha SQL esperada não ocorreu')
  } })
  const original = console.error; const logs: unknown[] = []; console.error = (...args: unknown[]) => { logs.push(args) }
  try {
    await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }, broken.url), 500)
    assert.match(JSON.stringify(logs), /UPDATE_STATUS/); assert.doesNotMatch(JSON.stringify(logs), /SENTINELA|22P02|stack/)
  } finally { console.error = original; await closeServer(broken.instance) }
  await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
})

test('TRACK-09: validação HTTP e datas inválidas não alteram banco', async () => {
  const order = await trackedOrder()
  for (const path of ['?teamId=1', '?userId=1', '?status=BAD', '?status=OPEN&status=OPEN', '/01', '/9223372036854775808', '/-1']) {
    await rejectsWithoutWrite(() => track(path), 400)
  }
  await rejectsWithoutWrite(() => track(`/${MISSING_ID}`), 404)
  await rejectsWithoutWrite(() => track(`/${MISSING_ID}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 404)
  for (const body of [null, [], { status: 'IN_TRANSIT' }, { status: 'IN_TRANSIT', revision: 1, userId: '1' }, { status: 'BAD', revision: 1 }]) {
    await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', body), 400)
  }
  await rejectsWithoutWrite(() => fetch(`${baseUrl}/svo/orders/${order.id}/status`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${user('EQUIPE_SVO').token}`, 'Content-Type': 'application/json' }, body: '{',
  }), 400)
  await pool.query("UPDATE svo.execution_orders SET opened_at = clock_timestamp() + interval '1 day' WHERE id = $1", [order.id])
  await rejectsWithoutWrite(() => track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 409)
})

test('TRACK-10: legado somente leitura, snapshots nulos e chegada sem inventar saída', async () => {
  for (const status of ['IN_PROGRESS', 'COMPLETED', 'NOT_PERFORMED', 'CANCELED', 'IN_TRANSIT'] as const) {
    const input = await eligible()
    const id = await insertLegacySvoOrder(pool, { ...input, actorId: user().id, status })
    await insertSvoMembership(pool, input.teamId, user('EQUIPE_SVO').id)
    const detail = await json(await track(`/${id}`), 200)
    assert.equal(detail.occurrenceSnapshot, null); assert.equal(detail.teamSnapshot, null); assert.equal(detail.vehicleSnapshot, null)
    assert.deepEqual(detail.dispatch, { location: null, teamName: null, vehicleLicensePlate: null })
    if (status === 'IN_TRANSIT') {
      const result = await json(await track(`/${id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 1 }), 200)
      assert.equal(result.departedAt, null); assert.ok(result.arrivedAt)
    } else {
      assert.deepEqual(detail.allowedTransitions, [])
      await rejectsWithoutWrite(() => track(`/${id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 1 }), 409)
    }
  }
})

function postResult(id: string, body: unknown, role: UserRole | null = 'EQUIPE_SVO', url = baseUrl, token?: string): Promise<Response> {
  return fetch(`${url}/svo/orders/${id}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token ?? user(role).token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
}

function user(role: UserRole = 'ATENDENTE_SVO'): RbacTestUser { return users.get(role)! }

function call(body: unknown, role: UserRole | null = 'ATENDENTE_SVO', token?: string, url = baseUrl): Promise<Response> {
  return fetch(`${url}/svo/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(role ? { Authorization: `Bearer ${token ?? user(role).token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  })
}

async function json(response: Response, status: number): Promise<JsonRecord> {
  assert.equal(response.status, status, await response.clone().text())
  return await response.json() as JsonRecord
}

async function confirmedOccurrence(): Promise<string> {
  const response = await fetch(`${baseUrl}/svo/occurrences`, {
    method: 'POST', headers: { Authorization: `Bearer ${user().token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(svoInput()),
  })
  const created = await json(response, 201)
  await json(await fetch(`${baseUrl}/svo/occurrences/${created.id}/confirm`, {
    method: 'POST', headers: { Authorization: `Bearer ${user().token}`, 'Content-Type': 'application/json' }, body: '{}',
  }), 200)
  return created.id as string
}

async function eligible(bodyLimit = 1): Promise<CreateSvoOrderInput> {
  return { occurrenceId: await confirmedOccurrence(), teamId: await insertSvoTeam(pool),
    vehicleId: await insertSvoVehicle(pool, { bodyLimit }) }
}

/** Projeções completas dos campos relevantes permitem comprovar ausência de escritas e efeitos laterais. */
async function databaseState(): Promise<unknown> {
  const queries = [
    'SELECT id, occurrence_id, team_id, vehicle_id, driver_id, driver_snapshot, status, result, failure_reason, notes, opened_at, departed_at, arrived_at, collected_at, closed_at, closed_by, updated_at, created_by, revision, occurrence_snapshot, team_snapshot, vehicle_snapshot FROM svo.execution_orders ORDER BY id',
    'SELECT id, execution_order_id, event_type, occurred_at, registered_at, reported_by, registered_by, actor_snapshot, reason, evidence_description, before_state, after_state FROM svo.execution_order_events ORDER BY id',
    'SELECT id, table_name, record_id, user_id, operation, "before", "after", actor_snapshot FROM audit.logs ORDER BY id',
    'SELECT id, status, revision, triaged_at, triaged_by, updated_at FROM svo.occurrences ORDER BY id',
    'SELECT id, status, revision, body_limit FROM fleet.vehicles ORDER BY id',
    'SELECT id, event_type, after_state FROM svo.occurrence_events ORDER BY id',
  ]
  const rows = []
  for (const query of queries) rows.push((await pool.query(query)).rows)
  return rows
}

async function rejectsWithoutWrite(operation: () => Promise<Response>, status: number): Promise<JsonRecord> {
  const beforeState = await databaseState()
  const body = await json(await operation(), status)
  assert.deepEqual(Object.keys(body), ['erro'])
  assert.equal(typeof body.erro, 'string')
  assert.doesNotMatch(JSON.stringify(body), /SENTINELA|stack|INSERT INTO|23505/)
  assert.deepEqual(await databaseState(), beforeState)
  return body
}

async function history(id: string) {
  const order = await pool.query<JsonRecord>(
    `SELECT id::text, occurrence_id::text, team_id::text, vehicle_id::text, driver_id, driver_snapshot,
            status, result, failure_reason, notes, opened_at, departed_at, arrived_at, collected_at,
            closed_at, closed_by::text, created_by::text, revision, occurrence_snapshot, team_snapshot, vehicle_snapshot
       FROM svo.execution_orders WHERE id = $1`, [id],
  )
  const events = await pool.query<JsonRecord>(
    `SELECT event_type, occurred_at, registered_at, reported_by, registered_by::text, actor_snapshot,
            reason, evidence_description, before_state, after_state FROM svo.execution_order_events WHERE execution_order_id = $1`, [id],
  )
  const audits = await pool.query<JsonRecord>(
    `SELECT user_id::text, operation, "before", "after", actor_snapshot, reason FROM audit.logs
      WHERE table_name = 'svo.execution_orders' AND record_id = $1`, [id],
  )
  return { order: order.rows[0]!, events: events.rows, audits: audits.rows }
}

async function closeServer(instance: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => instance.close((error) => error ? reject(error) : resolve()))
}

async function startServer(audits?: AuditRepositoryContract): Promise<{ instance: Server; url: string }> {
  const instance = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, ...(audits ? { audits } : {}) }).listen(0)
  await new Promise<void>((resolve) => instance.once('listening', resolve))
  return { instance, url: `http://127.0.0.1:${(instance.address() as AddressInfo).port}` }
}

before(async () => {
  const database = new URL(getTestDatabaseUrl()).pathname
  assert.match(database, /_test$/)
  if (process.env.DATABASE_URL) assert.notEqual(database, new URL(process.env.DATABASE_URL).pathname)
  await setupTestDatabase()
  pool = getTestPool()
  assert.equal(`/${(await pool.query<{ name: string }>('SELECT current_database() AS name')).rows[0]!.name}`, database)
  const started = await startServer(); server = started.instance; baseUrl = started.url
})
beforeEach(async () => {
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  users = await seedRbacTestUsers(pool)
})
after(async () => {
  if (server) await closeServer(server)
  await closeTestPool()
})

test('ORD-01/15: atendente e administrador criam OPEN, OPENED e CREATE sem alterar ocorrência/veículo', async () => {
  for (const role of ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const) {
    const input = await eligible()
    const beforeState = await databaseState() as unknown[][]
    const result = await json(await call(input, role), 201)
    assert.deepEqual(Object.keys(result).sort(), ['id', 'status']); assert.equal(typeof result.id, 'string')
    assert.equal(result.status, 'OPEN')
    const { order, events, audits } = await history(result.id as string)
    assert.equal(order.occurrence_id, input.occurrenceId); assert.equal(order.team_id, input.teamId)
    assert.equal(order.vehicle_id, input.vehicleId); assert.equal(order.created_by, user(role).id)
    assert.equal(order.revision, 1); assert.equal(order.driver_id, null); assert.equal(order.driver_snapshot, null)
    assert.equal(events.length, 1); assert.equal(audits.length, 1)
    assert.equal(events[0]!.event_type, 'OPENED'); assert.equal(events[0]!.registered_by, user(role).id)
    assert.equal(events[0]!.reported_by, user(role).name)
    assert.equal(events[0]!.before_state, null)
    assert.equal((events[0]!.occurred_at as Date).getTime(), (order.opened_at as Date).getTime())
    assert.ok(events[0]!.registered_at instanceof Date)
    assert.deepEqual(events[0]!.actor_snapshot, { id: user(role).id, name: user(role).name, email: user(role).email, role })
    assert.equal(audits[0]!.operation, 'CREATE'); assert.equal(audits[0]!.user_id, user(role).id)
    assert.equal(audits[0]!.before, null)
    assert.deepEqual(audits[0]!.actor_snapshot, events[0]!.actor_snapshot)
    const afterState = await databaseState() as unknown[][]
    assert.deepEqual(afterState.slice(3), beforeState.slice(3))
    assert.equal((await pool.query('SELECT id FROM svo.team_members')).rows.length, 0)
  }
})

test('ORD-02: PENDING e CANCELED retornam 400 sem escrita', async () => {
  const input = await eligible()
  for (const status of ['PENDING', 'CANCELED'] as const) {
    input.occurrenceId = await insertLegacySvo(pool, user().id, status)
    await rejectsWithoutWrite(() => call(input), 400)
  }
})

test('ORD-03: unicidade histórica inclui todos os estados, inclusive finais', async () => {
  const input = await eligible(10)
  const created = await json(await call(input), 201)
  await rejectsWithoutWrite(() => call(input), 409)
  for (const status of ALL_STATUSES) {
    input.occurrenceId = await confirmedOccurrence()
    await insertLegacySvoOrder(pool, { ...input, actorId: user().id, status })
    await rejectsWithoutWrite(() => call(input), 409)
  }
  assert.equal((await history(created.id as string)).events.length, 1)
})

test('ORD-04: equipe inativa e veículos inelegíveis são recusados', async () => {
  const input = await eligible()
  const inactiveTeam = await insertSvoTeam(pool, false)
  await rejectsWithoutWrite(() => call({ ...input, teamId: inactiveTeam }), 409)
  for (const options of [{ status: 'INACTIVE' }, { status: 'IN_MAINTENANCE' },
    { operationType: 'ADMINISTRATIVE' }, { categories: ['PASSENGER'] }] as const) {
    const vehicleId = await insertSvoVehicle(pool, options)
    await rejectsWithoutWrite(() => call({ ...input, vehicleId }), 409)
  }
  await json(await call(input), 201)
})

test('ORD-04a: manutenção impeditiva OPEN/IN_PROGRESS recusa veículo AVAILABLE sem gravar', async () => {
  for (const status of ['OPEN', 'IN_PROGRESS'] as const) {
    const input = await eligible()
    await insertLegacyMaintenance(pool, { vehicleId: input.vehicleId, actorId: user('GESTOR').id, status, blocksVehicle: true })
    const body = await rejectsWithoutWrite(() => call(input), 409)
    assert.match(body.erro as string, /manutenção impeditiva/)
  }
})

test('ORD-04b: manutenção não impeditiva, finalizada ou de outro veículo preserva elegibilidade', async () => {
  for (const options of [
    { status: 'OPEN', blocksVehicle: false }, { status: 'IN_PROGRESS', blocksVehicle: false },
    { status: 'DONE', blocksVehicle: true }, { status: 'CANCELED', blocksVehicle: true },
  ] as const) {
    const input = await eligible()
    await insertLegacyMaintenance(pool, { ...options, vehicleId: input.vehicleId, actorId: user('GESTOR').id })
    await json(await call(input), 201)
  }
  const input = await eligible()
  await insertLegacyMaintenance(pool, { vehicleId: await insertSvoVehicle(pool), actorId: user('GESTOR').id,
    status: 'OPEN', blocksVehicle: true })
  await json(await call(input), 201)
})

test('ORD-05a: zero, última vaga, excesso e capacidade reduzida', async () => {
  const input = await eligible(0)
  await rejectsWithoutWrite(() => call(input), 409)
  await pool.query('UPDATE fleet.vehicles SET body_limit = 2 WHERE id = $1', [input.vehicleId])
  await json(await call(input), 201)
  input.occurrenceId = await confirmedOccurrence()
  await json(await call(input), 201)
  input.occurrenceId = await confirmedOccurrence()
  await rejectsWithoutWrite(() => call(input), 409)
  await pool.query('UPDATE fleet.vehicles SET body_limit = 1 WHERE id = $1', [input.vehicleId])
  await rejectsWithoutWrite(() => call(input), 409)
})

test('ORD-05b: quatro estados reservam vaga; três finais liberam; contagem ignora equipe e snapshots', async () => {
  const teamId = await insertSvoTeam(pool)
  for (const status of ALL_STATUSES) {
    const input = await eligible()
    const legacyOccurrence = await insertLegacySvo(pool, user().id, 'CONFIRMED')
    const legacyId = await insertLegacySvoOrder(pool, { ...input, occurrenceId: legacyOccurrence, teamId, actorId: user().id, status })
    assert.equal((await history(legacyId)).order.vehicle_snapshot, null)
    if (SVO_ORDER_OCCUPYING_STATUSES.some((active) => active === status)) {
      await rejectsWithoutWrite(() => call(input), 409)
    } else await json(await call(input), 201)
  }
})

test('ORD-06: referências, IDs e JSON inválidos não gravam nem ecoam dados', async () => {
  const input = await eligible()
  for (const field of ['occurrenceId', 'teamId', 'vehicleId']) {
    const result = await rejectsWithoutWrite(() => call({ ...input, [field]: MISSING_ID }), 404)
    assert.match(result.erro as string, /não encontrad/)
    for (const value of [undefined, null, 1, 0, '-1', '0', '01', '', ' 1', '1 ', '1.5', '1e2', '9223372036854775808', {}, []]) {
      await rejectsWithoutWrite(() => call({ ...input, [field]: value }), 400)
    }
  }
  for (const body of [null, [], true, 'SENTINELA', {}, { ...input, status: 'OPEN' },
    { solicitacaoId: '1', equipeId: '2', veiculoId: '3' }]) await rejectsWithoutWrite(() => call(body), 400)
  const logs: unknown[] = []; const original = console.error
  console.error = (...args: unknown[]) => { logs.push(args) }
  try {
    await rejectsWithoutWrite(() => fetch(`${baseUrl}/svo/orders`, {
      method: 'POST', headers: { Authorization: `Bearer ${user().token}`, 'Content-Type': 'application/json' },
      body: '{"SENTINELA_NOME":',
    }), 400)
    assert.deepEqual(logs, [])
  } finally { console.error = original }
})

test('ORD-07: RBAC atual, conta ativa e tokens válidos são obrigatórios', async () => {
  const input = await eligible()
  for (const role of ['GESTOR', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) {
    await rejectsWithoutWrite(() => call(input, role), 403)
    await rejectsWithoutWrite(() => call({ occurrenceId: MISSING_ID }, role), 403)
  }
  await rejectsWithoutWrite(() => call(input, null), 401)
  await rejectsWithoutWrite(() => call(input, 'ATENDENTE_SVO', 'token-invalido'), 401)
  const expired = generateRbacUserToken(user(), RBAC_JWT_CONFIG.secret, { expiresIn: -1 })
  await rejectsWithoutWrite(() => call(input, 'ATENDENTE_SVO', expired), 401)
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [user().id])
  await rejectsWithoutWrite(() => call(input), 401)
  await pool.query('UPDATE auth.users SET active = true, role_id = $2 WHERE id = $1', [user().id, user('GESTOR').roleId])
  await rejectsWithoutWrite(() => call(input), 403)
  const missingToken = generateRbacUserToken({ id: MISSING_ID, role: 'ATENDENTE_SVO' })
  await rejectsWithoutWrite(() => call(input, 'ATENDENTE_SVO', missingToken), 401)
})

/** Observa espera real no PostgreSQL; o atraso apenas cede CPU entre observações, com prazo limitado. */
async function waitForBlocked(count: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `SELECT count(pid)::integer AS count FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND cardinality(pg_blocking_pids(pid)) > 0
          AND (query LIKE $1 OR query LIKE $2 OR query LIKE $3 OR query LIKE $4 OR query LIKE $5 OR query LIKE $6 OR query LIKE $7)`,
      ['%FROM svo.occurrences%', '%FROM fleet.vehicles%', '%FROM svo.teams%', '%FROM svo.execution_orders%',
        '%FROM svo.team_members%', '%UPDATE svo.teams%', '%UPDATE svo.team_members%'],
    )
    if (result.rows[0]!.count >= count) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail(`Não foram observadas ${count} transações aguardando trava.`)
}

async function holdLock(query: string, id: string): Promise<PoolClient> {
  const client = await pool.connect()
  await client.query('BEGIN')
  await client.query(query, [id])
  return client
}

test('ORD-08: mesma ocorrência concorrente, inclusive veículos distintos, produz 201/409', async () => {
  for (const distinctVehicle of [false, true]) {
    const input = await eligible(2)
    const other = distinctVehicle ? { ...input, vehicleId: await insertSvoVehicle(pool) } : input
    const holder = await holdLock('SELECT id FROM svo.occurrences WHERE id = $1 FOR UPDATE', input.occurrenceId)
    const first = call(input); const second = call(other)
    try {
      await waitForBlocked(2)
      await holder.query('COMMIT')
      const results = await Promise.all([first, second])
      assert.deepEqual(results.map((res) => res.status).sort(), [201, 409])
      const saved = await json(results.find((res) => res.status === 201)!, 201)
      const stored = await history(saved.id as string)
      assert.equal(stored.events.length, 1); assert.equal(stored.audits.length, 1)
      assert.equal((await pool.query('SELECT id FROM svo.execution_orders WHERE occurrence_id = $1', [input.occurrenceId])).rows.length, 1)
    } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([first, second]) }
  }
})

test('ORD-09: duas ocorrências disputam última vaga sem exceder capacidade', async () => {
  for (const capacity of [1, 2]) {
    const input = await eligible(capacity)
    const other = { ...input, occurrenceId: await confirmedOccurrence() }
    const holder = await holdLock('SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', input.vehicleId)
    const first = call(input); const second = call(other)
    try {
      await waitForBlocked(2)
      await holder.query('COMMIT')
      const results = await Promise.all([first, second])
      assert.deepEqual(results.map((res) => res.status).sort(), capacity === 1 ? [201, 409] : [201, 201])
      const count = await new SvoOrdersRepository().countOccupyingOrders(input.vehicleId, holder)
      assert.equal(count, capacity)
      const counts = await pool.query<{ events: number; audits: number }>(
        `SELECT (SELECT count(e.id)::integer FROM svo.execution_order_events e
                 JOIN svo.execution_orders o ON o.id = e.execution_order_id WHERE o.vehicle_id = $1) AS events,
                (SELECT count(a.id)::integer FROM audit.logs a JOIN svo.execution_orders o ON o.id::text = a.record_id
                 WHERE a.table_name = 'svo.execution_orders' AND o.vehicle_id = $1) AS audits`, [input.vehicleId],
      )
      assert.deepEqual(counts.rows[0], { events: capacity, audits: capacity })
    } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([first, second]) }
  }
})

test('ORD-10: criação aguarda e lê alterações confirmadas de veículo, equipe e manutenção', async () => {
  for (const target of ['status', 'capacity', 'team', 'maintenance'] as const) {
    const input = await eligible()
    const team = target === 'team'
    const holder = await holdLock(team ? 'SELECT id FROM svo.teams WHERE id = $1 FOR UPDATE'
      : 'SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', team ? input.teamId : input.vehicleId)
    const pending = call(input)
    try {
      await waitForBlocked(1)
      if (team) await holder.query('UPDATE svo.teams SET active = false WHERE id = $1', [input.teamId])
      else if (target === 'status') await holder.query("UPDATE fleet.vehicles SET status = 'IN_MAINTENANCE' WHERE id = $1", [input.vehicleId])
      else if (target === 'maintenance') await insertLegacyMaintenance(holder, {
        vehicleId: input.vehicleId, actorId: user('GESTOR').id, status: 'OPEN', blocksVehicle: true,
      })
      else await holder.query('UPDATE fleet.vehicles SET body_limit = 0 WHERE id = $1', [input.vehicleId])
      await holder.query('COMMIT')
      await rejectsWithoutWrite(() => pending, 409)
    } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([pending]) }
  }
})

test('ORD-11/14: falha de auditoria desfaz tudo, sanitiza logs e permite nova tentativa', async () => {
  const input = await eligible()
  const audits = new AuditRepository(pool)
  const broken = await startServer({
    async create(data, client) {
      await audits.create(data, client)
      assert.ok(client)
      await client.query('SELECT $1::integer', ['SENTINELA_NOME SENTINELA_TELEFONE SENTINELA_LOCAL'])
      throw new Error('A falha SQL esperada não ocorreu.')
    },
  })
  const logs: unknown[] = []; const original = console.error; console.error = (...args: unknown[]) => { logs.push(args) }
  try {
    await rejectsWithoutWrite(() => call(input, 'ATENDENTE_SVO', undefined, broken.url), 500)
    assert.equal(logs.length, 1)
    assert.doesNotMatch(JSON.stringify(logs), /SENTINELA|22P02|stack|detail/)
    assert.match(JSON.stringify(logs), /CREATE_ORDER/)
  } finally { console.error = original; await closeServer(broken.instance) }
  await json(await call(input), 201)
})

test('ORD-12: falha SQL no evento faz rollback real e libera a conexão', async () => {
  const input = await eligible()
  class BrokenEvents extends SvoOrdersRepository {
    override async createOpenedEvent(_event: Parameters<SvoOrdersRepository['createOpenedEvent']>[0], client: PoolClient): Promise<void> {
      await client.query('SELECT $1::integer', ['SENTINELA_EVIDENCIA'])
    }
  }
  const service = new SvoOrdersService(new SvoOccurrencesRepository(pool), new BrokenEvents(),
    new VehiclesRepository(pool), new AuditService(new AuditRepository(pool)))
  const state = await databaseState()
  for (let attempt = 0; attempt < 11; attempt++) {
    await assert.rejects(service.createOrder(input, user().id), (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === '22P02')
  }
  assert.deepEqual(await databaseState(), state)
  await json(await call(input), 201)
})

test('ORD-13/14: snapshots preservam contexto; auditoria e resposta excluem conteúdo pessoal', async () => {
  const input = await eligible()
  const result = await json(await call(input), 201)
  const original = await history(result.id as string)
  const eventState = original.events[0]!.after_state as JsonRecord
  assert.deepEqual(eventState.occurrenceSnapshot, original.order.occurrence_snapshot)
  assert.deepEqual(eventState.teamSnapshot, original.order.team_snapshot)
  assert.deepEqual(eventState.vehicleSnapshot, original.order.vehicle_snapshot)
  const occurrence = original.order.occurrence_snapshot as JsonRecord
  assert.deepEqual(Object.keys(occurrence).sort(), ['id', 'status', 'revision', 'requesterName', 'requesterPhone',
    'requesterType', 'location', 'description', 'notes', 'receivedAt', 'triagedAt', 'triagedBy', 'attendantId', 'evidenceDescription'].sort())
  for (const key of ['requesterName', 'requesterPhone', 'location', 'description', 'notes', 'evidenceDescription'] as const) {
    assert.equal(occurrence[key], svoInput()[key])
  }
  assert.deepEqual(Object.keys(original.audits[0]!.after as JsonRecord).sort(),
    ['id', 'occurrenceId', 'teamId', 'vehicleId', 'status', 'openedAt', 'revision'].sort())
  assert.doesNotMatch(JSON.stringify([result, original.audits]), /SENTINELA/)
  await pool.query("UPDATE svo.teams SET name = 'Nome posterior fictício', active = false, revision = revision + 1 WHERE id = $1", [input.teamId])
  await pool.query('UPDATE fleet.vehicles SET body_limit = 0, revision = revision + 1 WHERE id = $1', [input.vehicleId])
  await pool.query("UPDATE svo.occurrences SET requester_name = 'Nome posterior fictício', revision = revision + 1 WHERE id = $1", [input.occurrenceId])
  await pool.query("UPDATE auth.users SET name = 'Operador posterior fictício' WHERE id = $1", [user().id])
  assert.deepEqual(await history(result.id as string), original)
})

test('ORD repository: INSERT e evento respeitam cliente e rollback explícito', async () => {
  const input = await eligible()
  const created = await json(await call(input), 201)
  const stored = await history(created.id as string)
  const afterState = stored.events[0]!.after_state as JsonRecord
  const secondOccurrence = await confirmedOccurrence()
  const client = await pool.connect()
  const beforeState = await databaseState()
  try {
    await client.query('BEGIN')
    const repository = new SvoOrdersRepository()
    const order = await repository.create({
      ...input, occurrenceId: secondOccurrence, status: 'OPEN', openedAt: new Date(), createdBy: user().id, revision: 1,
      occurrenceSnapshot: afterState.occurrenceSnapshot as Parameters<SvoOrdersRepository['create']>[0]['occurrenceSnapshot'],
      teamSnapshot: afterState.teamSnapshot as Parameters<SvoOrdersRepository['create']>[0]['teamSnapshot'],
      vehicleSnapshot: afterState.vehicleSnapshot as Parameters<SvoOrdersRepository['create']>[0]['vehicleSnapshot'],
      teamShiftId: null,
      allocationSnapshot: null,
    }, client)
    await repository.createOpenedEvent({ order, actor: { id: user().id, name: user().name, email: user().email, role: user().role },
      reason: 'Verificação fictícia de transação.', evidenceDescription: 'Teste sintético.' }, client)
    assert.equal((await client.query('SELECT id FROM svo.execution_order_events WHERE execution_order_id = $1', [order.id])).rows.length, 1)
    assert.equal((await pool.query('SELECT id FROM svo.execution_orders WHERE id = $1', [order.id])).rows.length, 0)
    await client.query('ROLLBACK')
    assert.deepEqual(await databaseState(), beforeState)
  } finally { await client.query('ROLLBACK'); client.release() }
})

test('ORD-03: constraint real de unicidade é traduzida após rollback', async () => {
  const input = await eligible(2)
  await json(await call(input), 201)
  class SkipEarlyDuplicateCheck extends SvoOrdersRepository {
    override async findByOccurrenceId(): Promise<{ id: string; teamId: string; vehicleId: string } | null> { return null }
  }
  const service = new SvoOrdersService(new SvoOccurrencesRepository(pool), new SkipEarlyDuplicateCheck(),
    new VehiclesRepository(pool), new AuditService(new AuditRepository(pool)))
  const state = await databaseState()
  await assert.rejects(service.createOrder(input, user().id), (error: unknown) =>
    error instanceof SvoOrderServiceError && error.code === 'ORDER_ALREADY_EXISTS')
  assert.deepEqual(await databaseState(), state)
})

test('RESULT-01: conclusão em IN_SERVICE grava horários iguais, evento, auditoria, detalhe e libera reserva', async () => {
  const order = await trackedOrder()
  const original = await history(order.id)
  await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
  const inService = await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 2 }), 200)
  assert.deepEqual(inService.allowedResults, ['COMPLETED', 'NOT_PERFORMED'])
  const beforeCall = Date.now()
  const completed = await json(await postResult(order.id, {
    result: 'COMPLETED', revision: 3, notes: '  Observação sintética de encerramento QA.  ',
  }), 200)
  assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.result, 'COMPLETED')
  assert.equal(completed.revision, 4); assert.equal(completed.closedBy, user('EQUIPE_SVO').id)
  assert.equal(completed.failureReason, null); assert.equal(completed.notes, 'Observação sintética de encerramento QA.')
  assert.equal(completed.collectedAt, completed.closedAt)
  assert.ok(Date.parse(completed.closedAt as string) >= beforeCall - 1000)
  assert.deepEqual(completed.allowedTransitions, []); assert.deepEqual(completed.allowedResults, [])
  const list = await (await track('', 'GESTOR')).json() as JsonRecord[]
  assert.equal(list[0]!.result, 'COMPLETED'); assert.deepEqual(list[0]!.allowedResults, [])
  assert.doesNotMatch(JSON.stringify(list), /failureReason|notes|closedBy|Observação sintética/)
  const detail = await json(await track(`/${order.id}`, 'GESTOR'), 200)
  assert.equal(detail.notes, 'Observação sintética de encerramento QA.'); assert.equal(detail.closedBy, user('EQUIPE_SVO').id)
  const stored = await history(order.id)
  const event = stored.events.find((row) => row.event_type === 'COMPLETED')!
  assert.ok(event); assert.equal((event.occurred_at as Date).toISOString(), completed.closedAt)
  assert.equal(event.registered_by, user('EQUIPE_SVO').id); assert.equal(event.reported_by, user('EQUIPE_SVO').name)
  assert.equal((event.after_state as JsonRecord).collectedAt, completed.collectedAt)
  assert.deepEqual(stored.order.occurrence_snapshot, original.order.occurrence_snapshot)
  assert.equal(stored.audits.filter((row) => row.operation === 'UPDATE').length, 3)
  assert.doesNotMatch(JSON.stringify(stored.audits), /SENTINELA|Observação sintética/)
  await json(await call({ occurrenceId: await confirmedOccurrence(), teamId: order.teamId, vehicleId: order.vehicleId }), 201)
})

test('RESULT-02: não realização exige motivo em IN_TRANSIT/IN_SERVICE; contratos e FSM inválidos não gravam', async () => {
  for (const targetStatus of ['IN_TRANSIT', 'IN_SERVICE'] as const) {
    const order = await trackedOrder()
    await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
    let revision = 2
    if (targetStatus === 'IN_SERVICE') {
      await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 2 }), 200)
      revision = 3
    } else {
      await rejectsWithoutWrite(() => postResult(order.id, { result: 'COMPLETED', revision }), 409)
    }
    for (const reason of [undefined, null, '', '   ']) {
      const err = await rejectsWithoutWrite(() => postResult(order.id, { result: 'NOT_PERFORMED', revision, failureReason: reason }), 400)
      assert.equal(err.erro, 'Informe o motivo da não realização.')
    }
    const closed = await json(await postResult(order.id, {
      result: 'NOT_PERFORMED', revision, failureReason: '  Local fictício inacessível QA.  ',
    }), 200)
    assert.equal(closed.status, 'NOT_PERFORMED'); assert.equal(closed.result, 'NOT_PERFORMED')
    assert.equal(closed.collectedAt, null); assert.ok(closed.closedAt)
    assert.equal(closed.failureReason, 'Local fictício inacessível QA.')
    await rejectsWithoutWrite(() => postResult(order.id, { result: 'COMPLETED', revision: revision + 1 }), 409)
  }
  const openOrder = await trackedOrder()
  await rejectsWithoutWrite(() => postResult(openOrder.id, { result: 'NOT_PERFORMED', revision: 1, failureReason: 'Motivo QA' }), 409)
  await rejectsWithoutWrite(() => track(`/${openOrder.id}/status`, 'EQUIPE_SVO', { status: 'COMPLETED', revision: 1 }), 409)
  for (const body of [
    null, [], {}, { result: 'COMPLETED', revision: 1, failureReason: 'Contraditório' },
    { result: 'COMPLETED', revision: 1, closedAt: '2026-11-15T12:00:00Z' }, { resultado: 'CONCLUIDA', revision: 1 },
  ]) {
    await rejectsWithoutWrite(() => postResult(openOrder.id, body), 400)
  }
})

test('RESULT-03: RBAC, outra equipe, vínculo inativo e revogação concorrente impedem encerramento', async () => {
  const order = await trackedOrder()
  await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
  for (const role of ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA'] as const) {
    await rejectsWithoutWrite(() => postResult(order.id, { result: 'NOT_PERFORMED', revision: 2, failureReason: 'Motivo QA' }, role), 403)
  }
  await rejectsWithoutWrite(() => postResult(order.id, { result: 'NOT_PERFORMED', revision: 2, failureReason: 'Motivo QA' }, null), 401)
  const otherTeamOrder = await trackedOrder(false)
  await rejectsWithoutWrite(() => postResult(otherTeamOrder.id, { result: 'NOT_PERFORMED', revision: 1, failureReason: 'Motivo QA' }), 403)
  const holder = await holdLock('SELECT id FROM svo.teams WHERE id = $1 FOR UPDATE', order.teamId)
  const pending = postResult(order.id, { result: 'NOT_PERFORMED', revision: 2, failureReason: 'Motivo QA' })
  try {
    await waitForBlocked(1)
    await holder.query('UPDATE svo.teams SET active = false WHERE id = $1', [order.teamId])
    await holder.query('COMMIT')
    await rejectsWithoutWrite(() => pending, 403)
  } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([pending]) }
})

test('RESULT-04: concorrência de encerramento produz 200/409, um único evento e libera exatamente uma vaga', async () => {
  const firstOrder = await trackedOrder()
  const secondOcc = await confirmedOccurrence()
  await pool.query('UPDATE fleet.vehicles SET body_limit = 2 WHERE id = $1', [firstOrder.vehicleId])
  const secondOrder = await json(await call({ occurrenceId: secondOcc, teamId: firstOrder.teamId, vehicleId: firstOrder.vehicleId }), 201)
  await json(await track(`/${firstOrder.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
  await json(await track(`/${firstOrder.id}/status`, 'EQUIPE_SVO', { status: 'IN_SERVICE', revision: 2 }), 200)
  const holder = await holdLock('SELECT id FROM svo.execution_orders WHERE id = $1 FOR UPDATE', firstOrder.id)
  const a = postResult(firstOrder.id, { result: 'COMPLETED', revision: 3 })
  const b = postResult(firstOrder.id, { result: 'NOT_PERFORMED', revision: 3, failureReason: 'Disputa fictícia QA' })
  try {
    await waitForBlocked(2); await holder.query('COMMIT')
    assert.deepEqual((await Promise.all([a, b])).map((res) => res.status).sort(), [200, 409])
    const stored = await history(firstOrder.id)
    assert.equal(stored.events.filter((e) => e.event_type === 'COMPLETED' || e.event_type === 'NOT_PERFORMED').length, 1)
    assert.equal((await pool.query<{ count: number }>(
      'SELECT count(id)::integer AS count FROM svo.execution_orders WHERE vehicle_id = $1 AND status = ANY($2::text[])',
      [firstOrder.vehicleId, SVO_ORDER_OCCUPYING_STATUSES])).rows[0]!.count, 1)
    assert.ok(secondOrder.id)
  } finally { await holder.query('ROLLBACK'); holder.release(); await Promise.allSettled([a, b]) }
})

test('RESULT-05: rollback de evento/auditoria, sanitização RECORD_RESULT e trigger append-only', async () => {
  const order = await trackedOrder()
  await json(await track(`/${order.id}/status`, 'EQUIPE_SVO', { status: 'IN_TRANSIT', revision: 1 }), 200)
  const audits = new AuditRepository(pool)
  const broken = await startServer({ async create(data, client) {
    await audits.create(data, client); await client!.query('SELECT $1::integer', ['SENTINELA_LOCAL'])
    throw new Error('Falha SQL esperada não ocorreu')
  } })
  const original = console.error; const logs: unknown[] = []; console.error = (...args: unknown[]) => { logs.push(args) }
  try {
    const err = await rejectsWithoutWrite(() => postResult(order.id, {
      result: 'NOT_PERFORMED', revision: 2, failureReason: 'Motivo sintético QA',
    }, 'EQUIPE_SVO', broken.url), 500)
    assert.equal(err.erro, 'Não foi possível confirmar o encerramento da ordem. Consulte a situação antes de tentar novamente.')
    assert.match(JSON.stringify(logs), /RECORD_RESULT/); assert.doesNotMatch(JSON.stringify(logs), /SENTINELA|22P02|stack/)
  } finally { console.error = original; await closeServer(broken.instance) }
  await json(await postResult(order.id, { result: 'NOT_PERFORMED', revision: 2, failureReason: 'Motivo sintético QA' }), 200)
  await assert.rejects(pool.query('DELETE FROM svo.execution_order_events WHERE execution_order_id = $1', [order.id]))
})
