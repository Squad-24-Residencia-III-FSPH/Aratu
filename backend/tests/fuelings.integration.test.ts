import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { Pool, PoolClient } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { FuelingsRepository } from '../src/repositories/fuelings.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { FuelingsService } from '../src/services/fuelings.service'
import { AuditService } from '../src/services/audit.service'
import type { UserRole } from '../src/types/auth'
import type { FuelingVersion, FuelingDetail, FuelingList } from '../src/types/fueling.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
let vehicleId: string
let failAudit = false
let vehicleSequence = 0
const AT = '2026-10-02T12:00:00.000Z'
const EARLIER = '2026-10-01T12:00:00.000Z'
const LATER = '2026-10-03T12:00:00.000Z'
const metadata = { reportedBy: 'Equipe Fictícia QA', reason: 'Registro fictício de abastecimento',
  evidenceDescription: 'Comprovante fictício QA-001' }
type Options = { body?: unknown; role?: UserRole | null; key?: string; token?: string }
async function api(path: string, method = 'GET', options: Options = {}): Promise<Response> {
  const role = options.role === undefined ? 'GESTOR' : options.role
  return fetch(baseUrl + path, { method, headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': options.key ?? randomUUID(),
    ...(role ? { Authorization: `Bearer ${options.token ?? users.get(role)!.token}` } : {}),
  }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
}
async function json<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body as T
}
async function error(response: Response, status: number, message = /./): Promise<void> {
  const result = await json<{ erro: string }>(response, status)
  assert.deepEqual(Object.keys(result), ['erro'])
  assert.match(result.erro, message)
  assert.doesNotMatch(result.erro, /SELECT|INSERT|stack|postgres|password|example\.test|cnh|cpf/i)
}
function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...metadata, vehicleId, fueledAt: AT, fuelType: 'DIESEL_S10', liters: '40.500',
    totalValue: '250.00', odometerKm: 51200, station: 'Posto Fictício QA', ...overrides }
}
async function create(overrides: Record<string, unknown> = {}, role: UserRole = 'GESTOR'): Promise<FuelingVersion> {
  return json(await api('/fuelings', 'POST', { body: input(overrides), role }), 201)
}
async function rectify(version: FuelingVersion, overrides: Record<string, unknown> = {}, key?: string): Promise<FuelingVersion> {
  return json(await api('/fuelings/' + version.id, 'PUT', {
    body: { ...metadata, expectedRevision: version.revision, ...overrides }, ...(key ? { key } : {}),
  }))
}
async function newVehicle(): Promise<string> {
  const vehicle = await json<{ id: string }>(await api('/vehicles', 'POST', { body: {
    ...metadata, licensePlate: `QAT${++vehicleSequence}A64`, categories: ['BODY'], seats: 2,
    bodyLimit: 2, weightLimit: null, operationType: 'SVO',
  } }), 201)
  return vehicle.id
}
async function newDriver(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at, status)
     VALUES ('Motorista Fictício QA', lpad(nextval('fleet.drivers_id_seq')::text,11,'0'),
       'CNH-FICTICIA-QA', 'D', '2020-01-01', 'INACTIVE') RETURNING id::text`)
  return result.rows[0]!.id
}
async function reading(km: number, at: string, options: {
  vehicle?: string; predecessor?: string; annulled?: boolean; fuelingId?: string; tripId?: string; type?: string
} = {}, client?: PoolClient): Promise<string> {
  const actor = users.get('GESTOR')!
  const result = await (client ?? pool).query<{ id: string }>(
    `INSERT INTO trip.odometer_readings (vehicle_id, reading_type, odometer_km, occurred_at, reported_by,
       registered_by, actor_snapshot, reason, supersedes_id, is_annulled, fueling_id, trip_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12) RETURNING id::text`,
    [options.vehicle ?? vehicleId, options.type ?? (options.fuelingId ? 'FUELING' : 'CHECK'), km, at,
      metadata.reportedBy, actor.id, JSON.stringify({ id: actor.id, name: actor.name, email: actor.email, role: actor.role }),
      metadata.reason, options.predecessor ?? null, options.annulled ?? false, options.fuelingId ?? null, options.tripId ?? null],
  )
  return result.rows[0]!.id
}
async function legacyFueling(overrides: { at?: string; km?: number; supersedes?: string; annulled?: boolean; vehicle?: string; revision?: number } = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.fuelings (vehicle_id, fueled_at, fuel_type, liters, total_value, odometer_km, created_by,
       supersedes_id, is_annulled, annulment_reason, revision)
     VALUES ($1,$2,'DIESEL',10,60,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
    [overrides.vehicle ?? vehicleId, overrides.at ?? AT, overrides.km ?? 51200, users.get('GESTOR')!.id,
      overrides.supersedes ?? null, overrides.annulled ?? false, overrides.annulled ? 'Anulação fictícia QA' : null,
      overrides.revision ?? 1],
  )
  return result.rows[0]!.id
}
/** Compara conteúdo completo das quatro trilhas, sem depender de sequências transacionais. */
async function ledger(): Promise<unknown[]> {
  const tables = ['fleet.fuelings', 'fleet.fueling_events', 'trip.odometer_readings', 'audit.logs'] as const
  const results = await Promise.all(tables.map(table => pool.query<{ row: unknown }>(
    `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)))
  return results.map(result => result.rows.map(row => row.row))
}
async function waitForVehicleLocks(count: number): Promise<void> {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const result = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM pg_stat_activity WHERE datname = current_database()
       AND wait_event_type = 'Lock' AND query LIKE $1`, ['%FROM fleet.vehicles%FOR UPDATE%'])
    if (result.rows[0]!.total >= count) return
    await setImmediate()
  }
  assert.fail('As conexões concorrentes não chegaram à trava do veículo.')
}
async function race(requests: (() => Promise<Response>)[]): Promise<Response[]> {
  const client = await pool.connect()
  let pending: Promise<Response[]> | undefined
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', [vehicleId])
    pending = Promise.all(requests.map(request => request()))
    await waitForVehicleLocks(requests.length)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    if (pending) await pending
  }
  return pending!
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const db = await pool.query<{ name: string }>('SELECT current_database() AS name')
  assert.match(db.rows[0]!.name, /test/i, 'Somente banco de teste pode receber fixtures destrutivas.')
  const audits = new AuditRepository(pool)
  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, audits: {
    create: async (entry, client) => {
      if (failAudit && entry.table === 'fleet.fuelings') throw new Error('Falha fictícia de auditoria QA')
      return audits.create(entry, client)
    },
  } })
  server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
beforeEach(async () => {
  failAudit = false
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  users = await seedRbacTestUsers(pool)
  vehicleSequence = 0
  vehicleId = await newVehicle()
})
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()))
  await closeTestPool()
})

test('QA01: gestor e administrador registram fato, leitura, evento e auditoria com autoria segura', async () => {
  const driverId = await newDriver()
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const version = await create({ driverId }, role)
    assert.equal(version.createdBy, users.get(role)!.id)
    assert.equal(version.actorSnapshot?.role, role)
    assert.deepEqual(Object.keys(version.driverSnapshot!).sort(), ['id', 'name'])
    assert.equal(version.revision, 1)
    assert.equal(version.supersedesId, null)
    assert.equal(version.liters, '40.500')
    assert.equal(version.totalValue, '250.00')
    assert.ok(version.registeredAt)
    assert.equal('requestKey' in version, false)
    const detail = await json<FuelingDetail>(await api('/fuelings/' + version.id))
    assert.deepEqual(detail.fueling, version)
    assert.equal(detail.events[0]!.eventType, 'RECORDED')
    assert.deepEqual(detail.events[0]!.afterState, version)
    const rows = await pool.query<{ operation: string; user_id: string; before: unknown; after: FuelingVersion }>(
      'SELECT operation, user_id::text, before, after FROM audit.logs WHERE table_name = $1 AND record_id = $2',
      ['fleet.fuelings', version.id])
    assert.equal(rows.rows[0]!.operation, 'CREATE')
    assert.equal(rows.rows[0]!.user_id, users.get(role)!.id)
    assert.equal(rows.rows[0]!.before, null)
    assert.deepEqual(rows.rows[0]!.after, version)
  }
  const readings = await pool.query('SELECT id FROM trip.odometer_readings')
  assert.equal(readings.rowCount, 2)
})

test('QA02/05/17: entradas inválidas não alteram fatos nem trilhas', async () => {
  const original = await ledger()
  const invalid: Record<string, unknown>[] = [
    ...['0', '-1', '1.0001', '10000000', '1e2', 'NaN', '1,5', '', 2, null].map(liters => ({ liters })),
    ...['0', '-1', '1.001', '10000000000', 'Infinity', 3, null].map(totalValue => ({ totalValue })),
    ...[-1, 1.5, 2147483648, '10', null].map(odometerKm => ({ odometerKm })),
    ...['2026-02-30T12:00:00Z', '2026-10-02T24:00:00Z', '2026-10-02T12:00:00',
      '0001-01-01T00:00:00+01:00', 'invalid'].map(fueledAt => ({ fueledAt })),
    { fuelType: 'INVALID' }, { vehicleId: '9223372036854775808' }, { vehicleId: 1 }, { station: '' },
    { reason: '' }, { reportedBy: '' }, { evidenceDescription: null }, { attachmentUrl: 'file:///qa', evidenceDescription: null },
    { createdBy: '1' }, { actorSnapshot: {} }, { supersedesId: '1' }, { revision: 1 }, { isAnnulled: false },
  ]
  for (const overrides of invalid) await error(await api('/fuelings', 'POST', { body: input(overrides) }), 400)
  for (const field of ['vehicleId', 'fueledAt', 'liters', 'totalValue', 'odometerKm', 'fuelType', 'reason', 'reportedBy']) {
    const body = input(); delete body[field]
    await error(await api('/fuelings', 'POST', { body }), 400)
  }
  for (const body of [null, [], 'texto']) await error(await api('/fuelings', 'POST', { body }), 400)
  await error(await api('/fuelings', 'POST', { body: input(), key: '' }), 400, /Idempotency-Key/)
  await error(await api('/fuelings', 'POST', { body: input({ vehicleId: '999999' }) }), 404, /Veículo/)
  await error(await api('/fuelings', 'POST', { body: input({ driverId: '999999' }) }), 404, /Motorista/)
  assert.deepEqual(await ledger(), original)
})

test('QA02/06: precisão decimal, limites exatos, filtros AND e totais de todas as páginas', async () => {
  const driverId = await newDriver()
  await create({ driverId, fueledAt: EARLIER, liters: '0.1', totalValue: '0.10' })
  const middle = await create({ driverId, liters: '0.2', totalValue: '0.20' })
  await create({ driverId, fueledAt: LATER, liters: '1', totalValue: '1' })
  await create({ driverId: null })
  await create({ vehicleId: await newVehicle(), driverId })
  const filters = `vehicleId=${vehicleId}&driverId=${driverId}&from=${EARLIER}&to=${LATER}&pageSize=1`
  const result = await json<FuelingList>(await api('/fuelings?' + filters))
  assert.equal(result.items[0]!.id, middle.id)
  assert.equal(result.total, 2)
  assert.equal(result.totalPages, 2)
  assert.equal(result.totalLiters, '0.300')
  assert.equal(result.totalValue, '0.30')
  const page2 = await json<FuelingList>(await api('/fuelings?' + filters + '&page=2'))
  assert.equal(page2.items[0]!.fueledAt, EARLIER)
  assert.equal(page2.totalValue, result.totalValue)
  const empty = await json<FuelingList>(await api('/fuelings?vehicleId=999999'))
  assert.deepEqual(empty, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, totalLiters: '0.000', totalValue: '0.00' })
  const max = await create({ vehicleId: await newVehicle(), liters: '9999999.999', totalValue: '9999999999.99', odometerKm: 2147483647 })
  assert.equal(max.liters, '9999999.999')
  const equalTime = await json<FuelingList>(await api('/fuelings?vehicleId=' + vehicleId))
  assert.deepEqual(equalTime.items.filter(i => i.fueledAt === AT).map(i => i.id),
    equalTime.items.filter(i => i.fueledAt === AT).map(i => i.id).sort((a, b) => Number(b) - Number(a)))
})

test('QA03/04/15: retroativo respeita anterior, posterior e igualdade sem usar a leitura atual como mínimo', async () => {
  await reading(51000, EARLIER)
  await reading(52000, LATER)
  const original = await ledger()
  for (const odometerKm of [50900, 52100]) await error(await api('/fuelings', 'POST', { body: input({ odometerKm }) }), 422, /quilometragem/i)
  assert.deepEqual(await ledger(), original)
  const version = await create()
  assert.equal(version.odometerKm, 51200)
  await error(await api('/fuelings/' + version.id, 'PUT', { body: { ...metadata, expectedRevision: 1, odometerKm: 50900 } }), 422)
  const corrected = await rectify(version, { odometerKm: 51000 })
  await rectify(corrected, { odometerKm: 52000 })
})

test('QA05: data futura é 422 em criação e correção; datas equivalentes produzem replay', async () => {
  const key = randomUUID()
  const version = await json<FuelingVersion>(await api('/fuelings', 'POST', { key,
    body: input({ fueledAt: '2026-10-02T09:00:00-03:00', liters: '40.5', totalValue: '250' }) }), 201)
  const replay = await json<FuelingVersion>(await api('/fuelings', 'POST', { key, body: input() }), 201)
  assert.deepEqual(replay, version)
  const snapshot = await ledger()
  await error(await api('/fuelings', 'POST', { body: input({ fueledAt: '9999-01-01T00:00:00Z' }) }), 422, /futuro/)
  await error(await api('/fuelings/' + version.id, 'PUT', { body: {
    ...metadata, expectedRevision: 1, fueledAt: '9999-01-01T00:00:00Z',
  } }), 422)
  assert.deepEqual(await ledger(), snapshot)
})

test('QA06/20: consultas rejeitam filtros repetidos, formas inválidas e identificadores malformados', async () => {
  for (const query of ['vehicleId=1&vehicleId=2', 'page=0', 'page=1.2', 'page=1e2', 'pageSize=101',
    'pageSize=', 'driverId=-1', 'from=invalido', `from=${LATER}&to=${EARLIER}`, 'unknown=x', 'vehicleId[]=1']) {
    await error(await api('/fuelings?' + query), 400)
  }
  await error(await api('/fuelings/abc'), 400)
  await error(await api('/fuelings/99999'), 404)
})

test('QA07: os quatro endpoints autorizam somente gestor/administrador antes de revelar registros', async () => {
  const snapshot = await ledger()
  for (const role of ['MOTORISTA', 'SOLICITANTE', 'ATENDENTE_SVO', 'EQUIPE_SVO', null] as const) {
    for (const [path, method] of [['/fuelings','GET'], ['/fuelings/99999','GET'], ['/fuelings','POST'], ['/fuelings/99999','PUT']]) {
      await error(await api(path!, method!, { role, ...(method === 'GET' ? {} : { body: input() }) }), role ? 403 : 401)
    }
  }
  for (const [path, method] of [['/fuelings','GET'], ['/fuelings/99999','GET'], ['/fuelings','POST'], ['/fuelings/99999','PUT']]) {
    await error(await api(path!, method!, { token: 'token-invalido', ...(method === 'GET' ? {} : { body: input() }) }), 401)
  }
  assert.deepEqual(await ledger(), snapshot)
})

test('QA08/09: duas retificações preservam bytes originais, snapshots, eventos e totais vigentes', async () => {
  const driverId = await newDriver()
  const version = await create({ driverId })
  const original = await pool.query<{ row: unknown }>('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1', [version.id])
  await pool.query("UPDATE fleet.vehicles SET license_plate='ALT1A64' WHERE id=$1", [vehicleId])
  await pool.query("UPDATE fleet.drivers SET name='Nome Fictício Alterado' WHERE id=$1", [driverId])
  await pool.query("UPDATE auth.users SET name='Gestor Fictício Alterado' WHERE id=$1", [users.get('GESTOR')!.id])
  const second = await rectify(version, { odometerKm: 51100, liters: '30', totalValue: '200', station: 'Outro Posto Fictício',
    notes: 'Nota fictícia', fueledAt: EARLIER })
  assert.notEqual(second.id, version.id)
  assert.equal(second.supersedesId, version.id)
  assert.equal(second.revision, 2)
  assert.deepEqual(second.vehicleSnapshot, version.vehicleSnapshot)
  assert.deepEqual(second.driverSnapshot, version.driverSnapshot)
  assert.equal(second.actorSnapshot?.name, 'Gestor Fictício Alterado')
  const third = await rectify(second, { driverId: null, notes: null })
  assert.equal(third.driverSnapshot, null)
  const detail = await json<FuelingDetail>(await api('/fuelings/' + version.id))
  assert.deepEqual(detail.fueling, version)
  assert.equal(detail.currentId, third.id)
  assert.deepEqual(detail.versions.map(v => v.id), [version.id, second.id, third.id])
  assert.deepEqual(detail.events.map(e => e.eventType), ['RECORDED','RECTIFIED','RECTIFIED'])
  assert.deepEqual(detail.events[1]!.beforeState, version)
  assert.deepEqual(detail.events[2]!.afterState, third)
  assert.deepEqual((await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1', [version.id])).rows, original.rows)
  const listing = await json<FuelingList>(await api('/fuelings'))
  assert.equal(listing.total, 1)
  assert.equal(listing.items[0]!.id, third.id)
  assert.equal(listing.totalLiters, '30.000')
  const rows = await pool.query<{ supersedes_id: string | null }>('SELECT supersedes_id::text FROM trip.odometer_readings ORDER BY id')
  assert.deepEqual(rows.rows.map(r => r.supersedes_id), [null, '1', '2'])
  const audit = await pool.query<{ before: FuelingVersion; after: FuelingVersion }>(
    "SELECT before, after FROM audit.logs WHERE table_name='fleet.fuelings' AND operation='UPDATE' ORDER BY id")
  assert.equal(audit.rows[0]!.before.id, version.id)
  assert.equal(audit.rows[0]!.after.id, second.id)
})

test('QA10/17: revisão obsoleta, alvo substituído, troca de veículo e metadados ausentes são recusados', async () => {
  const version = await create()
  for (const fields of [{ vehicleId }, { createdBy: '1' }, { expectedRevision: 0 }, { expectedRevision: null }]) {
    await error(await api('/fuelings/' + version.id, 'PUT', { body: { ...metadata, expectedRevision: 1, ...fields } }), 400)
  }
  await error(await api('/fuelings/' + version.id, 'PUT', { body: { expectedRevision: 1, station: 'Posto QA' } }), 400)
  await error(await api('/fuelings/' + version.id, 'PUT', { body: { ...metadata, expectedRevision: 2 } }), 409)
  await rectify(version)
  const snapshot = await ledger()
  await error(await api('/fuelings/' + version.id, 'PUT', { body: { ...metadata, expectedRevision: 1 } }), 409)
  assert.deepEqual(await ledger(), snapshot)
})

test('QA11: replay POST/PUT continua devolvendo a versão original após correções posteriores', async () => {
  const createKey = randomUUID()
  const version = await json<FuelingVersion>(await api('/fuelings', 'POST', { key: createKey, body: input() }), 201)
  const key = randomUUID()
  const body = { ...metadata, expectedRevision: 1, station: 'Posto Corrigido QA' }
  const second = await json<FuelingVersion>(await api('/fuelings/' + version.id, 'PUT', { key, body }))
  await rectify(second)
  const snapshot = await ledger()
  assert.deepEqual(await json(await api('/fuelings', 'POST', { key: createKey, body: input() }), 201), version)
  assert.deepEqual(await json(await api('/fuelings/' + version.id, 'PUT', { key, body })), second)
  await error(await api('/fuelings', 'POST', { key: createKey, body: input({ liters: '1' }) }), 409, /chave/i)
  await error(await api('/fuelings/' + second.id, 'PUT', { key, body }), 409)
  await error(await api('/fuelings', 'POST', { key, body: input() }), 409)
  await error(await api('/fuelings/' + version.id, 'PUT', { key, body: { ...body, notes: null } }), 409)
  assert.deepEqual(await ledger(), snapshot)
})

test('QA10/11: POST e PUT simultâneos repetidos gravam uma única cadeia; correções diferentes conflitam', async () => {
  const key = randomUUID()
  const created = await race([1,2].map(() => () => api('/fuelings', 'POST', { key, body: input() })))
  const versions = await Promise.all(created.map(r => json<FuelingVersion>(r, 201)))
  assert.deepEqual(versions[0], versions[1])
  const version = versions[0]!
  const correctionKey = randomUUID()
  const body = { ...metadata, expectedRevision: 1, station: 'Posto QA Corrigido' }
  const corrected = await race([1,2].map(() => () => api('/fuelings/' + version.id, 'PUT', { key: correctionKey, body })))
  const next = await Promise.all(corrected.map(r => json<FuelingVersion>(r)))
  assert.deepEqual(next[0], next[1])
  const competing = await race([1,2].map(n => () => api('/fuelings/' + next[0]!.id, 'PUT', {
    body: { ...metadata, expectedRevision: 2, station: 'Posto QA ' + n },
  })))
  assert.deepEqual(competing.map(r => r.status).sort(), [200,409])
  await Promise.all(competing.map(r => r.json()))
  assert.equal((await pool.query('SELECT id FROM fleet.fuelings')).rowCount, 3)
  assert.equal((await pool.query('SELECT id FROM fleet.fueling_events')).rowCount, 3)
})

test('QA11: mesma chave em veículos distintos é resolvida pelo índice único por autor após rollback', async () => {
  const otherVehicle = await newVehicle()
  const key = randomUUID()
  const results = await Promise.all([
    api('/fuelings', 'POST', { key, body: input() }),
    api('/fuelings', 'POST', { key, body: input({ vehicleId: otherVehicle }) }),
  ])
  assert.deepEqual(results.map(r => r.status).sort(), [201,409])
  await Promise.all(results.map(r => r.json()))
  assert.equal((await pool.query('SELECT id FROM fleet.fuelings')).rowCount, 1)
  await json(await api('/fuelings', 'POST', { key, body: input(), role: 'ADMINISTRADOR' }), 201)
})

test('QA12: falha de auditoria em POST e PUT reverte todas as trilhas e permite reenvio', async () => {
  const version = await create()
  for (const [path, method, body] of [['/fuelings','POST',input()], ['/fuelings/' + version.id,'PUT',{ ...metadata, expectedRevision: 1 }]] as const) {
    const key = randomUUID()
    const snapshot = await ledger()
    failAudit = true
    await error(await api(path, method, { key, body }), 500)
    assert.deepEqual(await ledger(), snapshot)
    failAudit = false
    await json(await api(path, method, { key, body }), method === 'POST' ? 201 : 200)
  }
})

test('QA12: falha de leitura ou evento reverte inclusive a versão recém-inserida', async () => {
  const version = await create()
  for (const table of ['trip.odometer_readings', 'fleet.fueling_events'] as const) {
    const snapshot = await ledger()
    await pool.query(`CREATE FUNCTION public.fail_fueling_qa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Falha fictícia QA'; END $$;
      CREATE TRIGGER fail_fueling_qa BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.fail_fueling_qa()`)
    try {
      await error(await api('/fuelings', 'POST', { body: input() }), 500)
      await error(await api('/fuelings/' + version.id, 'PUT', { body: { ...metadata, expectedRevision: 1 } }), 500)
    }
    finally {
      await pool.query(`DROP TRIGGER fail_fueling_qa ON ${table}; DROP FUNCTION public.fail_fueling_qa()`)
    }
    assert.deepEqual(await ledger(), snapshot)
  }
})

test('QA13: escritor de viagem com a mesma trava faz a API reler limites depois de esperar', async () => {
  const client = await pool.connect()
  let pending: Promise<Response> | undefined
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM fleet.vehicles WHERE id=$1 FOR UPDATE', [vehicleId])
    pending = api('/fuelings', 'POST', { body: input() })
    await waitForVehicleLocks(1)
    await reading(51300, EARLIER, {}, client)
    await client.query('COMMIT')
    await error(await pending, 422)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    if (pending) await pending
  }
  assert.equal((await pool.query('SELECT id FROM fleet.fuelings')).rowCount, 0)
})

test('QA14: legado mantém null, contribui para cronologia e sua correção inicia leitura sem inventar passado', async () => {
  const id = await legacyFueling({ at: EARLIER, km: 51000 })
  const detail = await json<FuelingDetail>(await api('/fuelings/' + id))
  assert.equal(detail.fueling.actorSnapshot, null)
  assert.equal(detail.fueling.vehicleSnapshot, null)
  assert.equal(detail.fueling.reason, null)
  assert.deepEqual(detail.events, [])
  await error(await api('/fuelings', 'POST', { body: input({ odometerKm: 50900 }) }), 422)
  const corrected = await rectify(detail.fueling, { odometerKm: 50900 })
  assert.equal(corrected.vehicleSnapshot, null)
  const rows = await pool.query('SELECT supersedes_id FROM trip.odometer_readings WHERE fueling_id=$1', [corrected.id])
  assert.equal(rows.rows[0]!.supersedes_id, null)
})

test('QA14: viagens legadas usam instantes reais e trilha START/END é autoritativa mesmo anulada', async () => {
  const driverId = await newDriver()
  const service = await pool.query<{ id: string }>(`INSERT INTO fleet.services (name, categories) VALUES ('Serviço Fictício QA', ARRAY['BODY']) RETURNING id::text`)
  const request = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id,service_id,requested_date,requested_time,origin,destination,purpose)
     VALUES ($1,$2,'2026-10-01','09:00','Origem QA','Destino QA','Viagem fictícia') RETURNING id::text`,
    [users.get('GESTOR')!.id, service.rows[0]!.id])
  const trip = await pool.query<{ id: string }>(
    `INSERT INTO trip.trips (request_id,vehicle_id,driver_id,scheduled_start,scheduled_end,start_km,end_km,started_at,finished_at)
     VALUES ($1,$2,$3,$4,$5,51000,52000,$4,$5) RETURNING id::text`,
    [request.rows[0]!.id, vehicleId, driverId, EARLIER, LATER])
  await error(await api('/fuelings', 'POST', { body: input({ odometerKm: 50999 }) }), 422)
  await create()
  await pool.query('UPDATE trip.trips SET start_km=53000 WHERE id=$1', [trip.rows[0]!.id])
    .then(() => assert.fail('A constraint deve recusar start_km > end_km'), () => undefined)
  await reading(90000, EARLIER, { type: 'START', tripId: trip.rows[0]!.id, annulled: true })
  // A leitura anulada elimina o fallback de start_km; end_km continua limitando o futuro.
  const corrected = await json<FuelingDetail>(await api('/fuelings/1'))
  await rectify(corrected.fueling, { odometerKm: 50000 })
  await pool.query('UPDATE trip.trips SET finished_at=NULL WHERE id=$1', [trip.rows[0]!.id])
  await error(await api('/fuelings', 'POST', { body: input() }), 409, /histórico/i)
})

