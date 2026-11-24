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
import { sessionFor } from '../../../tests/fixtures.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l12-test-'))

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
  cacheDir: viteCacheDir,
  optimizeDeps: { noDiscovery: true },
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  { default: SolicitacaoPage },
  { AuthContext },
  { createRequest, isUncertainRequestError, RequestActionError, resubmitRequest },
  { buildRequestSearchParams, parseRequestUrlState, validateFilterDateRange },
  { validateRequestForm },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/SolicitacaoPage/SolicitacaoPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/services/requestsService.ts'),
  vite.ssrLoadModule('/src/pages/SolicitacaoPage/requestListFilters.ts'),
  vite.ssrLoadModule('/src/pages/SolicitacaoPage/requestFormValidation.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  dom.window.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
})

const activeServices = [
  {
    id: '2',
    name: 'Transporte Institucional de Passageiros',
    description: 'Deslocamento administrativo',
    categories: ['PASSENGER'],
    requiresTriage: false,
    requiresWeight: false,
    requiresIdentification: false,
    active: true,
    revision: 2,
  },
  {
    id: '4',
    name: 'Serviço Inativo de Controle',
    description: null,
    categories: ['PASSENGER'],
    requiresTriage: false,
    requiresWeight: false,
    requiresIdentification: false,
    active: false,
    revision: 8,
  },
]

const pendingSummary = {
  id: '1',
  requesterId: '3',
  requesterName: 'Solicitante Fictício',
  serviceId: '2',
  serviceName: 'Transporte Institucional de Passageiros',
  requestedDate: '2026-11-30',
  requestedTime: '09:30',
  origin: 'Base fictícia L12',
  destination: 'Polo Azul Fictício',
  purpose: 'Reunião institucional fictícia',
  passengers: 1,
  status: 'PENDING',
  createdAt: '2026-11-24T12:00:00.000Z',
  updatedAt: '2026-11-24T12:00:00.000Z',
}

const confirmedScheduledDetail = {
  ...pendingSummary,
  id: '10',
  status: 'SCHEDULED',
  decidedBy: '2',
  decidedByName: 'Gestor Fictício',
  decidedAt: '2026-11-24T13:00:00.000Z',
  decisionReason: null,
  trip: {
    id: '7',
    status: 'CONFIRMED',
    scheduledStart: '2026-11-30T12:30:00.000Z',
    scheduledEnd: '2026-11-30T13:30:00.000Z',
    vehicle: { id: '4', licensePlate: 'TQA5V23', brand: null, model: null },
    driver: { id: '1', name: 'Motorista Fictício' },
  },
}

const rejectedDetail = {
  ...pendingSummary,
  id: '2',
  status: 'REJECTED',
  destination: 'Polo Verde Fictício',
  notes: 'Levar documento protocolado',
  revision: 2,
  decidedBy: '2',
  decidedByName: 'Gestor Fictício',
  decidedAt: '2026-11-24T13:15:00.000Z',
  decisionReason: 'Polo Verde sem cobertura operacional no horário solicitado.',
  events: [
    {
      id: '1',
      eventType: 'CREATED',
      occurredAt: '2026-11-24T12:00:00.000Z',
      reportedBy: 'Solicitante Fictício',
      reason: 'Solicitação criada pelo Solicitante.',
    },
    {
      id: '2',
      eventType: 'REJECTED',
      occurredAt: '2026-11-24T13:15:00.000Z',
      reportedBy: 'Gestor Fictício',
      reason: 'Polo Verde sem cobertura operacional no horário solicitado.',
    },
  ],
  trip: null,
}

function renderSolicitacaoPage(api, initialEntries = ['/solicitacoes/minhas'], profile = 'SOLICITANTE') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(
    createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(MemoryRouter, { initialEntries }, createElement(SolicitacaoPage)),
    ),
  )
}

