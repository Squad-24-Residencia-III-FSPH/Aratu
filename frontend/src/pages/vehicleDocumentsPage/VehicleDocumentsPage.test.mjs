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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vehicle-docs-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
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
const { MemoryRouter } = await import('react-router-dom')

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: rootDir,
  cacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  { default: VehicleDocumentsPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/vehicleDocumentsPage/VehicleDocumentsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(cleanup)
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

const FICTITIOUS_VEHICLES = [
  {
    id: '4',
    licensePlate: 'TQA5V23',
    brand: 'Marca Fictícia',
    model: 'Van Fictícia',
    year: 2025,
    vehicleType: 'Van',
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 12,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status: 'AVAILABLE',
    revision: 7,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: '5',
    licensePlate: 'TQA9Z99',
    brand: 'Marca Fictícia',
    model: 'Furgão Inativo',
    year: 2024,
    vehicleType: 'Furgão',
    ownership: 'LEASED',
    categories: ['BODY'],
    seats: 2,
    bodyLimit: 2,
    weightLimit: null,
    operationType: 'SVO',
    status: 'INACTIVE',
    revision: 2,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
]

function makeDoc(overrides = {}) {
  return {
    id: '1',
    vehicleId: '4',
    vehicle: { licensePlate: 'TQA5V23', model: 'Van Fictícia', status: 'AVAILABLE' },
    documentType: 'LICENSING',
    documentNumber: 'LIC-001',
    issuedAt: '2026-10-08',
    expiresAt: '2026-11-21',
    notes: null,
    status: 'EXPIRED',
    daysUntilExpiration: -1,
    supersedesId: null,
    supersededById: null,
    isAnnulled: false,
    annulmentReason: null,
    vehicleSnapshot: FICTITIOUS_VEHICLES[0],
    createdBy: '2',
    revision: 1,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeDetail(doc, events = []) {
  return {
    ...doc,
    events: events.length > 0 ? events : [
      {
        id: '10',
        eventType: 'REGISTERED',
        occurredAt: '2026-11-01T12:00:00.000Z',
        registeredAt: '2026-11-01T12:00:00.000Z',
        reportedBy: 'Setor de Frota Fictício',
        reason: 'Cadastro inicial QA',
        actor: { id: '2', name: 'Gestor Fictício', role: 'GESTOR' },
        before: null,
        after: doc,
      },
    ],
  }
}

function mountPage(api, { profile = 'GESTOR', initialEntry = '/vehicle-documents' } = {}) {
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
        createElement(VehicleDocumentsPage),
      ),
    ),
  )
  return userEvent.setup()
}

test('RBAC: permite GESTOR e ADMINISTRADOR e bloqueia demais perfis sem chamar a API', async () => {
  for (const deniedProfile of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    mountPage(async () => {
      throw new Error(`Perfil ${deniedProfile} não deveria consultar a API`)
    }, { profile: deniedProfile })
    assert.ok(screen.getByText('Seu perfil não tem permissão para consultar ou gerenciar documentos de veículos.'))
    cleanup()
  }

  for (const allowedProfile of ['GESTOR', 'ADMINISTRADOR']) {
    mountPage(async (requestPath) => {
      if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
      if (requestPath.startsWith('/vehicle-documents/expiring')) {
        return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
      }
      return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
    }, { profile: allowedProfile })
    assert.ok(await screen.findByRole('button', { name: 'Cadastrar documento' }))
    assert.equal(document.title, 'Documentos de Veículos — Aratu')
    cleanup()
  }
})

test('abre já filtrada por query params da URL (situação e janela de alerta) e exibe data de referência e unidade em documentos', async () => {
  const calls = []
  const expiringDoc = makeDoc({
    id: '3',
    documentType: 'CRLV',
    expiresAt: '2026-12-02',
    status: 'EXPIRING',
    daysUntilExpiration: 10,
  })

  mountPage(async (requestPath) => {
    calls.push(requestPath)
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath === '/vehicle-documents/expiring?days=15') {
      return Response.json({ referenceDate: '2026-11-22', alertDays: 15, items: [expiringDoc] })
    }
    if (requestPath === '/vehicle-documents?status=EXPIRING') {
      return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [expiringDoc] })
    }
    return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
  }, { initialEntry: '/vehicle-documents?status=EXPIRING&days=15' })

  assert.ok(await screen.findByText(/Data de referência FSPH: 22\/11\/2026 · Janela atual: 15 dia\(s\)/))
  assert.ok(screen.getByText('1 documento'))
  assert.ok(screen.getAllByText('TQA5V23').length >= 1)
  assert.ok(screen.getAllByText('CRLV').length >= 1)
  assert.ok(screen.getAllByText('02/12/2026').length >= 1)
  assert.ok(calls.includes('/vehicle-documents/expiring?days=15'))
  assert.ok(calls.includes('/vehicle-documents?status=EXPIRING'))
})

