import test from 'node:test'
import assert from 'node:assert/strict'
import { logout } from '../src/auth/logoutService.ts'
import { sessionFor } from './fixtures.mjs'

test('logout usa token capturado, POST sem corpo e base configurada', async () => {
  const { token } = sessionFor()
  let calls = 0
  assert.equal(await logout(token, { baseUrl: '/custom/', fetcher: async (url, options) => {
    calls++
    assert.equal(url, '/custom/auth/logout')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer ' + token)
    assert.equal(options.body, undefined)
    assert.equal(options.cache, 'no-store')
    return Response.json({ mensagem: 'Logout realizado.' })
  } }), true)
  assert.equal(calls, 1)
})

for (const status of [204, 400, 401, 403, 500]) {
  test(`logout ${status} não confirma auditoria nem repete pedido`, async () => {
    let calls = 0
    assert.equal(await logout('token-capturado', { fetcher: async () => {
      calls++
      return new Response(null, { status })
    } }), false)
    assert.equal(calls, 1)
  })
}

test('falha de rede é um resultado tratado', async () => {
  assert.equal(await logout('token-capturado', { fetcher: async () => { throw new TypeError('offline') } }), false)
})

test('timeout aborta a tentativa de saída', async () => {
  assert.equal(await logout('token-capturado', { timeoutMs: 5, fetcher: (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  }), false)
})