test('createRequest exige 201 com ID real e classifica falhas incertas vs validação', async () => {
  let captured = null
  const created = await createRequest(async (url, options) => {
    captured = { url, method: options.method, body: JSON.parse(options.body) }
    return Response.json({ id: '15', status: 'PENDING' }, { status: 201 })
  }, {
    requestedDate: '2026-12-01',
    requestedTime: '09:30',
    origin: 'Origem Fictícia',
    destination: 'Destino Fictício',
    purpose: 'Visita técnica fictícia',
    serviceId: '2',
  })
  assert.deepEqual(created, { id: '15', status: 'PENDING' })
  assert.equal(captured.url, '/requests')
  assert.equal(captured.method, 'POST')
  assert.deepEqual(Object.keys(captured.body).sort(), [
    'destination', 'origin', 'purpose', 'requestedDate', 'requestedTime', 'serviceId',
  ])

  await assert.rejects(
    createRequest(async () => Response.json({ erro: 'Tipo de serviço inexistente ou inativo.' }, { status: 400 }), {
      requestedDate: '2026-12-01',
      requestedTime: '09:30',
      origin: 'A',
      destination: 'B',
      purpose: 'C',
      serviceId: '4',
    }),
    (error) => error instanceof RequestActionError && error.kind === 'validation' && !isUncertainRequestError(error),
  )

  await assert.rejects(
    createRequest(async () => Response.json({ erro: 'Erro interno' }, { status: 503 }), {
      requestedDate: '2026-12-01',
      requestedTime: '09:30',
      origin: 'A',
      destination: 'B',
      purpose: 'C',
      serviceId: '2',
    }),
    (error) => error instanceof RequestActionError && error.kind === 'server' && isUncertainRequestError(error),
  )

  await assert.rejects(
    createRequest(async () => Response.json({ erro: 'Não autenticado' }, { status: 401 }), {
      requestedDate: '2026-12-01',
      requestedTime: '09:30',
      origin: 'A',
      destination: 'B',
      purpose: 'C',
      serviceId: '2',
    }),
    (error) => error instanceof RequestActionError && error.kind === 'session' && !isUncertainRequestError(error),
  )

  let resubmitCaptured = null
  const resubmitted = await resubmitRequest(async (url, options) => {
    resubmitCaptured = { url, method: options.method, body: JSON.parse(options.body) }
    return Response.json({ id: '2', status: 'PENDING', revision: 3 }, { status: 200 })
  }, '2', {
    requestedDate: '2026-12-02',
    requestedTime: '10:30',
    origin: 'A',
    destination: 'B',
    purpose: 'C',
    serviceId: '2',
    passengers: 3,
    notes: 'Observação revisada',
    expectedRevision: 2,
    reason: 'Horário ajustado',
  })
  assert.deepEqual(resubmitted, { id: '2', status: 'PENDING', revision: 3 })
  assert.equal(resubmitCaptured.url, '/requests/2/resubmit')
  assert.equal(resubmitCaptured.body.expectedRevision, 2)

  await assert.rejects(
    resubmitRequest(async () => Response.json({ erro: 'Revisão obsoleta' }, { status: 409 }), '2', {
      requestedDate: '2026-12-02',
      requestedTime: '10:30',
      origin: 'A',
      destination: 'B',
      purpose: 'C',
      serviceId: '2',
      expectedRevision: 1,
      reason: 'Ajuste',
    }),
    (error) => error instanceof RequestActionError && error.kind === 'conflict' && !isUncertainRequestError(error),
  )
})

test('helpers de URL e validação rejeitam período invertido, espaços vazios e data retroativa', () => {
  const urlState = parseRequestUrlState(new URLSearchParams('status=SCHEDULED&from=2026-11-29&to=2026-12-01&service=%20Transporte%20&page=2&pageSize=10&nova=1'))
  assert.deepEqual(urlState, {
    filters: { status: 'SCHEDULED', from: '2026-11-29', to: '2026-12-01', service: 'Transporte' },
    page: 2,
    pageSize: 10,
    openNewRequested: true,
  })

  const serialized = buildRequestSearchParams(urlState.filters, urlState.page, urlState.pageSize)
  assert.equal(serialized.get('nova'), null)
  assert.equal(serialized.get('status'), 'SCHEDULED')

  const invalidRange = validateFilterDateRange('2026-12-05', '2026-12-01')
  assert.ok(invalidRange.fromError && invalidRange.toError)

  const fixedNow = new Date('2026-11-24T15:00:00.000Z') // 12:00 America/Maceio
  const pastValidation = validateRequestForm({
    serviceId: '2',
    requestedDate: '2026-11-24',
    requestedTime: '11:30',
    origin: '   ',
    destination: 'Destino válido',
    passengers: '0',
    purpose: 'Finalidade válida',
    notes: '',
  }, fixedNow)
  assert.equal(pastValidation.ok, false)
  if (!pastValidation.ok) {
    assert.equal(pastValidation.firstInvalidField, 'requestedTime')
    assert.ok(pastValidation.errors.origin)
    assert.ok(pastValidation.errors.passengers)
  }
})

