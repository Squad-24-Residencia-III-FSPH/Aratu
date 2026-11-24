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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l15-conf-'))

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

const { act, cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
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
const [{ default: TripConfirmationPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/tripConfirmationPage/TripConfirmationPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const trip = (id, overrides = {}) => ({
  id,
  requestId: `2026-00${id}`,
  status: 'FINISHED',
  scheduledStart: '2026-11-10T11:00:00.000Z',
  scheduledEnd: '2026-11-10T12:00:00.000Z',
  startedAt: '2026-11-10T11:03:00.000Z',
  finishedAt: '2026-11-10T11:44:00.000Z',
  startKm: 41152,
  endKm: 41200,
  vehicleLicensePlate: 'ABC1D23',
  driverName: 'Motorista Fictício',
  origin: 'Unidade Fictícia A',
  destination: 'Unidade Fictícia B',
  confirmedBy: null,
  confirmedAt: null,
  ...overrides,
})

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(TripConfirmationPage)))
}

test('T17-P01: anuncia sucesso uma única vez após fechar diálogos e restaura foco no aviso', async () => {
  let finishedTrips = [trip('74')]
  const api = async (path) => {
    if (path.startsWith('/trips?')) return jsonResponse(finishedTrips)
    if (path === '/trips/74/confirm') {
      finishedTrips = []
      return jsonResponse({ id: '74', status: 'CONFIRMED', confirmedBy: '5', confirmedAt: '2026-11-10T12:00:00.000Z', revision: 2 })
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)

  assert.equal(document.title, 'Confirmar viagens — Aratu')
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))

  const success = await screen.findByText('Viagem #74 confirmada com sucesso.')
  await waitFor(() => {
    assert.equal(screen.queryByRole('dialog') === null, true)
    assert.equal(success.closest('[aria-hidden="true"]') === null, true, 'anúncio não deve estar sob aria-hidden')
    assert.equal(document.activeElement?.getAttribute('role'), 'status')
  })
  const statusRegion = success.closest('[role="status"]')
  assert.ok(statusRegion !== null)
  assert.equal(within(statusRegion).queryByRole('alert') === null, true, 'sem duplicação status+alert')
})

test('T17-P01 (parcial): falha ao reconsultar fila após confirmação gera aviso único em role="status"', async () => {
  let listCalls = 0
  const api = async (path) => {
    if (path.startsWith('/trips?')) {
      listCalls += 1
      if (listCalls === 1) return jsonResponse([trip('74')])
      return jsonResponse({ erro: 'Indisponível' }, 503)
    }
    if (path === '/trips/74/confirm') {
      return jsonResponse({ id: '74', status: 'CONFIRMED', confirmedBy: '5', confirmedAt: '2026-11-10T12:00:00.000Z', revision: 2 })
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)

  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))

  const success = await screen.findByText('Viagem #74 confirmada com sucesso.')
  assert.ok(screen.getByText(/lista não pôde ser atualizada/))
  const statusRegion = success.closest('[role="status"]')
  assert.ok(statusRegion !== null)
  assert.equal(within(statusRegion).queryByRole('alert') === null, true, 'não deve aninhar role="alert" dentro de role="status"')
  assert.equal(screen.queryByText('A confirmação foi registrada.') === null, true, 'não deve duplicar aviso parcial separado')
})

