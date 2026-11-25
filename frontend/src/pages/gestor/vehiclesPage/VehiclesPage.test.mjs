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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vehicles-page-test-'))
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
  vehicleFilters,
  { default: VehiclesPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/gestor/vehiclesPage/vehicleFilters.ts'),
  vite.ssrLoadModule('/src/pages/gestor/vehiclesPage/VehiclesPage.tsx'),
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

function makeVehicle(overrides = {}) {
  return {
    id: '4',
    licensePlate: 'TQA5V23',
    brand: 'Marca Fictícia',
    model: 'Van QA T05',
    year: 2025,
    vehicleType: 'Van QA T05',
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
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return createElement('output', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

function mountPage(api, { profile = 'GESTOR', initialEntry = '/veiculos' } = {}) {
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
        createElement(VehiclesPage),
        createElement(LocationProbe),
      ),
    ),
  )
  return userEvent.setup()
}

test('vehicleFilters: interpreta e serializa query params válidos ignorando valores fora do contrato', () => {
  const parsed = vehicleFilters.parseVehiclesUrlParams(
    new URLSearchParams('status=INVALIDO&category=PASSENGER&operationType=X&vehicleType=Van'),
  )
  assert.deepEqual(parsed, {
    filters: { status: '', category: 'PASSENGER', operationType: '' },
    vehicleType: 'Van',
  })

  const serialized = vehicleFilters.buildVehiclesSearchParams(
    { status: 'AVAILABLE', category: 'BODY', operationType: 'SVO' },
    '  Van QA ',
  )
  assert.equal(serialized.toString(), 'status=AVAILABLE&category=BODY&operationType=SVO&vehicleType=++Van+QA+')
  assert.equal(
    vehicleFilters.describeVehicleFilters({ status: 'AVAILABLE', category: '', operationType: '' }),
    'Situação: Disponível',
  )
})

test('RBAC e título da aba: atualiza document.title e restringe leitura/escrita por perfil', async () => {
  for (const deniedProfile of ['SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO']) {
    mountPage(async () => {
      throw new Error(`Perfil ${deniedProfile} não deveria consultar /vehicles`)
    }, { profile: deniedProfile })
    assert.ok(screen.getByText('Seu perfil não tem permissão para consultar veículos.'))
    assert.equal(document.title, 'Veículos da Frota — Aratu')
    cleanup()
  }

  mountPage(async () => Response.json([makeVehicle()]), { profile: 'ATENDENTE_SVO' })
  assert.ok(await screen.findByText('TQA5V23'))
  assert.ok(screen.getByText('Seu perfil permite apenas consultar veículos.'))
  assert.equal(screen.queryByRole('button', { name: 'Cadastrar veículo' }), null)
  assert.equal(screen.queryByRole('button', { name: /Editar veículo/ }), null)
  cleanup()
  assert.equal(document.title, 'Início — Aratu')
})

test('persiste filtros nos query params da URL e restaura o recorte ao reabrir', async () => {
  const requestedPaths = []
  const user = mountPage(async (requestPath) => {
    requestedPaths.push(requestPath)
    if (requestPath.includes('status=AVAILABLE')) {
      return Response.json([makeVehicle()])
    }
    return Response.json([
      makeVehicle(),
      makeVehicle({ id: '9', licensePlate: 'TQB9M10', status: 'IN_MAINTENANCE', vehicleType: 'Furgão' }),
    ])
  })

  assert.ok(await screen.findByText('TQB9M10'))
  await user.click(screen.getByRole('combobox', { name: /Situação/ }))
  await user.click(await screen.findByRole('option', { name: 'Disponível' }))

  await waitFor(() => {
    assert.equal(screen.getByTestId('location-probe').textContent, '/veiculos?status=AVAILABLE')
  })
  assert.ok(requestedPaths.includes('/vehicles?status=AVAILABLE'))

  const savedEntry = screen.getByTestId('location-probe').textContent
  cleanup()

  const reloadCalls = []
  mountPage(async (requestPath) => {
    reloadCalls.push(requestPath)
    return Response.json([makeVehicle()])
  }, { initialEntry: savedEntry })

  assert.ok(await screen.findByText('Recorte confirmado: Situação: Disponível · 1 veículo'))
  assert.deepEqual(reloadCalls, ['/vehicles?status=AVAILABLE'])
  assert.equal(screen.getByRole('combobox', { name: /Situação/ }).textContent, 'Disponível')

  await userEvent.setup().click(screen.getByRole('button', { name: 'Limpar filtros' }))
  await waitFor(() => {
    assert.equal(screen.getByTestId('location-probe').textContent, '/veiculos')
  })
})

test('em falha 503 de novo filtro mantém recorte anterior como desatualizado, suspende ações e recupera ao tentar novamente', async () => {
  const availableVehicle = makeVehicle({ id: '4', licensePlate: 'TQA5V23', status: 'AVAILABLE' })
  let failInactive = true
  let resolvePendingInactive

  const user = mountPage(async (requestPath) => {
    if (requestPath === '/vehicles?status=INACTIVE') {
      if (failInactive) {
        return new Promise((resolve) => {
          resolvePendingInactive = () => resolve(Response.json({ erro: 'Falha temporária no serviço.' }, { status: 503 }))
        })
      }
      return Response.json([])
    }
    return Response.json([availableVehicle])
  }, { initialEntry: '/veiculos?status=AVAILABLE' })

  assert.ok(await screen.findByText('TQA5V23'))
  const editButton = screen.getByRole('button', { name: 'Editar veículo TQA5V23' })
  const statusButton = screen.getByRole('button', { name: 'Alterar situação do veículo TQA5V23' })
  assert.equal(editButton.disabled, false)
  assert.equal(statusButton.disabled, false)

  await user.click(screen.getByRole('combobox', { name: /Situação/ }))
  await user.click(await screen.findByRole('option', { name: 'Inativo' }))

  assert.ok(await screen.findByText(/Atualizando a lista para Situação: Inativo/))
  assert.equal(screen.getByRole('button', { name: 'Editar veículo TQA5V23' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Alterar situação do veículo TQA5V23' }).disabled, true)

  resolvePendingInactive()

  assert.ok(await screen.findByText('A lista exibida está desatualizada.'))
  assert.ok(screen.getByText(/Recorte exibido \(desatualizado\): Situação: Disponível · 1 veículo/))
  assert.ok(screen.getByText('TQA5V23'))
  assert.equal(screen.getByRole('button', { name: 'Editar veículo TQA5V23' }).disabled, true)
  assert.equal(screen.getByRole('button', { name: 'Alterar situação do veículo TQA5V23' }).disabled, true)
  assert.equal(screen.queryByText('Ajuste ou limpe os filtros para ver outros veículos.'), null)

  failInactive = false
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  assert.ok(await screen.findByText('Ajuste ou limpe os filtros para ver outros veículos.'))
  assert.equal(screen.queryByText('A lista exibida está desatualizada.'), null)
  assert.equal(screen.queryByText('TQA5V23'), null)
})

test('erro inicial 503 não duplica mensagem e recupera com Tentar novamente', async () => {
  let failFirst = true
  const user = mountPage(async () => {
    if (failFirst) {
      failFirst = false
      return Response.json({ erro: 'Não foi possível carregar os veículos.' }, { status: 503 })
    }
    return Response.json([makeVehicle()])
  })

  assert.equal((await screen.findAllByText('Não foi possível carregar os veículos.')).length, 1)
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('TQA5V23'))
})

test('VehicleFormDialog move o foco para o primeiro campo inválido em validação local e em placa duplicada 409', async () => {
  let postCount = 0
  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/services') {
      return Response.json([])
    }
    if (options.method === 'POST') {
      postCount += 1
      return Response.json({ erro: 'Placa já cadastrada' }, { status: 409 })
    }
    return Response.json([makeVehicle()])
  })

  await user.click(await screen.findByRole('button', { name: 'Cadastrar veículo' }))
  const dialog = await screen.findByRole('dialog', { name: 'Cadastrar veículo' })

  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Placa/))
  assert.equal(postCount, 0)

  await user.type(within(dialog).getByLabelText(/Placa/), 'ABC1D23')
  await user.type(within(dialog).getByLabelText(/^Ano/), '2101')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/^Ano/))

  await user.clear(within(dialog).getByLabelText(/^Ano/))
  await user.type(within(dialog).getByLabelText(/^Ano/), '2025')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Capacidade de passageiros/))

  await user.type(within(dialog).getByLabelText(/Capacidade de passageiros/), '4')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Limite de corpos/))

  await user.type(within(dialog).getByLabelText(/Limite de corpos/), '0')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByRole('combobox', { name: /Categorias/ }))

  await user.click(within(dialog).getByRole('combobox', { name: /Categorias/ }))
  await user.click(await screen.findByRole('option', { name: 'Passageiro' }))
  await user.keyboard('{Escape}')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Justificativa/))

  await user.type(within(dialog).getByLabelText(/Justificativa/), 'Inclusão fictícia de frota')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))

  assert.ok(await within(dialog).findByText('Placa já cadastrada'))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Placa/))
  assert.equal(postCount, 1)
})