test('QA15/16: limites unilaterais, mesmo instante e anulações não ressuscitam predecessores', async () => {
  await reading(51000, EARLIER)
  await create({ odometerKm: 51000 })
  await error(await api('/fuelings', 'POST', { body: input({ odometerKm: 51001 }) }), 422)
  const otherVehicle = await newVehicle()
  const old = await reading(90000, EARLIER, { vehicle: otherVehicle })
  await reading(1, EARLIER, { vehicle: otherVehicle, predecessor: old, annulled: true })
  const legacy = await legacyFueling({ vehicle: otherVehicle, at: EARLIER, km: 90000 })
  await legacyFueling({ vehicle: otherVehicle, at: EARLIER, km: 90000, supersedes: legacy, annulled: true })
  await create({ vehicleId: otherVehicle, odometerKm: 0 })
  const nextVehicle = await newVehicle()
  await reading(100, LATER, { vehicle: nextVehicle })
  await create({ vehicleId: nextVehicle, odometerKm: 0 })
  await error(await api('/fuelings', 'POST', { body: input({ vehicleId: nextVehicle, fueledAt: EARLIER, odometerKm: 101 }) }), 422)
})

test('QA14/16: leituras corrigidas substituem valores antigos e correções do próprio fato não se bloqueiam', async () => {
  const old = await reading(90000, EARLIER)
  await reading(51000, EARLIER, { predecessor: old })
  const version = await create({ odometerKm: 52000 })
  const corrected = await rectify(version, { odometerKm: 51200 })
  assert.equal(corrected.odometerKm, 51200)
  await reading(53000, LATER)
  await error(await api('/fuelings', 'POST', { body: input({ fueledAt: EARLIER, odometerKm: 52000 }) }), 422)
})

