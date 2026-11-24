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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-l18-test-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  SVGElement: { configurable: true, value: dom.window.SVGElement },
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

const { cleanup, fireEvent, render, screen, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const frontendRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  dataHelpers,
  dashboardService,
  { default: GestorPage },
  { default: DashboardPage },
  { default: TripAgendaPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/gestor/gestorPage/gestorDashboardData.ts'),
  vite.ssrLoadModule('/src/services/dashboardService.ts'),
  vite.ssrLoadModule('/src/pages/gestor/gestorPage/GestorPage.tsx'),
  vite.ssrLoadModule('/src/pages/gestor/gestorPage/DashboardPage.tsx'),
  vite.ssrLoadModule('/src/pages/gestor/gestorPage/TripAgendaPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeSession(perfil = 'GESTOR') {
  const payload = Buffer.from(JSON.stringify({ sub: '2', perfil, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return { token: `h.${payload}.s`, perfil, nome: 'Gestora Fictícia', email: 'gestor@aratu.local' }
}

function LocationProbe() {
  const location = useLocation()
  return createElement('output', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

const sampleSummary = (overrides = {}) => ({
  generatedAt: '2026-11-23T15:00:00.000Z',
  fleet: { available: 7, inMaintenance: 1, inactive: 2, total: 10 },
  pendingRequests: 3,
  tripsToConfirm: 2,
  documents: { expiring: 4, expired: 1, alertDays: 30 },
  svo: { ordersInProgress: 1, vehicles: { total: 4, busy: 1, occupancyRate: 25 } },
  ...overrides,
})

const sampleVehicle = (id, plate) => ({
  id,
  licensePlate: plate,
  brand: 'Marca Fictícia',
  model: 'Modelo Fictício',
  year: 2024,
  vehicleType: 'Utilitário',
  ownership: 'OWNED',
  categories: ['PASSENGER'],
  seats: 5,
  bodyLimit: 0,
  weightLimit: null,
  operationType: 'ADMINISTRATIVE',
  status: 'AVAILABLE',
  revision: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
})

const sampleIndicators = (overrides = {}) => ({
  period: { from: '2026-11-22', to: '2026-11-24' },
  vehicles: [
    {
      vehicleId: '4',
      licensePlate: 'TQA5V23',
      tripsCount: 1,
      kmDriven: 25,
      litersFueled: 26.375,
      fuelCost: 154.6,
      averageConsumptionKmPerLiter: 0.95,
      maintenanceCost: 136.25,
    },
    {
      vehicleId: '8',
      licensePlate: 'TQB8V00',
      tripsCount: 0,
      kmDriven: 0,
      litersFueled: 0,
      fuelCost: 0,
      averageConsumptionKmPerLiter: null,
      maintenanceCost: 0,
    },
  ],
  totals: {
    tripsCount: 1,
    kmDriven: 25,
    litersFueled: 26.375,
    fuelCost: 154.6,
    averageConsumptionKmPerLiter: 0.95,
    maintenanceCost: 136.25,
  },
  svo: {
    ordersOpened: 3,
    ordersCollected: 1,
    averageMinutesToCollection: 3335.1,
  },
  pendingValidation: ['averageConsumptionKmPerLiter', 'svo.averageMinutesToCollection'],
  ...overrides,
})

test('validateDashboardPeriod valida datas inclusivas, converte [from, to) e respeita limite de 366 dias', () => {
  const oneDay = dataHelpers.validateDashboardPeriod('2026-11-23', '2026-11-23')
  assert.equal(oneDay.valid, true)
  assert.equal(oneDay.inclusiveDays, 1)
  assert.deepEqual(oneDay.apiPeriod, { from: '2026-11-23', to: '2026-11-24' })

  const maxValid = dataHelpers.validateDashboardPeriod('2025-01-01', '2026-01-01')
  assert.equal(maxValid.valid, true)
  assert.equal(maxValid.inclusiveDays, 366)
  assert.deepEqual(maxValid.apiPeriod, { from: '2025-01-01', to: '2026-01-02' })

  const overLimit = dataHelpers.validateDashboardPeriod('2025-01-01', '2026-01-02')
  assert.equal(overLimit.valid, false)
  assert.match(overLimit.toError, /366 dias/)

  const inverted = dataHelpers.validateDashboardPeriod('2026-11-24', '2026-11-23')
  assert.equal(inverted.valid, false)
  assert.match(inverted.toError, /igual ou posterior/)

  const cleared = dataHelpers.validateDashboardPeriod('', '2026-11-23')
  assert.equal(cleared.valid, false)
  assert.match(cleared.fromError, /Informe a data inicial/)
  assert.equal(dataHelpers.formatSafeCalendarDate(''), 'Data não definida')
  assert.equal(dataHelpers.formatSafeCalendarDate('2026-02-30'), 'Data não definida')
})

test('dashboardService valida resposta, preserva null e repassa erro de domínio', async () => {
  const calls = []
  const api = async (url) => {
    calls.push(url)
    if (url === '/dashboard/summary') return jsonResponse(sampleSummary())
    if (url.startsWith('/dashboard/indicators')) {
      return jsonResponse(sampleIndicators({
        totals: {
          tripsCount: 0,
          kmDriven: 0,
          litersFueled: 0,
          fuelCost: 0,
          averageConsumptionKmPerLiter: null,
          maintenanceCost: 0,
        },
      }))
    }
    return jsonResponse({ erro: 'Veículo não encontrado.' }, 404)
  }

  const summary = await dashboardService.fetchDashboardSummary(api)
  assert.equal(summary.documents.alertDays, 30)
  const indicators = await dashboardService.fetchDashboardIndicators(api, { from: '2026-11-22', to: '2026-11-24', vehicleId: '4' })
  assert.equal(indicators.totals.averageConsumptionKmPerLiter, null)
  assert.equal(calls[1], '/dashboard/indicators?from=2026-11-22&to=2026-11-24&vehicleId=4')

  await assert.rejects(
    dashboardService.fetchDashboardIndicators(async () => jsonResponse({ erro: 'Veículo não encontrado.' }, 404), {
      from: '2026-11-22',
      to: '2026-11-24',
      vehicleId: '999',
    }),
    (error) => error.kind === 'notFound' && error.message === 'Veículo não encontrado.',
  )
})

test('GestorPage exibe resumo real, alertDays, exclui canceladas e aponta Ver agenda completa para /viagens/agenda', async () => {
  const calls = []
  const today = dataHelpers.todayInMaceio()
  const api = async (url) => {
    calls.push(url)
    if (url === '/dashboard/summary') return jsonResponse(sampleSummary())
    if (url.startsWith('/trips?')) {
      return jsonResponse([
        {
          id: '10',
          requestId: '501',
          status: 'SCHEDULED',
          scheduledStart: `${today}T13:00:00.000Z`,
          scheduledEnd: `${today}T14:30:00.000Z`,
          startedAt: null,
          finishedAt: null,
          startKm: null,
          endKm: null,
          vehicleLicensePlate: 'TQA5V23',
          driverName: 'Condutor Fictício',
          origin: 'FSPH Sede',
          destination: 'Unidade Fictícia',
          confirmedBy: null,
          confirmedAt: null,
        },
        {
          id: '11',
          requestId: '502',
          status: 'CANCELED',
          scheduledStart: `${today}T15:00:00.000Z`,
          scheduledEnd: `${today}T16:00:00.000Z`,
          startedAt: null,
          finishedAt: null,
          startKm: null,
          endKm: null,
          vehicleLicensePlate: 'TQB8V00',
          driverName: 'Condutor Cancelado',
          origin: 'FSPH Sede',
          destination: 'Unidade Cancelada',
          confirmedBy: null,
          confirmedAt: null,
        },
      ])
    }
    if (url.startsWith('/requests?')) return jsonResponse({ requests: [], total: 2, page: 1, pageSize: 1, totalPages: 1 })
    return jsonResponse({}, 404)
  }

  const auth = { session: fakeSession(), signIn: async () => {}, logout() {}, api, notice: '' }
  render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        MemoryRouter,
        { initialEntries: ['/frota/inicio'] },
        createElement(GestorPage),
      ),
    ),
  )

  assert.ok(await screen.findByText(/4 a vencer em até 30 dias · 1 vencido/))
  assert.ok(screen.getByText(/2 são para viagens ainda hoje/))
  assert.ok(screen.getByText('TQA5V23'))
  assert.equal(screen.queryByText('TQB8V00'), null)
  assert.ok(screen.getByText(/1 viagem programada/))
  assert.equal(screen.queryByText(/Resumo de demonstração/), null)

  const docLink = screen.getByRole('link', { name: 'Ver documentos' })
  assert.equal(docLink.getAttribute('href'), '/vehicle-documents?status=EXPIRING&days=30')

  const agendaLink = screen.getByRole('link', { name: 'Ver agenda completa' })
  assert.equal(agendaLink.getAttribute('href'), `/viagens/agenda?from=${today}&to=${today}`)
  assert.ok(calls.some((url) => url === `/trips?from=${today}&to=${today}`))
})

test('TripAgendaPage exclui canceladas por padrão, persiste filtros na URL e restringe acesso ao perfil Gestor', async () => {
  const calls = []
  const today = dataHelpers.todayInMaceio()
  const trips = [
    {
      id: '21',
      requestId: '601',
      status: 'SCHEDULED',
      scheduledStart: `${today}T11:00:00.000Z`,
      scheduledEnd: `${today}T12:00:00.000Z`,
      startedAt: null,
      finishedAt: null,
      startKm: null,
      endKm: null,
      vehicleLicensePlate: 'TQA5V23',
      driverName: 'Condutor Ativo',
      origin: 'FSPH Sede',
      destination: 'Lacen Fictício',
      confirmedBy: null,
      confirmedAt: null,
    },
    {
      id: '22',
      requestId: '602',
      status: 'CANCELED',
      scheduledStart: `${today}T15:00:00.000Z`,
      scheduledEnd: `${today}T16:00:00.000Z`,
      startedAt: null,
      finishedAt: null,
      startKm: null,
      endKm: null,
      vehicleLicensePlate: 'TQC9V11',
      driverName: 'Condutor Cancelado',
      origin: 'FSPH Sede',
      destination: 'HUSE Fictício',
      confirmedBy: null,
      confirmedAt: null,
    },
  ]

  const api = async (url) => {
    calls.push(url)
    if (url.includes('status=CANCELED')) return jsonResponse(trips.filter((item) => item.status === 'CANCELED'))
    return jsonResponse(trips)
  }

  const gestorAuth = { session: fakeSession('GESTOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  const firstRender = render(
    createElement(
      AuthContext.Provider,
      { value: gestorAuth },
      createElement(
        MemoryRouter,
        { initialEntries: [`/viagens/agenda?from=${today}&to=${today}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/viagens/agenda',
            element: createElement('div', null, createElement(TripAgendaPage), createElement(LocationProbe)),
          }),
        ),
      ),
    ),
  )

  assert.ok(await screen.findByText('Condutor Ativo'))
  assert.equal(screen.queryByText('Condutor Cancelado'), null)
  assert.ok(screen.getByText('1 viagem encontrada'))

  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Todas (incluindo canceladas)' }))
  assert.ok(await screen.findByText('Condutor Cancelado'))
  assert.ok(screen.getByText('2 viagens encontradas'))
  assert.match(screen.getByTestId('location-probe').textContent, /status=ALL/)

  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Cancelada' }))
  assert.ok(await screen.findByText('Condutor Cancelado'))
  assert.equal(screen.queryByText('Condutor Ativo'), null)
  assert.ok(calls.some((url) => url === `/trips?from=${today}&to=${today}&status=CANCELED`))

  firstRender.unmount()

  let adminCalls = 0
  const adminAuth = {
    session: fakeSession('ADMINISTRADOR'),
    signIn: async () => {},
    logout() {},
    api: async () => { adminCalls += 1; return jsonResponse([]) },
    notice: '',
  }
  render(
    createElement(
      AuthContext.Provider,
      { value: adminAuth },
      createElement(
        MemoryRouter,
        { initialEntries: ['/viagens/agenda'] },
        createElement(TripAgendaPage),
      ),
    ),
  )
  assert.ok(await screen.findByText(/Acesso restrito/))
  assert.equal(adminCalls, 0)
})

test('DashboardPage consome API real, persiste recorte na URL e não quebra ao limpar data', async () => {
  const calls = []
  const api = async (url) => {
    calls.push(url)
    if (url === '/dashboard/summary') return jsonResponse(sampleSummary())
    if (url === '/vehicles') return jsonResponse([sampleVehicle('4', 'TQA5V23'), sampleVehicle('8', 'TQB8V00')])
    if (url.startsWith('/dashboard/indicators')) {
      return jsonResponse(sampleIndicators({
        totals: {
          tripsCount: 1,
          kmDriven: 25,
          litersFueled: 26.375,
          fuelCost: 154.6,
          averageConsumptionKmPerLiter: null,
          maintenanceCost: 136.25,
        },
      }))
    }
    return jsonResponse({}, 404)
  }

  const auth = { session: fakeSession(), signIn: async () => {}, logout() {}, api, notice: '' }
  render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        MemoryRouter,
        { initialEntries: ['/frota/dashboard?period=custom&from=2026-11-22&to=2026-11-23&vehicleId=4'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/frota/dashboard',
            element: createElement('div', null, createElement(DashboardPage), createElement(LocationProbe)),
          }),
        ),
      ),
    ),
  )

  assert.ok((await screen.findAllByText(/R\$\s*154,60/)).length >= 1)
  assert.ok((await screen.findAllByText(/R\$\s*136,25/)).length >= 1)
  assert.ok(screen.getAllByText('Sem base no período').length >= 1)
  assert.ok(screen.getByText('Contém fórmulas em validação'))
  assert.ok(calls.some((url) => url === '/dashboard/indicators?from=2026-11-22&to=2026-11-24&vehicleId=4'))
  assert.match(screen.getByTestId('location-probe').textContent, /period=custom&from=2026-11-22&to=2026-11-23&vehicleId=4/)

  const fromInput = screen.getByLabelText('Data inicial (inclusiva)')
  fireEvent.change(fromInput, { target: { value: '' } })
  assert.ok(await screen.findByText('Informe um período válido para consultar os indicadores.'))
  assert.ok(screen.getByText('Informe a data inicial.'))

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Usar últimos 7 dias' }))
  assert.match(screen.getByTestId('location-probe').textContent, /period=7days/)
  assert.equal(document.activeElement?.textContent, '7 dias')
})

test('DashboardPage permite leitura ao perfil ADMINISTRADOR com bloco SVO', async () => {
  const api = async (url) => {
    if (url === '/dashboard/summary') return jsonResponse(sampleSummary())
    if (url === '/vehicles') return jsonResponse([sampleVehicle('4', 'TQA5V23')])
    if (url.startsWith('/dashboard/indicators')) return jsonResponse(sampleIndicators())
    return jsonResponse({}, 404)
  }

  const auth = { session: fakeSession('ADMINISTRADOR'), signIn: async () => {}, logout() {}, api, notice: '' }
  render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        MemoryRouter,
        { initialEntries: ['/frota/dashboard'] },
        createElement(DashboardPage),
      ),
    ),
  )

  assert.equal(screen.queryByText(/Acesso restrito/), null)
  assert.ok(await screen.findByText('Indicadores do SVO'))
  assert.ok(screen.getByText('Tempo médio até a coleta'))
})
