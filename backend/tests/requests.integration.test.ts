import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import {
  closeTestPool,
  getTestPool,
  setupTestDatabase,
  truncateTestDatabase,
} from './helpers/db-test'
import {
  RBAC_JWT_CONFIG,
  RBAC_JWT_SECRET,
  seedRbacTestUsers,
} from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

interface RequestBody extends Record<string, unknown> {
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  serviceId: string
}

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const validRequest: Omit<RequestBody, 'serviceId'> = {
  requestedDate: '2099-12-01',
  requestedTime: '08:30',
  origin: 'Unidade fictícia de origem',
  destination: 'Unidade fictícia de destino',
  purpose: 'Atendimento administrativo fictício',
}

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error('Usuário de teste não instanciado para o perfil ' + role + '.')
  return user
}

async function createService(active = true): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name)
     VALUES ('Serviço fictício de integração FROTA-80')
     RETURNING id::text AS id`,
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error('Falha ao criar o serviço fictício de teste.')
  if (!active) {
    await pool.query('UPDATE fleet.services SET active = false WHERE id = $1', [id])
  }
  return id
}

function submitRequest(body: unknown, role: UserRole | null = 'SOLICITANTE'): Promise<Response> {
  return fetch(baseUrl + '/requests', {
    method: 'POST',
    headers: {
      ...(role ? { Authorization: 'Bearer ' + getUser(role).token } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function requestApi(path: string, role: UserRole | null, options: RequestInit = {}): Promise<Response> {
  return fetch(baseUrl + path, {
    ...options,
    headers: {
      ...(role ? { Authorization: 'Bearer ' + getUser(role).token } : {}),
      ...(options.headers ?? {}),
    },
  })
}

async function createPendingRequest(serviceId: string, requestedDate: string): Promise<string> {
  const response = await submitRequest({ ...validRequest, serviceId, requestedDate })
  assert.equal(response.status, 201)
  const body = await response.json() as { id: string }
  return body.id
}

async function assertNoRequestEffects(): Promise<void> {
  const [requests, events, audits] = await Promise.all([
    pool.query<{ total: number }>('SELECT count(*)::int AS total FROM trip.requests'),
    pool.query<{ total: number }>('SELECT count(*)::int AS total FROM trip.request_events'),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit.logs WHERE table_name = 'trip.requests'`,
    ),
  ])
  assert.equal(requests.rows[0]?.total, 0)
  assert.equal(events.rows[0]?.total, 0)
  assert.equal(audits.rows[0]?.total, 0)
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG })
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
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

