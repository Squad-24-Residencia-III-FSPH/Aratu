import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import type { AuditRepositoryContract } from '../src/types/audit.types'
import type { UserRole } from '../src/types/auth'
import { SVO_REQUESTER_TYPES } from '../src/types/svo-occurrence.types'
import { closeTestPool, getTestDatabaseUrl, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, generateRbacUserToken, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import { insertLegacySvo, svoInput } from './fixtures/svo-occurrences.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
type JsonRecord = Record<string, unknown>

function user(role: UserRole = 'ATENDENTE_SVO'): RbacTestUser {
  return users.get(role)!
}

function call(method: string, path = '', body?: unknown, role: UserRole | null = 'ATENDENTE_SVO', token?: string): Promise<Response> {
  return fetch(`${baseUrl}/svo/occurrences${path}`, {
    method,
    headers: {
      ...(role ? { Authorization: `Bearer ${token ?? user(role).token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json(response: Response, status = 200): Promise<JsonRecord> {
  assert.equal(response.status, status, await response.clone().text())
  return await response.json() as JsonRecord
}

async function create(body: unknown = svoInput(), role: UserRole = 'ATENDENTE_SVO'): Promise<string> {
  const result = await json(await call('POST', '', body, role), 201)
  assert.equal(typeof result.id, 'string')
  return result.id as string
}

async function history(id: string) {
  const events = await pool.query<JsonRecord>(
    `SELECT id::text, event_type, occurred_at, registered_at, reported_by, registered_by::text,
            actor_snapshot, reason, evidence_description, before_state, after_state
       FROM svo.occurrence_events WHERE occurrence_id = $1 ORDER BY id`, [id],
  )
  const audits = await pool.query<JsonRecord>(
    `SELECT operation, "before", "after", actor_snapshot, reason
       FROM audit.logs WHERE table_name = 'svo.occurrences' AND record_id = $1 ORDER BY id`, [id],
  )
  const rows = await pool.query<JsonRecord>(
    `SELECT id::text, status, revision, received_at, triaged_at, triaged_by::text,
            attendant_snapshot, created_at, updated_at FROM svo.occurrences WHERE id = $1`, [id],
  )
  return { occurrence: rows.rows[0], events: events.rows, audits: audits.rows }
}

/** Captura somente o schema SVO e sua auditoria para demonstrar ausência de qualquer escrita. */
async function databaseState(): Promise<unknown[]> {
  const ids = await pool.query<{ id: string }>('SELECT id::text FROM svo.occurrences ORDER BY id')
  const triages = await pool.query<JsonRecord>(
    `SELECT id::text, occurrence_id::text, revision, supersedes_id::text, registered_by::text,
            registered_at, reason FROM svo.occurrence_triages ORDER BY id`,
  )
  return [...await Promise.all(ids.rows.map(({ id }) => history(id))), triages.rows]
}

async function rejectsWithoutWrite(operation: () => Promise<Response>, status: number): Promise<void> {
  const before = await databaseState()
  const body = await json(await operation(), status)
  assert.deepEqual(Object.keys(body), ['erro'])
  assert.equal(typeof body.erro, 'string')
  assert.ok((body.erro as string).length > 10)
  assert.deepEqual(await databaseState(), before)
}

async function databaseTime(): Promise<Date> {
  const result = await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
  return result.rows[0]!.now
}

async function closeServer(instance: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => instance.close((error) => error ? reject(error) : resolve()))
}

before(async () => {
  const database = new URL(getTestDatabaseUrl()).pathname
  assert.match(database, /_test$/, 'A limpeza exige banco explicitamente identificado como teste.')
  if (process.env.DATABASE_URL) assert.notEqual(database, new URL(process.env.DATABASE_URL).pathname)
  await setupTestDatabase()
  pool = getTestPool()
  const actual = await pool.query<{ name: string }>('SELECT current_database() AS name')
  assert.equal(`/${actual.rows[0]!.name}`, database)
  server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG }).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
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

test('SVO-01: atendente e administrador criam PENDING, RECEIVED e CREATE atomicamente', async () => {
  for (const role of ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const) {
    const start = await databaseTime()
    const response = await json(await call('POST', '', svoInput(), role), 201)
    const end = await databaseTime()
    assert.deepEqual(Object.keys(response).sort(), ['id', 'status', 'receivedAt', 'createdAt', 'revision'].sort())
    assert.equal(response.status, 'PENDING'); assert.equal(response.revision, 1)
    const stored = await history(response.id as string)
    assert.equal(stored.events.length, 1); assert.equal(stored.audits.length, 1)
    const event = stored.events[0]!
    assert.equal(event.event_type, 'RECEIVED'); assert.equal(event.registered_by, user(role).id)
    assert.deepEqual(event.actor_snapshot, { id: user(role).id, name: user(role).name, email: user(role).email, role })
    assert.equal(event.reported_by, svoInput().requesterName)
    assert.equal(event.evidence_description, svoInput().evidenceDescription)
    assert.equal(stored.audits[0]!.operation, 'CREATE')
    for (const date of [new Date(response.receivedAt as string), new Date(response.createdAt as string), event.registered_at as Date]) {
      assert.ok(date >= start && date <= end)
    }
  }
})

test('SVO-02: cada campo obrigatório inválido e corpos incompatíveis retornam 400 sem escrita', async () => {
  for (const field of ['requesterName', 'requesterPhone', 'requesterType', 'location', 'description', 'evidenceDescription']) {
    for (const value of [undefined, null, '', '   ', 3, false, [], {}]) {
      await rejectsWithoutWrite(() => call('POST', '', { ...svoInput(), [field]: value }), 400)
    }
  }
  for (const body of [null, [], true, 'text']) await rejectsWithoutWrite(() => call('POST', '', body), 400)
})

test('SVO-03: todos os seis tipos são aceitos e desconhecido é rejeitado', async () => {
  for (const requesterType of SVO_REQUESTER_TYPES) {
    const id = await create({ ...svoInput(), requesterType })
    const detail = await json(await call('GET', `/${id}`))
    assert.equal(detail.requesterType, requesterType)
    assert.equal((await history(id)).events.length, 1)
  }
  await rejectsWithoutWrite(() => call('POST', '', { ...svoInput(), requesterType: 'UNKNOWN' }), 400)
})

test('SVO-04: recebimento anterior, noturno e no fim de semana preserva o instante fático', async () => {
  const now = await databaseTime()
  const saturday = new Date(now.getTime() - 14 * 86_400_000)
  saturday.setUTCDate(saturday.getUTCDate() - ((saturday.getUTCDay() + 1) % 7))
  saturday.setUTCHours(5, 15, 0, 0)
  const id = await create({ ...svoInput(), receivedAt: saturday.toISOString() })
  const stored = await history(id)
  assert.deepEqual(stored.occurrence!.received_at, saturday)
  assert.deepEqual(stored.events[0]!.occurred_at, saturday)
  assert.ok((stored.events[0]!.registered_at as Date) > saturday)
  assert.ok((stored.occurrence!.created_at as Date) >= now)
})

test('SVO-05: recebimento omitido usa relógio do banco; inválido, sem fuso ou futuro não escreve', async () => {
  const id = await create()
  const stored = await history(id)
  assert.deepEqual(stored.occurrence!.received_at, stored.events[0]!.occurred_at)
  const future = new Date((await databaseTime()).getTime() + 86_400_000).toISOString()
  for (const receivedAt of ['2025-02-29T10:00:00Z', '2025-01-01T10:00:00', 'inválido', future, null, 3]) {
    await rejectsWithoutWrite(() => call('POST', '', { ...svoInput(), receivedAt }), 400)
  }
})

test('SVO-06: confirmação conserva RECEIVED e incrementa revisão com autoria e horário únicos', async () => {
  const id = await create(); const before = await history(id)
  const start = await databaseTime()
  const result = await json(await call('POST', `/${id}/confirm`))
  const end = await databaseTime()
  assert.deepEqual(Object.keys(result).sort(), ['id', 'status', 'triagedAt', 'triagedBy', 'revision'].sort())
  assert.equal(result.status, 'CONFIRMED'); assert.equal(result.revision, 2); assert.equal(result.triagedBy, user().id)
  assert.ok(new Date(result.triagedAt as string) >= start && new Date(result.triagedAt as string) <= end)
  const after = await history(id)
  assert.deepEqual(after.events[0], before.events[0]); assert.equal(after.events.length, 2)
  assert.equal(after.events[1]!.event_type, 'CONFIRMED')
  assert.deepEqual(after.events[1]!.occurred_at, after.occurrence!.triaged_at)
  assert.deepEqual(after.audits.map((row) => row.operation), ['CREATE', 'STATUS_CHANGE'])
})

test('SVO-07: CONFIRMED e CANCELED retornam 409 sem alterar trilhas ou revisão', async () => {
  const confirmed = await create(); await json(await call('POST', `/${confirmed}/confirm`, {}))
  const canceled = await insertLegacySvo(pool, user().id, 'CANCELED')
  for (const id of [confirmed, canceled]) await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`), 409)
})

test('SVO-TRIAGE-01: cria e consulta snapshot opcional sem expor dados em auditoria de metadados', async () => {
  const id = await create()
  const payload = {
    deceasedName: 'SENTINELA_NOME_FICTICIO', estimatedAge: 'aproximadamente 70',
    responsiblePhysician: 'SENTINELA_MEDICO_FICTICIO', crm: 'CRM-FICTICIO',
    preliminaryCauseOfDeath: 'SENTINELA_CAUSA_FICTICIA',
    availableDocuments: ['tipo-livre-a', 'tipo-livre-b'], referral: 'encaminhamento-livre',
    triageNotes: 'SENTINELA_OBSERVACAO_FICTICIA',
  }
  const created = await json(await call('POST', `/${id}/triage`, payload), 201)
  assert.equal(created.occurrenceId, id)
  assert.equal(created.revision, 1)
  assert.equal(created.supersedesId, null)
  assert.deepEqual(created.availableDocuments, payload.availableDocuments)
  assert.equal(created.registeredBy, user().id)
  assert.ok(typeof created.occurredAt === 'string' && typeof created.registeredAt === 'string')
  assert.deepEqual(await json(await call('GET', `/${id}/triage`)), created)
  const audits = await pool.query<JsonRecord>(
    `SELECT "before", "after", reason FROM audit.logs
      WHERE table_name = 'svo.occurrence_triages' AND record_id = $1`, [created.id],
  )
  const events = await pool.query<JsonRecord>(
    `SELECT reason, before_state, after_state FROM svo.occurrence_events
      WHERE occurrence_id = $1 AND event_type IN ('TRIAGED', 'RECTIFIED')`, [id],
  )
  assert.equal(audits.rows.length, 1)
  assert.ok(!JSON.stringify([audits.rows, events.rows]).includes('SENTINELA_'))
  assert.equal((await json(await call('GET', `/${id}`))).deceasedName, undefined)
})

test('SVO-TRIAGE-02: retificação preserva versão, encadeia revisão e exige justificativa', async () => {
  const id = await create()
  const first = await json(await call('POST', `/${id}/triage`, { deceasedName: 'Nome fictício' }), 201)
  await rejectsWithoutWrite(() => call('POST', `/${id}/triage`, { deceasedName: 'Outro nome fictício' }), 400)
  const second = await json(await call('POST', `/${id}/triage`, {
    deceasedName: 'Outro nome fictício', reason: 'SENTINELA_JUSTIFICATIVA_FICTICIA',
  }), 201)
  assert.equal(second.revision, 2)
  assert.equal(second.supersedesId, first.id)
  assert.equal(second.deceasedName, 'Outro nome fictício')
  const versions = await pool.query<JsonRecord>(
    'SELECT id::text, revision, deceased_name FROM svo.occurrence_triages WHERE occurrence_id = $1 ORDER BY revision', [id],
  )
  assert.deepEqual(versions.rows.map((row) => [row.revision, row.deceased_name]), [
    [1, 'Nome fictício'], [2, 'Outro nome fictício'],
  ])
  const events = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM svo.occurrence_events WHERE occurrence_id = $1 ORDER BY id', [id],
  )
  assert.deepEqual(events.rows.map((row) => row.event_type), ['RECEIVED', 'TRIAGED', 'RECTIFIED'])
  const eventRows = await pool.query<JsonRecord>(
    `SELECT reason, before_state, after_state FROM svo.occurrence_events
      WHERE occurrence_id = $1 AND event_type IN ('TRIAGED', 'RECTIFIED')`, [id],
  )
  const auditRows = await pool.query<JsonRecord>(
    `SELECT reason, "before", "after" FROM audit.logs
      WHERE table_name = 'svo.occurrence_triages' ORDER BY id`,
  )
  assert.ok(!JSON.stringify([eventRows.rows, auditRows.rows]).includes('SENTINELA_JUSTIFICATIVA'))
})

test('SVO-TRIAGE-03: somente PENDING aceita triagem e campos não definidos não ganham validação clínica', async () => {
  const pending = await create()
  const empty = await json(await call('POST', `/${pending}/triage`, {}), 201)
  assert.equal(empty.deceasedName, null)
  assert.equal(empty.availableDocuments, null)
  const confirmed = await create(); await json(await call('POST', `/${confirmed}/confirm`, {}))
  const canceled = await insertLegacySvo(pool, user().id, 'CANCELED')
  for (const id of [confirmed, canceled]) await rejectsWithoutWrite(() => call('POST', `/${id}/triage`, {}), 409)
  const invalids = [
    { deceasedName: 2 }, { availableDocuments: 'texto' }, { availableDocuments: [1] },
    { status: 'CONFIRMED' }, { revision: 4 },
  ]
  for (const body of invalids) await rejectsWithoutWrite(() => call('POST', `/${pending}/triage`, body), 400)
  await rejectsWithoutWrite(() => call('GET', '/9223372036854775807/triage'), 404)
})

test('SVO-TRIAGE-04: permissões e autenticação respeitam os perfis SVO atuais', async () => {
  const id = await create()
  assert.equal(await (await call('GET', `/${id}/triage`, undefined, 'GESTOR')).json(), null)
  for (const role of ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const) {
    const roleOccurrence = role === 'ATENDENTE_SVO' ? id : await create()
    assert.equal((await call('POST', `/${roleOccurrence}/triage`, {}, role)).status, 201)
  }
  for (const role of ['EQUIPE_SVO', 'SOLICITANTE', 'MOTORISTA'] as const) {
    await rejectsWithoutWrite(() => call('POST', `/${id}/triage`, {}, role), 403)
  }
  await rejectsWithoutWrite(() => call('POST', `/${id}/triage`, {}, null), 401)
  await rejectsWithoutWrite(() => call('GET', `/${id}/triage`, undefined, null), 401)
})

test('SVO-TRIAGE-05: falha de auditoria desfaz triagem, evento e versão na mesma transação', async (context) => {
  context.mock.method(console, 'error', () => {})
  const id = await create()
  const real = new AuditRepository(pool)
  const audits: AuditRepositoryContract = {
    async create(input, client) {
      if (input.table === 'svo.occurrence_triages') throw new Error('Falha sintética de auditoria clínica')
      return real.create(input, client)
    },
  }
  const failing = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, audits }).listen(0)
  await new Promise<void>((resolve) => failing.once('listening', resolve))
  const originalUrl = baseUrl
  try {
    baseUrl = `http://127.0.0.1:${(failing.address() as AddressInfo).port}`
    await rejectsWithoutWrite(() => call('POST', `/${id}/triage`, { deceasedName: 'SENTINELA_TRANSACAO' }), 500)
  } finally { baseUrl = originalUrl; await closeServer(failing) }
  assert.equal(await (await call('GET', `/${id}/triage`)).json(), null)
  assert.deepEqual((await history(id)).events.map((row) => row.event_type), ['RECEIVED'])
})