test('carrega lista real de GET /requests, exibe "0 de 0" no vazio e aplica filtros com URL', async () => {
  const calls = []
  const api = async (url) => {
    calls.push(url)
    if (url.includes('status=APPROVED')) {
      return Response.json({ requests: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
    }
    return Response.json({ requests: [pendingSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 })
  }

  const user = userEvent.setup()
  renderSolicitacaoPage(api)

  assert.equal(document.title, 'Minhas solicitações — Aratu')
  assert.ok(await screen.findByText('Polo Azul Fictício'))
  assert.equal(screen.getByText('1–1 de 1').textContent, '1–1 de 1')

  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Aprovada' }))
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

  assert.ok(await screen.findByText('Nenhuma solicitação encontrada para os filtros atuais.'))
  assert.ok(screen.getByText('0 de 0'))
  assert.equal(screen.queryByText(/1–0 de 0/), null)
  assert.ok(calls.some((url) => url.includes('status=APPROVED')))

  const fromInput = screen.getByLabelText('Data inicial')
  const toInput = screen.getByLabelText('Data final')
  fireEvent.change(fromInput, { target: { value: '2026-12-10' } })
  fireEvent.change(toInput, { target: { value: '2026-12-01' } })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

  assert.ok(await screen.findByText('Data inicial posterior à data final.'))
  assert.equal(fromInput.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, fromInput)
})

test('abre formulário por ?nova=1, carrega apenas serviços ativos, valida erros em PT-BR e envia passageiros e observações via POST /requests', async () => {
  const createdRequests = []
  const postBodies = []
  const api = async (url, options = {}) => {
    if (url.startsWith('/requests?')) {
      return Response.json({
        requests: createdRequests,
        total: createdRequests.length,
        page: 1,
        pageSize: 20,
        totalPages: createdRequests.length > 0 ? 1 : 0,
      })
    }
    if (url === '/services') {
      return Response.json(activeServices)
    }
    if (url === '/requests' && options.method === 'POST') {
      const payload = JSON.parse(options.body)
      postBodies.push(payload)
      createdRequests.push({
        ...pendingSummary,
        id: '99',
        ...payload,
      })
      return Response.json({ id: '99', status: 'PENDING' }, { status: 201 })
    }
    throw new Error(`Rota inesperada: ${url}`)
  }

  const user = userEvent.setup()
  renderSolicitacaoPage(api, ['/solicitacoes/minhas?nova=1'])

  const dialog = await screen.findByRole('dialog')
  assert.ok(within(dialog).getByText('Nova Solicitação de Viagem'))

  const serviceSelect = await within(dialog).findByRole('combobox', { name: /Tipo de serviço/i })
  await user.click(within(dialog).getByRole('button', { name: 'Enviar Solicitação' }))

  assert.ok(await within(dialog).findByText('Selecione o tipo de serviço.'))
  assert.equal(serviceSelect.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, serviceSelect)
  assert.equal(postBodies.length, 0)

  await user.click(serviceSelect)
  assert.ok(await screen.findByRole('option', { name: 'Transporte Institucional de Passageiros' }))
  assert.equal(screen.queryByRole('option', { name: 'Serviço Inativo de Controle' }), null)
  await user.click(screen.getByRole('option', { name: 'Transporte Institucional de Passageiros' }))

  fireEvent.change(within(dialog).getByLabelText(/Data da Viagem/i), { target: { value: '2026-12-10' } })
  fireEvent.change(within(dialog).getByLabelText(/Horário de Saída/i), { target: { value: '09:30' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Origem/i }), { target: { value: 'Base Fictícia L12' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Destino/i }), { target: { value: 'Unidade Fictícia L12' } })
  fireEvent.change(within(dialog).getByLabelText(/Quantidade de passageiros/i), { target: { value: '3' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Finalidade/i }), { target: { value: 'Reunião operacional fictícia' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Observações/i }), { target: { value: 'Levar pasta institucional fictícia' } })

  await user.click(within(dialog).getByRole('button', { name: 'Enviar Solicitação' }))

  assert.ok(await screen.findByText(/Solicitação #99 enviada com sucesso/))
  assert.equal(postBodies.length, 1)
  assert.deepEqual(postBodies[0], {
    serviceId: '2',
    requestedDate: '2026-12-10',
    requestedTime: '09:30',
    origin: 'Base Fictícia L12',
    destination: 'Unidade Fictícia L12',
    passengers: 3,
    purpose: 'Reunião operacional fictícia',
    notes: 'Levar pasta institucional fictícia',
  })
  assert.ok(await screen.findByText('Unidade Fictícia L12'))
})

test('preserva entradas em falha 503 de POST /requests, protege contra duplo clique e orienta consultar a lista', async () => {
  let postAttempts = 0
  let releasePost
  const listCalls = []
  const persistedAfterFailure = []
  const postPromise = new Promise((resolve) => { releasePost = resolve })
  const api = async (url, options = {}) => {
    if (url.startsWith('/requests?')) {
      listCalls.push(url)
      return Response.json({
        requests: url.includes('status=APPROVED') ? [] : persistedAfterFailure,
        total: url.includes('status=APPROVED') ? 0 : persistedAfterFailure.length,
        page: 1,
        pageSize: 20,
        totalPages: !url.includes('status=APPROVED') && persistedAfterFailure.length > 0 ? 1 : 0,
      })
    }
    if (url === '/services') {
      return Response.json(activeServices)
    }
    if (url === '/requests' && options.method === 'POST') {
      postAttempts += 1
      await postPromise
      persistedAfterFailure.push({ ...pendingSummary, id: '88', destination: 'Unidade Destino Preservar' })
      return Response.json({ erro: 'Indisponível' }, { status: 503 })
    }
    throw new Error(`Rota inesperada: ${url}`)
  }

  const user = userEvent.setup()
  renderSolicitacaoPage(api, ['/solicitacoes/minhas?status=APPROVED&action=new'])

  const dialog = await screen.findByRole('dialog')
  const serviceSelect = await within(dialog).findByRole('combobox', { name: /Tipo de serviço/i })
  await user.click(serviceSelect)
  await user.click(await screen.findByRole('option', { name: 'Transporte Institucional de Passageiros' }))
  fireEvent.change(within(dialog).getByLabelText(/Data da Viagem/i), { target: { value: '2026-12-12' } })
  fireEvent.change(within(dialog).getByLabelText(/Horário de Saída/i), { target: { value: '14:00' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Origem/i }), { target: { value: 'Unidade Origem Preservar' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Destino/i }), { target: { value: 'Unidade Destino Preservar' } })
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Finalidade/i }), { target: { value: 'Entrega de insumos fictícios' } })

  const submitButton = within(dialog).getByRole('button', { name: 'Enviar Solicitação' })
  fireEvent.click(submitButton)
  fireEvent.click(submitButton)
  releasePost()

  await waitFor(() => assert.equal(postAttempts, 1))
  assert.ok(await within(dialog).findByText(/consulte a lista antes de tentar novamente/i))
  assert.equal(within(dialog).getByRole('textbox', { name: /Destino/i }).value, 'Unidade Destino Preservar')
  const checkListButton = within(dialog).getByRole('button', { name: 'Consultar lista' })
  await user.click(checkListButton)
  assert.ok(await within(dialog).findByText(/Lista atualizada/i))
  assert.ok(listCalls.some((url) => !url.includes('status=APPROVED')))
})

test('detalhe distingue pedido agendado de viagem confirmada e executa reenvio versionado preservando histórico da recusa', async () => {
  const scheduledNotConfirmedDetail = {
    ...confirmedScheduledDetail,
    id: '11',
    destination: 'Polo Amarelo Fictício',
    trip: {
      ...confirmedScheduledDetail.trip,
      id: '8',
      status: 'SCHEDULED',
    },
  }
  let currentDetail2 = { ...rejectedDetail }
  let listStatus2 = 'REJECTED'
  const resubmitBodies = []
  const api = async (url, options = {}) => {
    if (url.startsWith('/requests?')) {
      return Response.json({
        requests: [
          { ...pendingSummary, id: '10', status: 'SCHEDULED' },
          { ...pendingSummary, id: '11', status: 'SCHEDULED', destination: 'Polo Amarelo Fictício' },
          { ...pendingSummary, id: '2', status: listStatus2, destination: 'Polo Verde Fictício', notes: 'Levar documento protocolado' },
        ],
        total: 3,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })
    }
    if (url === '/services') return Response.json(activeServices)
    if (url === '/requests/10') return Response.json(confirmedScheduledDetail)
    if (url === '/requests/11') return Response.json(scheduledNotConfirmedDetail)
    if (url === '/requests/2') return Response.json(currentDetail2)
    if (url === '/requests/2/resubmit' && options.method === 'POST') {
      const payload = JSON.parse(options.body)
      resubmitBodies.push(payload)
      listStatus2 = 'PENDING'
      currentDetail2 = {
        ...currentDetail2,
        ...payload,
        status: 'PENDING',
        revision: 3,
        decidedBy: null,
        decidedByName: null,
        decidedAt: null,
        decisionReason: null,
        events: [
          ...rejectedDetail.events,
          {
            id: '3',
            eventType: 'RESUBMITTED',
            occurredAt: '2026-11-24T14:00:00.000Z',
            reportedBy: 'Solicitante Fictício',
            reason: payload.reason,
          },
        ],
      }
      return Response.json({ id: '2', status: 'PENDING', revision: 3 }, { status: 200 })
    }
    throw new Error(`Rota inesperada: ${url}`)
  }

  renderSolicitacaoPage(api)

  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação #10 para Polo Azul Fictício' }))
  const dialogConfirmed = await screen.findByRole('dialog')
  assert.ok(await within(dialogConfirmed).findByText('Viagem confirmada'))
  assert.ok(within(dialogConfirmed).getByText('TQA5V23'))
  assert.ok(within(dialogConfirmed).getByText('Motorista Fictício'))
  assert.ok(within(dialogConfirmed).getByText('Viagem #7 confirmada pela gestão de frota após encerramento pelo motorista.'))
  assert.equal(document.querySelectorAll('main').length, 0)
  fireEvent.click(within(dialogConfirmed).getByRole('button', { name: 'Fechar' }))
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))

  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação #11 para Polo Amarelo Fictício' }))
  const dialogScheduled = await screen.findByRole('dialog')
  assert.ok(await within(dialogScheduled).findByText('Viagem agendada'))
  assert.ok(within(dialogScheduled).getByText(/aguardando execução e confirmação/i))
  fireEvent.click(within(dialogScheduled).getByRole('button', { name: 'Fechar' }))
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))

  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação #2 para Polo Verde Fictício' }))
  const dialogRejected = await screen.findByRole('dialog')
  assert.ok((await within(dialogRejected).findAllByText(/Polo Verde sem cobertura operacional/)).length >= 1)
  assert.ok(within(dialogRejected).getByText('Levar documento protocolado'))
  fireEvent.click(within(dialogRejected).getByRole('button', { name: 'Reenviar solicitação' }))

  const resubmitDialog = await screen.findByRole('dialog', { name: 'Reenviar Solicitação #2' })
  assert.ok(await within(resubmitDialog).findByText('Reenviar Solicitação #2'))
  assert.ok(await within(resubmitDialog).findByRole('combobox', { name: /Tipo de serviço/i }))
  fireEvent.change(within(resubmitDialog).getByLabelText(/Data da Viagem/i), { target: { value: '2026-12-15' } })
  fireEvent.click(within(resubmitDialog).getByRole('button', { name: 'Confirmar Reenvio' }))
  assert.ok(await within(resubmitDialog).findByText('Informe a justificativa do reenvio.'))

  fireEvent.change(within(resubmitDialog).getByRole('textbox', { name: /Justificativa do reenvio/i }), {
    target: { value: 'Ajustada a data para disponibilidade da unidade' },
  })
  fireEvent.click(within(resubmitDialog).getByRole('button', { name: 'Confirmar Reenvio' }))

  assert.ok(await screen.findByText(/Solicitação #2 reenviada com sucesso \(revisão 3\)/))
  assert.equal(resubmitBodies.length, 1)
  assert.equal(resubmitBodies[0].expectedRevision, 2)
  assert.equal(resubmitBodies[0].reason, 'Ajustada a data para disponibilidade da unidade')

  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da solicitação #2 para Polo Verde Fictício' }))
  const reopenedDetail = await screen.findByRole('dialog')
  assert.ok(await within(reopenedDetail).findByText(/Solicitação reenviada após recusa anterior/))
  assert.ok(within(reopenedDetail).getByText(/Motivo: Polo Verde sem cobertura operacional no horário solicitado\./))
  assert.ok(within(reopenedDetail).getByText(/Justificativa: Ajustada a data para disponibilidade da unidade/))
})

