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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-fines-test-'))

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

const frontendRoot = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  { default: FinesPage },
  { AuthContext },
  fineTypes,
  finesService,
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/finesPage/FinesPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/types/fine.ts'),
  vite.ssrLoadModule('/src/services/finesService.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeVehicle(id = '4', overrides = {}) {
  return {
    id: String(id),
    licensePlate: 'TQA5V23',
    brand: 'Marca Fictícia',
    model: 'Viatura Fictícia',
    year: 2025,
    vehicleType: 'Utilitário',
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 5,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status: 'AVAILABLE',
    revision: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDriver(id = '1', overrides = {}) {
  return {
    id: String(id),
    name: 'Motorista Fictício QA',
    cpf: '12345678901',
    cnhNumber: '00011122233',
    cnhCategory: 'B',
    cnhExpiresAt: '2028-12-31',
    phone: null,
    status: 'ACTIVE',
    userId: null,
    revision: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeFine(id = '9007199254740993', overrides = {}) {
  return {
    id: String(id),
    vehicleId: '4',
    driverId: null,
    tripId: null,
    infractionAt: '2026-11-23T09:21:00.000Z',
    infractionCode: 'QA-7401',
    description: 'Infração fictícia para teste de tela',
    location: 'Via Fictícia',
    amount: '123.45',
    dueAt: '2026-12-20',
    notes: null,
    status: 'PENDING',
    paidAt: null,
    cancellationReason: null,
    createdBy: '2',
    revision: 1,
    createdAt: '2026-11-23T09:30:00.000Z',
    updatedAt: '2026-11-23T09:30:00.000Z',
    vehicle: { id: '4', licensePlate: 'TQA5V23', model: 'Viatura Fictícia' },
    driver: null,
    vehicleSnapshot: {
      id: '4',
      licensePlate: 'TQA5V23',
      model: 'Viatura Fictícia',
      source: 'CURRENT_REGISTRY',
      capturedAt: '2026-11-23T09:30:00.000Z',
    },
    driverSnapshot: null,
    tripSnapshot: null,
    ...overrides,
  }
}

function makeDetail(fine, events = []) {
  return {
    ...fine,
    events: events.length > 0 ? events : [
      {
        id: '10',
        eventType: 'REGISTERED',
        occurredAt: fine.infractionAt,
        registeredAt: fine.createdAt,
        reportedBy: 'Setor Fictício de Frota',
        reason: 'Notificação fictícia recebida',
        evidenceDescription: 'Auto fictício anexado ao protocolo',
        attachmentUrl: null,
        supersedesId: null,
        actor: { id: '2', name: 'Gestor Fictício', role: 'GESTOR' },
        before: null,
        after: fine,
      },
    ],
  }
}

function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(FinesPage)))
}

test('helpers monetários, URL, RBAC e transições seguem contrato exato da API', () => {
  assert.equal(fineTypes.canManageFines('GESTOR'), true)
  assert.equal(fineTypes.canManageFines('ADMINISTRADOR'), true)
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO', null]) {
    assert.equal(fineTypes.canManageFines(role), false)
  }

  assert.equal(fineTypes.normalizeFineAmount('0'), '0.00')
  assert.equal(fineTypes.normalizeFineAmount('195,23'), '195.23')
  assert.equal(fineTypes.normalizeFineAmount('9999999999.99'), '9999999999.99')
  assert.throws(() => fineTypes.normalizeFineAmount('-1,00'))
  assert.throws(() => fineTypes.normalizeFineAmount('10000000000.00'))
  assert.equal(fineTypes.formatFineMoney('1234.56'), 'R$ 1.234,56')
  assert.equal(fineTypes.sumFineAmounts([{ amount: '10.50' }, { amount: '0.75' }]), 'R$ 11,25')

  assert.equal(fineTypes.getAttachmentUrlError(''), undefined)
  assert.equal(fineTypes.getAttachmentUrlError('https://exemplo.invalid/doc.pdf'), undefined)
  assert.match(fineTypes.getAttachmentUrlError('https://user:pass@exemplo.invalid/doc.pdf'), /sem credenciais/)
  assert.match(fineTypes.getAttachmentUrlError('ftp://exemplo.invalid/doc.pdf'), /HTTP ou HTTPS/)

  assert.deepEqual(fineTypes.FINE_TRANSITIONS.PAID, ['PENDING'])
  assert.deepEqual(fineTypes.FINE_TRANSITIONS.CANCELED, ['PENDING'])
})

