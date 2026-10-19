import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import jwt = require('jsonwebtoken')
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { createAuthMiddleware } from '../src/middlewares/auth.middleware'
import { authorizeRoles } from '../src/middlewares/rbac.middleware'
import { USER_ROLES } from '../src/types/auth'
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
  generateRbacUserToken,
  seedRbacTestUsers,
} from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

/**
 * Mensagem padronizada esperada em rejeições de autorização RBAC (HTTP 403).
 */
const EXPECTED_FORBIDDEN_BODY = {
  erro: 'Acesso negado: perfil de usuário não autorizado para esta operação.',
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()

  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG })
  const authenticate = createAuthMiddleware(RBAC_JWT_CONFIG.secret)

  // Endpoints dedicados para auditoria da autorização de cada perfil (Seção 5.1 do SDD)
  app.get('/test-access/gestor', authenticate, authorizeRoles(['GESTOR']), (_req, res) => {
    res.status(200).json({ mensagem: 'Acesso autorizado para GESTOR.' })
  })

  app.get('/test-access/solicitante', authenticate, authorizeRoles(['SOLICITANTE']), (_req, res) => {
    res.status(200).json({ mensagem: 'Acesso autorizado para SOLICITANTE.' })
  })

  app.get('/test-access/motorista', authenticate, authorizeRoles(['MOTORISTA']), (_req, res) => {
    res.status(200).json({ mensagem: 'Acesso autorizado para MOTORISTA.' })
  })

  app.get('/test-access/atendente-svo', authenticate, authorizeRoles(['ATENDENTE_SVO']), (_req, res) => {
    res.status(200).json({ mensagem: 'Acesso autorizado para ATENDENTE_SVO.' })
  })

  app.get('/test-access/equipe-svo', authenticate, authorizeRoles(['EQUIPE_SVO']), (_req, res) => {
    res.status(200).json({ mensagem: 'Acesso autorizado para EQUIPE_SVO.' })
  })

  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
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

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) {
    throw new Error(`Usuário de teste para o perfil ${role} não está instanciado na fixture.`)
  }
  return user
}

test('IT-RBAC-01: ADMINISTRADOR obtém sucesso ao listar os perfis RBAC em GET /profiles', async () => {
  const admin = getUser('ADMINISTRADOR')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })

  assert.equal(response.status, 200)
  const profiles = await response.json() as Array<{ id: string; name: string; description: string }>
  assert.ok(Array.isArray(profiles))
  assert.equal(profiles.length, 6)

  const returnedRoles = profiles.map((p) => p.name)
  for (const role of USER_ROLES) {
    assert.ok(returnedRoles.includes(role), `Perfil ${role} deve estar presente na listagem de perfis.`)
  }
})