test('QA14: histórico inconsistente gera conflito e não é reparado silenciosamente', async () => {
  await reading(52000, EARLIER)
  await reading(51000, LATER)
  const snapshot = await ledger()
  await error(await api('/fuelings', 'POST', { body: input() }), 409, /histórico/i)
  assert.deepEqual(await ledger(), snapshot)
})

test('QA18: fatos, eventos e leituras são imutáveis inclusive por SQL direto', async () => {
  const version = await create()
  const snapshot = await ledger()
  for (const table of ['fleet.fuelings','fleet.fueling_events','trip.odometer_readings']) {
    for (const statement of [`UPDATE ${table} SET reason='Alteração QA' WHERE id=$1`, `DELETE FROM ${table} WHERE id=$1`]) {
      await assert.rejects(pool.query(statement, [version.id]), /imutáveis|append-only/)
    }
  }
  assert.deepEqual(await ledger(), snapshot)
})

test('QA05: relógio injetado aceita o instante exato e recusa um milissegundo à frente', async () => {
  const service = new FuelingsService(new FuelingsRepository(pool), new VehiclesRepository(pool),
    new AuditService(new AuditRepository(pool)), () => new Date(AT))
  const exact = input() as unknown as Parameters<FuelingsService['create']>[0]
  await service.create(exact, users.get('GESTOR')!.id, randomUUID())
  await assert.rejects(service.create({ ...exact, fueledAt: '2026-10-02T12:00:00.001Z' }, users.get('GESTOR')!.id, randomUUID()),
    { code: 'FUTURE_DATE' })
})

