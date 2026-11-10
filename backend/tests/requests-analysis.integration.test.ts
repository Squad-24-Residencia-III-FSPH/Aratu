import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { RequestDecisionResult } from '../src/types/request-decision.types'
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

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

function decide(requestId: string, decision: 'approve' | 'reject', role: UserRole | null = 'GESTOR', body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}/requests/${requestId}/${decision}`, {
    method: 'POST',
    headers: {
      ...(role ? { Authorization: `Bearer ${getUser(role).token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function insertPendingRequest(): Promise<string> {
  const service = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name) VALUES ('Transporte Fictício QA') RETURNING id::text AS id`,
  )
  const request = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose)
     VALUES ($1, $2, '2099-12-01', '08:00', 'Sede fictícia', 'Unidade fictícia', 'Reunião de teste')
     RETURNING id::text AS id`,
    [getUser('SOLICITANTE').id, service.rows[0]?.id],
  )
  const id = request.rows[0]?.id
  if (!id) throw new Error('Falha ao inserir solicitação de teste.')
  return id
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

test('IT-ANALYSIS-01: aprovação de pendente retorna 200 com APPROVED, responsável e data do servidor', async () => {
  const requestId = await insertPendingRequest()
  const gestor = getUser('GESTOR')
  const requestedAt = Date.now()
  const response = await decide(requestId, 'approve')
  const answeredAt = Date.now()
  assert.equal(response.status, 200)
  const body = (await response.json()) as RequestDecisionResult
  assert.equal(body.status, 'APPROVED')
  assert.equal(body.decidedBy, gestor.id)
  const decidedAt = new Date(body.decidedAt).getTime()
  assert.ok(decidedAt >= requestedAt - 1000 && decidedAt <= answeredAt + 1000, 'decidedAt deve ser o relógio do servidor no momento da decisão')

  const row = await pool.query('SELECT status, decided_by::text AS decided_by FROM trip.requests WHERE id = $1', [requestId])
  assert.deepEqual(row.rows[0], { status: 'APPROVED', decided_by: gestor.id })
  const events = await pool.query('SELECT event_type, reason FROM trip.request_events WHERE request_id = $1', [requestId])
  assert.deepEqual(events.rows, [{ event_type: 'APPROVED', reason: 'Solicitação aprovada' }])
  const audits = await pool.query(`SELECT operation FROM audit.logs WHERE table_name = 'trip.requests' AND record_id = $1`, [requestId])
  assert.equal(audits.rowCount, 1)
})

test('IT-ANALYSIS-02: rejeição com justificativa retorna 200 com REJECTED e o motivo', async () => {
  const requestId = await insertPendingRequest()
  const response = await decide(requestId, 'reject', 'GESTOR', { reason: 'Sem veículo disponível' })
  assert.equal(response.status, 200)
  const body = (await response.json()) as RequestDecisionResult
  assert.equal(body.status, 'REJECTED')
  assert.equal(body.decisionReason, 'Sem veículo disponível')
  const row = await pool.query('SELECT decision_reason FROM trip.requests WHERE id = $1', [requestId])
  assert.equal(row.rows[0]?.decision_reason, 'Sem veículo disponível')
})

test('IT-ANALYSIS-03: rejeição sem justificativa retorna 400 e mantém a solicitação pendente', async () => {
  const requestId = await insertPendingRequest()
  assert.equal((await decide(requestId, 'reject', 'GESTOR', {})).status, 400)
  assert.equal((await decide(requestId, 'reject', 'GESTOR', { reason: '   ' })).status, 400)
  const row = await pool.query('SELECT status FROM trip.requests WHERE id = $1', [requestId])
  assert.equal(row.rows[0]?.status, 'PENDING')
})

test('IT-ANALYSIS-04: analisar solicitação já decidida retorna 409; inexistente retorna 404', async () => {
  const requestId = await insertPendingRequest()
  assert.equal((await decide(requestId, 'approve')).status, 200)
  assert.equal((await decide(requestId, 'approve')).status, 409)
  assert.equal((await decide(requestId, 'reject', 'GESTOR', { reason: 'Tarde demais' })).status, 409)
  assert.equal((await decide('999999', 'approve')).status, 404)
})

test('IT-ANALYSIS-05: duas decisões simultâneas sobre a mesma solicitação — só uma vence', async () => {
  const requestId = await insertPendingRequest()
  const responses = await Promise.all([
    decide(requestId, 'approve'),
    decide(requestId, 'reject', 'GESTOR', { reason: 'Decisão concorrente' }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  const events = await pool.query('SELECT count(*)::int AS total FROM trip.request_events WHERE request_id = $1', [requestId])
  assert.equal(events.rows[0]?.total, 1)
})

test('IT-ANALYSIS-06: perfil diferente de GESTOR recebe 403; sem token, 401', async () => {
  const requestId = await insertPendingRequest()
  for (const role of ['SOLICITANTE', 'ADMINISTRADOR', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await decide(requestId, 'approve', role)).status, 403, role)
    assert.equal((await decide(requestId, 'reject', role, { reason: 'x' })).status, 403, role)
  }
  assert.equal((await decide(requestId, 'approve', null)).status, 401)
})
