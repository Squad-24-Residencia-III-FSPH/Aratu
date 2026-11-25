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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-svo-occurrences-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { cleanup, fireEvent, render, screen, waitFor, within, act } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
  plugins: [react()],
  cacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [{ default: SvoOccurrencesPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/svoOccurrencesPage/SvoOccurrencesPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(cleanup)
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function makeOccurrence(overrides = {}) {
  return {
    id: '1',
    requesterType: 'FAMILY',
    location: 'Local Fictício QA',
    status: 'PENDING',
    receivedAt: '2026-11-23T03:00:00.000Z',
    createdAt: '2026-11-23T09:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

function makeDetail(overrides = {}) {
  return {
    ...makeOccurrence(overrides),
    requesterName: 'Solicitante Fictício QA',
    requesterPhone: '79999990000',
    description: 'Chamado sintético para testes de triagem.',
    notes: null,
    attendantId: '5',
    triagedAt: null,
    triagedBy: null,
    updatedAt: '2026-11-23T09:00:00.000Z',
    evidenceDescription: 'Contato telefônico simulado na central.',
    ...overrides,
  }
}

function makeCandidateVehicle(overrides = {}) {
  return {
    id: '10',
    plate: 'FIC0A01',
    brand: 'Marca Fictícia',
    model: 'Furgão SVO',
    bodyLimit: 2,
    occupyingOrders: 1,
    availableSlots: 1,
    ...overrides,
  }
}

function makeCandidateTeam(overrides = {}) {
  return {
    id: '1',
    name: 'Equipe Alfa Fictícia',
    ...overrides,
  }
}

function makeOrderSummary(overrides = {}) {
  return {
    id: '50',
    occurrenceId: '99',
    teamId: '1',
    vehicleId: '10',
    status: 'OPEN',
    result: null,
    revision: 1,
    openedAt: '2026-11-23T10:00:00.000Z',
    departedAt: null,
    arrivedAt: null,
    collectedAt: null,
    closedAt: null,
    dispatch: { location: 'Outro Local', teamName: 'Equipe Alfa Fictícia', vehicleLicensePlate: 'FIC0A01' },
    current: { location: 'Outro Local', teamName: 'Equipe Alfa Fictícia', vehicleLicensePlate: 'FIC0A01' },
    allowedTransitions: [],
    allowedResults: [],
    ...overrides,
  }
}

function makeApi(handlers = {}) {
  const calls = []
  const api = async (reqPath, init = {}) => {
    calls.push({ path: reqPath, init })
    const method = init.method ?? 'GET'
    if (method === 'GET' && reqPath.startsWith('/svo/occurrences?')) {
      return handlers.onListOccurrences ? handlers.onListOccurrences(reqPath) : jsonResponse(handlers.occurrences ?? [])
    }
    if (method === 'GET' && reqPath === '/svo/occurrences') {
      return handlers.onListOccurrences ? handlers.onListOccurrences(reqPath) : jsonResponse(handlers.occurrences ?? [])
    }
    if (method === 'GET' && /^\/svo\/occurrences\/\d+$/.test(reqPath)) {
      const id = reqPath.split('/').pop()
      return handlers.onDetail ? handlers.onDetail(id) : jsonResponse(makeDetail({ id }))
    }
    if (method === 'POST' && reqPath === '/svo/occurrences') {
      return handlers.onCreateOccurrence(init)
    }
    if (method === 'POST' && /^\/svo\/occurrences\/\d+\/confirm$/.test(reqPath)) {
      return handlers.onConfirmOccurrence(reqPath, init)
    }
    if (method === 'GET' && reqPath === '/svo/orders') {
      return handlers.onListOrders ? handlers.onListOrders() : jsonResponse(handlers.orders ?? [])
    }
    if (method === 'GET' && reqPath === '/svo/dispatch-candidates') {
      return handlers.onDispatchCandidates
        ? handlers.onDispatchCandidates()
        : jsonResponse(handlers.candidates ?? { teams: [], vehicles: [] })
    }
    if (method === 'POST' && reqPath === '/svo/orders') {
      return handlers.onCreateOrder(init)
    }
    if (method === 'POST' && /^\/svo\/orders\/dispatch\/\d+$/.test(reqPath)) {
      return handlers.onRetryDispatch(reqPath, init)
    }
    throw new Error(`Endpoint não simulado: ${method} ${reqPath}`)
  }
  return { api, calls }
}

function renderPage(api, perfil = 'ATENDENTE_SVO') {
  const view = render(
    createElement(
      AuthContext.Provider,
      { value: { session: sessionFor(perfil), api, signIn: async () => {}, logout() {}, notice: '' } },
      createElement(SvoOccurrencesPage),
    ),
  )
  return view
}

test('exibe título da aba, carregamento, ideal, parcial de vínculo e bloqueia perfil não autorizado', async () => {
  const pending = deferred()
  const { api } = makeApi({
    onListOccurrences: () => pending.promise,
    onListOrders: () => jsonResponse({ erro: 'Falha simulada em ordens' }, 500),
  })

  renderPage(api, 'ATENDENTE_SVO')
  assert.equal(document.title, 'Solicitações SVO — Aratu')
  assert.ok(screen.getByText('Carregando solicitações SVO...'))

  await act(async () => {
    pending.resolve(jsonResponse([makeOccurrence({ id: '1', status: 'PENDING' })]))
  })

  assert.ok(await screen.findByText('#1'))
  assert.ok(screen.getByText('Vínculo com ordens SVO parcialmente indisponível.'))
  assert.ok(screen.getByRole('button', { name: 'Confirmar triagem da solicitação #1' }))

  cleanup()
  renderPage(makeApi().api, 'EQUIPE_SVO')
  assert.ok(screen.getByText('Seu perfil atual não tem permissão para consultar solicitações SVO.'))
})

test('atendente confirma triagem, gestor reprocessa a fila e administrador reúne as duas permissões', async () => {
  const pending = makeOccurrence({ id: '1', status: 'PENDING' })
  const waiting = makeOccurrence({
    id: '2', status: 'CONFIRMED', revision: 2,
    dispatchRequestedAt: '2026-11-23T09:10:00.000Z', dispatchWaitReason: 'NO_VEHICLE',
  })
  let rows = [pending, waiting]
  const { api, calls } = makeApi({
    onListOccurrences: () => jsonResponse(rows),
    onRetryDispatch: (_path, init) => {
      assert.equal(JSON.parse(init.body).expectedRevision, 2)
      rows = [pending, { ...waiting, executionOrderId: '51', revision: 3 }]
      return jsonResponse({ status: 'DISPATCHED', orderId: '51', teamId: '1', vehicleId: '10', revision: 3 })
    },
  })

  renderPage(api, 'ATENDENTE_SVO')
  assert.ok(await screen.findByRole('button', { name: 'Confirmar triagem da solicitação #1' }))
  assert.equal(screen.queryByRole('heading', { name: 'Aguardando despacho' }), null)
  assert.equal(screen.queryByRole('button', { name: /Gerar ordem/ }), null)

  cleanup()
  renderPage(api, 'GESTOR')
  const queue = await screen.findByRole('region', { name: 'Aguardando despacho' })
  assert.ok(within(queue).getByText('Aguardando viatura com vaga elegível.'))
  assert.equal(screen.queryByRole('button', { name: 'Nova solicitação' }), null)
  assert.equal(screen.queryByRole('button', { name: /Confirmar triagem/ }), null)
  assert.ok(screen.getByRole('button', { name: 'Gerar ordem para solicitação #2' }))
  await userEvent.setup().click(within(queue).getByRole('button', { name: 'Tentar despacho da solicitação #2' }))
  assert.ok(await screen.findByText('Ordem #51 criada automaticamente para a solicitação #2.'))
  assert.ok(await within(queue).findByText('Nenhuma solicitação aguardando despacho neste recorte.'))
  assert.equal(calls.filter((call) => call.path === '/svo/orders/dispatch/2').length, 1)

  cleanup()
  rows = [pending, waiting]
  renderPage(api, 'ADMINISTRADOR')
  assert.ok(await screen.findByRole('button', { name: 'Nova solicitação' }))
  assert.ok(screen.getByRole('button', { name: 'Confirmar triagem da solicitação #1' }))
  assert.ok(screen.getByRole('button', { name: 'Gerar ordem para solicitação #2' }))
})

test('estados erro, tentar novamente, vazio e filtros por situação/período', async () => {
  let fail = true
  const { api, calls } = makeApi({
    onListOccurrences: () => (fail ? jsonResponse({ erro: 'Falha simulada' }, 500) : jsonResponse([])),
  })

  renderPage(api, 'ATENDENTE_SVO')
  assert.ok(await screen.findByText('Não foi possível carregar as solicitações SVO.'))

  fail = false
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhuma solicitação SVO cadastrada até o momento.'))

  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Confirmada' }))
  await user.type(screen.getByLabelText('Recebidas de'), '2026-11-21')
  await user.type(screen.getByLabelText('Até'), '2026-11-22')
  await user.click(screen.getByRole('button', { name: 'Filtrar' }))

  await waitFor(() => {
    assert.ok(calls.some((call) => call.path === '/svo/occurrences?status=CONFIRMED&from=2026-11-21&to=2026-11-22'))
  })
  assert.ok(await screen.findByText('Nenhuma solicitação encontrada para os filtros aplicados.'))
})

test('cadastro valida campos obrigatórios, foca primeiro inválido, envia com Enter e impede duplicidade em erro incerto', async () => {
  const state = {
    occurrences: [],
    failNextCreate: true,
  }
  const { api, calls } = makeApi({
    onListOccurrences: () => jsonResponse(state.occurrences),
    onCreateOccurrence: (init) => {
      if (state.failNextCreate) {
        return jsonResponse({}, 500)
      }
      const parsed = JSON.parse(init.body)
      assert.equal(parsed.requesterName, 'Solicitante Fictício QA')
      assert.equal(parsed.requesterType, 'HOSPITAL')
      state.occurrences = [makeOccurrence({ id: '7', requesterType: 'HOSPITAL', location: parsed.location })]
      return jsonResponse({
        id: '7',
        status: 'PENDING',
        receivedAt: '2026-11-23T03:00:00.000Z',
        createdAt: '2026-11-23T09:00:00.000Z',
        revision: 1,
      }, 201)
    },
  })

  renderPage(api, 'ATENDENTE_SVO')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Nova solicitação' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova solicitação SVO' })

  await user.click(within(dialog).getByRole('button', { name: 'Registrar solicitação' }))
  assert.ok(await within(dialog).findByText('Informe o nome do solicitante.'))
  await waitFor(() => {
    assert.equal(document.activeElement, within(dialog).getByLabelText(/Nome do solicitante/))
  })

  await user.type(within(dialog).getByLabelText(/Nome do solicitante/), 'Solicitante Fictício QA')
  await user.type(within(dialog).getByLabelText(/Telefone do solicitante/), '79999990000')
  await user.click(within(dialog).getByRole('combobox', { name: /Tipo de solicitante/ }))
  await user.click(await screen.findByRole('option', { name: 'Hospital' }))
  await user.type(within(dialog).getByLabelText(/Local da remoção/), 'Hospital Fictício')
  await user.type(within(dialog).getByLabelText(/Canal ou meio de recebimento/), 'Telefone da central')
  await user.type(within(dialog).getByLabelText(/Descrição da solicitação/), 'Chamado sintético de teste')

  await user.click(within(dialog).getByRole('button', { name: 'Registrar solicitação' }))
  assert.ok(await within(dialog).findByText(/O resultado do envio é incerto/))
  assert.equal(within(dialog).queryByRole('button', { name: 'Registrar solicitação' }), null)
  assert.equal(calls.filter((c) => c.init.method === 'POST' && c.path === '/svo/occurrences').length, 1)

  await user.click(within(dialog).getByRole('button', { name: 'Consultar solicitações' }))
  assert.ok(await screen.findByText(/Lista de solicitações atualizada/))

  state.failNextCreate = false
  await user.click(screen.getAllByRole('button', { name: 'Nova solicitação' })[0])
  const secondDialog = await screen.findByRole('dialog', { name: 'Nova solicitação SVO' })
  await user.type(within(secondDialog).getByLabelText(/Nome do solicitante/), 'Solicitante Fictício QA')
  await user.type(within(secondDialog).getByLabelText(/Telefone do solicitante/), '79999990000')
  await user.click(within(secondDialog).getByRole('combobox', { name: /Tipo de solicitante/ }))
  await user.click(await screen.findByRole('option', { name: 'Hospital' }))
  await user.type(within(secondDialog).getByLabelText(/Local da remoção/), 'Hospital Fictício')
  await user.type(within(secondDialog).getByLabelText(/Canal ou meio de recebimento/), 'Telefone da central')
  await user.type(within(secondDialog).getByLabelText(/Descrição da solicitação/), 'Chamado sintético de teste')
  fireEvent.submit(within(secondDialog).getByLabelText(/Descrição da solicitação/).closest('form'))

  assert.ok(await screen.findByText('Solicitação SVO #7 registrada com situação Pendente.'))
  assert.ok(await screen.findByText('#7'))
})

test('confirma triagem PENDING -> CONFIRMED, trata 409 e despacha ordem usando /svo/dispatch-candidates', async () => {
  const state = {
    occurrences: [makeOccurrence({ id: '1', status: 'PENDING' })],
    orders: [makeOrderSummary({ id: '50', occurrenceId: '99', teamId: '1', vehicleId: '10', status: 'OPEN' })],
    candidates: {
      teams: [makeCandidateTeam({ id: '1', name: 'Equipe Alfa Fictícia' })],
      vehicles: [makeCandidateVehicle({ id: '10', plate: 'FIC0A01', bodyLimit: 2, occupyingOrders: 1, availableSlots: 1 })],
    },
    conflictDispatchOnce: true,
    failCandidatesOnce: true,
  }
  const { api, calls } = makeApi({
    onListOccurrences: () => jsonResponse(state.occurrences),
    onDetail: (id) => jsonResponse(makeDetail({ id, status: state.occurrences[0].status })),
    onConfirmOccurrence: () => {
      state.occurrences = [makeOccurrence({
        id: '1', status: 'CONFIRMED', revision: 2, dispatchRequestedAt: '2026-11-23T09:10:00.000Z',
      })]
      return jsonResponse({
        id: '1',
        status: 'CONFIRMED',
        triagedAt: '2026-11-23T09:10:00.000Z',
        triagedBy: '5',
        revision: 2,
      })
    },
    onListOrders: () => jsonResponse(state.orders),
    onDispatchCandidates: () => {
      if (state.failCandidatesOnce) {
        state.failCandidatesOnce = false
        return jsonResponse({ erro: 'Erro transitório de candidatos' }, 500)
      }
      return jsonResponse(state.candidates)
    },
    onCreateOrder: (init) => {
      const payload = JSON.parse(init.body)
      assert.deepEqual(payload, { occurrenceId: '1', teamId: '1', vehicleId: '10' })
      if (state.conflictDispatchOnce) {
        state.conflictDispatchOnce = false
        state.candidates = {
          teams: [makeCandidateTeam({ id: '1', name: 'Equipe Alfa Fictícia' })],
          vehicles: [makeCandidateVehicle({ id: '10', plate: 'FIC0A01', bodyLimit: 3, occupyingOrders: 2, availableSlots: 1 })],
        }
        return jsonResponse({ erro: 'O veículo não possui vaga disponível. Escolha outro veículo.' }, 409)
      }
      state.orders = [
        ...state.orders,
        makeOrderSummary({ id: '51', occurrenceId: '1', teamId: '1', vehicleId: '10', status: 'OPEN' }),
      ]
      return jsonResponse({ id: '51', status: 'OPEN' }, 201)
    },
  })

  renderPage(api, 'ADMINISTRADOR')
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Confirmar triagem da solicitação #1' }))
  const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar triagem da solicitação #1' })
  assert.ok(await within(confirmDialog).findByText(/Solicitante Fictício QA/))
  await user.click(within(confirmDialog).getByRole('button', { name: 'Confirmar triagem' }))

  assert.ok(await screen.findByText('Solicitação SVO #1 confirmada com sucesso.'))
  const dispatchBtn = await screen.findByRole('button', { name: 'Gerar ordem para solicitação #1' })
  await user.click(dispatchBtn)

  const dispatchDialog = await screen.findByRole('dialog', { name: /Gerar ordem SVO/ })
  assert.ok(await within(dispatchDialog).findByText('Não foi possível carregar os candidatos de despacho.'))
  await user.click(within(dispatchDialog).getByRole('button', { name: 'Tentar novamente' }))

  assert.ok(await within(dispatchDialog).findByRole('combobox', { name: /Equipe SVO ativa/ }))
  await user.click(within(dispatchDialog).getByRole('combobox', { name: /Equipe SVO ativa/ }))
  await user.click(await screen.findByRole('option', { name: 'Equipe Alfa Fictícia' }))

  await user.click(within(dispatchDialog).getByRole('combobox', { name: /Viatura SVO disponível/ }))
  await user.click(await screen.findByRole('option', { name: /FIC0A01.*1\/2 ocupadas · 1 vaga/ }))

  const candidateCallsBefore409 = calls.filter((c) => c.path === '/svo/dispatch-candidates').length
  await user.click(within(dispatchDialog).getByRole('button', { name: 'Gerar ordem' }))

  assert.ok(await within(dispatchDialog).findByText('O veículo não possui vaga disponível. Escolha outro veículo.'))
  await waitFor(() => {
    assert.ok(calls.filter((c) => c.path === '/svo/dispatch-candidates').length > candidateCallsBefore409)
  })

  await user.click(within(dispatchDialog).getByRole('button', { name: 'Gerar ordem' }))
  assert.ok(await screen.findByText('Ordem SVO #51 gerada com situação Aberta para a solicitação #1.'))
  assert.equal(screen.queryByRole('button', { name: 'Gerar ordem para solicitação #1' }), null)
  assert.ok(screen.getByText(/Ordem #51 \(Aberta\)/))
})

test('exibe estado vazio de candidatos no despacho quando não há equipe ativa ou viatura elegível', async () => {
  const { api } = makeApi({
    occurrences: [makeOccurrence({
      id: '2', status: 'CONFIRMED', revision: 2, dispatchRequestedAt: '2026-11-23T09:10:00.000Z',
    })],
    candidates: { teams: [], vehicles: [] },
  })

  renderPage(api, 'GESTOR')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Gerar ordem para solicitação #2' }))
  const dispatchDialog = await screen.findByRole('dialog', { name: /Gerar ordem SVO/ })
  assert.ok(await within(dispatchDialog).findByText('Nenhuma equipe ativa e nenhuma viatura SVO elegível no momento.'))
  assert.equal(within(dispatchDialog).getByRole('button', { name: 'Gerar ordem' }).disabled, true)
})