test('trata conflito 409 no reenvio preservando entrada e permitindo atualizar a solicitação', async () => {
  let currentDetail2 = { ...rejectedDetail }
  const api = async (url, options = {}) => {
    if (url.startsWith('/requests?')) {
      return Response.json({
        requests: [{ ...pendingSummary, id: '2', status: 'REJECTED', destination: 'Polo Verde Fictício' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })
    }
    if (url === '/services') return Response.json(activeServices)
    if (url === '/requests/2') return Response.json(currentDetail2)
    if (url === '/requests/2/resubmit' && options.method === 'POST') {
      currentDetail2 = { ...rejectedDetail, status: 'PENDING', revision: 3 }
      return Response.json({ erro: 'A solicitação foi atualizada em outra ação.' }, { status: 409 })
    }
    throw new Error(`Rota inesperada: ${url}`)
  }

  renderSolicitacaoPage(api)

  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes da solicitação #2 para Polo Verde Fictício' }))
  const detailDialog = await screen.findByRole('dialog')
  fireEvent.click(await within(detailDialog).findByRole('button', { name: 'Reenviar solicitação' }))

  const resubmitDialog = await screen.findByRole('dialog', { name: 'Reenviar Solicitação #2' })
  await within(resubmitDialog).findByRole('combobox', { name: /Tipo de serviço/i })
  fireEvent.change(within(resubmitDialog).getByLabelText(/Data da Viagem/i), { target: { value: '2026-12-16' } })
  fireEvent.change(within(resubmitDialog).getByRole('textbox', { name: /Justificativa do reenvio/i }), {
    target: { value: 'Reenvio concorrente' },
  })
  fireEvent.click(within(resubmitDialog).getByRole('button', { name: 'Confirmar Reenvio' }))

  assert.ok(await within(resubmitDialog).findByText(/atualizada em outra ação/i))
  fireEvent.click(within(resubmitDialog).getByRole('button', { name: 'Atualizar solicitação' }))
  const refreshedDialog = await screen.findByRole('dialog', { name: /Detalhes da Solicitação #2/ })
  assert.ok(await within(refreshedDialog).findByText('v3'))
})

test('preserva campos quando GET /services falha e permite recuperar o catálogo sem perder o rascunho', async () => {
  let serviceCalls = 0
  const api = async (url) => {
    if (url.startsWith('/requests?')) {
      return Response.json({ requests: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
    }
    if (url === '/services') {
      serviceCalls += 1
      if (serviceCalls === 1) return Response.json({ erro: 'Catálogo temporariamente indisponível.' }, { status: 503 })
      return Response.json(activeServices)
    }
    throw new Error(`Rota inesperada: ${url}`)
  }

  renderSolicitacaoPage(api, ['/solicitacoes/minhas?nova=1'])
  const dialog = await screen.findByRole('dialog')

  assert.ok(await within(dialog).findByText('Não foi possível carregar os tipos de serviço.'))
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Destino/i }), { target: { value: 'Destino Mantido Após Erro' } })

  fireEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await within(dialog).findByRole('combobox', { name: /Tipo de serviço/i }))
  assert.equal(within(dialog).getByRole('textbox', { name: /Destino/i }).value, 'Destino Mantido Após Erro')
  assert.equal(serviceCalls, 2)
})

test('bloqueia perfis não solicitantes na tela mesmo no alias', async () => {
  let calledApi = false
  const api = async () => {
    calledApi = true
    return Response.json({})
  }
  renderSolicitacaoPage(api, ['/minhas-solicitacoes'], 'MOTORISTA')
  assert.ok(await screen.findByText('Acesso restrito'))
  assert.equal(calledApi, false)
})
