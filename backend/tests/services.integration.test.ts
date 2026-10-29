import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { FleetService } from '../src/types/fleet-service.types'
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

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

async function createService(body: Record<string, unknown>): Promise<FleetService> {
  const response = await api('/services', { method: 'POST', token: getUser('GESTOR').token, body })
  assert.equal(response.status, 201)
  return (await response.json()) as FleetService
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

test('IT-SERVICES-01: cadastro retorna 201 com padrões e grava auditoria', async () => {
  const service = await createService({ name: 'Transporte de Passageiros', reason: 'Catálogo inicial' })
  assert.deepEqual(service.categories, ['PASSENGER'])
  assert.equal(service.active, true)
  assert.equal(service.revision, 1)

  const audits = await pool.query(
    `SELECT operation, reason FROM audit.logs WHERE table_name = 'fleet.services' AND record_id = $1`,
    [service.id],
  )
  assert.deepEqual(audits.rows, [{ operation: 'CREATE', reason: 'Catálogo inicial' }])
})

test('IT-SERVICES-02: nome repetido sem diferenciar maiúsculas retorna 409', async () => {
  await createService({ name: 'Coleta de Amostras', reason: 'Catálogo inicial' })
  const duplicate = await api('/services', {
    method: 'POST',
    token: getUser('ADMINISTRADOR').token,
    body: { name: '  COLETA DE AMOSTRAS ', reason: 'Teste' },
  })
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { erro: 'Tipo de serviço já cadastrado' })
})

test('IT-SERVICES-03: edição com revisão e conflito de revisão antiga', async () => {
  const token = getUser('GESTOR').token
  const service = await createService({ name: 'Distribuição de Materiais', reason: 'Catálogo inicial' })
  const updated = await api(`/services/${service.id}`, {
    method: 'PUT',
    token,
    body: { name: 'Distribuição de Insumos', categories: ['OTHER'], requiresWeight: true, expectedRevision: 1, reason: 'Ajuste' },
  })
  assert.equal(updated.status, 200)
  const body = (await updated.json()) as FleetService
  assert.equal(body.revision, 2)
  assert.deepEqual(body.categories, ['OTHER'])

  const stale = await api(`/services/${service.id}`, {
    method: 'PUT',
    token,
    body: { name: 'Outro Nome', expectedRevision: 1, reason: 'Ajuste' },
  })
  assert.equal(stale.status, 409)
})

test('IT-SERVICES-04: inativado some para o Solicitante e continua visível ao Gestor', async () => {
  const gestor = getUser('GESTOR').token
  const solicitante = getUser('SOLICITANTE').token
  await createService({ name: 'Transporte de Passageiros', reason: 'Catálogo inicial' })
  const old = await createService({ name: 'Serviço Antigo', reason: 'Catálogo inicial' })

  const deactivated = await api(`/services/${old.id}/deactivate`, {
    method: 'PATCH',
    token: gestor,
    body: { expectedRevision: 1, reason: 'Fora de uso' },
  })
  assert.equal(deactivated.status, 200)
  assert.equal(((await deactivated.json()) as FleetService).active, false)

  const requesterList = (await (await api('/services', { token: solicitante })).json()) as FleetService[]
  assert.deepEqual(requesterList.map((item) => item.name), ['Transporte de Passageiros'])
  assert.equal((await api(`/services/${old.id}`, { token: solicitante })).status, 404)
  assert.equal((await api('/services?active=false', { token: solicitante })).status, 400)

  const inactiveList = (await (await api('/services?active=false', { token: gestor })).json()) as FleetService[]
  assert.deepEqual(inactiveList.map((item) => item.name), ['Serviço Antigo'])

  const reactivated = await api(`/services/${old.id}/activate`, {
    method: 'PATCH',
    token: gestor,
    body: { expectedRevision: 2, reason: 'Retomado' },
  })
  assert.equal(((await reactivated.json()) as FleetService).active, true)
})

test('IT-SERVICES-05: RBAC de leitura e escrita', async () => {
  const service = await createService({ name: 'Remoção SVO', categories: ['BODY'], reason: 'Catálogo inicial' })
  assert.equal((await api('/services', { token: getUser('ATENDENTE_SVO').token })).status, 200)
  for (const role of ['MOTORISTA', 'EQUIPE_SVO'] as const) {
    assert.equal((await api('/services', { token: getUser(role).token })).status, 403, role)
  }
  const write = await api('/services', {
    method: 'POST',
    token: getUser('SOLICITANTE').token,
    body: { name: 'Novo', reason: 'x' },
  })
  assert.equal(write.status, 403)
  const deactivate = await api(`/services/${service.id}/deactivate`, {
    method: 'PATCH',
    token: getUser('ATENDENTE_SVO').token,
    body: { expectedRevision: 1, reason: 'x' },
  })
  assert.equal(deactivate.status, 403)
  assert.equal((await api('/services')).status, 401)
})
