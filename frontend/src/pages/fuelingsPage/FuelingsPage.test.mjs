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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-fuelings-test-'))
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
  { default: FuelingsPage },
  { AuthContext },
  fuelingForm,
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/fuelingsPage/FuelingsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/pages/fuelingsPage/fuelingForm.ts'),
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
    licensePlate: 'TQB7V05',
    brand: 'Marca Fictícia',
    model: 'Utilitário Fictício',
    year: 2024,
    vehicleType: 'Utilitário',
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

const FICTITIOUS_DRIVERS = [
  {
    id: '1',
    name: 'Condutor Fictício QA',
    cpf: '11122233344',
    cnhNumber: '99988877766',
    cnhCategory: 'D',
    cnhExpiresAt: '2028-12-31',
    phone: null,
    status: 'ACTIVE',
    userId: null,
    revision: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
]

function makeFueling(id = '1', overrides = {}) {
  return {
    id,
    vehicleId: '4',
    driverId: '1',
    fueledAt: '2026-11-22T21:40:00.000Z',
    fuelType: 'GASOLINE',
    liters: '26.375',
    totalValue: '154.60',
    odometerKm: 421,
    station: 'Posto Sintético QA',
    vehicleSnapshot: { id: '4', licensePlate: 'TQA5V23', model: 'Van Fictícia' },
    driverSnapshot: { id: '1', name: 'Condutor Fictício QA' },
    isAnnulled: false,
    ...overrides,
  }
}

function mountPage(api, { profile = 'GESTOR' } = {}) {
  document.title = 'Início — Aratu'
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/abastecimentos'] },
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
        createElement(FuelingsPage),
      ),
    ),
  )
  return userEvent.setup()
}

test('T09-P06 e RBAC: atualiza document.title para Abastecimentos e bloqueia perfis sem acesso sem consultar API', async () => {
  for (const deniedProfile of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    mountPage(async () => {
      throw new Error(`Perfil ${deniedProfile} não deveria chamar a API`)
    }, { profile: deniedProfile })
    assert.ok(screen.getByText('Seu perfil não tem permissão para consultar abastecimentos.'))
    assert.equal(document.title, 'Abastecimentos — Aratu')
    cleanup()
  }

  for (const allowedProfile of ['GESTOR', 'ADMINISTRADOR']) {
    mountPage(async (requestPath) => {
      if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
      if (requestPath === '/drivers') return Response.json(FICTITIOUS_DRIVERS)
      return Response.json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, totalLiters: '0.000', totalValue: '0.00' })
    }, { profile: allowedProfile })
    assert.ok(await screen.findByRole('button', { name: 'Registrar Abastecimento' }))
    assert.equal(document.title, 'Abastecimentos — Aratu')
    cleanup()
  }
})