test('serviço de multas envia filtros, Idempotency-Key e trata erros sem perder BIGINT', async () => {
  const calls = []
  const fine = makeFine('9007199254740993')
  const detail = makeDetail(fine)
  const api = async (requestPath, options = {}) => {
    calls.push({ requestPath, options })
    if (requestPath.startsWith('/fines/driver-suggestions')) {
      return jsonResponse({
        items: [{
          tripId: '77',
          driverId: '1',
          driverName: 'Motorista Fictício QA',
          vehicleId: '4',
          startedAt: '2026-11-23T09:20:40.000Z',
          finishedAt: '2026-11-23T09:21:30.000Z',
          tripStatus: 'FINISHED',
          nameSource: 'TRIP_SNAPSHOT',
        }],
      })
    }
    if (requestPath === `/fines/${fine.id}/status`) {
      return jsonResponse({ ...fine, status: 'PAID', revision: 2, paidAt: '2026-11-24T10:00:00.000Z' })
    }
    if (requestPath === `/fines/${fine.id}` && !options.method) {
      return jsonResponse(detail)
    }
    if (requestPath === `/fines/${fine.id}` && options.method === 'PUT') {
      return jsonResponse({ ...fine, revision: 2 })
    }
    if (requestPath === '/fines' && options.method === 'POST') {
      return jsonResponse(fine, 201)
    }
    return jsonResponse({ items: [fine] })
  }

  const list = await finesService.listFines(api, { vehicleId: '4', status: 'PENDING' })
  assert.equal(list[0].id, fine.id)
  assert.equal(calls[0].requestPath, '/fines?vehicleId=4&status=PENDING')

  const suggestions = await finesService.suggestFineDrivers(api, '4', '2026-11-23T09:21:00.000Z')
  assert.equal(suggestions[0].nameSource, 'TRIP_SNAPSHOT')

  await finesService.createFine(api, {
    vehicleId: '4',
    infractionAt: '2026-11-23T09:21:00.000Z',
    infractionCode: 'QA-7401',
    description: 'Infração fictícia',
    amount: '123.45',
    reportedBy: 'Setor Fictício',
    reason: 'Teste',
    evidenceDescription: 'Protocolo',
  }, '11111111-1111-4111-8111-111111111173')
  assert.equal(calls[2].options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111173')

  await finesService.changeFineStatus(api, fine.id, {
    expectedRevision: 1,
    status: 'PAID',
    paidAt: '2026-11-24T10:00:00.000Z',
    reportedBy: 'Tesouraria Fictícia',
    reason: 'Quitação',
    evidenceDescription: 'Guia paga',
  })
  assert.equal(calls[3].options.method, 'PATCH')

  const conflictApi = async () => jsonResponse({ erro: 'A multa foi alterada por outra operação.' }, 409)
  await assert.rejects(
    finesService.getFine(conflictApi, '1'),
    (err) => err instanceof finesService.FineRequestError && err.status === 409 && /alterada/.test(err.message),
  )
})

test('bloqueia perfil sem permissão sem disparar chamadas à API', async () => {
  let called = false
  renderPage(async () => {
    called = true
    return jsonResponse({ items: [] })
  }, 'MOTORISTA')

  assert.ok(await screen.findByText('Seu perfil não tem permissão para consultar multas e infrações.'))
  assert.equal(called, false)
})

test('exibe estados carregando, erro com retry e vazio com limpeza de filtros', async () => {
  let fineAttempts = 0
  const api = async (requestPath) => {
    if (requestPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (requestPath === '/drivers') return jsonResponse([makeDriver()])
    fineAttempts += 1
    if (fineAttempts === 1) return jsonResponse({ erro: 'Serviço fictício indisponível.' }, 503)
    return jsonResponse({ items: [] })
  }

  renderPage(api, 'ADMINISTRADOR')
  assert.ok(await screen.findByText('Serviço fictício indisponível.'))

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhuma multa registrada.'))
})

test('permite registrar multa sem motorista quando não houver candidatos e mantém estado parcial se sugestão falhar', async () => {
  const calls = []
  let suggestionAttempts = 0
  const created = makeFine('50', { infractionCode: 'QA-SEM-MOT', driverId: null, tripId: null })
  let listItems = []

  const api = async (requestPath, options = {}) => {
    calls.push({ requestPath, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null, headers: options.headers })
    if (requestPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (requestPath === '/drivers') return jsonResponse([makeDriver()])
    if (requestPath.startsWith('/fines/driver-suggestions')) {
      suggestionAttempts += 1
      if (suggestionAttempts === 1) return jsonResponse({ erro: 'Consulta de sugestões indisponível.' }, 503)
      return jsonResponse({ items: [] })
    }
    if (requestPath === '/fines' && options.method === 'POST') {
      listItems = [created]
      return jsonResponse(created, 201)
    }
    if (requestPath === `/fines/${created.id}`) return jsonResponse(makeDetail(created))
    return jsonResponse({ items: listItems })
  }

  renderPage(api, 'GESTOR')
  await screen.findByText('Nenhuma multa registrada.')

  const user = userEvent.setup()
  const registerButton = screen.getByRole('button', { name: 'Registrar multa' })
  await waitFor(() => assert.equal(registerButton.disabled, false))
  await user.click(registerButton)

  const dialog = await screen.findByRole('dialog', { name: 'Registrar multa ou infração' })
  await user.click(within(dialog).getByLabelText(/Veículo/))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))

  fireEvent.change(within(dialog).getByLabelText(/Data e hora da infração/), { target: { value: '2026-11-23T06:21' } })

  // Primeira tentativa de sugestão falha -> estado parcial, formulário segue utilizável
  assert.ok(await within(dialog).findByText('Não foi possível consultar sugestões de viagem.'))

  // Nova tentativa retorna lista vazia -> fluxo sem motorista liberado
  await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await within(dialog).findByText(/Nenhuma viagem iniciada ou em andamento encontrada/))

  fireEvent.change(within(dialog).getByLabelText(/Código da infração/), { target: { value: 'QA-SEM-MOT' } })
  fireEvent.change(within(dialog).getByLabelText(/Valor \(R\$\)/), { target: { value: '0,00' } })
  fireEvent.change(within(dialog).getByLabelText(/Descrição da infração/), { target: { value: 'Infração fictícia sem motorista' } })
  fireEvent.change(within(dialog).getByLabelText(/Origem da informação/), { target: { value: 'Órgão Fictício' } })
  fireEvent.change(within(dialog).getByLabelText(/Justificativa/), { target: { value: 'Registro sem candidato' } })
  fireEvent.change(within(dialog).getByLabelText(/Descrição da evidência/), { target: { value: 'Auto fictício 001' } })

  await user.click(within(dialog).getByRole('button', { name: 'Salvar multa' }))

  await waitFor(() => {
    assert.ok(calls.some((call) => call.requestPath === '/fines' && call.method === 'POST'))
  })
  const postCall = calls.find((call) => call.requestPath === '/fines' && call.method === 'POST')
  assert.equal(postCall.body.driverId, null)
  assert.equal(postCall.body.tripId, null)
  assert.equal(postCall.body.amount, '0.00')
  assert.ok(postCall.headers['Idempotency-Key'])
})

