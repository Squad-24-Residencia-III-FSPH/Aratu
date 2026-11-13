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
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, render, screen, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: TripConfirmationPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/TripConfirmationPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])
afterEach(() => cleanup())
after(async () => { await vite.close(); dom.window.close() })

const trip = (id, overrides = {}) => ({
  id, requestId: `2026-00${id}`, status: 'FINISHED',
  scheduledStart: '2026-11-10T11:00:00.000Z', scheduledEnd: '2026-11-10T12:00:00.000Z',
  startedAt: '2026-11-10T11:03:00.000Z', finishedAt: '2026-11-10T11:44:00.000Z',
  startKm: 41152, endKm: 41200, vehicleLicensePlate: 'ABC1D23', driverName: 'Motorista Fictício',
  origin: 'Unidade Fictícia A', destination: 'Unidade Fictícia B', confirmedBy: null, confirmedAt: null, ...overrides,
})
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(TripConfirmationPage)))
}

test('carrega viagens finalizadas, mostra detalhes suportados e não simula tipo de serviço ou fotos', async () => {
  const finishedTrips = [trip('73', { startKm: null }), trip('74')]
  const calls = []
  renderPage(async (path) => { calls.push(path); return jsonResponse(finishedTrips) })
  assert.ok(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  assert.equal(new URL(calls[0], 'http://aratu.test').searchParams.get('status'), 'FINISHED')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver detalhes da viagem 74' }))
  const details = await screen.findByRole('dialog', { name: 'Conferir viagem #74' })
  assert.ok(within(details).getByText('Solicitação'))
  assert.ok(within(details).getByText('Início planejado'))
  assert.ok(within(details).getByText('Início realizado'))
  assert.ok(within(details).getByText('41.152 km'))
  assert.ok(within(details).getByText('48 km'))
  assert.equal(within(details).queryByText(/foto|evidência/i), null)
  assert.equal(within(details).queryByText(/tipo de serviço/i), null)
})

test('bloqueia confirmação sem hodômetro e confirma viagem válida após diálogo', async () => {
  let finishedTrips = [trip('73', { startKm: null }), trip('74')]
  const calls = []
  const api = async (path, options = {}) => {
    calls.push({ path, options })
    if (path.startsWith('/trips?')) return jsonResponse(finishedTrips)
    if (path === '/trips/74/confirm') {
      finishedTrips = finishedTrips.filter((item) => item.id !== '74')
      return jsonResponse({ id: '74', status: 'CONFIRMED', confirmedBy: '5', confirmedAt: '2026-11-10T12:00:00.000Z', revision: 2 })
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)
  await screen.findByRole('button', { name: 'Ver detalhes da viagem 73' })
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da viagem 73' }))
  const incomplete = await screen.findByRole('dialog', { name: 'Conferir viagem #73' })
  assert.ok(within(incomplete).getByText(/hodômetro inicial/))
  assert.equal(within(incomplete).getByRole('button', { name: 'Confirmar viagem' }).disabled, true)
  await user.click(within(incomplete).getByRole('button', { name: 'Fechar' }))
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))
  assert.ok(await screen.findByText('Viagem #74 confirmada com sucesso.'))
  assert.ok(calls.some(({ path, options }) => path === '/trips/74/confirm' && options.method === 'POST' && options.body === undefined))
  assert.equal(screen.queryByRole('button', { name: 'Ver detalhes da viagem 74' }), null)
})

test('mensagem de erro de confirmação preserva o campo erro da API', async () => {
  const api = async (path) => path.startsWith('/trips?')
    ? jsonResponse([trip('74')])
    : jsonResponse({ erro: 'Viagem sem evidências do hodômetro não pode ser confirmada.' }, 422)
  const user = userEvent.setup()
  renderPage(api)
  await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' })
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))
  assert.ok((await screen.findAllByText('Viagem sem evidências do hodômetro não pode ser confirmada.')).length > 0)
})