test('IT-REQUEST-01: criação válida ignora status/autoria forjados e grava solicitação, evento e auditoria', async () => {
  const serviceId = await createService()
  const requester = getUser('SOLICITANTE')
  const response = await submitRequest({
    ...validRequest,
    serviceId,
    status: 'APPROVED',
    requesterId: '999999',
  })

  assert.equal(response.status, 201)
  const body = await response.json() as { id: string; status: string }
  assert.match(body.id, /^[1-9]\d*$/)
  assert.equal(body.status, 'PENDING')

  const requestResult = await pool.query<{
    requesterId: string
    serviceId: string
    status: string
    requesterIdSnapshot: string
  }>(
    `SELECT requester_id::text AS "requesterId",
            service_id::text AS "serviceId",
            status,
            requester_snapshot->>'id' AS "requesterIdSnapshot"
       FROM trip.requests
      WHERE id = $1`,
    [body.id],
  )
  assert.deepEqual(requestResult.rows[0], {
    requesterId: requester.id,
    serviceId,
    status: 'PENDING',
    requesterIdSnapshot: requester.id,
  })

  const eventResult = await pool.query<{
    eventType: string
    registeredBy: string
    afterStatus: string
  }>(
    `SELECT event_type AS "eventType",
            registered_by::text AS "registeredBy",
            after_state->>'status' AS "afterStatus"
       FROM trip.request_events
      WHERE request_id = $1`,
    [body.id],
  )
  assert.deepEqual(eventResult.rows, [{
    eventType: 'CREATED',
    registeredBy: requester.id,
    afterStatus: 'PENDING',
  }])

  const auditResult = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total
       FROM audit.logs
      WHERE table_name = 'trip.requests'
        AND record_id = $1
        AND user_id = $2
        AND operation = 'CREATE'`,
    [body.id, requester.id],
  )
  assert.equal(auditResult.rows[0]?.total, 1)
})

test('IT-REQUEST-02: entradas ausentes, malformadas ou passadas não deixam efeitos no banco', async () => {
  const serviceId = await createService()
  const cases: Array<{ body: unknown; status: number }> = [
    { body: {}, status: 400 },
    { body: { ...validRequest, serviceId, origin: '   ' }, status: 400 },
    { body: { ...validRequest, serviceId, requestedDate: '2025-02-30' }, status: 400 },
    { body: { ...validRequest, serviceId, requestedTime: '24:00' }, status: 400 },
    { body: { ...validRequest, serviceId, requestedDate: '2000-01-01' }, status: 422 },
  ]

  for (const scenario of cases) {
    const response = await submitRequest(scenario.body)
    assert.equal(response.status, scenario.status)
    const body = await response.json() as { erro?: string }
    assert.equal(typeof body.erro, 'string')
    await assertNoRequestEffects()
  }
})

test('IT-REQUEST-03: serviço inexistente ou inativo retorna 400 sem persistir', async () => {
  const inactiveServiceId = await createService(false)
  for (const serviceId of ['999999', inactiveServiceId]) {
    const response = await submitRequest({ ...validRequest, serviceId })
    assert.equal(response.status, 400)
    await assertNoRequestEffects()
  }
})

test('IT-REQUEST-04: somente SOLICITANTE autenticado pode criar solicitações', async () => {
  const serviceId = await createService()
  const body = { ...validRequest, serviceId }

  assert.equal((await submitRequest(body, null)).status, 401)
  for (const role of ['GESTOR', 'ADMINISTRADOR', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await submitRequest(body, role)).status, 403, role)
    await assertNoRequestEffects()
  }
})

test('IT-REQUEST-05: perfil revogado no cadastro atual invalida o perfil SOLICITANTE do token antigo', async () => {
  const serviceId = await createService()
  const requester = getUser('SOLICITANTE')
  const manager = getUser('GESTOR')
  await pool.query('UPDATE auth.users SET role_id = $1 WHERE id = $2', [manager.roleId, requester.id])

  const response = await submitRequest({ ...validRequest, serviceId }, 'SOLICITANTE')
  assert.equal(response.status, 403)
  await assertNoRequestEffects()
})

test('IT-REQUEST-06: Gestor filtra, pagina e consulta o detalhe com os dados da decisão', async () => {
  const serviceId = await createService()
  const earlyId = await createPendingRequest(serviceId, '2099-12-01')
  const lateId = await createPendingRequest(serviceId, '2099-12-02')

  const missingAuth = await requestApi('/requests?status=PENDING', null)
  assert.equal(missingAuth.status, 401)
  const forbidden = await requestApi('/requests', 'MOTORISTA')
  assert.equal(forbidden.status, 403)

  const listResponse = await requestApi(
    '/requests?status=PENDING&from=2099-12-01&to=2099-12-02&requester=Solicitante%20Fict%C3%ADcio&service=FROTA-80&page=1&pageSize=1',
    'GESTOR',
  )
  assert.equal(listResponse.status, 200)
  const page = await listResponse.json() as {
    requests: Array<{ id: string; requestedDate: string; createdAt: string; updatedAt: string }>
    total: number
    totalPages: number
  }
  assert.deepEqual(page, {
    requests: [{
      id: earlyId,
      requesterId: getUser('SOLICITANTE').id,
      requesterName: getUser('SOLICITANTE').name,
      serviceId,
      serviceName: 'Serviço fictício de integração FROTA-80',
      requestedDate: '2099-12-01',
      requestedTime: '08:30',
      origin: validRequest.origin,
      destination: validRequest.destination,
      purpose: validRequest.purpose,
      passengers: 1,
      status: 'PENDING',
      createdAt: page.requests[0]?.createdAt,
      updatedAt: page.requests[0]?.updatedAt,
    }],
    total: 2,
    page: 1,
    pageSize: 1,
    totalPages: 2,
  })

  const ownDetail = await requestApi(`/requests/${earlyId}`, 'SOLICITANTE')
  assert.equal(ownDetail.status, 200)
  const detail = await ownDetail.json() as { requesterName: string; decidedByName: string | null; trip: unknown }
  assert.equal(detail.requesterName, getUser('SOLICITANTE').name)
  assert.equal(detail.decidedByName, null)
  assert.equal(detail.trip, null)

  const anotherPage = await requestApi('/requests?status=PENDING&page=2&pageSize=1', 'GESTOR')
  const second = await anotherPage.json() as { requests: Array<{ id: string }> }
  assert.equal(second.requests[0]?.id, lateId)

  const decision = await requestApi(`/requests/${earlyId}/reject`, 'GESTOR', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Sem viatura disponível' }),
  })
  assert.equal(decision.status, 200)
  const decidedDetail = await requestApi(`/requests/${earlyId}`, 'GESTOR')
  const decided = await decidedDetail.json() as { status: string; decidedByName: string; decisionReason: string; decidedAt: string }
  assert.equal(decided.status, 'REJECTED')
  assert.equal(decided.decidedByName, getUser('GESTOR').name)
  assert.equal(decided.decisionReason, 'Sem viatura disponível')
  assert.ok(Number.isFinite(Date.parse(decided.decidedAt)))
})