test('exibe fonte da sugestão, cancela confirmação de vínculo sem gravar e depois confirma gravação', async () => {
  const calls = []
  let listItems = []
  const createdWithLink = makeFine('51', {
    driverId: '1',
    tripId: '99',
    infractionCode: 'QA-VINCULO',
    driver: { id: '1', name: 'Motorista Fictício QA' },
    driverSnapshot: {
      id: '1',
      name: 'Motorista Fictício QA',
      source: 'TRIP_SNAPSHOT',
      capturedAt: '2026-11-23T09:30:00.000Z',
    },
    tripSnapshot: {
      id: '99',
      vehicleId: '4',
      driverId: '1',
      startedAt: '2026-11-23T09:20:40.000Z',
      finishedAt: '2026-11-23T09:21:30.000Z',
      status: 'FINISHED',
      capturedAt: '2026-11-23T09:30:00.000Z',
    },
  })

  const api = async (requestPath, options = {}) => {
    calls.push({ requestPath, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (requestPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (requestPath === '/drivers') return jsonResponse([makeDriver()])
    if (requestPath.startsWith('/fines/driver-suggestions')) {
      return jsonResponse({
        items: [{
          tripId: '99',
          driverId: '1',
          driverName: 'Motorista Fictício QA',
          vehicleId: '4',
          startedAt: '2026-11-23T09:20:40.000Z',
          finishedAt: '2026-11-23T09:21:30.000Z',
          tripStatus: 'FINISHED',
          nameSource: 'TRIP_SNAPSHOT',
        }],
      })
    }
    if (requestPath === '/fines' && options.method === 'POST') {
      listItems = [createdWithLink]
      return jsonResponse(createdWithLink, 201)
    }
    if (requestPath === `/fines/${createdWithLink.id}`) return jsonResponse(makeDetail(createdWithLink))
    return jsonResponse({ items: listItems })
  }

  renderPage(api, 'GESTOR')
  await screen.findByText('Nenhuma multa registrada.')

  const user = userEvent.setup()
  const registerButton = screen.getByRole('button', { name: 'Registrar multa' })
  await waitFor(() => assert.equal(registerButton.disabled, false))
  await user.click(registerButton)
  const dialog = await screen.findByRole('dialog', { name: 'Registrar multa ou infração' })

  await user.click(within(dialog).getByLabelText(/Veículo/))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  fireEvent.change(within(dialog).getByLabelText(/Data e hora da infração/), { target: { value: '2026-11-23T06:21' } })

  assert.ok(await within(dialog).findByText(/Viagem #99 · Motorista Fictício QA/))
  assert.ok(within(dialog).getByText('Snapshot da viagem'))

  await user.click(within(dialog).getByRole('button', { name: 'Selecionar vínculo' }))

  fireEvent.change(within(dialog).getByLabelText(/Código da infração/), { target: { value: 'QA-VINCULO' } })
  fireEvent.change(within(dialog).getByLabelText(/Valor \(R\$\)/), { target: { value: '195,23' } })
  fireEvent.change(within(dialog).getByLabelText(/Descrição da infração/), { target: { value: 'Infração fictícia em viagem' } })
  fireEvent.change(within(dialog).getByLabelText(/Origem da informação/), { target: { value: 'Órgão Fictício' } })
  fireEvent.change(within(dialog).getByLabelText(/Justificativa/), { target: { value: 'Confirmado pela escala real' } })
  fireEvent.change(within(dialog).getByLabelText(/Descrição da evidência/), { target: { value: 'Auto fictício 002' } })

  await user.click(within(dialog).getByRole('button', { name: 'Salvar multa' }))

  const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar vínculo com motorista e viagem?' })
  assert.ok(within(confirmDialog).getByText(/Snapshot da viagem/))

  // Cancela a confirmação sem gravar
  await user.click(within(confirmDialog).getByRole('button', { name: 'Cancelar e revisar' }))
  assert.equal(calls.some((call) => call.requestPath === '/fines' && call.method === 'POST'), false)

  // Salva novamente e confirma vínculo
  await user.click(within(dialog).getByRole('button', { name: 'Salvar multa' }))
  const secondConfirm = await screen.findByRole('dialog', { name: 'Confirmar vínculo com motorista e viagem?' })
  await user.click(within(secondConfirm).getByRole('button', { name: 'Confirmar vínculo e gravar' }))

  await waitFor(() => {
    assert.ok(calls.some((call) => call.requestPath === '/fines' && call.method === 'POST'))
  })
  const postCall = calls.find((call) => call.requestPath === '/fines' && call.method === 'POST')
  assert.equal(postCall.body.driverId, '1')
  assert.equal(postCall.body.tripId, '99')
})

test('exibe detalhe com snapshots e timeline, muda para Paga e permite reabrir para Pendente', async () => {
  let fine = makeFine('60', { infractionCode: 'QA-FLUXO' })
  let events = [
    {
      id: '1',
      eventType: 'REGISTERED',
      occurredAt: fine.infractionAt,
      registeredAt: fine.createdAt,
      reportedBy: 'Setor Fictício',
      reason: 'Registro inicial',
      evidenceDescription: 'Auto fictício',
      attachmentUrl: null,
      supersedesId: null,
      actor: { id: '2', name: 'Gestor Fictício', role: 'GESTOR' },
      before: null,
      after: fine,
    },
  ]

  const api = async (requestPath, options = {}) => {
    if (requestPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (requestPath === '/drivers') return jsonResponse([makeDriver()])
    if (requestPath === `/fines/${fine.id}/status` && options.method === 'PATCH') {
      const payload = JSON.parse(options.body)
      const prev = fine
      fine = {
        ...fine,
        status: payload.status,
        paidAt: payload.status === 'PAID' ? payload.paidAt : null,
        revision: fine.revision + 1,
      }
      events = [
        ...events,
        {
          id: String(events.length + 1),
          eventType: payload.status === 'PENDING' ? 'REOPENED' : payload.status,
          occurredAt: payload.paidAt ?? payload.occurredAt,
          registeredAt: '2026-11-24T12:00:00.000Z',
          reportedBy: payload.reportedBy,
          reason: payload.reason,
          evidenceDescription: payload.evidenceDescription,
          attachmentUrl: null,
          supersedesId: null,
          actor: { id: '2', name: 'Gestor Fictício', role: 'GESTOR' },
          before: prev,
          after: fine,
        },
      ]
      return jsonResponse(fine)
    }
    if (requestPath === `/fines/${fine.id}`) return jsonResponse(makeDetail(fine, events))
    return jsonResponse({ items: [fine] })
  }

  renderPage(api, 'GESTOR')
  const user = userEvent.setup()

  const detailBtn = await screen.findByRole('button', { name: 'Ver detalhes da multa #60 código QA-FLUXO' })
  await user.click(detailBtn)

  const detailDialog = await screen.findByRole('dialog', { name: 'Multa #60 — QA-FLUXO' })
  assert.ok(within(detailDialog).getByText('Retratos históricos preservados'))
  assert.ok(within(detailDialog).getByText('Trilha imutável de eventos (1)'))

  // Pagar multa
  await user.click(within(detailDialog).getByRole('button', { name: 'Registrar pagamento' }))
  const payDialog = await screen.findByRole('dialog', { name: 'Registrar pagamento #60?' })
  fireEvent.change(within(payDialog).getByLabelText(/Origem da informação/), { target: { value: 'Tesouraria Fictícia' } })
  fireEvent.change(within(payDialog).getByLabelText(/Justificativa/), { target: { value: 'Guia quitada' } })
  fireEvent.change(within(payDialog).getByLabelText(/Descrição da evidência/), { target: { value: 'Comprovante 123' } })
  await user.click(within(payDialog).getByRole('button', { name: 'Registrar pagamento' }))

  const paidDetail = await screen.findByRole('dialog', { name: 'Multa #60 — QA-FLUXO' })
  assert.ok(within(paidDetail).getByText(/Revisão 2/))
  assert.ok(within(paidDetail).getByText(/Multas com situação Paga ou Cancelada ficam bloqueadas/))
  assert.equal(within(paidDetail).queryByRole('button', { name: 'Retificar multa' }), null)

  // Reabrir multa
  await user.click(within(paidDetail).getByRole('button', { name: 'Reabrir multa' }))
  const reopenDialog = await screen.findByRole('dialog', { name: 'Reabrir multa #60?' })
  fireEvent.change(within(reopenDialog).getByLabelText(/Origem da informação/), { target: { value: 'Controle Interno' } })
  fireEvent.change(within(reopenDialog).getByLabelText(/Justificativa/), { target: { value: 'Necessita retificação de valor' } })
  fireEvent.change(within(reopenDialog).getByLabelText(/Descrição da evidência/), { target: { value: 'Despacho fictício' } })
  await user.click(within(reopenDialog).getByRole('button', { name: 'Reabrir multa' }))

  const reopenedDetail = await screen.findByRole('dialog', { name: 'Multa #60 — QA-FLUXO' })
  assert.ok(within(reopenedDetail).getByText(/Revisão 3/))
  assert.ok(within(reopenedDetail).getByText('Trilha imutável de eventos (3)'))
  assert.ok(within(reopenedDetail).getByRole('button', { name: 'Retificar multa' }))
})

test('retificação envia expectedRevision, trata conflito 409 com recarga e exige revisão de vínculo ao mudar horário', async () => {
  const fine = makeFine('70', {
    infractionCode: 'QA-RETIF',
    driverId: '1',
    tripId: '88',
    driver: { id: '1', name: 'Motorista Fictício QA' },
    driverSnapshot: {
      id: '1',
      name: 'Motorista Fictício QA',
      source: 'CURRENT_REGISTRY',
      capturedAt: '2026-11-23T09:30:00.000Z',
    },
    tripSnapshot: {
      id: '88',
      vehicleId: '4',
      driverId: '1',
      startedAt: '2026-11-23T09:20:00.000Z',
      finishedAt: '2026-11-23T09:25:00.000Z',
      status: 'FINISHED',
      capturedAt: '2026-11-23T09:30:00.000Z',
    },
    revision: 2,
  })
  const calls = []
  let detailCalls = 0

  const api = async (requestPath, options = {}) => {
    calls.push({ requestPath, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (requestPath === '/vehicles') return jsonResponse([makeVehicle()])
    if (requestPath === '/drivers') return jsonResponse([makeDriver()])
    if (requestPath.startsWith('/fines/driver-suggestions')) return jsonResponse({ items: [] })
    if (requestPath === `/fines/${fine.id}` && options.method === 'PUT') {
      return jsonResponse({ erro: 'A multa foi alterada por outra operação. Atualize os dados e tente novamente.' }, 409)
    }
    if (requestPath === `/fines/${fine.id}`) {
      detailCalls += 1
      return jsonResponse(makeDetail({ ...fine, revision: detailCalls === 1 ? 2 : 3 }))
    }
    return jsonResponse({ items: [fine] })
  }

  renderPage(api, 'GESTOR')
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Ver detalhes da multa #70 código QA-RETIF' }))
  const detailDialog = await screen.findByRole('dialog', { name: 'Multa #70 — QA-RETIF' })
  assert.equal(within(detailDialog).getAllByText(/Cadastro vigente no registro/).length, 2)

  await user.click(within(detailDialog).getByRole('button', { name: 'Retificar multa' }))
  const editDialog = await screen.findByRole('dialog', { name: 'Retificar multa #70 — QA-RETIF' })

  // Mudar horário enquanto viagem está vinculada exige revisão explícita (não limpa silenciosamente)
  fireEvent.change(within(editDialog).getByLabelText(/Data e hora da infração/), { target: { value: '2026-11-23T11:00' } })
  assert.ok(await within(editDialog).findByText(/O veículo ou a data\/hora foram alterados após o vínculo com a viagem #88/))
  await user.click(within(editDialog).getByRole('button', { name: 'Desvincular viagem' }))

  fireEvent.change(within(editDialog).getByLabelText(/Origem da informação/), { target: { value: 'Auditoria Interna' } })
  fireEvent.change(within(editDialog).getByLabelText(/Justificativa/), { target: { value: 'Correção de horário' } })
  fireEvent.change(within(editDialog).getByLabelText(/Descrição da evidência/), { target: { value: 'Registro de portaria' } })
  await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }))

  // Ainda há motorista vinculado -> confirma vínculo
  const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar vínculo com motorista?' })
  await user.click(within(confirmDialog).getByRole('button', { name: 'Confirmar vínculo e gravar' }))

  assert.ok(await within(editDialog).findByText(/A multa foi alterada por outra operação/))
  const putCall = calls.find((call) => call.method === 'PUT')
  assert.equal(putCall.body.expectedRevision, 2)
  assert.equal(putCall.body.tripId, null)

  await user.click(within(editDialog).getByRole('button', { name: 'Recarregar multa' }))
  const reloadedDetail = await screen.findByRole('dialog', { name: 'Multa #70 — QA-RETIF' })
  assert.ok(within(reloadedDetail).getByText(/Revisão 3/))
})