test('SVO-TRIAGE-06: versões clínicas não aceitam UPDATE nem DELETE', async () => {
  const id = await create()
  const triage = await json(await call('POST', `/${id}/triage`, { deceasedName: 'Nome fictício' }), 201)
  for (const query of [
    'UPDATE svo.occurrence_triages SET reason = $2 WHERE id = $1',
    'DELETE FROM svo.occurrence_triages WHERE id = $1',
  ]) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await assert.rejects(client.query(query, query.startsWith('UPDATE')
        ? [triage.id, 'Alteração fictícia'] : [triage.id]), /append-only/)
    } finally { await client.query('ROLLBACK'); client.release() }
  }
  assert.equal((await json(await call('GET', `/${id}/triage`))).deceasedName, 'Nome fictício')
})

test('SVO-TRIAGE-07: concorrência entre triagem e confirmação respeita a trava de PENDING', async () => {
  const id = await create()
  const [triageResponse, confirmResponse] = await Promise.all([
    call('POST', `/${id}/triage`, { deceasedName: 'Nome fictício' }),
    call('POST', `/${id}/confirm`, {}),
  ])
  assert.equal(confirmResponse.status, 200)
  assert.ok([201, 409].includes(triageResponse.status))
  const occurrence = await pool.query<{ status: string }>('SELECT status FROM svo.occurrences WHERE id = $1', [id])
  assert.equal(occurrence.rows[0]!.status, 'CONFIRMED')
  const triageCount = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM svo.occurrence_triages WHERE occurrence_id = $1', [id])
  assert.equal(Number(triageCount.rows[0]!.count), triageResponse.status === 201 ? 1 : 0)
})

