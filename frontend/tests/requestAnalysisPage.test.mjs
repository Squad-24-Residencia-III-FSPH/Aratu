import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement, Fragment } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createTestViteServer } from './viteTestServer.mjs'
import react from '@vitejs/plugin-react'
import { sessionFor } from './fixtures.mjs'

// O cache precisa ficar fora de `node_modules`, que pode ser somente leitura
// quando as dependências foram instaladas por outro usuário (ex: container).
const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-test-'))

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
const vite = await createTestViteServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), cacheDir: viteCacheDir, plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: RequestAnalysisPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/requestAnalysisPage/RequestAnalysisPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => { await vite.close(); dom.window.close() })

function LocationProbe() {
  const location = useLocation()
  return createElement('output', { 'data-testid': 'router-location' }, `${location.pathname}${location.search}`)
}

function mount(auth) {
  render(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth },
      createElement(Fragment, null, createElement(RequestAnalysisPage), createElement(LocationProbe)))))
}

const request = {
  id: '41', requesterId: '8', requesterName: 'Solicitante Fictício', serviceId: '5',
  serviceName: 'Transporte institucional', requestedDate: '2026-12-15', requestedTime: '08:30',
  origin: 'Unidade fictícia de origem', destination: 'Unidade fictícia de destino',
  purpose: 'Atividade institucional fictícia', passengers: 2, specialRequirements: null, notes: null,
  status: 'PENDING', revision: 1,
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
  mount(auth)

  assert.equal(document.title, 'Solicitações | Aratu')
  assert.ok(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  assert.ok(await screen.findByText('Atividade institucional fictícia'))

  await user.click(screen.getByRole('button', { name: 'Recusar definitivamente' }))
  const dialog = await screen.findByRole('dialog')
  const confirm = within(dialog).getByRole('button', { name: 'Recusar definitivamente' })
  assert.equal(confirm.disabled, true)
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa da recusa definitiva' }), 'Sem veículo disponível')
  assert.equal(confirm.disabled, false)
  await user.click(confirm)

  assert.ok(await screen.findByText('Solicitação #41 rejeitada.'))
  await waitFor(() => assert.equal(listCalls, 2))
  assert.deepEqual(rejection, { reason: 'Sem veículo disponível', expectedRevision: 1 })
  // O botão que abriu o diálogo sai da lista com a linha decidida; o foco retorna
  // ao aviso para o teclado não cair no body (ver `onExited` do ConfirmDialog).
  assert.equal(screen.queryByRole('button', { name: 'Ver detalhes da solicitação 41' }), null)
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole('status')))
})

test('gestor encaminha a solicitação para o fluxo de agendamento sem aprová-la antes', async () => {
  const api = async (path) => {
    if (path.startsWith('/requests?')) return Response.json({ requests: [request], total: 1, page: 1, pageSize: 20, totalPages: 1 })
    if (path === '/requests/41') return Response.json(request)
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  mount(auth)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
  assert.equal(screen.getByTestId('router-location').textContent, '/agendar-viagem?requestId=41')
})

test('devolve solicitação para correção com observação e revisão atual', async () => {
  let returnBody = null
  const api = async (path, options = {}) => {
    if (path.startsWith('/requests?')) return Response.json({ requests: [request], total: 1, page: 1, pageSize: 20, totalPages: 1 })
    if (path === '/requests/41') return Response.json(request)
    if (path === '/requests/41/return') {
      returnBody = JSON.parse(options.body)
      return Response.json({ id: '41', status: 'RETURNED' })
    }
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  mount(auth)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(await screen.findByRole('button', { name: 'Devolver para correção' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: 'Observação para correção' }), 'Confirme o endereço de origem')
  await user.click(within(dialog).getByRole('button', { name: 'Devolver para correção' }))

  assert.ok(await screen.findByText('Solicitação #41 devolvida para correção.'))
  assert.deepEqual(returnBody, { reason: 'Confirme o endereço de origem', expectedRevision: 1 })
})

test('mostra estado parcial quando a recusa foi salva e a atualização da lista falha', async () => {
  let listCalls = 0
  const api = async (path) => {
    if (path.startsWith('/requests?')) {
      listCalls += 1
      if (listCalls === 2) return Response.json({ erro: 'Falha ao atualizar a lista.' }, { status: 503 })
      return Response.json({ requests: listCalls === 1 ? [request] : [], total: listCalls === 1 ? 1 : 0, page: 1, pageSize: 20, totalPages: listCalls === 1 ? 1 : 0 })
    }
    if (path === '/requests/41') return Response.json(request)
    if (path === '/requests/41/reject') return Response.json({ id: '41', status: 'REJECTED' })
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  mount(auth)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(await screen.findByRole('button', { name: 'Recusar definitivamente' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa da recusa definitiva' }), 'Sem disponibilidade operacional')
  await user.click(within(dialog).getByRole('button', { name: 'Recusar definitivamente' }))

  assert.ok(await screen.findByText('A decisão foi registrada, mas a lista pode estar desatualizada.'))
  assert.ok(screen.getByText('Falha ao atualizar a lista.'))
  assert.equal(screen.queryByText('Agendar viagem'), null)
  await user.click(await screen.findByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => assert.equal(listCalls, 3))
  await waitFor(() => assert.equal(screen.queryByText('A decisão foi registrada, mas a lista pode estar desatualizada.'), null))
})

test('preserva o erro da API quando outro Gestor já analisou a solicitação', async () => {
  let listCalls = 0
  const api = async (path) => {
    if (path.startsWith('/requests?')) {
      listCalls += 1
      return Response.json({ requests: [request], total: 1, page: 1, pageSize: 20, totalPages: 1 })
    }
    if (path === '/requests/41') return Response.json(request)
    if (path === '/requests/41/reject') {
      return Response.json({ erro: 'Esta solicitação já foi analisada por outro Gestor.' }, { status: 409 })
    }
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  mount(auth)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  await user.click(await screen.findByRole('button', { name: 'Recusar definitivamente' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa da recusa definitiva' }), 'Sem disponibilidade operacional')
  await user.click(within(dialog).getByRole('button', { name: 'Recusar definitivamente' }))

  const error = await within(dialog).findByRole('alert')
  assert.equal(error.textContent, 'Esta solicitação já foi analisada por outro Gestor.')
  assert.equal(listCalls, 1)
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
  assert.ok(await screen.findByRole('button', { name: 'Solicitação selecionada 41' }))
})

test('administrador consulta e abre os dados sem receber ações de decisão', async () => {
  const api = async (path) => {
    if (path.startsWith('/requests?')) return Response.json({ requests: [request], total: 1, page: 1, pageSize: 20, totalPages: 1 })
    if (path === '/requests/41') return Response.json(request)
    throw new Error(`Rota de teste inesperada: ${path}`)
  }
  const auth = { session: sessionFor('ADMINISTRADOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  mount(auth)

  assert.ok(await screen.findByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  assert.ok(screen.getByText('A consulta está disponível para manutenção e supervisão. Decisões operacionais são registradas pelo Gestor.'))
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação 41' }))
  assert.ok(await screen.findByText('Atividade institucional fictícia'))
  assert.equal(screen.queryByRole('button', { name: 'Aprovar solicitação' }), null)
  assert.equal(screen.queryByRole('button', { name: 'Devolver para correção' }), null)
  assert.equal(screen.queryByRole('button', { name: 'Recusar definitivamente' }), null)
})