test('IT-RBAC-02: ADMINISTRADOR recebe 403 Forbidden ao acessar endpoint exclusivo de MOTORISTA', async () => {
  const admin = getUser('ADMINISTRADOR')
  const response = await fetch(`${baseUrl}/test-access/motorista`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-03: GESTOR obtém sucesso ao acessar rota autorizada para seu perfil', async () => {
  const gestor = getUser('GESTOR')
  const response = await fetch(`${baseUrl}/test-access/gestor`, {
    headers: { Authorization: `Bearer ${gestor.token}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mensagem: 'Acesso autorizado para GESTOR.' })
})

test('IT-RBAC-04: GESTOR recebe 403 Forbidden ao tentar acessar rota exclusiva de ADMINISTRADOR', async () => {
  const gestor = getUser('GESTOR')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${gestor.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-05: SOLICITANTE obtém sucesso ao acessar rota autorizada para seu perfil', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await fetch(`${baseUrl}/test-access/solicitante`, {
    headers: { Authorization: `Bearer ${solicitante.token}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mensagem: 'Acesso autorizado para SOLICITANTE.' })
})

test('IT-RBAC-06: SOLICITANTE recebe 403 Forbidden ao tentar acessar rota exclusiva de ADMINISTRADOR', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${solicitante.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-07: MOTORISTA obtém sucesso ao acessar rota autorizada para seu perfil', async () => {
  const motorista = getUser('MOTORISTA')
  const response = await fetch(`${baseUrl}/test-access/motorista`, {
    headers: { Authorization: `Bearer ${motorista.token}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mensagem: 'Acesso autorizado para MOTORISTA.' })
})

test('IT-RBAC-08: MOTORISTA recebe 403 Forbidden ao tentar acessar rota exclusiva de ADMINISTRADOR', async () => {
  const motorista = getUser('MOTORISTA')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${motorista.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-09: ATENDENTE_SVO obtém sucesso ao acessar rota autorizada para seu perfil', async () => {
  const atendenteSvo = getUser('ATENDENTE_SVO')
  const response = await fetch(`${baseUrl}/test-access/atendente-svo`, {
    headers: { Authorization: `Bearer ${atendenteSvo.token}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mensagem: 'Acesso autorizado para ATENDENTE_SVO.' })
})

test('IT-RBAC-10: ATENDENTE_SVO recebe 403 Forbidden ao tentar acessar rota exclusiva de ADMINISTRADOR', async () => {
  const atendenteSvo = getUser('ATENDENTE_SVO')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${atendenteSvo.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-11: EQUIPE_SVO obtém sucesso ao acessar rota autorizada para seu perfil', async () => {
  const equipeSvo = getUser('EQUIPE_SVO')
  const response = await fetch(`${baseUrl}/test-access/equipe-svo`, {
    headers: { Authorization: `Bearer ${equipeSvo.token}` },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mensagem: 'Acesso autorizado para EQUIPE_SVO.' })
})

test('IT-RBAC-12: EQUIPE_SVO recebe 403 Forbidden ao tentar acessar rota exclusiva de ADMINISTRADOR', async () => {
  const equipeSvo = getUser('EQUIPE_SVO')
  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${equipeSvo.token}` },
  })

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), EXPECTED_FORBIDDEN_BODY)
})

test('IT-RBAC-13: Todos os 6 perfis RBAC realizam logout com sucesso em POST /auth/logout', async () => {
  for (const role of USER_ROLES) {
    const user = getUser(role)
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
    })

    assert.equal(response.status, 200, `Logout deve retornar 200 para o perfil ${role}.`)
    const body = await response.json() as { mensagem: string }
    assert.equal(body.mensagem, 'Logout realizado. Apague o token armazenado no cliente.')
  }
})

test('IT-RBAC-14: Requisição sem cabeçalho Authorization é rejeitada com 401 Unauthorized', async () => {
  const responseProfiles = await fetch(`${baseUrl}/profiles`)
  assert.equal(responseProfiles.status, 401)
  assert.deepEqual(await responseProfiles.json(), { erro: 'Autenticação necessária.' })

  const responseLogout = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' })
  assert.equal(responseLogout.status, 401)
  assert.deepEqual(await responseLogout.json(), { erro: 'Autenticação necessária.' })
})

test('IT-RBAC-15: Requisição com token JWT expirado é rejeitada com 401 Unauthorized', async () => {
  const admin = getUser('ADMINISTRADOR')
  const expiredToken = generateRbacUserToken(
    { id: admin.id, role: admin.role },
    RBAC_JWT_SECRET,
    { expiresIn: -10 },
  )

  const response = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  })

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { erro: 'Token inválido ou expirado.' })
})

test('IT-RBAC-16: Requisição com token adulterado, forjado ou com perfil desconhecido é rejeitada com 401', async () => {
  const admin = getUser('ADMINISTRADOR')

  // Assinatura com segredo divergente
  const forgedSecretToken = generateRbacUserToken(
    { id: admin.id, role: admin.role },
    'segredo-divergente-nao-autorizado',
  )
  const respForged = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${forgedSecretToken}` },
  })
  assert.equal(respForged.status, 401)
  assert.deepEqual(await respForged.json(), { erro: 'Token inválido ou expirado.' })

  // Token com perfil inexistente fora do catálogo canônico
  const invalidRoleToken = jwt.sign(
    { id: admin.id, perfil: 'SUPER_USUARIO_FORJADO' },
    RBAC_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )
  const respInvalidRole = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: `Bearer ${invalidRoleToken}` },
  })
  assert.equal(respInvalidRole.status, 401)
  assert.deepEqual(await respInvalidRole.json(), { erro: 'Token inválido.' })

  // Formato malformado sem Bearer
  const respMalformed = await fetch(`${baseUrl}/profiles`, {
    headers: { Authorization: 'TokenInvalidoSemBearer' },
  })
  assert.equal(respMalformed.status, 401)
  assert.deepEqual(await respMalformed.json(), { erro: 'Autenticação necessária.' })
})

test('IT-RBAC-17: Todos os 6 perfis realizam login válido via POST /auth/login e recebem credenciais e tokens legítimos', async () => {
  for (const role of USER_ROLES) {
    const user = getUser(role)
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        senha: RBAC_FIXTURE_PASSWORD,
      }),
    })

    assert.equal(response.status, 200, `Login deve responder 200 para ${role}`)
    const body = await response.json() as { token: string; nome: string; perfil: string }
    assert.equal(typeof body.token, 'string')
    assert.equal(body.perfil, role)
    assert.equal(body.nome, user.name)
  }
})