test('QA13: cadastros concorrentes com leituras incompatíveis aceitam somente um fato', async () => {
  const responses = await race([
    () => api('/fuelings', 'POST', { body: input({ fueledAt: EARLIER, odometerKm: 52000 }) }),
    () => api('/fuelings', 'POST', { body: input({ fueledAt: LATER, odometerKm: 51000 }) }),
  ])
  assert.deepEqual(responses.map(r => r.status).sort(), [201,422])
  await Promise.all(responses.map(r => r.json()))
  assert.equal((await pool.query('SELECT id FROM fleet.fuelings')).rowCount, 1)
})

test('QA08/17: mudança de motorista captura somente novo vínculo e aceita comprovante HTTP(S) sem descrição', async () => {
  const version = await create({ driverId: await newDriver() })
  const newDriverId = await newDriver()
  await pool.query("UPDATE fleet.vehicles SET status='INACTIVE' WHERE id=$1", [vehicleId])
  const corrected = await rectify(version, { driverId: newDriverId, evidenceDescription: null,
    attachmentUrl: 'https://example.test/comprovante-qa', station: '  Posto Fictício Novo  ' })
  assert.equal(corrected.driverSnapshot?.id, newDriverId)
  assert.equal(corrected.station, 'Posto Fictício Novo')
  assert.equal(corrected.evidenceDescription, null)
  assert.equal(corrected.attachmentUrl, 'https://example.test/comprovante-qa')
  assert.equal((await json<FuelingDetail>(await api('/fuelings/' + version.id))).fueling.driverId, version.driverId)
})

