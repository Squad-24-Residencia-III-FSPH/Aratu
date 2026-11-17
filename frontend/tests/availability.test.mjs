import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waitForApi } from '../src/api/availability.ts'
import { createApiClient } from '../src/api/client.ts'
import { sessionFor } from './fixtures.mjs'

test('retomada repete somente GET até o banco estar pronto', async () => {
  const calls = []
  await waitForApi('https://api.example.test/', { intervalMs: 1, fetcher: async (url, options) => {
    calls.push({ url, options })
    return Response.json({ status: calls.length === 1 ? 'unavailable' : 'ready' }, { status: calls.length === 1 ? 503 : 200 })
  } })
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.url.endsWith('/health/ready') && call.options.method === undefined))
})

test('retomada pode ser cancelada e tem prazo limitado', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(waitForApi('/api', { signal: controller.signal }), /cancelada/)
  await assert.rejects(waitForApi('/api', { timeoutMs: 10, intervalMs: 1, fetcher: async () => new Response(null, { status: 503 }) }), /indisponível/)
})

test('uma escrita aguarda prontidão e é enviada somente uma vez', async () => {
  let writes = 0
  let prepared = false
  const session = sessionFor()
  const api = createApiClient({ baseUrl: '/api', getSession: () => session, onUnauthorized: () => assert.fail(),
    prepare: async () => { prepared = true }, fetcher: async () => {
      assert.equal(prepared, true); writes++; return new Response(null, { status: 503 })
    } })
  assert.equal((await api('/requests', { method: 'POST' })).status, 503)
  assert.equal(writes, 1)
})

test('troca de sessão durante retomada impede escrita com token de outra conta', async () => {
  let session = sessionFor()
  const api = createApiClient({ baseUrl: '/api', getSession: () => session, onUnauthorized: () => assert.fail(),
    prepare: async () => { session = sessionFor('MOTORISTA') }, fetcher: () => assert.fail('Não enviar escrita antiga') })
  await assert.rejects(api('/requests', { method: 'POST' }), /sessão/i)
})
