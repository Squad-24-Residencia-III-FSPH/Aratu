import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient } from './client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { sessionFor } from '../../tests/fixtures.mjs'

test('401 com motivo específico de conta inativa repassa o motivo para onUnauthorized', async () => {
  let session = sessionFor('SOLICITANTE')
  let capturedReason
  const request = createApiClient({
    baseUrl: '/api',
    getSession: () => session,
    onUnauthorized: (reason) => {
      capturedReason = reason
      session = null
    },
    fetcher: async () => Response.json(
      { erro: 'Sua conta não está ativa. Entre novamente ou procure a administração.' },
      { status: 401 },
    ),
  })

  await assert.rejects(request('/requests'), { message: SESSION_EXPIRED })
  assert.equal(session, null)
  assert.equal(capturedReason, 'Sua conta não está ativa. Entre novamente ou procure a administração.')
})

test('401 genérico mantém motivo padrão de sessão expirada sem ecoar texto técnico', async () => {
  let session = sessionFor('GESTOR')
  let capturedReason = 'nao-deveria-permanecer'
  const request = createApiClient({
    baseUrl: '/api',
    getSession: () => session,
    onUnauthorized: (reason) => {
      capturedReason = reason
      session = null
    },
    fetcher: async () => Response.json({ erro: 'Token inválido ou expirado.' }, { status: 401 }),
  })

  await assert.rejects(request('/requests'), { message: SESSION_EXPIRED })
  assert.equal(session, null)
  assert.equal(capturedReason, undefined)
})

test('expiração ocorrida durante prepare limpa a sessão antes de enviar requisição', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] })
  const session = sessionFor('GESTOR', 5)
  let unauthorizedCalled = false
  let fetched = false
  const request = createApiClient({
    baseUrl: '/api',
    getSession: () => session,
    onUnauthorized: () => { unauthorizedCalled = true },
    prepare: async () => { t.mock.timers.tick(6000) },
    fetcher: async () => {
      fetched = true
      return Response.json({})
    },
  })

  await assert.rejects(request('/requests'), { message: SESSION_EXPIRED })
  assert.equal(unauthorizedCalled, true)
  assert.equal(fetched, false)
})

test('401 atrasado de token anterior não aciona onUnauthorized quando sessão já mudou', async () => {
  let session = sessionFor('GESTOR')
  let unauthorizedCalled = false
  let resolveFetch
  const request = createApiClient({
    baseUrl: '/api',
    getSession: () => session,
    onUnauthorized: () => { unauthorizedCalled = true },
    fetcher: () => new Promise((resolve) => { resolveFetch = resolve }),
  })

  const pending = request('/requests')
  session = sessionFor('SOLICITANTE')
  resolveFetch(Response.json(
    { erro: 'Sua conta não está ativa. Entre novamente ou procure a administração.' },
    { status: 401 },
  ))

  await assert.rejects(pending, { message: SESSION_EXPIRED })
  assert.equal(unauthorizedCalled, false)
  assert.equal(session.perfil, 'SOLICITANTE')
})