test('QA14: ciclos legados de abastecimentos e leituras são diagnosticados sem ocultar ou reparar fatos', async () => {
  const first = await legacyFueling()
  const second = await legacyFueling({ supersedes: first })
  // Corrupção sintética exclusivamente no banco de teste, simulando dados anteriores à proteção.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('ALTER TABLE fleet.fuelings DISABLE TRIGGER fleet_fuelings_append_only')
    await client.query('UPDATE fleet.fuelings SET supersedes_id=$1 WHERE id=$2', [second, first])
    await client.query('ALTER TABLE fleet.fuelings ENABLE TRIGGER fleet_fuelings_append_only')
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release() }
  const snapshot = await ledger()
  await error(await api('/fuelings/' + first), 409, /histórico/i)
  await error(await api('/fuelings', 'POST', { body: input() }), 409, /histórico/i)
  assert.deepEqual(await ledger(), snapshot)
  const other = await newVehicle()
  const a = await reading(51000, EARLIER, { vehicle: other })
  const b = await reading(52000, LATER, { vehicle: other, predecessor: a })
  const tx = await pool.connect()
  try {
    await tx.query('BEGIN')
    await tx.query('ALTER TABLE trip.odometer_readings DISABLE TRIGGER trip_odometer_readings_append_only')
    await tx.query('UPDATE trip.odometer_readings SET supersedes_id=$1 WHERE id=$2', [b,a])
    await tx.query('ALTER TABLE trip.odometer_readings ENABLE TRIGGER trip_odometer_readings_append_only')
    await tx.query('COMMIT')
  } catch (e) { await tx.query('ROLLBACK'); throw e }
  finally { tx.release() }
  await error(await api('/fuelings', 'POST', { body: input({ vehicleId: other }) }), 409, /histórico/i)
})