test('VehicleStatusDialog move foco para Justificativa quando vazia, cancela com Esc e envia PATCH válido', async () => {
  const calls = []
  let current = makeVehicle({ id: '4', licensePlate: 'TQA5V23', status: 'AVAILABLE', revision: 2 })
  const user = mountPage(async (requestPath, options = {}) => {
    calls.push({ path: requestPath, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (requestPath === '/vehicles/4/status' && options.method === 'PATCH') {
      current = makeVehicle({ ...current, status: 'IN_MAINTENANCE', revision: 3 })
      return Response.json(current)
    }
    return Response.json([current])
  })

  await user.click(await screen.findByRole('button', { name: 'Alterar situação do veículo TQA5V23' }))
  const dialog = await screen.findByRole('dialog', { name: 'Alterar situação do veículo' })

  await user.click(within(dialog).getByRole('button', { name: 'Enviar para manutenção' }))
  assert.ok(await within(dialog).findByText('Informe a justificativa da mudança de situação.'))
  assert.equal(document.activeElement, within(dialog).getByLabelText(/Justificativa/))
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 0)

  await user.keyboard('{Escape}')
  await waitFor(() => {
    assert.equal(screen.queryByRole('dialog', { name: 'Alterar situação do veículo' }), null)
  })
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 0)

  await user.click(screen.getByRole('button', { name: 'Alterar situação do veículo TQA5V23' }))
  const reopenedDialog = await screen.findByRole('dialog', { name: 'Alterar situação do veículo' })
  await user.type(within(reopenedDialog).getByLabelText(/Justificativa/), 'Revisão programada fictícia')
  await user.click(within(reopenedDialog).getByRole('button', { name: 'Enviar para manutenção' }))

  assert.ok(await screen.findByText('Situação alterada para Em manutenção.'))
  const patchCall = calls.find((call) => call.method === 'PATCH')
  assert.equal(patchCall.path, '/vehicles/4/status')
  assert.deepEqual(patchCall.body, {
    status: 'IN_MAINTENANCE',
    expectedRevision: 2,
    reportedBy: 'Pessoa de teste',
    reason: 'Revisão programada fictícia',
  })
})