test('SVO-08: duas confirmações simultâneas retornam 200/409 e gravam um único efeito', async () => {
  const id = await create()
  const responses = await Promise.all([call('POST', `/${id}/confirm`), call('POST', `/${id}/confirm`, {}, 'ADMINISTRADOR')])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  const stored = await history(id)
  assert.equal(stored.occurrence!.revision, 2)
  assert.equal(stored.events.filter((row) => row.event_type === 'CONFIRMED').length, 1)
  assert.equal(stored.audits.filter((row) => row.operation === 'STATUS_CHANGE').length, 1)
  const client = await pool.connect()
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout = '1s'")
    await client.query('SELECT id FROM svo.occurrences WHERE id = $1 FOR UPDATE NOWAIT', [id])
  } finally { await client.query('ROLLBACK'); client.release() }
  assert.equal(pool.waitingCount, 0)
})

test('SVO-09: todas as rotas exigem token válido e não revelam registros', async () => {
  const id = await create()
  const expired = generateRbacUserToken(user(), RBAC_JWT_CONFIG.secret, { expiresIn: -1 })
  for (const [method, path, body] of [['GET', '', undefined], ['GET', `/${id}`, undefined], ['POST', '', svoInput()], ['POST', `/${id}/confirm`, {}]] as const) {
    await rejectsWithoutWrite(() => call(method, path, body, null), 401)
    for (const token of ['inválido', expired]) await rejectsWithoutWrite(() => call(method, path, body, 'ATENDENTE_SVO', token), 401)
  }
})

