// Somente dados 100% fictícios (LGPD/SVO): placas, nomes, unidades e serviços inventados.
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
import { sessionFor } from '../../../../tests/fixtures.mjs'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-scheduling-page-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><head><title>Início — Aratu</title></head><body></body></html>', {
  url: 'http://localhost/',
})
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ...['HTMLElement', 'SVGElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const { MemoryRouter, useLocation } = await import('react-router-dom')

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: rootDir,
  cacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  helpers,
  { default: ScheduleTripPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/gestor/schedulingPage/schedulingHelpers.ts'),
  vite.ssrLoadModule('/src/pages/gestor/schedulingPage/ScheduleTripPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => {
  cleanup()
  document.title = 'Início — Aratu'
})
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

function makeRequest(overrides = {}) {
  return {
    id: '5',
    requesterId: '3',
    requesterName: 'Servidora Fictícia Alpha',
    serviceId: '2',
    serviceName: 'Transporte de Materiais Fictício',
    requestedDate: '2026-12-01',
    requestedTime: '09:00',
    origin: 'Unidade Fictícia Norte',
    destination: 'Laboratório Fictício Sul',
    purpose: 'Entrega de insumos fictícios',
    passengers: 1,
    status: 'APPROVED',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T11:00:00.000Z',
    ...overrides,
  }
}

function makeRequestsPage(requests) {
  return {
    requests,
    total: requests.length,
    page: 1,
    pageSize: 100,
    totalPages: requests.length > 0 ? 1 : 0,
  }
}

function makeVehicle(overrides = {}) {
  return {
    id: '6',
    licensePlate: 'TQA1T15',
    brand: 'Marca Fictícia',
    model: 'Furgão QA',
    categories: ['PASSENGER'],
    seats: 5,
    bodyLimit: 0,
    status: 'AVAILABLE',
    available: true,
    reasons: [],
    ...overrides,
  }
}

function makeDriver(overrides = {}) {
  return {
    id: '3',
    name: 'Condutor Fictício QA',
    cnhCategory: 'B',
    cnhExpiresAt: '2027-12-31',
    status: 'ACTIVE',
    available: true,
    reasons: [],
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return createElement('output', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

function mountPage(api, { profile = 'GESTOR', initialEntry = '/agendar-viagem' } = {}) {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        AuthContext.Provider,
        {
          value: {
            session: sessionFor(profile),
            api,
            notice: '',
            logout() {},
            signIn: async () => {},
          },
        },
        createElement(ScheduleTripPage),
        createElement(LocationProbe),
      ),
    ),
  )
  return userEvent.setup()
}

test('helpers validam período, traduzem motivos estruturados e reconciliam seleções pelos IDs', () => {
  const invalidPeriod = helpers.validatePeriodFields({ start: '2026-12-01T09:30', end: '2026-12-01T09:29' })
  assert.equal(invalidPeriod.isValid, false)
  assert.equal(invalidPeriod.startError, undefined)
  assert.equal(invalidPeriod.endError, 'O término previsto precisa ser posterior ao início.')

  const pastPeriod = helpers.validatePeriodFields(
    { start: '2026-11-01T09:00', end: '2026-11-01T10:00' },
    '2026-11-01T09:00:00-03:00',
  )
  assert.equal(pastPeriod.isValid, false)
  assert.equal(pastPeriod.startError, 'O início da viagem não pode estar no passado.')

  assert.match(helpers.translateAvailabilityReasons(['MAINTENANCE', 'CONFLICT']), /manutenção impeditiva e já possui outra viagem/)
  assert.match(helpers.translateAvailabilityReasons(['CAPACITY_EXCEEDED']), /não comporta a quantidade de passageiros/)
  assert.match(helpers.translateAvailabilityReasons(['AWAY', 'CNH_EXPIRED']), /afastado.*CNH vencida/)

  const vehicleSummary = helpers.summarizeUnavailableVehicles([
    makeVehicle({ id: '1', licensePlate: 'QAA0A01', seats: 5, available: false, reasons: ['INCOMPATIBLE'] }),
    makeVehicle({ id: '6', licensePlate: 'TQA1T15', seats: 5, available: false, reasons: ['MAINTENANCE'] }),
    makeVehicle({ id: '7', licensePlate: 'TQA0T15', seats: 0, available: false, reasons: ['CAPACITY_EXCEEDED'] }),
  ])
  assert.equal(vehicleSummary.total, 3)
  assert.match(vehicleSummary.overview, /3 veículos indisponíveis/)
  assert.match(vehicleSummary.overview, /1 incompatível com o serviço/)
  assert.match(vehicleSummary.overview, /1 em manutenção impeditiva/)
  assert.match(vehicleSummary.overview, /1 lotação insuficiente/)
  assert.match(vehicleSummary.items[2]?.label ?? '', /0 lugares/)

  const partialReconciliation = helpers.reconcileSchedulingSelection(
    { vehicleId: '6', driverId: '3' },
    [makeVehicle({ id: '6', available: false, reasons: ['MAINTENANCE'] }), makeVehicle({ id: '8', licensePlate: 'QAA8B88' })],
    [makeDriver({ id: '3', available: true })],
    'revalidation',
  )
  assert.equal(partialReconciliation.vehicleId, '')
  assert.equal(partialReconciliation.driverId, '3')
  assert.equal(partialReconciliation.hasRemovals, true)
  assert.match(partialReconciliation.summaryMessage, /TQA1T15.*manutenção impeditiva/)
  assert.match(partialReconciliation.summaryMessage, /Condutor Fictício QA permaneceu selecionado/)
})

test('define document.title contextualizado, restaura ao desmontar e bloqueia perfil sem permissão', async () => {
  const unmounted = mountPage(async () => jsonResponse(makeRequestsPage([])), { profile: 'MOTORISTA' })
  assert.equal(document.title, 'Agendar viagem — Aratu')
  assert.ok(await screen.findByText('Somente o Gestor pode agendar solicitações.'))
  cleanup()
  assert.equal(document.title, 'Início — Aratu')
  assert.ok(unmounted)
})

test('associa erro diretamente aos campos de período, não consulta disponibilidade e foca o primeiro inválido', async () => {
  const availabilityCalls = []
  const api = async (path) => {
    if (path.startsWith('/requests?')) return jsonResponse(makeRequestsPage([makeRequest({ id: '5' })]))
    availabilityCalls.push(path)
    return jsonResponse([])
  }

  mountPage(api, { initialEntry: '/agendar-viagem?requestId=5' })
  await screen.findByText('Resumo da solicitação #5')

  const startInput = screen.getByLabelText(/Início previsto/i)
  const endInput = screen.getByLabelText(/Término previsto/i)
  const confirmButton = screen.getByRole('button', { name: /Confirmar agendamento/i })

  fireEvent.change(startInput, { target: { value: '2026-12-01T09:30' } })
  fireEvent.change(endInput, { target: { value: '2026-12-01T09:29' } })

  assert.equal(endInput.getAttribute('aria-invalid'), 'true')
  const describedBy = endInput.getAttribute('aria-describedby')
  assert.ok(describedBy)
  const errorNode = document.getElementById(describedBy)
  assert.ok(errorNode)
  assert.equal(errorNode.getAttribute('role'), 'alert')
  assert.match(errorNode.textContent ?? '', /posterior ao início/)
  assert.equal(confirmButton.disabled, true)
  assert.equal(availabilityCalls.length, 0)

  fireEvent.submit(confirmButton.closest('form'))
  assert.equal(document.activeElement, endInput)
})

test('em 409 desabilita confirmação durante a reconsulta, preserva pedido e motorista válido e remove veículo em conflito', async () => {
  let vehicleListPhase = 1
  let resolveSecondVehicles = null
  const calls = []

  const api = async (path, options = {}) => {
    calls.push({ path, method: options.method ?? 'GET' })
    if (path.startsWith('/requests?')) return jsonResponse(makeRequestsPage([makeRequest({ id: '5' })]))
    if (path.startsWith('/vehicles/available')) {
      if (vehicleListPhase === 1) {
        return jsonResponse([
          makeVehicle({ id: '6', licensePlate: 'TQA1T15' }),
          makeVehicle({ id: '8', licensePlate: 'QAA8B88', model: 'Sedan QA' }),
        ])
      }
      return new Promise((resolve) => {
        resolveSecondVehicles = () => resolve(jsonResponse([
          makeVehicle({ id: '6', licensePlate: 'TQA1T15', available: false, reasons: ['CONFLICT'] }),
          makeVehicle({ id: '8', licensePlate: 'QAA8B88', model: 'Sedan QA', available: true }),
        ]))
      })
    }
    if (path.startsWith('/drivers/available')) {
      return jsonResponse([makeDriver({ id: '3', name: 'Condutor Fictício QA' })])
    }
    if (path === '/trips' && options.method === 'POST') {
      if (vehicleListPhase === 1) {
        vehicleListPhase = 2
        return jsonResponse({ erro: 'O veículo já tem viagem no período.' }, 409)
      }
      const body = JSON.parse(options.body)
      return jsonResponse({
        id: '99',
        requestId: body.requestId,
        vehicleId: body.vehicleId,
        driverId: body.driverId,
        scheduledStart: body.scheduledStart,
        scheduledEnd: body.scheduledEnd,
        status: 'SCHEDULED',
        startKm: null,
        endKm: null,
        startedAt: null,
        finishedAt: null,
        revision: 1,
        createdAt: '2026-11-24T01:00:00.000Z',
      }, 201)
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }

  const user = mountPage(api, { initialEntry: '/agendar-viagem?requestId=5' })
  await screen.findByText('Resumo da solicitação #5')

  fireEvent.change(screen.getByLabelText(/Início previsto/i), { target: { value: '2026-12-01T09:00' } })
  fireEvent.change(screen.getByLabelText(/Término previsto/i), { target: { value: '2026-12-01T10:00' } })

  const vehicleSelect = await screen.findByLabelText(/Veículo disponível/i)
  const driverSelect = await screen.findByLabelText(/Motorista disponível/i)

  await user.click(vehicleSelect)
  await user.click(await screen.findByRole('option', { name: /TQA1T15/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  await user.click(driverSelect)
  await user.click(await screen.findByRole('option', { name: 'Condutor Fictício QA' }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))

  const confirmButton = screen.getByRole('button', { name: /Confirmar agendamento/i })
  assert.equal(confirmButton.disabled, false)
  await user.click(confirmButton)

  await screen.findByText('Reconsultando disponibilidade após conflito ou impedimento...')
  assert.equal(screen.getByRole('button', { name: /Confirmar agendamento/i }).disabled, true)
  assert.equal(screen.getByTestId('location-probe').textContent, '/agendar-viagem?requestId=5')

  resolveSecondVehicles()

  const notice = await screen.findByRole('alert')
  assert.match(notice.textContent ?? '', /TQA1T15.*outra viagem agendada no período/)
  assert.match(notice.textContent ?? '', /Condutor Fictício QA permaneceu selecionado/)
  assert.equal(screen.getByRole('button', { name: /Confirmar agendamento/i }).disabled, true)
  assert.match(screen.getByLabelText(/Motorista disponível/i).textContent ?? '', /Condutor Fictício QA/)

  await user.click(screen.getByLabelText(/Veículo disponível/i))
  await user.click(await screen.findByRole('option', { name: /QAA8B88/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  const readyButton = screen.getByRole('button', { name: /Confirmar agendamento/i })
  assert.equal(readyButton.disabled, false)
  await user.click(readyButton)

  assert.ok(await screen.findByText('Solicitação #5 agendada com sucesso como viagem #99.'))
})

test('em 422 de manutenção limpa veículo mantendo motorista, e em 422 de início no passado foca Início previsto', async () => {
  let phase = 'maintenance'
  const api = async (path, options = {}) => {
    if (path.startsWith('/requests?')) return jsonResponse(makeRequestsPage([makeRequest({ id: '7' })]))
    if (path.startsWith('/vehicles/available')) {
      return jsonResponse(phase === 'initial'
        ? [makeVehicle({ id: '6', licensePlate: 'TQA1T15' })]
        : [makeVehicle({ id: '6', licensePlate: 'TQA1T15', available: false, reasons: ['MAINTENANCE'] })])
    }
    if (path.startsWith('/drivers/available')) {
      return jsonResponse([makeDriver({ id: '3', name: 'Condutor Fictício QA' })])
    }
    if (path === '/trips' && options.method === 'POST') {
      if (phase === 'maintenance') {
        return jsonResponse({ erro: 'O veículo está em manutenção.' }, 422)
      }
      return jsonResponse({ erro: 'O início da viagem não pode estar no passado.' }, 422)
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }

  phase = 'initial'
  const user = mountPage(api, { initialEntry: '/agendar-viagem?requestId=7' })
  await screen.findByText('Resumo da solicitação #7')

  fireEvent.change(screen.getByLabelText(/Início previsto/i), { target: { value: '2026-12-02T09:00' } })
  fireEvent.change(screen.getByLabelText(/Término previsto/i), { target: { value: '2026-12-02T10:00' } })

  await user.click(await screen.findByLabelText(/Veículo disponível/i))
  await user.click(await screen.findByRole('option', { name: /TQA1T15/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  await user.click(await screen.findByLabelText(/Motorista disponível/i))
  await user.click(await screen.findByRole('option', { name: 'Condutor Fictício QA' }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))

  phase = 'maintenance'
  await user.click(screen.getByRole('button', { name: /Confirmar agendamento/i }))

  const alertText = await screen.findByText(/Disponibilidade atualizada após conflito ou impedimento/i)
  assert.match(alertText.textContent ?? '', /TQA1T15.*manutenção impeditiva/)
  assert.match(alertText.textContent ?? '', /Condutor Fictício QA permaneceu selecionado/)
  await waitFor(() => {
    assert.ok(screen.getByText('Nenhum veículo compatível disponível'))
  })
  assert.ok(screen.getAllByText(/1 em manutenção impeditiva/).length > 0)

  // Agora testa 422 de início no passado associando erro e foco ao campo Início previsto
  phase = 'initial'
  const startInput = screen.getByLabelText(/Início previsto/i)
  fireEvent.change(startInput, { target: { value: '2026-12-02T08:00' } })
  await user.click(await screen.findByLabelText(/Veículo disponível/i))
  await user.click(await screen.findByRole('option', { name: /TQA1T15/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))

  phase = 'past'
  await user.click(screen.getByRole('button', { name: /Confirmar agendamento/i }))

  await waitFor(() => {
    assert.equal(startInput.getAttribute('aria-invalid'), 'true')
  })
  const startErrorNode = document.getElementById(startInput.getAttribute('aria-describedby') ?? '')
  assert.match(startErrorNode?.textContent ?? '', /não pode estar no passado/)
  assert.equal(document.activeElement, startInput)
  assert.equal(screen.getByRole('button', { name: /Confirmar agendamento/i }).disabled, true)
})

test('ajuste de período preserva seleção ainda válida e trata erro parcial com recuperação', async () => {
  let failDrivers = false
  const api = async (path) => {
    if (path.startsWith('/requests?')) return jsonResponse(makeRequestsPage([makeRequest({ id: '5' })]))
    if (path.startsWith('/vehicles/available')) {
      return jsonResponse([
        makeVehicle({ id: '6', licensePlate: 'TQA1T15' }),
        makeVehicle({ id: '9', licensePlate: 'QAA9C99', available: false, reasons: ['INCOMPATIBLE'] }),
      ])
    }
    if (path.startsWith('/drivers/available')) {
      if (failDrivers) return jsonResponse({ erro: 'Falha temporária' }, 503)
      const isSecondSlot = path.includes('start=2026-12-01T10%3A00')
      return jsonResponse(isSecondSlot
        ? [makeDriver({ id: '3', name: 'Condutor Fictício QA', available: false, reasons: ['AWAY'] })]
        : [makeDriver({ id: '3', name: 'Condutor Fictício QA', available: true })])
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }

  const user = mountPage(api, { initialEntry: '/agendar-viagem?requestId=5' })
  await screen.findByText('Resumo da solicitação #5')

  fireEvent.change(screen.getByLabelText(/Início previsto/i), { target: { value: '2026-12-01T09:00' } })
  fireEvent.change(screen.getByLabelText(/Término previsto/i), { target: { value: '2026-12-01T10:00' } })

  await user.click(await screen.findByLabelText(/Veículo disponível/i))
  await user.click(await screen.findByRole('option', { name: /TQA1T15/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  await user.click(await screen.findByLabelText(/Motorista disponível/i))
  await user.click(await screen.findByRole('option', { name: 'Condutor Fictício QA' }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))

  // Muda o período para 10:00–11:00 com falha parcial no serviço de motoristas
  failDrivers = true
  fireEvent.change(screen.getByLabelText(/Início previsto/i), { target: { value: '2026-12-01T10:00' } })
  fireEvent.change(screen.getByLabelText(/Término previsto/i), { target: { value: '2026-12-01T11:00' } })

  assert.ok(await screen.findByText('Consulta de disponibilidade incompleta'))
  assert.equal(screen.getByRole('button', { name: /Confirmar agendamento/i }).disabled, true)

  // Recupera consulta parcial: veículo 6 continua válido e motorista 3 é limpo com motivo AWAY
  failDrivers = false
  await user.click(screen.getByRole('button', { name: /Tentar novamente/i }))

  const notice = await screen.findByText(/Disponibilidade atualizada para o período/i)
  assert.match(notice.textContent ?? '', /Condutor Fictício QA está afastado/)
  assert.match(notice.textContent ?? '', /TQA1T15.*permaneceu selecionado/)
  assert.match(screen.getByLabelText(/Veículo disponível/i).textContent ?? '', /TQA1T15.*5 lugares/)
  assert.ok(within(document.body).getByText(/Veículos indisponíveis no período/))
})

test('envia requestId na disponibilidade e trata 422 de lotação insuficiente com reconsulta e orientação clara', async () => {
  let phase = 'beforeUpdate'
  const vehicleRequests = []
  const api = async (path, options = {}) => {
    if (path.startsWith('/requests?')) {
      return jsonResponse(makeRequestsPage([makeRequest({ id: '8', passengers: 3 })]))
    }
    if (path.startsWith('/vehicles/available')) {
      vehicleRequests.push(path)
      return jsonResponse(phase === 'beforeUpdate'
        ? [makeVehicle({ id: '7', licensePlate: 'TQA0T15', seats: 3 })]
        : [
            makeVehicle({ id: '7', licensePlate: 'TQA0T15', seats: 0, available: false, reasons: ['CAPACITY_EXCEEDED'] }),
            makeVehicle({ id: '6', licensePlate: 'TQA1T15', seats: 5, available: true }),
          ])
    }
    if (path.startsWith('/drivers/available')) {
      return jsonResponse([makeDriver({ id: '3', name: 'Condutor Fictício QA' })])
    }
    if (path === '/trips' && options.method === 'POST') {
      return jsonResponse({ erro: 'O veículo não comporta a quantidade de passageiros da solicitação.' }, 422)
    }
    return jsonResponse({ erro: 'Rota inesperada.' }, 404)
  }

  const user = mountPage(api, { initialEntry: '/agendar-viagem?requestId=8' })
  await screen.findByText('Resumo da solicitação #8')
  assert.ok(screen.getByText('3 passageiros'))

  fireEvent.change(screen.getByLabelText(/Início previsto/i), { target: { value: '2026-12-03T09:00' } })
  fireEvent.change(screen.getByLabelText(/Término previsto/i), { target: { value: '2026-12-03T10:00' } })

  await user.click(await screen.findByLabelText(/Veículo disponível/i))
  await user.click(await screen.findByRole('option', { name: /TQA0T15.*3 lugares/ }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))
  await user.click(await screen.findByLabelText(/Motorista disponível/i))
  await user.click(await screen.findByRole('option', { name: 'Condutor Fictício QA' }))
  await waitFor(() => assert.equal(screen.queryByRole('listbox'), null))

  assert.ok(vehicleRequests.some((url) => url.includes('requestId=8')))

  phase = 'capacityExceeded'
  await user.click(screen.getByRole('button', { name: /Confirmar agendamento/i }))

  const notice = await screen.findByText(/Disponibilidade atualizada após conflito ou impedimento/i)
  assert.match(notice.textContent ?? '', /TQA0T15.*não comporta a quantidade de passageiros da solicitação/)
  assert.match(notice.textContent ?? '', /Condutor Fictício QA permaneceu selecionado/)
  assert.equal(screen.getByRole('button', { name: /Confirmar agendamento/i }).disabled, true)
  assert.ok(screen.getAllByText(/1 lotação insuficiente/).length > 0)
})
