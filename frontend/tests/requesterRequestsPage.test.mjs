import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { MemoryRouter } from 'react-router-dom'
import { sessionFor } from './fixtures.mjs'

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

const { cleanup, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), cacheDir: viteCacheDir,
  plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: SolicitacaoPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/SolicitacaoPage/SolicitacaoPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => { await vite.close(); dom.window.close() })

test('Solicitante envia pedido real com serviço e passageiros ao backend', async () => {
  let submitted = null
  const service = {
    id: '5', name: 'Transporte institucional', description: null, categories: ['PASSENGER'],
    requiresTriage: false, requiresWeight: false, requiresIdentification: false, active: true, revision: 1,
  }
  let listCalls = 0
  const api = async (url, options = {}) => {
    if (url === '/services') return Response.json([service])
    if (url.startsWith('/requests?')) {
      listCalls += 1
      return Response.json({ requests: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    }
    if (url === '/requests' && options.method === 'POST') {
      submitted = JSON.parse(options.body)
      return Response.json({ id: '42', status: 'PENDING' }, { status: 201 })
    }
    throw new Error(`Rota de teste inesperada: ${url}`)
  }
  const auth = { session: sessionFor('SOLICITANTE'), signIn: async () => {}, logout() {}, api, notice: '' }
  const user = userEvent.setup()
  render(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: auth }, createElement(SolicitacaoPage))))

  await user.click(await screen.findByRole('button', { name: 'Nova solicitação' }))
  await user.type(await screen.findByLabelText(/Data da viagem/), '2026-12-20')
  await user.type(await screen.findByLabelText(/Horário/), '09:15')
  await user.click(screen.getByRole('combobox', { name: 'Tipo de serviço' }))
  await user.click(await screen.findByRole('option', { name: 'Transporte institucional' }))
  const passengersInput = await screen.findByLabelText(/Passageiros/)
  await user.clear(passengersInput)
  await user.type(passengersInput, '3')
  await user.type(await screen.findByLabelText(/Origem/), 'Unidade de origem')
  await user.type(await screen.findByLabelText(/Destino/), 'Unidade de destino')
  await user.type(await screen.findByLabelText(/Finalidade/), 'Atividade institucional')
  await user.type(await screen.findByLabelText(/Necessidades especiais/), 'Acesso sem escadas')
  await user.type(await screen.findByLabelText(/Observações/), 'Avisar na recepção')
  await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))

  assert.ok(await screen.findByText('Solicitação #42 enviada para análise.'))
  assert.deepEqual(submitted, {
    requestedDate: '2026-12-20', requestedTime: '09:15', origin: 'Unidade de origem',
    destination: 'Unidade de destino', purpose: 'Atividade institucional', serviceId: '5',
    passengers: 3, specialRequirements: 'Acesso sem escadas', notes: 'Avisar na recepção',
  })
  await waitFor(() => assert.ok(listCalls >= 2))
})