test('SVO-10: matriz completa de seis perfis nas quatro rotas', async () => {
  for (const [role] of users) {
    const id = await create()
    const writes = role === 'ADMINISTRADOR' || role === 'ATENDENTE_SVO'
    const reads = writes || role === 'GESTOR'
    for (const path of ['', `/${id}`]) {
      if (reads) assert.equal((await call('GET', path, undefined, role)).status, 200)
      else await rejectsWithoutWrite(() => call('GET', path, undefined, role), 403)
    }
    if (writes) {
      await create(svoInput(), role)
      await json(await call('POST', `/${id}/confirm`, {}, role))
    } else {
      await rejectsWithoutWrite(() => call('POST', '', svoInput(), role), 403)
      await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`, {}, role), 403)
      await rejectsWithoutWrite(() => call('GET', '/9223372036854775807', undefined, role), reads ? 404 : 403)
    }
  }
})

test('SVO-11: token antigo não mantém acesso após desativação ou perda de perfil', async () => {
  const id = await create()
  const endpoints = [['GET', '', undefined], ['GET', `/${id}`, undefined], ['POST', '', svoInput()], ['POST', `/${id}/confirm`, {}]] as const
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [user().id])
  for (const [method, path, body] of endpoints) await rejectsWithoutWrite(() => call(method, path, body), 401)
  await pool.query('UPDATE auth.users SET active = true, role_id = $2 WHERE id = $1', [user().id, user('EQUIPE_SVO').roleId])
  for (const [method, path, body] of endpoints) await rejectsWithoutWrite(() => call(method, path, body), 403)
})

test('SVO-12: detalhe, inexistência e IDs malformados respeitam BIGINT sem escrita', async () => {
  const id = await create(); assert.equal((await json(await call('GET', `/${id}`))).id, id)
  for (const invalid of ['0', '-1', '1.5', '01', '1e3', 'text', '9223372036854775808']) {
    for (const method of ['GET', 'POST']) await rejectsWithoutWrite(() => call(method, `/${invalid}${method === 'POST' ? '/confirm' : ''}`), 400)
  }
  for (const method of ['GET', 'POST']) await rejectsWithoutWrite(() => call(method, `/9223372036854775807${method === 'POST' ? '/confirm' : ''}`), 404)
  await pool.query('ALTER TABLE svo.occurrences ALTER COLUMN id RESTART WITH 9007199254740993')
  const large = await create(); assert.equal(large, '9007199254740993')
  assert.equal((await json(await call('GET', `/${large}`))).id, large)
})

test('SVO-13: filtro combinado inclui início e último instante do dia em America/Maceio', async () => {
  const times = ['2020-01-04T02:59:59.999Z', '2020-01-04T03:00:00Z', '2020-01-05T02:59:59.999Z', '2020-01-05T03:00:00Z']
  const ids: string[] = []
  for (const time of times) ids.push(await insertLegacySvo(pool, user().id, 'PENDING', time))
  await insertLegacySvo(pool, user().id, 'CONFIRMED', times[1])
  const response = await call('GET', '?status=PENDING&from=2020-01-04&to=2020-01-04')
  assert.equal(response.status, 200)
  const rows = await response.json() as JsonRecord[]
  assert.deepEqual(rows.map((row) => row.id), [ids[2], ids[1]])
})

test('SVO-14: consultas inválidas não escrevem; vazio e desempate são estáveis', async () => {
  const first = await insertLegacySvo(pool, user().id)
  const second = await insertLegacySvo(pool, user().id)
  for (const query of ['status=UNKNOWN', 'status=PENDING&status=CONFIRMED', 'from=2025-02-29', 'from=2020-01-05&to=2020-01-04', 'to[]=2020-01-04', 'from[x]=2020-01-04', 'from=', 'from=2020-01-04&from=2020-01-05']) {
    await rejectsWithoutWrite(() => call('GET', `?${query}`), 400)
  }
  assert.deepEqual(await (await call('GET', '?status=CANCELED')).json(), [])
  const list = await (await call('GET')).json() as JsonRecord[]
  assert.deepEqual(list.map((row) => row.id), [second, first])
})

test('SVO-15: falha de auditoria durante criação e confirmação desfaz toda a transação', async (context) => {
  context.mock.method(console, 'error', () => {})
  const id = await create()
  const real = new AuditRepository(pool)
  const audits: AuditRepositoryContract = {
    async create(input, client) {
      if (input.table === 'svo.occurrences') throw new Error('Falha sintética de auditoria')
      return real.create(input, client)
    },
  }
  const failing = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG, audits }).listen(0)
  await new Promise<void>((resolve) => failing.once('listening', resolve))
  const originalUrl = baseUrl
  try {
    baseUrl = `http://127.0.0.1:${(failing.address() as AddressInfo).port}`
    await rejectsWithoutWrite(() => call('POST', '', svoInput()), 500)
    await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`), 500)
  } finally { baseUrl = originalUrl; await closeServer(failing) }
})

test('SVO-16: auditoria e logs excluem todos os textos sensíveis; histórico mantém evidência', async (context) => {
  const logs: unknown[] = []
  context.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args) })
  const id = await create(); await json(await call('POST', `/${id}/confirm`))
  const stored = await history(id)
  for (const value of Object.values(svoInput()).filter((value) => typeof value === 'string' && value.includes('SENTINELA_'))) {
    assert.ok(!JSON.stringify(stored.audits).includes(value))
    assert.ok(!JSON.stringify(logs).includes(value))
  }
  assert.equal(stored.events[0]!.evidence_description, svoInput().evidenceDescription)
  assert.equal(stored.events[1]!.registered_by, user().id)
})

test('SVO-17: evento é imutável por UPDATE e DELETE', async () => {
  const id = await create(); const initial = await history(id)
  for (const query of ['UPDATE svo.occurrence_events SET reason = $2 WHERE occurrence_id = $1', 'DELETE FROM svo.occurrence_events WHERE occurrence_id = $1']) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await assert.rejects(client.query(query, query.startsWith('UPDATE') ? [id, 'Mudança fictícia'] : [id]), /append-only/)
    } finally { await client.query('ROLLBACK'); client.release() }
    assert.deepEqual(await history(id), initial)
  }
})

test('SVO-18: propriedades controladas pelo servidor são recusadas na criação e confirmação', async () => {
  const id = await create()
  for (const field of ['status', 'attendantId', 'triagedBy', 'revision', 'attendantSnapshot', 'actorSnapshot', 'createdAt']) {
    await rejectsWithoutWrite(() => call('POST', '', { ...svoInput(), [field]: 'FORGED' }), 400)
    await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`, { [field]: 'FORGED' }), 400)
  }
  for (const body of [null, [], true]) await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`, body), 400)
})

test('SVO-19: legado sem RECEIVED/snapshot permanece sem passado inventado', async () => {
  const id = await insertLegacySvo(pool, user().id)
  assert.equal((await json(await call('GET', `/${id}`))).evidenceDescription, null)
  await json(await call('POST', `/${id}/confirm`))
  const stored = await history(id)
  assert.equal(stored.occurrence!.attendant_snapshot, null)
  assert.deepEqual(stored.events.map((row) => row.event_type), ['CONFIRMED'])
  assert.equal((await json(await call('GET', `/${id}`))).evidenceDescription, null)
})

test('SVO-20: mudanças posteriores no operador não alteram autoria histórica', async () => {
  const id = await create(); const initial = await history(id)
  await pool.query('UPDATE auth.users SET name = $2, role_id = $3 WHERE id = $1', [user().id, 'Operador Alterado Fictício', user('GESTOR').roleId])
  assert.deepEqual(await history(id), initial)
  await rejectsWithoutWrite(() => call('POST', `/${id}/confirm`), 403)
})

test('SVO-21: falha SQL no evento com detalhe sensível faz rollback sem vazar diagnóstico', async (context) => {
  const logs: unknown[] = []
  context.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args) })
  const id = await create()
  try {
    await pool.query(`CREATE FUNCTION svo.qa_fail_occurrence_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SENTINELA_SQL_PRIVADA' USING DETAIL = 'SENTINELA_SQL_PRIVADA'; END; $$`)
    await pool.query(`CREATE TRIGGER qa_fail_occurrence_event BEFORE INSERT ON svo.occurrence_events
      FOR EACH ROW EXECUTE FUNCTION svo.qa_fail_occurrence_event()`)
    for (const action of [() => call('POST', '', svoInput()), () => call('POST', `/${id}/confirm`)]) {
      await rejectsWithoutWrite(async () => {
        const response = await action()
        assert.ok(!(await response.clone().text()).includes('SENTINELA_'))
        return response
      }, 500)
    }
    assert.equal(logs.length, 2)
    assert.ok(!JSON.stringify(logs).includes('SENTINELA_'))
    for (const entry of logs) {
      const record = (entry as JsonRecord[])[0]!
      assert.deepEqual(Object.keys(record).sort(), ['code', 'operation', 'time'])
      assert.equal(record.code, 'SVO_OPERATION_FAILED')
    }
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS qa_fail_occurrence_event ON svo.occurrence_events')
    await pool.query('DROP FUNCTION IF EXISTS svo.qa_fail_occurrence_event()')
  }
})

