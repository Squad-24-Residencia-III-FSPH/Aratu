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
  RBAC_FIXTURE_PASSWORD,
  RBAC_JWT_CONFIG,
  RBAC_JWT_SECRET,
  seedRbacTestUsers,
} from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

interface UserPayload {
  id: string
  name: string
  email: string
  roleId: string
  role: UserRole
  active: boolean
  revision: number
  createdAt: string
  updatedAt: string
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

test('IT-USERS-01: cadastro válido retorna 201 sem credenciais e registra auditoria', async () => {
  const admin = getUser('ADMINISTRADOR')
  const response = await api('/users', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'Usuária Fictícia Nova',
      email: 'nova.usuaria@example.test',
      roleId: admin.roleId,
      password: 'senha-ficticia-nova',
    },
  })

  assert.equal(response.status, 201)
  const body = await response.json() as UserPayload & Record<string, unknown>
  assert.equal(body.name, 'Usuária Fictícia Nova')
  assert.equal(body.email, 'nova.usuaria@example.test')
  assert.equal(body.active, true)
  assert.equal(body.revision, 1)
  assert.equal('password_hash' in body, false)
  assert.equal('passwordHash' in body, false)

  const audit = await pool.query<{ operation: string }>(
    `SELECT operation FROM audit.logs WHERE record_id = $1 ORDER BY id ASC`,
    [body.id],
  )
  assert.deepEqual(audit.rows.map((row) => row.operation), ['CREATE'])
})

test('IT-USERS-02: e-mail duplicado retorna 409 e payload inválido retorna 400', async () => {
  const admin = getUser('ADMINISTRADOR')
  const duplicate = await api('/users', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'Duplicada Fictícia',
      email: 'GESTOR.QA@EXAMPLE.TEST',
      roleId: admin.roleId,
      password: 'senha-ficticia',
    },
  })
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { erro: 'E-mail já cadastrado.' })

  const invalidEmail = await api('/users', {
    method: 'POST',
    token: admin.token,
    body: { name: 'Sem Email', email: 'invalido', roleId: admin.roleId, password: 'x' },
  })
  assert.equal(invalidEmail.status, 400)

  const missingName = await api('/users', {
    method: 'POST',
    token: admin.token,
    body: { email: 'sem.nome@example.test', roleId: admin.roleId, password: 'x' },
  })
  assert.equal(missingName.status, 400)

  const longPassword = await api('/users', {
    method: 'POST',
    token: admin.token,
    body: {
      name: 'Senha Longa',
      email: 'senha.longa@example.test',
      roleId: admin.roleId,
      password: 'á'.repeat(37),
    },
  })
  assert.equal(longPassword.status, 400)
})