test('T09-P01: vincula linhas e totais ao filtro confirmado e distingue zero real de indisponibilidade/erro', async () => {
  const itemA = makeFueling('3', { vehicleId: '4', liters: '26.375', totalValue: '154.60' })
  const itemB = makeFueling('2', {
    vehicleId: '5',
    driverId: null,
    fuelType: 'ETHANOL',
    liters: '11.125',
    totalValue: '64.50',
    odometerKm: 210,
    station: null,
    vehicleSnapshot: { id: '5', licensePlate: 'TQB7V05', model: 'Utilitário Fictício' },
    driverSnapshot: null,
  })

  let failAllInitial = true
  let failVehicle4Filter = true

  const user = mountPage(async (requestPath) => {
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath === '/drivers') return Response.json(FICTITIOUS_DRIVERS)
    if (requestPath.startsWith('/fuelings')) {
      if (failAllInitial) {
        return Response.json({ erro: 'Serviço de abastecimentos indisponível.' }, { status: 503 })
      }
      if (requestPath.includes('vehicleId=4') && failVehicle4Filter) {
        return Response.json({ erro: 'Falha ao consultar veículo 4.' }, { status: 503 })
      }
      if (requestPath.includes('vehicleId=4')) {
        return Response.json({
          items: [itemA],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
          totalLiters: '26.375',
          totalValue: '154.60',
        })
      }
      if (requestPath.includes('driverId=1') && requestPath.includes('vehicleId=5')) {
        return Response.json({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
          totalLiters: '0.000',
          totalValue: '0.00',
        })
      }
      return Response.json({
        items: [itemA, itemB],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        totalLiters: '37.500',
        totalValue: '219.10',
      })
    }
    return Response.json({})
  })

  // 1. Primeira carga com 503 não deve mostrar R$ 0,00 nem 0 L
  assert.ok(await screen.findByText('Serviço de abastecimentos indisponível.'))
  assert.equal(screen.getAllByText('Indisponível').length, 2)
  assert.equal(screen.queryByText(/R\$\s*0,00/), null)

  // 2. Recupera listagem completa -> R$ 219,10 e 37,5 L com recorte identificado
  failAllInitial = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  const indicators = screen.getByRole('region', { name: 'Indicadores do período filtrado' })
  assert.ok(await within(indicators).findByText(/R\$\s*219,10/))
  assert.ok(within(indicators).getByText(/37,5 L/))
  assert.equal(within(indicators).getAllByText(/Recorte confirmado: Todos os veículos · Todos os motoristas · Todo o período/).length, 2)

  // 3. Seleciona veículo 4 com 503 -> NÃO deve manter R$ 219,10 como válido para veículo 4
  await user.click(screen.getByRole('combobox', { name: 'Veículo' }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  assert.ok(await screen.findByText('Falha ao consultar veículo 4.'))
  assert.equal(within(indicators).getAllByText('Indisponível').length, 2)
  assert.equal(screen.queryByText(/R\$\s*219,10/), null)

  // 4. Tentar novamente traz recorte confirmado de veículo 4 (R$ 154,60 / 26,375 L)
  failVehicle4Filter = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await within(indicators).findByText(/R\$\s*154,60/))
  assert.ok(within(indicators).getByText(/26,375 L/))
  assert.equal(within(indicators).getAllByText(/Recorte confirmado: Veículo TQA5V23/).length, 2)

  // 5. Datas invertidas (De > Até) invalidam recorte sem manter totais anteriores
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-23' } })
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-22' } })
  assert.ok(await screen.findByText('A data inicial (De) não pode ser posterior à data final (Até).'))
  assert.equal(within(indicators).getAllByText('Indisponível').length, 2)

  // 6. Limpar filtros e selecionar cruzamento sem registro (veículo 5 + motorista 1) -> zero REAL
  await user.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0])
  await user.click(screen.getByRole('combobox', { name: 'Veículo' }))
  await user.click(await screen.findByRole('option', { name: /TQB7V05/ }))
  await user.click(screen.getByRole('combobox', { name: 'Motorista' }))
  await user.click(await screen.findByRole('option', { name: /Condutor Fictício QA/ }))
  assert.ok(await screen.findByText('Nenhum abastecimento encontrado'))
  assert.ok(within(indicators).getByText(/R\$\s*0,00/))
  assert.ok(within(indicators).getByText('0 L'))
})