test('T17-P02: 409 invalida detalhe, reconsulta a fila, preserva evidências e restaura foco ao fechar', async () => {
  let finishedTrips = [trip('74'), trip('75', { driverName: 'Motorista Reserva' })]
  let listCalls = 0
  const calls = []
  const api = async (path, options = {}) => {
    calls.push({ path, options })
    if (path.startsWith('/trips?')) {
      listCalls += 1
      return jsonResponse(finishedTrips)
    }
    if (path === '/trips/74/confirm') {
      finishedTrips = finishedTrips.filter((item) => item.id !== '74')
      return jsonResponse({ erro: 'Esta viagem já foi confirmada.' }, 409)
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)

  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))

  const details = await screen.findByRole('dialog', { name: 'Conferir viagem #74' })
  assert.ok(await within(details).findByText('Esta viagem já foi confirmada.'))
  // Evidências permanecem legíveis e ação vencida é desabilitada
  assert.ok(within(details).getByText('41.152 km'))
  assert.ok(within(details).getByText('48 km'))
  assert.equal(within(details).getByRole('button', { name: 'Confirmar viagem' }).disabled, true)
  assert.equal(listCalls >= 2, true, 'deve reconsultar a fila após 409')

  await user.click(within(details).getByRole('button', { name: 'Fechar' }))
  await waitFor(() => {
    assert.equal(screen.queryByRole('dialog') === null, true)
    const nextButton = screen.getByRole('button', { name: 'Ver detalhes da viagem 75' })
    assert.equal(document.activeElement === nextButton, true, 'foco deve ir para próxima linha após saída da #74')
  })
  assert.equal(calls.filter(({ path }) => path === '/trips/74/confirm').length, 1)
})

test('T17-P03: estados vazio/carregando ficam fora da tabela, chip possui ícone e foco rola botão para vista', async () => {
  const api = async () => jsonResponse([])
  renderPage(api)
  const emptyHeading = await screen.findByText('Não há viagens finalizadas aguardando conferência.')
  assert.equal(emptyHeading.closest('table') === null, true, 'aviso vazio não deve ficar dentro de tabela com largura mínima')

  cleanup()
  const apiWithRows = async () => jsonResponse([trip('74')])
  renderPage(apiWithRows)
  const actionButton = await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' })
  let scrolledArgs = null
  actionButton.scrollIntoView = (args) => { scrolledArgs = args }
  act(() => { actionButton.focus() })
  assert.deepEqual(scrolledArgs, { block: 'nearest', inline: 'nearest' })

  const chipLabel = screen.getByText('Finalizada')
  const chipRoot = chipLabel.closest('.MuiChip-root')
  assert.ok(chipRoot)
  const svg = chipRoot.querySelector('svg')
  assert.ok(svg)
  assert.equal(svg.getAttribute('aria-hidden'), 'true')
})

test('T17-P04: período invertido associa erro aos campos De/Até sem disparar 400 e recupera ao corrigir', async () => {
  const calls = []
  const api = async (path) => {
    calls.push(path)
    return jsonResponse([trip('74')])
  }
  const user = userEvent.setup()
  renderPage(api)

  await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' })
  const fromInput = screen.getByLabelText('De')
  const toInput = screen.getByLabelText('Até')
  assert.ok(getComputedStyle(fromInput).minHeight === '44px')

  await user.type(fromInput, '2026-12-01')
  await user.type(toInput, '2026-11-30')

  await waitFor(() => {
    assert.equal(fromInput.getAttribute('aria-invalid'), 'true')
    assert.equal(toInput.getAttribute('aria-invalid'), 'true')
  })
  const fromDescribedBy = fromInput.getAttribute('aria-describedby') ?? ''
  const toDescribedBy = toInput.getAttribute('aria-describedby') ?? ''
  const fromErr = document.getElementById(fromDescribedBy.split(' ')[0])
  const toErr = document.getElementById(toDescribedBy.split(' ')[0])
  assert.ok(fromErr?.textContent?.includes('"De"'))
  assert.ok(toErr?.textContent?.includes('"Até"'))
  assert.equal(screen.queryByText('Não foi possível carregar as viagens finalizadas.') === null, true)
  assert.equal(calls.some((path) => path.includes('from=2026-12-01&to=2026-11-30')), false)

  // Corrige a data final para período válido e reconsulta automaticamente
  await user.clear(toInput)
  await user.type(toInput, '2026-12-05')
  await waitFor(() => {
    assert.notEqual(fromInput.getAttribute('aria-invalid'), 'true')
    assert.notEqual(toInput.getAttribute('aria-invalid'), 'true')
    assert.equal(calls.some((path) => path.includes('from=2026-12-01&to=2026-12-05')), true)
  })
})

