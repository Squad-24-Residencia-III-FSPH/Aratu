import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { Driver } from '../src/types/driver.types'
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

const validDriver = {
  name: 'Motorista Fictício QA',
  cpf: '12345678909',
  cnhNumber: '00000000001',
  cnhCategory: 'D',
  cnhExpiresAt: '2099-12-31',
  phone: '(79) 90000-0000',
  reportedBy: 'Coordenação fictícia',
  reason: 'Cadastro inicial de teste',
}

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

async function createDriver(body: Record<string, unknown> = validDriver): Promise<Driver> {
  const response = await api('/drivers', { method: 'POST', token: getUser('GESTOR').token, body })
  assert.equal(response.status, 201)
  return (await response.json()) as Driver
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

test('IT-DRIVERS-01: cadastro retorna 201 e grava evento e auditoria', async () => {
  const driver = await createDriver()
  assert.equal(driver.status, 'ACTIVE')
  assert.equal(driver.cnhExpiresAt, '2099-12-31')
  assert.equal(driver.revision, 1)

  const events = await pool.query('SELECT event_type, reported_by, reason FROM fleet.driver_events WHERE driver_id = $1', [driver.id])
  assert.deepEqual(events.rows, [{ event_type: 'CREATED', reported_by: 'Coordenação fictícia', reason: 'Cadastro inicial de teste' }])
  const audits = await pool.query(
    `SELECT operation FROM audit.logs WHERE table_name = 'fleet.drivers' AND record_id = $1`,
    [driver.id],
  )
  assert.equal(audits.rowCount, 1)
})

test('IT-DRIVERS-02: CPF inválido retorna 400 e CPF duplicado retorna 409', async () => {
  const token = getUser('GESTOR').token
  const invalid = await api('/drivers', { method: 'POST', token, body: { ...validDriver, cpf: '123.456.789-09' } })
  assert.equal(invalid.status, 400)

  await createDriver()
  const duplicate = await api('/drivers', { method: 'POST', token, body: validDriver })
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { erro: 'CPF já cadastrado' })
})

test('IT-DRIVERS-03: CNH vencida bloqueia ACTIVE (422) e permite cadastro afastado', async () => {
  const token = getUser('GESTOR').token
  const expired = { ...validDriver, cnhExpiresAt: '2020-01-01' }
  const blocked = await api('/drivers', { method: 'POST', token, body: expired })
  assert.equal(blocked.status, 422)

  const away = await createDriver({ ...expired, status: 'AWAY' })
  const activate = await api(`/drivers/${away.id}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'ACTIVE', expectedRevision: 1, reportedBy: 'Coordenação fictícia', reason: 'Retorno' },
  })
  assert.equal(activate.status, 422)
})

test('IT-DRIVERS-04: listagem filtra por nome parcial e situação; detalhe ausente retorna 404', async () => {
  const token = getUser('ADMINISTRADOR').token
  await createDriver()
  await createDriver({ ...validDriver, name: 'Condutora Fictícia', cpf: '11144477735', status: 'AWAY' })

  const byName = (await (await api('/drivers?name=motorista%20fict', { token })).json()) as Driver[]
  assert.deepEqual(byName.map((driver) => driver.name), ['Motorista Fictício QA'])
  const byStatus = (await (await api('/drivers?status=AWAY', { token })).json()) as Driver[]
  assert.deepEqual(byStatus.map((driver) => driver.name), ['Condutora Fictícia'])
  const wildcard = (await (await api('/drivers?name=%25', { token })).json()) as Driver[]
  assert.equal(wildcard.length, 0)

  assert.equal((await api('/drivers/999999', { token })).status, 404)
})

test('IT-DRIVERS-05: edição com revisão antiga retorna 409 e PATCH muda a situação', async () => {
  const token = getUser('GESTOR').token
  const driver = await createDriver()
  const updated = await api(`/drivers/${driver.id}`, {
    method: 'PUT',
    token,
    body: { ...validDriver, phone: null, expectedRevision: 1 },
  })
  assert.equal(updated.status, 200)
  assert.equal(((await updated.json()) as Driver).revision, 2)

  const stale = await api(`/drivers/${driver.id}`, { method: 'PUT', token, body: { ...validDriver, expectedRevision: 1 } })
  assert.equal(stale.status, 409)

  const inactive = await api(`/drivers/${driver.id}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'INACTIVE', expectedRevision: 2, reportedBy: 'Coordenação fictícia', reason: 'Desligamento' },
  })
  assert.equal(inactive.status, 200)
  assert.equal(((await inactive.json()) as Driver).status, 'INACTIVE')
})

test('IT-DRIVERS-06: vínculo aceita conta MOTORISTA, recusa outro perfil (422) e repetição (409)', async () => {
  const token = getUser('GESTOR').token
  const linked = await createDriver({ ...validDriver, userId: getUser('MOTORISTA').id })
  assert.equal(linked.userId, getUser('MOTORISTA').id)

  const wrongRole = await api('/drivers', {
    method: 'POST',
    token,
    body: { ...validDriver, cpf: '11144477735', userId: getUser('SOLICITANTE').id },
  })
  assert.equal(wrongRole.status, 422)

  const repeated = await api('/drivers', {
    method: 'POST',
    token,
    body: { ...validDriver, cpf: '11144477735', userId: getUser('MOTORISTA').id },
  })
  assert.equal(repeated.status, 409)
})

test('IT-DRIVERS-07: perfis sem permissão recebem 403 e requisição sem token 401', async () => {
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await api('/drivers', { token: getUser(role).token })).status, 403, role)
  }
  assert.equal((await api('/drivers')).status, 401)
})