test('T09-P02: carrega veículos e motoristas independentemente, permite gravar sem motorista quando motoristas falha e oferece reconsulta', async () => {
  let failDrivers = true
  const posts = []
  const created = makeFueling('10', {
    vehicleId: '4',
    driverId: null,
    driverSnapshot: null,
    liters: '11.125',
    totalValue: '64.50',
    odometerKm: 210,
  })
  const rows = []

  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath === '/drivers') {
      if (failDrivers) return Response.json({ erro: 'Catálogo de motoristas fora do ar.' }, { status: 503 })
      return Response.json(FICTITIOUS_DRIVERS)
    }
    if (requestPath === '/fuelings' && options.method === 'POST') {
      posts.push(JSON.parse(options.body))
      rows.push(created)
      return Response.json(created, { status: 201 })
    }
    return Response.json({
      items: rows,
      total: rows.length,
      page: 1,
      pageSize: 20,
      totalPages: rows.length > 0 ? 1 : 0,
      totalLiters: rows.length > 0 ? '11.125' : '0.000',
      totalValue: rows.length > 0 ? '64.50' : '0.00',
    })
  })

  // Motoristas falhou, mas veículos carregou e "Registrar Abastecimento" está habilitado
  assert.ok(await screen.findByText('Não foi possível carregar o catálogo de motoristas.'))
  const registerBtn = screen.getByRole('button', { name: 'Registrar Abastecimento' })
  await waitFor(() => assert.equal(registerBtn.disabled, false))

  // Abre diálogo, vê opção de recarregar motoristas e consegue gravar sem motorista
  await user.click(registerBtn)
  const dialog = await screen.findByRole('dialog', { name: 'Registrar abastecimento' })
  assert.ok(within(dialog).getByRole('button', { name: 'Recarregar motoristas' }))

  await user.click(within(dialog).getByRole('combobox', { name: /Veículo/ }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await user.click(within(dialog).getByRole('combobox', { name: /Tipo de combustível/ }))
  await user.click(await screen.findByRole('option', { name: 'Etanol' }))
  await user.type(within(dialog).getByLabelText(/Litros/), '11,125')
  await user.type(within(dialog).getByLabelText(/Valor total \(R\$\)/), '64,50')
  await user.type(within(dialog).getByLabelText(/Quilometragem \(km\)/), '210')
  await user.type(within(dialog).getByLabelText(/Justificativa do registro/), 'Abastecimento sem motorista em campo')
  await user.type(within(dialog).getByLabelText(/Descrição da evidência/), 'Cupom fiscal sintético 002')

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))

  assert.ok(await screen.findByText('Abastecimento #10 registrado com sucesso.'))
  assert.equal(posts.length, 1)
  assert.equal(posts[0].driverId, null)

  // Recupera catálogo de motoristas na própria tela
  failDrivers = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => {
    assert.equal(screen.queryByText('Não foi possível carregar o catálogo de motoristas.'), null)
  })
})

test('T09-P03: associa erros a campos em português, preserva valores digitados, foca o primeiro inválido e traduz erros da API', async () => {
  let postAttempts = 0
  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath === '/drivers') return Response.json(FICTITIOUS_DRIVERS)
    if (requestPath === '/fuelings' && options.method === 'POST') {
      postAttempts += 1
      return Response.json(
        { erro: 'A quilometragem informada conflita com a leitura de 420 km em 2026-11-22T21:40:00Z. Revise a data ou a quilometragem do abastecimento.' },
        { status: 422 },
      )
    }
    return Response.json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0, totalLiters: '0.000', totalValue: '0.00' })
  })

  await user.click(await screen.findByRole('button', { name: 'Registrar Abastecimento' }))
  const dialog = await screen.findByRole('dialog', { name: 'Registrar abastecimento' })

  // Preenche todos exceto Justificativa e informa litros = 0
  await user.click(within(dialog).getByRole('combobox', { name: /Veículo/ }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await user.click(within(dialog).getByRole('combobox', { name: /Tipo de combustível/ }))
  await user.click(await screen.findByRole('option', { name: 'Gasolina' }))
  await user.type(within(dialog).getByLabelText(/Litros/), '0')
  await user.type(within(dialog).getByLabelText(/Valor total \(R\$\)/), '153,40')
  await user.type(within(dialog).getByLabelText(/Quilometragem \(km\)/), '419')
  await user.type(within(dialog).getByLabelText(/Descrição da evidência/), 'Comprovante sintético')

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))

  // Verifica erro individual em Litros (sem expor "liters") e em Justificativa, com foco em Litros
  const litersInput = within(dialog).getByLabelText(/Litros/)
  const reasonInput = within(dialog).getByLabelText(/Justificativa do registro/)
  assert.ok(await within(dialog).findByText('Informe a quantidade de litros maior que zero.'))
  assert.ok(within(dialog).getByText('Informe a justificativa do registro.'))
  assert.equal(litersInput.getAttribute('aria-invalid'), 'true')
  assert.equal(reasonInput.getAttribute('aria-invalid'), 'true')
  assert.equal(within(dialog).queryByText(/\bliters\b|\btotalValue\b/), null)
  assert.equal(postAttempts, 0)
  await waitFor(() => assert.equal(document.activeElement, litersInput))

  // Preserva os outros valores já preenchidos
  assert.equal(within(dialog).getByLabelText(/Valor total \(R\$\)/).value, '153,40')
  assert.equal(within(dialog).getByLabelText(/Quilometragem \(km\)/).value, '419')

  // Corrige Litros e Justificativa -> envia POST e recebe 422 de quilometragem, focando Quilometragem (km)
  await user.clear(litersInput)
  await user.type(litersInput, '26,375')
  await user.type(reasonInput, 'Registro de abastecimento sintético')
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))

  const odometerInput = within(dialog).getByLabelText(/Quilometragem \(km\)/)
  await waitFor(() => assert.equal(postAttempts, 1))
  await waitFor(() => assert.equal(odometerInput.getAttribute('aria-invalid'), 'true'))
  await waitFor(() => assert.equal(document.activeElement, odometerInput))
  assert.ok(within(dialog).getAllByText(/quilometragem informada conflita com a leitura de 420 km/i).length >= 1)
})