test('T17-P02 (fila única e falha na reconsulta): foco cai em role="status" e exibe estado parcial ao fechar detalhe', async () => {
  let listCalls = 0
  const api = async (path) => {
    if (path.startsWith('/trips?')) {
      listCalls += 1
      if (listCalls === 1) return jsonResponse([trip('74')])
      return jsonResponse({ erro: 'Indisponível' }, 503)
    }
    if (path === '/trips/74/confirm') {
      return jsonResponse({ erro: 'Esta viagem já foi confirmada.' }, 409)
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)

  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))

  const details = await screen.findByRole('dialog', { name: 'Conferir viagem #74' })
  assert.ok(await within(details).findByText('Esta viagem já foi confirmada.'))
  assert.ok(within(details).getByRole('button', { name: 'Atualizar lista' }))

  await user.click(within(details).getByRole('button', { name: 'Fechar' }))
  assert.ok(await screen.findByText('A lista pode estar desatualizada.'))
  assert.ok(screen.getByText(/Não foi possível atualizar a listagem após a alteração da viagem/))
})

test('T17-P06: consulta viagens confirmadas (Recibo) pelo mesmo ID e exibe recibo somente leitura', async () => {
  let finishedTrips = [trip('74')]
  let confirmedTrips = []
  const calls = []
  const api = async (path) => {
    calls.push(path)
    if (path.startsWith('/trips?status=FINISHED')) return jsonResponse(finishedTrips)
    if (path.startsWith('/trips?status=CONFIRMED')) return jsonResponse(confirmedTrips)
    if (path === '/trips/74/confirm') {
      const confirmed = trip('74', {
        status: 'CONFIRMED',
        confirmedBy: '2',
        confirmedAt: '2026-11-10T12:00:00.000Z',
      })
      finishedTrips = []
      confirmedTrips = [confirmed]
      return jsonResponse({ id: '74', status: 'CONFIRMED', confirmedBy: '2', confirmedAt: '2026-11-10T12:00:00.000Z', revision: 4 })
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }
  const user = userEvent.setup()
  renderPage(api)

  const pendingTab = await screen.findByRole('tab', { name: 'Aguardando conferência' })
  const confirmedTab = screen.getByRole('tab', { name: 'Confirmadas (Recibo)' })
  assert.equal(pendingTab.getAttribute('aria-selected'), 'true')
  assert.equal(confirmedTab.getAttribute('aria-selected'), 'false')
  assert.ok(getComputedStyle(confirmedTab).minHeight === '44px')

  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da viagem 74' }))
  await user.click(await screen.findByRole('button', { name: 'Confirmar viagem' }))
  const confirmation = await screen.findByRole('dialog', { name: 'Confirmar viagem #74?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Confirmar viagem' }))

  assert.ok(await screen.findByText('Viagem #74 confirmada com sucesso.'))
  await user.click(await screen.findByRole('button', { name: 'Consultar em Confirmadas' }))

  assert.equal(confirmedTab.getAttribute('aria-selected'), 'true')
  assert.ok(calls.some((path) => path.startsWith('/trips?status=CONFIRMED')))

  await user.click(await screen.findByRole('button', { name: 'Ver recibo da viagem 74' }))
  const receipt = await screen.findByRole('dialog', { name: 'Recibo da viagem #74' })
  assert.ok(within(receipt).getByText('Confirmada'))
  assert.ok(within(receipt).getByText('Gestor #2'))
  assert.ok(within(receipt).getByText('41.152 km'))
  assert.ok(within(receipt).getByText('41.200 km'))
  assert.ok(within(receipt).getByText('48 km'))
  assert.ok(within(receipt).getByText(/#2026-0074/))
  assert.equal(within(receipt).queryByRole('button', { name: 'Confirmar viagem' }), null)
  await user.click(within(receipt).getByRole('button', { name: 'Fechar' }))
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null))
})