test('persiste filtro livre de tipo de veículo na URL e trata edição com conflito de revisão 409', async () => {
  const user = mountPage(async (requestPath, options = {}) => {
    if (requestPath === '/services') {
      return Response.json([])
    }
    if (requestPath === '/vehicles/4' && options.method === 'PUT') {
      return Response.json({ erro: 'O veículo foi alterado por outra operação.' }, { status: 409 })
    }
    return Response.json([
      makeVehicle({ id: '4', licensePlate: 'TQA5V23', vehicleType: 'Van QA T05', revision: 2 }),
      makeVehicle({ id: '9', licensePlate: 'TQB9M10', vehicleType: 'Sedan', revision: 1 }),
    ])
  })

  assert.ok(await screen.findByText('TQB9M10'))
  await user.type(screen.getByLabelText('Tipo de veículo'), 'Van')
  await waitFor(() => {
    assert.equal(screen.getByTestId('location-probe').textContent, '/veiculos?vehicleType=Van')
  })
  assert.ok(screen.getByText('TQA5V23'))
  assert.equal(screen.queryByText('TQB9M10'), null)

  await user.click(screen.getByRole('button', { name: 'Editar veículo TQA5V23' }))
  const editDialog = await screen.findByRole('dialog', { name: 'Editar veículo' })
  await user.type(within(editDialog).getByLabelText(/Justificativa/), 'Ajuste concorrente fictício')
  await user.click(within(editDialog).getByRole('button', { name: 'Atualizar' }))

  assert.ok(await screen.findByText('O veículo foi alterado por outra operação.'))
  assert.equal(screen.queryByRole('dialog', { name: 'Editar veículo' }), null)
})
