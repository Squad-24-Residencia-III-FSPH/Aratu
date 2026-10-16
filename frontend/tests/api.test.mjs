import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient } from '../src/api/client.ts'
import { SESSION_EXPIRED } from '../src/auth/token.ts'
import { SERVICE_UNAVAILABLE } from '../src/auth/loginService.ts'
import { sessionFor } from './fixtures.mjs'

test('requisições protegidas enviam o Bearer da sessão atual', async () => {
  const session = sessionFor()
  const request = createApiClient({
    baseUrl: '/api/', getSession: () => session,
    onUnauthorized: () => assert.fail('Sessão válida'),
    fetcher: async (path, options) => {
      assert.equal(path, '/api/protected')
      assert.equal(options.headers.get('Authorization'), 'Bearer ' + session.token)
      return Response.json({ ok: true })
    },
  })
  assert.equal((await request('/protected')).status, 200)
})

test('HTTP 401 invalida sessão, impedindo próximas requisições protegidas', async () => {
  let session = sessionFor()
  let requests = 0
  const request = createApiClient({
    baseUrl: '/api', getSession: () => session, onUnauthorized: () => { session = null },
    fetcher: async () => { requests++; return Response.json({ erro: 'Token inválido' }, { status: 401 }) },
  })
  await assert.rejects(request('/protected'), { message: SESSION_EXPIRED })
  assert.equal(session, null)
  await assert.rejects(request('/protected'), { message: SESSION_EXPIRED })
  assert.equal(requests, 1)
})

test('token expirado não é enviado à API', async () => {
  let cleared = false
  const request = createApiClient({
    baseUrl: '/api', getSession: () => sessionFor('MOTORISTA', -1),
    onUnauthorized: () => { cleared = true },
    fetcher: () => assert.fail('Não deve enviar token expirado'),
  })
  await assert.rejects(request('/protected'), { message: SESSION_EXPIRED })
  assert.equal(cleared, true)
})

test('indisponibilidade da API não é confundida com autenticação válida', async () => {
  const request = createApiClient({
    baseUrl: '/api', getSession: () => sessionFor(), onUnauthorized: () => assert.fail('Não é 401'),
    fetcher: async () => { throw new TypeError('rede indisponível') },
  })
  await assert.rejects(request('/protected'), { message: SERVICE_UNAVAILABLE })
})

test('um 401 atrasado não apaga uma sessão nova', async () => {
  let session = sessionFor('GESTOR')
  let respond
  const request = createApiClient({
    baseUrl: '/api', getSession: () => session, onUnauthorized: () => { session = null },
    fetcher: () => new Promise((resolve) => { respond = resolve }),
  })
  const pending = request('/protected')
  session = sessionFor('MOTORISTA')
  respond(Response.json({}, { status: 401 }))
  await assert.rejects(pending, { message: SESSION_EXPIRED })
  assert.equal(session.perfil, 'MOTORISTA')
})