test('SVO-22: JSON malformado é interceptado no app sem vazar o corpo recebido', async (context) => {
  const logs: unknown[] = []
  context.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args) })
  const id = await create()
  for (const suffix of ['', `/${id}/confirm`]) {
    await rejectsWithoutWrite(async () => {
      const response = await fetch(`${baseUrl}/svo/occurrences${suffix}`, {
        method: 'POST', headers: { Authorization: `Bearer ${user().token}`, 'Content-Type': 'application/json' },
        body: '{"requesterName":"SENTINELA_JSON_PRIVADA",',
      })
      assert.deepEqual(await response.clone().json(), { erro: 'O corpo da requisição deve conter JSON válido.' })
      return response
    }, 400)
  }
  assert.deepEqual(logs, [])
})

test('SVO-23: notes vazias persistem null e tipos incompatíveis não escrevem', async () => {
  for (const notes of [undefined, null, '', '   ']) {
    const id = await create({ ...svoInput(), notes })
    assert.equal((await json(await call('GET', `/${id}`))).notes, null)
    const stored = await history(id)
    assert.equal((stored.events[0]!.after_state as JsonRecord).notes, null)
  }
  for (const notes of [false, 1, [], {}]) await rejectsWithoutWrite(() => call('POST', '', { ...svoInput(), notes }), 400)
})

test('SVO-24: lista e detalhe expõem apenas DTOs explícitos, sem snapshots/eventos brutos', async () => {
  const id = await create()
  const summaryKeys = ['id', 'requesterType', 'location', 'status', 'receivedAt', 'createdAt', 'revision']
  const detailKeys = [...summaryKeys, 'requesterName', 'requesterPhone', 'description', 'notes', 'attendantId', 'triagedAt', 'triagedBy', 'updatedAt', 'evidenceDescription']
  for (const role of ['GESTOR', 'ATENDENTE_SVO', 'ADMINISTRADOR'] as const) {
    const list = await (await call('GET', '', undefined, role)).json() as JsonRecord[]
    assert.deepEqual(Object.keys(list[0]!).sort(), summaryKeys.sort())
    const detail = await json(await call('GET', `/${id}`, undefined, role))
    assert.deepEqual(Object.keys(detail).sort(), detailKeys.sort())
    for (const field of ['requesterName', 'requesterPhone', 'description', 'notes', 'evidenceDescription']) assert.equal(list[0]![field], undefined)
    assert.equal(detail.evidenceDescription, svoInput().evidenceDescription)
  }
})
