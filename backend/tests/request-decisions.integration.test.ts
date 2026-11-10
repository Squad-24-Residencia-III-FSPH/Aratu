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

async function api(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

async function insertPendingRequest(): Promise<string> {
  const service = await pool.query<{ id: string }>(
    `INSERT INTO fleet.services (name) VALUES ('Transporte Fictício QA') RETURNING id::text AS id`,
  )
  const request = await pool.query<{ id: string }>(
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose)
     VALUES ($1, $2, '2026-12-01', '08:00', 'Sede fictícia', 'Unidade fictícia', 'Reunião de teste')
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

test('IT-DECISIONS-01: aprovação registra responsável, data, evento e auditoria', async () => {
  const requestId = await insertPendingRequest()
  const gestor = getUser('GESTOR')
  const response = await api(`/requests/${requestId}/approve`, { method: 'POST', token: gestor.token })
  assert.equal(response.status, 200)
  const body = (await response.json()) as RequestDecisionResult
  assert.equal(body.status, 'APPROVED')
  assert.equal(body.decidedBy, gestor.id)
  assert.ok(body.decidedAt)

  const row = await pool.query('SELECT status, decided_by::text AS decided_by FROM trip.requests WHERE id = $1', [requestId])
  assert.deepEqual(row.rows[0], { status: 'APPROVED', decided_by: gestor.id })
  const events = await pool.query('SELECT event_type, reason FROM trip.request_events WHERE request_id = $1', [requestId])
  assert.deepEqual(events.rows, [{ event_type: 'APPROVED', reason: 'Solicitação aprovada' }])
  const audits = await pool.query(`SELECT operation FROM audit.logs WHERE table_name = 'trip.requests' AND record_id = $1`, [requestId])
  assert.equal(audits.rowCount, 1)
})

test('IT-DECISIONS-02: rejeição exige justificativa e grava o motivo', async () => {
  const requestId = await insertPendingRequest()
  const token = getUser('GESTOR').token
  assert.equal((await api(`/requests/${requestId}/reject`, { method: 'POST', token, body: {} })).status, 400)

  const response = await api(`/requests/${requestId}/reject`, { method: 'POST', token, body: { reason: 'Sem veículo disponível' } })
  assert.equal(response.status, 200)
  const body = (await response.json()) as RequestDecisionResult
  assert.equal(body.status, 'REJECTED')
  assert.equal(body.decisionReason, 'Sem veículo disponível')
})

test('IT-DECISIONS-03: decisão repetida retorna 409 e inexistente 404', async () => {
  const requestId = await insertPendingRequest()
  const token = getUser('GESTOR').token
  assert.equal((await api(`/requests/${requestId}/approve`, { method: 'POST', token })).status, 200)
  assert.equal((await api(`/requests/${requestId}/approve`, { method: 'POST', token })).status, 409)
  assert.equal((await api(`/requests/${requestId}/reject`, { method: 'POST', token, body: { reason: 'x' } })).status, 409)
  assert.equal((await api('/requests/999999/approve', { method: 'POST', token })).status, 404)
})

test('IT-DECISIONS-04: duas decisões simultâneas resultam em uma 200 e uma 409', async () => {
  const requestId = await insertPendingRequest()
  const token = getUser('GESTOR').token
  const responses = await Promise.all([
    api(`/requests/${requestId}/approve`, { method: 'POST', token }),
    api(`/requests/${requestId}/reject`, { method: 'POST', token, body: { reason: 'Concorrente' } }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  const events = await pool.query('SELECT count(*)::int AS total FROM trip.request_events WHERE request_id = $1', [requestId])
  assert.equal(events.rows[0]?.total, 1)
})

test('IT-DECISIONS-05: somente GESTOR decide', async () => {
  const requestId = await insertPendingRequest()
  for (const role of ['SOLICITANTE', 'ADMINISTRADOR', 'MOTORISTA', 'ATENDENTE_SVO'] as const) {
    assert.equal((await api(`/requests/${requestId}/approve`, { method: 'POST', token: getUser(role).token })).status, 403, role)
  }
  assert.equal((await api(`/requests/${requestId}/approve`, { method: 'POST' })).status, 401)
})