test('trata parâmetro days inválido na URL sem quebrar e exibe estados carregando, erro, parcial e vazio', async () => {
  let failList = true
  let failVehicles = true
  const user = mountPage(async (requestPath) => {
    if (requestPath === '/vehicles') {
      return failVehicles ? Response.json({ erro: 'Falha ao carregar veículos.' }, { status: 503 }) : Response.json(FICTITIOUS_VEHICLES)
    }
    if (requestPath.startsWith('/vehicle-documents/expiring')) {
      return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
    }
    return failList
      ? Response.json({ erro: 'Serviço de documentos indisponível.' }, { status: 503 })
      : Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
  }, { initialEntry: '/vehicle-documents?days=366' })

  assert.ok(await screen.findByText('Informe a janela do alerta como número inteiro entre 1 e 365 dias.'))
  assert.ok(await screen.findByText('Serviço de documentos indisponível.'))
  assert.ok(screen.getByText('Não foi possível carregar o catálogo completo de veículos para filtro.'))

  failList = false
  failVehicles = false
  const retryButtons = screen.getAllByRole('button', { name: 'Tentar novamente' })
  await user.click(retryButtons[retryButtons.length - 1])
  assert.ok(await screen.findByText('Nenhum documento cadastrado.'))
})

test('cadastro valida campos condicionais (Outro exige observações, emissão futura, vencimento anterior) e conflito 409', async () => {
  let postCount = 0
  let conflictNext = true
  const createdDoc = makeDoc({
    id: '20',
    documentType: 'OTHER',
    documentNumber: null,
    issuedAt: '2026-11-20',
    expiresAt: '2026-12-30',
    notes: 'Autorização especial fictícia',
    status: 'VALID',
    daysUntilExpiration: 38,
  })
  const docs = []

  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath.startsWith('/vehicle-documents/expiring')) {
      return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: [] })
    }
    if (requestPath === '/vehicle-documents' && options.method === 'POST') {
      postCount += 1
      if (conflictNext) {
        conflictNext = false
        return Response.json(
          { erro: 'Já existe documento deste tipo com o mesmo vencimento para o veículo.' },
          { status: 409 },
        )
      }
      docs.push(createdDoc)
      return Response.json(createdDoc, { status: 201 })
    }
    return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: docs })
  })

  await user.click(await screen.findByRole('button', { name: 'Cadastrar documento' }))
  const dialog = await screen.findByRole('dialog', { name: 'Cadastrar documento' })

  await user.click(within(dialog).getByRole('combobox', { name: /Veículo/ }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await user.click(within(dialog).getByRole('combobox', { name: /Tipo de documento/ }))
  await user.click(await screen.findByRole('option', { name: 'Outro' }))

  fireEvent.change(within(dialog).getByLabelText(/Data de emissão/), { target: { value: '2026-11-23' } })
  fireEvent.change(within(dialog).getByLabelText(/Data de vencimento/), { target: { value: '2026-11-20' } })
  await user.type(within(dialog).getByLabelText(/Origem da informação/), 'Setor Fictício')
  await user.type(within(dialog).getByLabelText(/Justificativa/), 'Cadastro inicial')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar documento' }))

  assert.ok(await within(dialog).findByText('A data de emissão não pode estar no futuro.'))
  assert.ok(within(dialog).getByText('O vencimento não pode ser anterior à emissão.'))
  assert.ok(within(dialog).getByText('Descreva o documento em observações quando o tipo for Outro.'))
  assert.equal(postCount, 0)

  fireEvent.change(within(dialog).getByLabelText(/Data de emissão/), { target: { value: '2026-11-20' } })
  fireEvent.change(within(dialog).getByLabelText(/Data de vencimento/), { target: { value: '2026-12-30' } })
  await user.type(within(dialog).getByLabelText(/Observações/), 'Autorização especial fictícia')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar documento' }))

  assert.ok(await within(dialog).findByText('Já existe documento deste tipo com o mesmo vencimento para o veículo.'))
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar documento' }))

  assert.ok(await screen.findByText('Documento #20 (Outro · TQA5V23) cadastrado com sucesso.'))
  assert.equal(postCount, 2)
})