test('T09-P07: preserva Idempotency-Key na falha incerta, anuncia espera, recupera foco, gera nova chave só se conteúdo mudar e reconcilia commit perdido', async () => {
  const keys = []
  let failPostUncertain = true
  let committedHidden = false
  let releasePendingPost = null
  const committedRecord = makeFueling('77', {
    vehicleId: '4',
    driverId: null,
    driverSnapshot: null,
    fuelType: 'GASOLINE',
    liters: '26.375',
    totalValue: '153.40',
    odometerKm: 420,
    fueledAt: '2026-11-22T18:40:00.000Z',
  })

  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/vehicles') return Response.json(FICTITIOUS_VEHICLES)
    if (requestPath === '/drivers') return Response.json(FICTITIOUS_DRIVERS)
    if (requestPath === '/fuelings' && options.method === 'POST') {
      keys.push(options.headers['Idempotency-Key'])
      if (keys.length === 1) {
        await new Promise((resolve) => { releasePendingPost = resolve })
      }
      if (failPostUncertain) {
        return Response.json({ erro: 'Tempo limite excedido no gateway.' }, { status: 504 })
      }
      return Response.json(committedRecord, { status: 201 })
    }
    if (requestPath.startsWith('/fuelings')) {
      return Response.json({
        items: committedHidden ? [committedRecord] : [],
        total: committedHidden ? 1 : 0,
        page: 1,
        pageSize: 20,
        totalPages: committedHidden ? 1 : 0,
        totalLiters: committedHidden ? '26.375' : '0.000',
        totalValue: committedHidden ? '153.40' : '0.00',
      })
    }
    return Response.json({})
  })

  await user.click(await screen.findByRole('button', { name: 'Registrar Abastecimento' }))
  const dialog = await screen.findByRole('dialog', { name: 'Registrar abastecimento' })

  await user.click(within(dialog).getByRole('combobox', { name: /Veículo/ }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  fireEvent.change(within(dialog).getByLabelText(/Data e hora/), { target: { value: '2026-11-22T15:40' } })
  await user.click(within(dialog).getByRole('combobox', { name: /Tipo de combustível/ }))
  await user.click(await screen.findByRole('option', { name: 'Gasolina' }))
  await user.type(within(dialog).getByLabelText(/Litros/), '26,375')
  await user.type(within(dialog).getByLabelText(/Valor total \(R\$\)/), '153,40')
  await user.type(within(dialog).getByLabelText(/Quilometragem \(km\)/), '420')
  await user.type(within(dialog).getByLabelText(/Justificativa do registro/), 'Teste de idempotência')
  await user.type(within(dialog).getByLabelText(/Descrição da evidência/), 'Cupom 77')

  // 1. Submete e pausa no POST -> anuncia espera com aria-busy, depois recebe 504, preserva chave e move foco para o alerta
  const clickSubmit = user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))
  assert.ok(await within(dialog).findByText('Registrando abastecimento, aguarde...'))
  const busyButton = within(dialog).getByRole('button', { name: 'Registrando...' })
  assert.equal(busyButton.disabled, true)
  assert.equal(busyButton.getAttribute('aria-busy'), 'true')
  releasePendingPost()
  await clickSubmit

  const uncertainAlert = await within(dialog).findByRole('alert')
  assert.match(uncertainAlert.textContent ?? '', /Não foi possível confirmar se o abastecimento foi gravado/)
  await waitFor(() => assert.equal(document.activeElement, uncertainAlert))

  // 2. Consulta lançamentos (ainda não gravado) -> permite reenviar com segurança com a MESMA chave
  await user.click(within(dialog).getByRole('button', { name: 'Consultar lançamentos' }))
  assert.ok(await within(dialog).findByText(/Nenhum lançamento correspondente foi encontrado/))

  const resendBtn = within(dialog).getByRole('button', { name: 'Reenviar com segurança' })
  await user.click(resendBtn)
  await waitFor(() => assert.equal(keys.length, 2))
  assert.equal(keys[0], keys[1])

  // 3. Alterar conteúdo gera uma NOVA Idempotency-Key
  const litersInput = within(dialog).getByLabelText(/Litros/)
  await user.clear(litersInput)
  await user.type(litersInput, '27,000')
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))
  await waitFor(() => assert.equal(keys.length, 3))
  assert.notEqual(keys[2], keys[1])

  // 4. Quando o servidor gravou mas a resposta 504 se perdeu, "Consultar lançamentos" reconcilia sem duplicar!
  await user.clear(litersInput)
  await user.type(litersInput, '26,375')
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abastecimento' }))
  await waitFor(() => assert.equal(keys.length, 4))
  committedHidden = true
  await user.click(within(dialog).getByRole('button', { name: 'Consultar lançamentos' }))
  assert.ok(await screen.findByText('Abastecimento #77 já estava registrado. Listagem sincronizada sem duplicidade.'))
})

