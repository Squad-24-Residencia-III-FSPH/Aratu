import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import jwt = require('jsonwebtoken')
import { createApp } from '../src/app'
import { createAuthMiddleware } from '../src/middlewares/auth.middleware'
import type { UserForLogin } from '../src/types/auth'
import { AuthService } from '../src/services/auth.service'
import { comparePassword, hashPassword } from '../src/services/password.service'
import { loadJwtConfig } from '../src/services/jwt-config.service'

const password = 'senha-ficticia-para-testes'
const jwtConfig = { secret: 'chave-ficticia-de-teste-com-tamanho-suficiente', expiresInSeconds: 28_800 }
let passwordHash: string

before(async () => {
  passwordHash = await hashPassword(password)
})

test('bcrypt cria hash e diferencia a senha correta de uma incorreta', async () => {
  assert.notEqual(passwordHash, password)
  assert.equal(await comparePassword(password, passwordHash), true)
  assert.equal(await comparePassword('senha-incorreta', passwordHash), false)
})

test('hash de senha vazia não é criado e hash ausente não autentica', async () => {
  await assert.rejects(hashPassword(''), /senha não pode estar vazia/)
  assert.equal(await comparePassword(password, ''), false)
  await assert.rejects(hashPassword('á'.repeat(37)), /limite suportado pelo bcrypt/)
  assert.equal(await comparePassword('á'.repeat(37), passwordHash), false)
})

test('configuração JWT exige segredo e usa oito horas por padrão', () => {
  assert.throws(() => loadJwtConfig({}), /JWT_SECRET é obrigatória/)
  assert.deepEqual(loadJwtConfig({ JWT_SECRET: 'chave-ficticia' }), {
    secret: 'chave-ficticia',
    expiresInSeconds: 28_800,
  })
  assert.equal(loadJwtConfig({ JWT_SECRET: 'x', JWT_EXPIRES_IN: '15m' }).expiresInSeconds, 900)
  assert.throws(
    () => loadJwtConfig({ JWT_SECRET: 'x', JWT_EXPIRES_IN: '0 hours' }),
    /JWT_EXPIRES_IN/,
  )
})

function user(overrides: Partial<UserForLogin> = {}): UserForLogin {
  return {
    id: '1',
    name: 'Usuária Fictícia',
    email: 'motorista@example.test',
    password_hash: passwordHash,
    role: 'MOTORISTA',
    is_active: true,
    ...overrides,
  }
}

test('login normaliza e-mail, valida bcrypt e emite JWT com id e perfil', async () => {
  let queriedEmail = ''
  const service = new AuthService({
    findByEmail: async (email) => {
      queriedEmail = email
      return user()
    },
  }, jwtConfig)

  const result = await service.login('  MOTORISTA@EXAMPLE.TEST ', password)
  assert.equal(queriedEmail, 'motorista@example.test')
  assert.equal(result.kind, 'authenticated')
  if (result.kind !== 'authenticated') return

  assert.equal(result.user.nome, 'Usuária Fictícia')
  assert.equal(result.user.perfil, 'MOTORISTA')
  const payload = jwt.verify(result.user.token, jwtConfig.secret, { algorithms: ['HS256'] })
  assert.equal(typeof payload, 'object')
  if (typeof payload === 'string') return
  assert.equal(payload.id, '1')
  assert.equal(payload.perfil, 'MOTORISTA')
  assert.equal('role' in payload, false)
  assert.equal('nome' in payload, false)
  assert.equal('email' in payload, false)
  assert.equal(typeof payload.exp, 'number')
  assert.equal(typeof payload.iat, 'number')
  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return
  assert.equal(payload.exp - payload.iat, 28_800)
})