test('IT-USERS-03: listagem filtra por nome, perfil e situação com envelope paginado', async () => {
  const admin = getUser('ADMINISTRADOR')
  const response = await api('/users?nome=Gestor&perfil=GESTOR&ativo=true&page=1&pageSize=5', {
    token: admin.token,
  })

  assert.equal(response.status, 200)
  const body = await response.json() as {
    users: UserPayload[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  assert.equal(body.total, 1)
  assert.equal(body.page, 1)
  assert.equal(body.pageSize, 5)
  assert.equal(body.totalPages, 1)
  assert.equal(body.users[0]?.role, 'GESTOR')

  const invalid = await api('/users?ativo=talvez', { token: admin.token })
  assert.equal(invalid.status, 400)
})

test('IT-USERS-04: detalhe retorna 200 para existente e 404 para inexistente', async () => {
  const admin = getUser('ADMINISTRADOR')
  const found = await api(`/users/${getUser('MOTORISTA').id}`, { token: admin.token })
  assert.equal(found.status, 200)
  assert.equal((await found.json() as UserPayload).role, 'MOTORISTA')

  const missing = await api('/users/999999', { token: admin.token })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { erro: 'Usuário não encontrado.' })
})

test('IT-USERS-05: edição atualiza dados, mas rejeita revisão antiga e e-mail duplicado', async () => {
  const admin = getUser('ADMINISTRADOR')
  const target = getUser('MOTORISTA')
  const updated = await api(`/users/${target.id}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      name: 'Motorista Editado Fictício',
      email: 'motorista.editado@example.test',
      roleId: admin.roleId,
      revision: 1,
    },
  })

  assert.equal(updated.status, 200)
  const body = await updated.json() as UserPayload
  assert.equal(body.name, 'Motorista Editado Fictício')
  assert.equal(body.email, 'motorista.editado@example.test')
  assert.equal(body.role, 'ADMINISTRADOR')
  assert.equal(body.revision, 2)

  const stale = await api(`/users/${target.id}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      name: 'Motorista Editado Fictício',
      email: 'motorista.editado@example.test',
      roleId: admin.roleId,
      revision: 1,
    },
  })
  assert.equal(stale.status, 409)

  const duplicate = await api(`/users/${target.id}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      name: 'Motorista Editado Fictício',
      email: 'gestor.qa@example.test',
      roleId: admin.roleId,
      revision: 2,
    },
  })
  assert.equal(duplicate.status, 409)
})

test('IT-USERS-06: inativação bloqueia login, reativação libera e autoinativação falha', async () => {
  const admin = getUser('ADMINISTRADOR')
  const gestor = getUser('GESTOR')

  const deactivated = await api(`/users/${gestor.id}/deactivate`, {
    method: 'PATCH',
    token: admin.token,
  })
  assert.equal(deactivated.status, 200)
  assert.equal((await deactivated.json() as UserPayload).active, false)

  const blockedLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: gestor.email, senha: RBAC_FIXTURE_PASSWORD }),
  })
  assert.equal(blockedLogin.status, 403)
  assert.deepEqual(await blockedLogin.json(), { erro: 'Acesso desativado' })

  const reactivated = await api(`/users/${gestor.id}/activate`, {
    method: 'PATCH',
    token: admin.token,
  })
  assert.equal(reactivated.status, 200)
  assert.equal((await reactivated.json() as UserPayload).active, true)

  const allowedLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: gestor.email, senha: RBAC_FIXTURE_PASSWORD }),
  })
  assert.equal(allowedLogin.status, 200)

  const self = await api(`/users/${admin.id}/deactivate`, {
    method: 'PATCH',
    token: admin.token,
  })
  assert.equal(self.status, 409)
  assert.deepEqual(await self.json(), { erro: 'Você não pode inativar a própria conta.' })
})

test('IT-USERS-07: /users exige autenticação e perfil ADMINISTRADOR e não expõe DELETE', async () => {
  const anonymous = await api('/users')
  assert.equal(anonymous.status, 401)

  const gestor = getUser('GESTOR')
  const forbidden = await api('/users', { token: gestor.token })
  assert.equal(forbidden.status, 403)

  const admin = getUser('ADMINISTRADOR')
  const remove = await api(`/users/${gestor.id}`, { method: 'DELETE', token: admin.token })
  assert.equal(remove.status, 404)
})

test('IT-USERS-08: alterações registram UPDATE e STATUS_CHANGE na auditoria', async () => {
  const admin = getUser('ADMINISTRADOR')
  const target = getUser('SOLICITANTE')

  await api(`/users/${target.id}`, {
    method: 'PUT',
    token: admin.token,
    body: {
      name: 'Solicitante Editado Fictício',
      email: target.email,
      roleId: target.roleId,
      revision: 1,
    },
  })
  await api(`/users/${target.id}/deactivate`, { method: 'PATCH', token: admin.token })

  const audit = await pool.query<{ operation: string }>(
    `SELECT operation FROM audit.logs WHERE record_id = $1 ORDER BY id ASC`,
    [target.id],
  )
  assert.deepEqual(audit.rows.map((row) => row.operation), ['UPDATE', 'STATUS_CHANGE'])
})
