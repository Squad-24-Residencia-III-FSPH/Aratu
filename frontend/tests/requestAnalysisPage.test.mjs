import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { sessionFor } from './fixtures.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node }, DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot }, MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
dom.window.requestAnimationFrame ??= callback => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= id => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: RequestAnalysisPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/RequestAnalysisPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => { await vite.close(); dom.window.close() })

const request = {
  id: '41', requesterId: '8', requesterName: 'Solicitante Fictício', serviceId: '5',
  serviceName: 'Transporte institucional', requestedDate: '2026-12-15', requestedTime: '08:30',
  origin: 'Unidade fictícia de origem', destination: 'Unidade fictícia de destino',
  purpose: 'Atividade institucional fictícia', passengers: 2, status: 'PENDING',
  decidedBy: null, decidedByName: null, decidedAt: null, decisionReason: null,
  createdAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z', trip: null,
}

test('seleciona, lê os detalhes e rejeita com justificativa; a solicitação sai da lista', async () => {
  let listCalls = 0
  let rejection = null
  const api = async (path, options = {}) => {
    if (path.startsWith('/requests?')) {
      listCalls += 1
      return Response.json({ requests: listCalls === 1 ? [request] : [], total: listCalls === 1 ? 1 : 0, page: 1, pageSize: 20, totalPages: listCalls === 1 ? 1 : 0 })
    }
    if (path === '/requests/41') return Response.json(request)
    if (path === '/requests/41/reject') {
      rejection = JSON.parse(options.body)
      return Response.json({ id: '41', status: 'REJECTED' })
    }
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  render(createElement(AuthContext.Provider, { value: auth }, createElement(RequestAnalysisPage)))

  assert.ok(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  assert.ok(await screen.findByText('Atividade institucional fictícia'))
  assert.ok(screen.getByText('Não informado'))

  await user.click(screen.getByRole('button', { name: 'Rejeitar solicitação' }))
  const dialog = await screen.findByRole('dialog')
  const confirm = within(dialog).getByRole('button', { name: 'Rejeitar solicitação' })
  assert.equal(confirm.disabled, true)
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa da rejeição' }), 'Sem veículo disponível')
  assert.equal(confirm.disabled, false)
  await user.click(confirm)

  assert.ok(await screen.findByText('Solicitação #41 rejeitada.'))
  await waitFor(() => assert.equal(listCalls, 2))
  assert.deepEqual(rejection, { reason: 'Sem veículo disponível' })
  assert.equal(screen.queryByRole('button', { name: 'Ver detalhes da solicitação 41' }), null)
})