test('login não diferencia usuário inexistente de senha incorreta; conta inativa não recebe token', async () => {
  const absent = new AuthService({ findByEmail: async () => null }, jwtConfig)
  const wrongPassword = new AuthService({ findByEmail: async () => user() }, jwtConfig)
  const inactive = new AuthService({ findByEmail: async () => user({ is_active: false }) }, jwtConfig)

  assert.deepEqual(await absent.login('missing@example.test', password), { kind: 'invalid-credentials' })
  assert.deepEqual(await wrongPassword.login('motorista@example.test', 'errada'), { kind: 'invalid-credentials' })
  assert.deepEqual(await inactive.login('motorista@example.test', password), { kind: 'inactive' })
})

async function withServer(
  users: { findByEmail(email: string): Promise<UserForLogin | null> },
  run: (baseUrl: string) => Promise<void>,
  configure?: (app: ReturnType<typeof createApp>) => void,
): Promise<void> {
  const app = createApp({ users, jwtConfig })
  configure?.(app)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const address = server.address() as AddressInfo
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

test('POST /auth/login mantém contrato do frontend e mensagens de erro definidas', async () => {
  await withServer({
    findByEmail: async (email) => {
      if (email === 'motorista@example.test') return user()
      if (email === 'inativa@example.test') return user({ email, is_active: false })
      return null
    },
  }, async (baseUrl) => {
    const success = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'MOTORISTA@example.test', senha: password }),
    })
    assert.equal(success.status, 200)
    const successBody = await success.json() as { token: string; nome: string; perfil: string }
    assert.equal(typeof successBody.token, 'string')
    assert.deepEqual({ nome: successBody.nome, perfil: successBody.perfil }, {
      nome: 'Usuária Fictícia',
      perfil: 'MOTORISTA',
    })

    const invalid = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.test', senha: password }),
    })
    assert.equal(invalid.status, 401)
    assert.deepEqual(await invalid.json(), { erro: 'E-mail ou senha inválidos' })

    const wrongPassword = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'motorista@example.test', senha: 'incorreta' }),
    })
    assert.equal(wrongPassword.status, 401)
    assert.deepEqual(await wrongPassword.json(), { erro: 'E-mail ou senha inválidos' })

    const inactive = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inativa@example.test', senha: password }),
    })
    assert.equal(inactive.status, 403)
    assert.deepEqual(await inactive.json(), { erro: 'Acesso desativado' })

    const malformedBody = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'motorista@example.test' }),
    })
    assert.equal(malformedBody.status, 400)
  })
})

test('logout protegido rejeita token ausente/inválido e aceita token válido', async () => {
  await withServer({ findByEmail: async () => user() }, async (baseUrl) => {
    const withoutToken = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' })
    assert.equal(withoutToken.status, 401)

    const invalidToken = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: 'Bearer inválido' },
    })
    assert.equal(invalidToken.status, 401)

    const invalidRoleToken = jwt.sign({ id: user().id, perfil: 'PERFIL_DESCONHECIDO' }, jwtConfig.secret)
    const invalidRole = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${invalidRoleToken}` },
    })
    assert.equal(invalidRole.status, 401)

    const legacyRoleToken = jwt.sign({ id: user().id, role: 'MOTORISTA' }, jwtConfig.secret)
    const legacyRole = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${legacyRoleToken}` },
    })
    assert.equal(legacyRole.status, 401)

    const expiredToken = jwt.sign(
      { id: user().id, perfil: 'MOTORISTA', exp: Math.floor(Date.now() / 1000) - 1 },
      jwtConfig.secret,
    )
    const expired = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredToken}` },
    })
    assert.equal(expired.status, 401)

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'motorista@example.test', senha: password }),
    })
    const { token } = await login.json() as { token: string }
    const privateRoute = await fetch(`${baseUrl}/test-private`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(privateRoute.status, 200)
    assert.deepEqual(await privateRoute.json(), {
      id: '1',
      perfil: 'MOTORISTA',
    })

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(logout.status, 200)
    assert.match((await logout.json() as { mensagem: string }).mensagem, /Apague o token armazenado no cliente/)
  }, (app) => {
    app.get('/test-private', createAuthMiddleware(jwtConfig.secret), (req, res) => {
      res.json(req.usuario)
    })
  })
})