test('QA14: vínculos legados entre veículos diferentes impedem a mutação afetada', async () => {
  const other = await newVehicle()
  const first = await legacyFueling()
  await legacyFueling({ supersedes: first, vehicle: other })
  const snapshot = await ledger()
  await error(await api('/fuelings/' + first), 409)
  await error(await api('/fuelings', 'POST', { body: input() }), 409)
  await error(await api('/fuelings', 'POST', { body: input({ vehicleId: other }) }), 409)
  assert.deepEqual(await ledger(), snapshot)
})

test('R1: retificar só o posto preserva microssegundos do fato, da leitura e do evento', async () => {
  const at = '2026-10-02T12:00:00.123456Z'
  const id = await legacyFueling({ at })
  const original = await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1', [id])
  const detail = await json<FuelingDetail>(await api('/fuelings/' + id))
  assert.equal(detail.fueling.fueledAt, at)
  const corrected = await rectify(detail.fueling, { station: 'Posto Fictício Corrigido' })
  assert.equal(corrected.fueledAt, at)
  const equality = await pool.query<{ sameFact: boolean; sameReading: boolean; sameEvent: boolean }>(
    `SELECT f.fueled_at = old.fueled_at AS "sameFact",
       r.occurred_at = old.fueled_at AS "sameReading", e.occurred_at = old.fueled_at AS "sameEvent"
     FROM fleet.fuelings f JOIN fleet.fuelings old ON old.id = f.supersedes_id
     JOIN trip.odometer_readings r ON r.fueling_id = f.id
     JOIN fleet.fueling_events e ON e.fueling_id = f.id WHERE f.id=$1`, [corrected.id])
  assert.deepEqual(equality.rows, [{ sameFact: true, sameReading: true, sameEvent: true }])
  assert.deepEqual((await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f WHERE id=$1', [id])).rows, original.rows)
})

test('R2: cronologia, ordenação e período distinguem microssegundos anteriores, iguais e posteriores', async () => {
  await reading(52000, '2026-10-02T12:00:00.123456Z')
  const earlier = await create({ fueledAt: '2026-10-02T12:00:00.123Z', odometerKm: 51200 })
  const equal = await create({ fueledAt: '2026-10-02T09:00:00.123456-03:00', odometerKm: 52000 })
  const later = await create({ fueledAt: '2026-10-02T12:00:00.123789Z', odometerKm: 52001 })
  assert.equal(equal.fueledAt, '2026-10-02T12:00:00.123456Z')
  await error(await api('/fuelings', 'POST', { body: input({
    fueledAt: equal.fueledAt, odometerKm: 51999,
  }) }), 422)
  const list = await json<FuelingList>(await api('/fuelings?vehicleId=' + vehicleId))
  assert.deepEqual(list.items.map(v => v.id), [later.id, equal.id, earlier.id])
  const period = await json<FuelingList>(await api('/fuelings?' + new URLSearchParams({
    vehicleId, from: earlier.fueledAt, to: equal.fueledAt,
  })))
  assert.deepEqual(period.items.map(v => v.id), [earlier.id])
  const key = randomUUID()
  const body = input({ fueledAt: equal.fueledAt, odometerKm: 52000 })
  const first = await json<FuelingVersion>(await api('/fuelings', 'POST', { key, body }), 201)
  assert.deepEqual(await json(await api('/fuelings', 'POST', { key, body: {
    ...body, fueledAt: '2026-10-02T09:00:00.123456-03:00',
  } }), 201), first)
})

test('R3: currentId segue a sucessora legada mesmo quando sua revisão é menor', async () => {
  const root = await legacyFueling({ revision: 5 })
  const leaf = await legacyFueling({ supersedes: root })
  const current = await json<FuelingDetail>(await api('/fuelings/' + leaf))
  assert.equal(current.currentId, leaf)
  assert.equal((await json<FuelingDetail>(await api('/fuelings/' + root))).currentId, leaf)
  const listed = await json<FuelingList>(await api('/fuelings?vehicleId=' + vehicleId))
  assert.deepEqual(listed.items.map(v => v.id), [leaf])
  const corrected = await rectify(current.fueling, { station: 'Posto Fictício Atualizado' })
  assert.equal(corrected.supersedesId, leaf)
  assert.equal(corrected.revision, 2)
  assert.equal((await json<FuelingDetail>(await api('/fuelings/' + root))).currentId, corrected.id)
})