test('correção envia apenas campos editáveis, renovação pré-preenche veículo/tipo e anulação usa ConfirmDialog', async () => {
  const docA = makeDoc({
    id: '3',
    documentType: 'CRLV',
    expiresAt: '2026-12-02',
    status: 'EXPIRING',
    daysUntilExpiration: 10,
    revision: 1,
  })
  const docR = makeDoc({
    id: '7',
    documentType: 'CRLV',
    expiresAt: '2027-10-31',
    status: 'VALID',
    daysUntilExpiration: 343,
    supersedesId: '3',
    revision: 1,
  })
  const calls = []
  let currentDocs = [docA]

  const user = mountPage(async (requestPath, options = {}) => {
    calls.push({ path: requestPath, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath.startsWith('/vehicle-documents/expiring')) {
      return Response.json({
        referenceDate: '2026-11-22',
        alertDays: 30,
        items: currentDocs.filter((item) => item.status === 'EXPIRED' || item.status === 'EXPIRING'),
      })
    }
    if (requestPath === '/vehicle-documents/3' && (!options.method || options.method === 'GET')) {
      return Response.json(makeDetail(currentDocs.find((d) => d.id === '3')))
    }
    if (requestPath === '/vehicle-documents/7' && (!options.method || options.method === 'GET')) {
      return Response.json(makeDetail(currentDocs.find((d) => d.id === '7')))
    }
    if (requestPath === '/vehicle-documents/3' && options.method === 'PUT') {
      const updated = { ...docA, expiresAt: '2026-12-05', revision: 2, daysUntilExpiration: 13 }
      currentDocs = [updated]
      return Response.json(updated)
    }
    if (requestPath === '/vehicle-documents' && options.method === 'POST') {
      const renewedA = { ...currentDocs[0], status: 'RENEWED', supersededById: '7' }
      currentDocs = [renewedA, docR]
      return Response.json(docR, { status: 201 })
    }
    if (requestPath === '/vehicle-documents/7/annul' && options.method === 'PATCH') {
      const annulledR = { ...docR, isAnnulled: true, status: 'ANNULLED', annulmentReason: 'Lançado com erro', revision: 2 }
      const reactivatedA = { ...docA, expiresAt: '2026-12-05', revision: 2, status: 'EXPIRING', supersededById: null, daysUntilExpiration: 13 }
      currentDocs = [reactivatedA, annulledR]
      return Response.json(annulledR)
    }
    return Response.json({ referenceDate: '2026-11-22', alertDays: 30, items: currentDocs })
  })

  // 1. Corrigir documento #3
  await user.click(await screen.findByRole('button', { name: 'Corrigir documento CRLV do veículo TQA5V23' }))
  const editDialog = await screen.findByRole('dialog', { name: 'Corrigir documento #3' })
  fireEvent.change(within(editDialog).getByLabelText(/Data de vencimento/), { target: { value: '2026-12-05' } })
  await user.type(within(editDialog).getByLabelText(/Origem da informação/), 'Gestor QA')
  await user.type(within(editDialog).getByLabelText(/Justificativa/), 'Correção de data')
  await user.click(within(editDialog).getByRole('button', { name: 'Salvar correção' }))

  assert.ok(await screen.findByText('Documento #3 (CRLV · TQA5V23) corrigido com sucesso.'))
  const putCall = calls.find((call) => call.method === 'PUT')
  assert.ok(putCall)
  assert.equal(putCall.body.expectedRevision, 1)
  assert.equal('vehicleId' in putCall.body, false)
  assert.equal('documentType' in putCall.body, false)

  // 2. Renovar documento #3
  const renewButtons = screen.getAllByRole('button', { name: 'Renovar documento CRLV do veículo TQA5V23' })
  await user.click(renewButtons[renewButtons.length - 1])
  const renewDialog = await screen.findByRole('dialog', { name: 'Renovar documento #3' })
  fireEvent.change(within(renewDialog).getByLabelText(/Data de vencimento/), { target: { value: '2027-10-31' } })
  await user.type(within(renewDialog).getByLabelText(/Origem da informação/), 'Detran Fictício')
  await user.type(within(renewDialog).getByLabelText(/Justificativa/), 'CRLV 2027 emitido')
  await user.click(within(renewDialog).getByRole('button', { name: 'Registrar renovação' }))

  assert.ok(await screen.findByText('Renovação #7 (CRLV · TQA5V23) registrada com sucesso.'))
  const postCall = calls.find((call) => call.method === 'POST')
  assert.equal(postCall.body.supersedesId, '3')
  assert.equal(postCall.body.vehicleId, '4')
  assert.equal(postCall.body.documentType, 'CRLV')

  // 3. Abrir detalhe de #7, navegar para #3 e voltar para #7, depois anular #7
  const detailButtons = screen.getAllByRole('button', { name: 'Ver detalhes do documento CRLV do veículo TQA5V23' })
  await user.click(detailButtons[detailButtons.length - 1])
  const detailDialog = await screen.findByRole('dialog', { name: /Documento #7/ })
  assert.ok(within(detailDialog).getByText('Este documento substitui o documento anterior #3.'))
  assert.equal(within(detailDialog).queryByText(/@/), null)
  await user.click(within(detailDialog).getByRole('button', { name: 'Abrir anterior #3' }))
  assert.ok(await screen.findByRole('dialog', { name: /Documento #3/ }))
  await user.click(screen.getByRole('button', { name: 'Abrir renovação #7' }))
  assert.ok(await screen.findByRole('dialog', { name: /Documento #7/ }))
  await user.click(screen.getByRole('button', { name: 'Anular documento' }))

  const annulDialog = await screen.findByRole('dialog', { name: 'Anular documento #7?' })
  assert.ok(within(annulDialog).getByText(/o documento anterior voltará automaticamente a ficar vigente/))
  await user.type(within(annulDialog).getByLabelText(/Origem da informação/), 'Gestor QA')
  await user.type(within(annulDialog).getByLabelText(/Justificativa da anulação/), 'Lançado com erro')
  await user.click(within(annulDialog).getByRole('button', { name: 'Confirmar anulação' }))

  assert.ok(await screen.findByText('Documento #7 (CRLV · TQA5V23) anulado com preservação histórica.'))
  const patchCall = calls.find((call) => call.method === 'PATCH')
  assert.equal(patchCall.path, '/vehicle-documents/7/annul')
  assert.equal(patchCall.body.expectedRevision, 1)
})