test('fuelingForm helpers: tradução de erros sem jargões e assinatura canônica de idempotência', () => {
  const mappedLiters = fuelingForm.mapBackendFuelingError('Informe liters (liters) maior que zero.')
  assert.equal(mappedLiters.field, 'liters')
  assert.equal(/\bliters\b/.test(mappedLiters.message), false)

  const mappedValue = fuelingForm.mapBackendFuelingError('Informe valor total (totalValue) maior que zero.')
  assert.equal(mappedValue.field, 'totalValue')
  assert.equal(/\btotalValue\b/.test(mappedValue.message), false)

  const sig1 = fuelingForm.buildCanonicalFuelingSignature({
    vehicleId: '4',
    driverId: null,
    fueledAt: '2026-11-22T21:40:00.000Z',
    fuelType: 'GASOLINE',
    liters: '26.375',
    totalValue: '153.40',
    odometerKm: 420,
    station: ' Posto A ',
    reportedBy: 'Gestor',
    reason: 'Motivo ',
    evidenceDescription: ' Cupom ',
  })
  const sig2 = fuelingForm.buildCanonicalFuelingSignature({
    vehicleId: '4',
    driverId: null,
    fueledAt: '2026-11-22T21:40:00.000Z',
    fuelType: 'GASOLINE',
    liters: '26.375',
    totalValue: '153.40',
    odometerKm: 420,
    station: 'Posto A',
    reportedBy: 'Gestor',
    reason: 'Motivo',
    evidenceDescription: 'Cupom',
  })
  assert.equal(sig1, sig2)
})
