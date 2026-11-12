import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

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

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { default: RequestDetailsPanel } = await vite.ssrLoadModule('/src/components/RequestDetailsPanel.tsx')

afterEach(() => cleanup())
after(async () => { await vite.close(); dom.window.close() })

const request = {
  id: 'request-1', requesterId: 'user-1', requesterName: 'Solicitante Fictício',
  serviceId: 'service-1', serviceName: 'Transporte institucional',
  requestedDate: '2026-12-15', requestedTime: '08:30',
  origin: 'Unidade de origem', destination: 'Unidade de destino', purpose: 'Atividade institucional',
  passengers: 2, status: 'PENDING', decidedBy: null, decidedByName: null,
  decidedAt: null, decisionReason: null, createdAt: '2026-11-12T12:00:00.000Z',
  updatedAt: '2026-11-12T12:00:00.000Z', trip: null,
}

test('carrega o painel com rótulos semânticos e permite recuperar após erro da API', async () => {
  let calls = 0
  const api = async () => {
    calls += 1
    return calls === 1
      ? Response.json({ erro: 'Solicitação não encontrada.' }, { status: 404 })
      : Response.json(request)
  }

  render(createElement(RequestDetailsPanel, { requestId: request.id, api }))
  assert.ok(screen.getByText('Carregando dados da solicitação...'))
  assert.ok(await screen.findByText('Solicitação não encontrada.'))
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  const title = await screen.findByRole('heading', { level: 2, name: 'Detalhes da solicitação' })
  assert.ok(title)
  assert.equal(screen.getByText('Solicitante').tagName, 'DT')
  assert.equal(screen.getByText('Solicitante Fictício').tagName, 'DD')
  assert.equal(screen.getByText('Setor').tagName, 'DT')
  assert.equal(screen.getByText('Não informado').tagName, 'DD')
  assert.ok(screen.getByText('Nenhuma decisão registrada.'))
  await waitFor(() => assert.equal(calls, 2))
})
