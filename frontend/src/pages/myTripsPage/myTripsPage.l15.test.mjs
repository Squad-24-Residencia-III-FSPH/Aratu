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
import { sessionFor } from '../../../tests/fixtures.mjs'
import { jsonResponse, makeDriverTrip, makeTrip } from '../../../tests/my-trips.fixture.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l15-my-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  cacheDir: viteCacheDir,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const [{ default: MyTripsPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/myTripsPage/MyTripsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const NOW_ISO = new Date().toISOString()

function renderPage(api, session = sessionFor('MOTORISTA')) {
  return render(
    createElement(
      AuthContext.Provider,
      { value: { session, signIn: async () => {}, logout() {}, api, notice: '' } },
      createElement(MyTripsPage),
    ),
  )
}

function makeApi(state) {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    if (path === '/trips/mine') return state.onList ? state.onList() : jsonResponse(state.list)
    return state.onPost(path, init)
  }
  return { api, calls, posts: () => calls.filter(({ init }) => init.method === 'POST') }
}

test('T16-P01: resultado incerto no término bloqueia repetição até reconsulta bem-sucedida e permite nova tentativa se ainda em andamento', async () => {
  const state = {
    list: [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1000, startedAt: NOW_ISO })],
    onPost: async () => { throw new Error('Falha temporária de rede') },
  }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' }))
  const dialog = await screen.findByRole('dialog')
  const field = within(dialog).getByRole('textbox', { name: /Quilometragem final/ })
  await user.type(field, '1025')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar término' }))

  assert.ok(await within(dialog).findByText(/Não foi possível confirmar se o registro foi concluído/))
  assert.equal(field.value, '1025')
  const confirmButton = within(dialog).getByRole('button', { name: 'Confirmar término' })
  assert.equal(confirmButton.disabled, true, 'repetição deve ficar bloqueada até reconsulta')
  fireEvent.click(confirmButton)
  await user.click(field)
  await user.keyboard('{Enter}')
  assert.equal(posts().length, 1, 'Enter e clique não podem repetir POST enquanto incerto')

  // Falha na reconsulta mantém bloqueio e preserva digitação
  state.onList = async () => jsonResponse({ erro: 'Indisponível' }, 503)
  await user.click(within(dialog).getByRole('button', { name: 'Atualizar situação' }))
  await waitFor(() => assert.ok(screen.getByText('A lista pode estar desatualizada.')))
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar término' }).disabled, true)
  assert.equal(field.value, '1025')

  // Reconsulta bem-sucedida com a viagem ainda em andamento limpa erro incerto e libera nova tentativa explícita
  state.onList = undefined
  await user.click(within(dialog).getByRole('button', { name: 'Atualizar situação' }))
  const notice = await within(dialog).findByText(/continua em andamento/i)
  assert.equal(notice.closest('[role="status"]') !== null, true)
  assert.equal(within(dialog).queryByText(/Não foi possível confirmar se o registro foi concluído/), null)
  assert.equal(field.value, '1025')
  await waitFor(() => assert.equal(within(dialog).getByRole('button', { name: 'Confirmar término' }).disabled, false))

  // Nova tentativa explícita conclui e anuncia em role="status" único (sem role="alert" interno)
  state.onPost = () => {
    state.list = []
    return jsonResponse(makeTrip(5, { status: 'FINISHED', endKm: 1025, finishedAt: NOW_ISO }))
  }
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar término' }))
  const successText = await screen.findByText(/Viagem #5 finalizada .* 1\.025 km/)
  const statusRegion = successText.closest('[role="status"]')
  assert.ok(statusRegion !== null)
  assert.equal(within(statusRegion).queryByRole('alert'), null, 'não deve aninhar role="alert" dentro de role="status"')
  assert.equal(posts().length, 2)
})

test('T16-P01: resultado incerto no início exibe estado persistido se o servidor já gravou', async () => {
  const state = {
    list: [makeDriverTrip(8, { scheduledStart: NOW_ISO, status: 'SCHEDULED' })],
    onPost: async () => jsonResponse({ erro: 'Erro interno' }, 500),
  }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Iniciar viagem #8 para Unidade fictícia 8' }))
  const dialog = await screen.findByRole('dialog')
  const field = within(dialog).getByRole('textbox', { name: /Quilometragem inicial/ })
  await user.type(field, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))

  assert.ok(await within(dialog).findByText(/Não foi possível confirmar se o registro foi concluído/))
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)

  // Servidor já gravou o início antes de falhar a resposta
  state.list = [makeDriverTrip(8, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO })]
  await user.click(within(dialog).getByRole('button', { name: 'Atualizar situação' }))
  const persisted = await within(dialog).findByText(/já consta no servidor como Em andamento.*1\.500 km/)
  assert.equal(persisted.closest('[role="status"]') !== null, true)
  assert.equal(within(dialog).queryByRole('alert'), null, 'sem duplicação status+alert após reconciliar estado persistido')
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)
  assert.equal(posts().length, 1)
})

test('T16-P02 e T16-P03: seletor Exibir acessível e chip de situação com ícone decorativo e rótulo', async () => {
  const state = {
    list: [
      makeDriverTrip(1, { scheduledStart: NOW_ISO, status: 'SCHEDULED' }),
      makeDriverTrip(2, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 900, startedAt: NOW_ISO }),
    ],
  }
  const { api } = makeApi(state)
  renderPage(api)

  assert.ok(await screen.findByText('Unidade fictícia 1'))
  const select = screen.getByRole('combobox', { name: 'Exibir' })
  assert.ok(select)
  assert.ok(getComputedStyle(select).minHeight === '44px')

  for (const label of ['Agendada', 'Em andamento']) {
    const chipLabel = screen.getByText(label)
    const chipRoot = chipLabel.closest('.MuiChip-root')
    assert.ok(chipRoot, `chip ${label} deve existir`)
    const svg = chipRoot.querySelector('svg')
    assert.ok(svg, `chip ${label} deve conter ícone`)
    assert.equal(svg.getAttribute('aria-hidden'), 'true')
  }
})
