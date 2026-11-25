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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-services-test-'))

const dom = new JSDOM('<!doctype html><html lang="pt-BR"><head><title>Início — Aratu</title></head><body></body></html>', {
  url: 'http://localhost/#/tipos-de-servico',
})
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

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../../..', import.meta.url)),
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [{ default: ServicesPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/gestor/servicePage/ServicesPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => {
  cleanup()
  dom.window.document.title = 'Início — Aratu'
})

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

function makeService(id, overrides = {}) {
  return {
    id: String(id),
    name: `Serviço Fictício ${id}`,
    description: `Descrição fictícia ${id}`,
    categories: ['PASSENGER'],
    requiresTriage: false,
    requiresWeight: false,
    requiresIdentification: false,
    active: true,
    revision: 1,
    ...overrides,
  }
}

function makeVehicle(id, overrides = {}) {
  return {
    id: String(id),
    licensePlate: `TQA${id}V00`,
    brand: 'Marca Fictícia',
    model: `Modelo ${id}`,
    year: 2025,
    vehicleType: 'Sedan',
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 5,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status: 'AVAILABLE',
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(ServicesPage)))
}

async function closeVehicleListbox(user, dialog) {
  await user.keyboard('{Escape}')
  await waitFor(() => assert.ok(!screen.queryByRole('listbox'), 'A lista de viaturas deve fechar com Escape.'))
  await within(dialog).findByRole('textbox', { name: 'Justificativa' })
}

test('T07-P06: atualiza document.title e renderiza ícones distintos para Ativo e Inativo', async () => {
  const services = [
    makeService(1, { name: 'Transporte Administrativo', active: true }),
    makeService(2, { name: 'Remoção Desativada', active: false }),
  ]
  const api = async (url) => {
    if (url === '/services') return jsonResponse(services)
    if (url === '/vehicles') return jsonResponse([])
    if (url === '/services/1/vehicles') return jsonResponse({ serviceId: '1', revision: 1, vehicles: [] })
    if (url === '/services/2/vehicles') return jsonResponse({ serviceId: '2', revision: 1, vehicles: [] })
    return jsonResponse({}, 404)
  }

  const { unmount } = renderPage(api)
  assert.equal(dom.window.document.title, 'Tipos de serviço — Aratu')

  await screen.findByText('Transporte Administrativo')
  const activeChip = screen.getByText('Ativo').closest('.MuiChip-root')
  const inactiveChip = screen.getByText('Inativo').closest('.MuiChip-root')
  assert.ok(activeChip)
  assert.ok(inactiveChip)
  const activeIcon = activeChip.querySelector('svg[data-testid]')
  const inactiveIcon = inactiveChip.querySelector('svg[data-testid]')
  assert.ok(activeIcon)
  assert.ok(inactiveIcon)
  assert.notEqual(activeIcon.getAttribute('data-testid'), inactiveIcon.getAttribute('data-testid'))

  unmount()
  assert.equal(dom.window.document.title, 'Início — Aratu')
})

test('T07-P03: falha em GET de vínculos de um serviço preserva catálogo e permite nova consulta por serviço', async () => {
  const services = [
    makeService(1, { name: 'Serviço Ativo A' }),
    makeService(2, { name: 'Serviço Sintético B' }),
  ]
  const vehicle = makeVehicle(4, { licensePlate: 'TQA5V23' })
  let service2Attempts = 0

  const api = async (url) => {
    if (url === '/services') return jsonResponse(services)
    if (url === '/vehicles') return jsonResponse([vehicle])
    if (url === '/services/1/vehicles') return jsonResponse({ serviceId: '1', revision: 1, vehicles: [vehicle] })
    if (url === '/services/2/vehicles') {
      service2Attempts += 1
      if (service2Attempts === 1) {
        return jsonResponse({ erro: 'Serviço de vínculos temporariamente indisponível.' }, 503)
      }
      return jsonResponse({ serviceId: '2', revision: 1, vehicles: [] })
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Serviço Ativo A')
  assert.ok(screen.getByText('Serviço Sintético B'))
  assert.ok(screen.getByText('1 veículo'))
  assert.ok(await screen.findByText('Leitura parcial dos veículos compatíveis'))
  assert.ok(screen.getByText('Falha ao consultar'))

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Consultar novamente veículos compatíveis de Serviço Sintético B' }))

  await waitFor(() => {
    assert.equal(screen.queryByText('Leitura parcial dos veículos compatíveis'), null)
  })
  assert.ok(screen.getByText('0 veículos'))
  assert.equal(service2Attempts, 2)
})

test('T07-P02: veículo inativo fica indisponível para nova seleção e vínculo histórico é preservado', async () => {
  const services = [makeService(4, { name: 'Serviço Teste Frota' })]
  const activeVehicle = makeVehicle(4, { licensePlate: 'TQA5V23', status: 'AVAILABLE' })
  const inactiveVehicle = makeVehicle(5, { licensePlate: 'TQB7V05', status: 'INACTIVE' })
  const historicalInactive = makeVehicle(6, { licensePlate: 'TQH9V06', status: 'INACTIVE' })

  const calls = []
  const api = async (url, req = {}) => {
    calls.push({ url, req })
    if (url === '/services') return jsonResponse(services)
    if (url === '/vehicles') return jsonResponse([activeVehicle, inactiveVehicle, historicalInactive])
    if (url === '/services/4/vehicles' && !req.method) {
      return jsonResponse({ serviceId: '4', revision: 1, vehicles: [historicalInactive] })
    }
    if (url === '/services/4' && req.method === 'PUT') {
      return jsonResponse({ ...services[0], description: 'Descrição atualizada', revision: 2 })
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Serviço Teste Frota')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Editar tipo de serviço Serviço Teste Frota' }))

  const dialog = await screen.findByRole('dialog')
  assert.ok(within(dialog).getByText('TQH9V06 (inativo)'))

  await user.click(within(dialog).getByRole('combobox', { name: 'Veículos compatíveis' }))
  const listbox = await screen.findByRole('listbox')
  const inactiveOption = within(listbox).getByRole('option', { name: /TQB7V05/ })
  assert.equal(inactiveOption.getAttribute('aria-disabled'), 'true')
  const activeOption = within(listbox).getByRole('option', { name: /TQA5V23/ })
  assert.notEqual(activeOption.getAttribute('aria-disabled'), 'true')

  await closeVehicleListbox(user, dialog)
  const descriptionInput = within(dialog).getByRole('textbox', { name: 'Descrição' })
  await user.clear(descriptionInput)
  await user.type(descriptionInput, 'Descrição atualizada')
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa' }), 'Atualizar descrição preservando vínculo')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))

  await waitFor(() => {
    assert.ok(screen.getByText(/Tipo de serviço “Serviço Teste Frota” atualizado\./))
  })
  assert.equal(calls.some((call) => call.url === '/services/4/vehicles' && call.req.method === 'PUT'), false)
})

test('T07-P02/P07: falha apenas no PUT de vínculos na edição não fecha diálogo nem exibe falso sucesso', async () => {
  const services = [makeService(4, { name: 'Serviço Edição Parcial', revision: 2 })]
  const vehicle = makeVehicle(4, { licensePlate: 'TQA5V23', status: 'AVAILABLE' })
  const calls = []

  const api = async (url, req = {}) => {
    calls.push({ url, req })
    if (url === '/services') return jsonResponse(services)
    if (url === '/vehicles') return jsonResponse([vehicle])
    if (url === '/services/4/vehicles' && !req.method) {
      return jsonResponse({ serviceId: '4', revision: 2, vehicles: [] })
    }
    if (url === '/services/4/vehicles' && req.method === 'PUT') {
      return jsonResponse({ erro: 'Veículo TQB7V05 está inativo e não pode ser vinculado.' }, 400)
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Serviço Edição Parcial')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Editar tipo de serviço Serviço Edição Parcial' }))

  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('combobox', { name: 'Veículos compatíveis' }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await closeVehicleListbox(user, dialog)
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa' }), 'Vincular viatura')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))

  const alert = await within(dialog).findByRole('alert')
  assert.match(alert.textContent ?? '', /Veículo TQB7V05 está inativo e não pode ser vinculado/)
  assert.ok(!screen.queryByText(/Alteração parcialmente concluída/))
  assert.equal(within(dialog).getByRole('textbox', { name: 'Justificativa' }).value, 'Vincular viatura')
  assert.equal(calls.filter((c) => c.url === '/services/4' && c.req.method === 'PUT').length, 0)
})

test('T07-P04: foca primeiro campo inválido no cadastro e na inativação, e associa 409 ao campo Nome', async () => {
  const services = [makeService(1, { name: 'Transporte Existente' })]
  const api = async (url, req = {}) => {
    if (url === '/services' && !req.method) return jsonResponse(services)
    if (url === '/vehicles') return jsonResponse([])
    if (url === '/services/1/vehicles') return jsonResponse({ serviceId: '1', revision: 1, vehicles: [] })
    if (url === '/services' && req.method === 'POST') {
      return jsonResponse({ erro: 'Tipo de serviço já cadastrado' }, 409)
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Transporte Existente')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Novo tipo' }))
  const dialog = await screen.findByRole('dialog')
  const nameInput = within(dialog).getByRole('textbox', { name: /Nome/ })
  await waitFor(() => assert.equal(dom.window.document.activeElement, nameInput))

  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar tipo' }))
  assert.ok(await within(dialog).findByText('Informe o nome do tipo de serviço.'))
  assert.ok(within(dialog).getByText('Informe a justificativa da alteração.'))
  assert.equal(nameInput.getAttribute('aria-invalid'), 'true')
  assert.equal(dom.window.document.activeElement, nameInput)

  await user.type(nameInput, 'transporte existente')
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa' }), 'Teste 409')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar tipo' }))

  await waitFor(() => {
    assert.ok(within(dialog).getByText('Tipo de serviço já cadastrado'))
  })
  assert.equal(nameInput.getAttribute('aria-invalid'), 'true')
  assert.equal(dom.window.document.activeElement, nameInput)

  await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
  await user.click(screen.getByRole('button', { name: 'Inativar tipo de serviço Transporte Existente' }))
  const statusDialog = await screen.findByRole('dialog')
  const statusReason = within(statusDialog).getByRole('textbox', { name: 'Justificativa' })
  await user.click(within(statusDialog).getByRole('button', { name: 'Inativar tipo' }))
  assert.ok(await within(statusDialog).findByText('Informe a justificativa da mudança de situação.'))
  assert.equal(statusReason.getAttribute('aria-invalid'), 'true')
  assert.equal(dom.window.document.activeElement, statusReason)
})

test('T07-P07: POST salvo + falha no PUT mantém ID, seleção e justificativa no diálogo e retoma sem duplicar', async () => {
  let servicesList = []
  let linkedVehicles = []
  let postCount = 0
  let putVehiclesCount = 0

  const vehicle = makeVehicle(4, { licensePlate: 'TQA5V23', status: 'AVAILABLE' })

  const api = async (url, req = {}) => {
    if (url === '/services' && !req.method) return jsonResponse(servicesList)
    if (url === '/vehicles') return jsonResponse([vehicle])
    if (url === '/services/10/vehicles' && !req.method) {
      return jsonResponse({ serviceId: '10', revision: servicesList[0]?.revision ?? 1, vehicles: linkedVehicles })
    }
    if (url === '/services' && req.method === 'POST') {
      postCount += 1
      const created = makeService(10, { name: 'Novo Serviço Reconciliado', description: null, revision: 1 })
      servicesList = [created]
      return jsonResponse(created, 201)
    }
    if (url === '/services/10/vehicles' && req.method === 'PUT') {
      putVehiclesCount += 1
      if (putVehiclesCount === 1) {
        return jsonResponse({ erro: 'Falha transitória ao vincular veículos.' }, 503)
      }
      linkedVehicles = [vehicle]
      servicesList = [{ ...servicesList[0], revision: 2 }]
      return jsonResponse({ serviceId: '10', revision: 2, vehicles: linkedVehicles })
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Nenhum tipo de serviço cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Novo tipo' }))

  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: /Nome/ }), 'Novo Serviço Reconciliado')
  await user.click(within(dialog).getByRole('combobox', { name: 'Veículos compatíveis' }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await closeVehicleListbox(user, dialog)
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa' }), 'Habilitar veículo no serviço')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar tipo' }))

  const alert = await within(dialog).findByRole('alert')
  assert.match(alert.textContent ?? '', /ID 10/)
  assert.match(alert.textContent ?? '', /ainda não foram atualizados|não foram atualizados/)
  assert.equal(within(dialog).getByRole('textbox', { name: 'Justificativa' }).value, 'Habilitar veículo no serviço')
  assert.ok(within(dialog).getByText('TQA5V23'))
  assert.equal(postCount, 1)

  await user.click(within(dialog).getByRole('button', { name: 'Salvar veículos compatíveis' }))
  await waitFor(() => {
    assert.ok(screen.getByText(/Tipo de serviço “Novo Serviço Reconciliado” cadastrado com os veículos compatíveis\./))
  })
  assert.equal(postCount, 1)
  assert.equal(putVehiclesCount, 2)
})

test('reconcilia resultado incerto (503 após commit no POST) consultando estado antes de gravar e evita duplicidade', async () => {
  let servicesList = []
  let postCount = 0
  let putVehiclesCount = 0
  const vehicle = makeVehicle(4, { licensePlate: 'TQA5V23', status: 'AVAILABLE' })

  const api = async (url, req = {}) => {
    if (url === '/services' && !req.method) return jsonResponse(servicesList)
    if (url === '/vehicles') return jsonResponse([vehicle])
    if (url === '/services' && req.method === 'POST') {
      postCount += 1
      servicesList = [makeService(15, { name: 'Serviço Commitado Sem Resposta', description: null, revision: 1 })]
      return jsonResponse({ erro: 'Gateway timeout' }, 504)
    }
    if (url === '/services/15/vehicles' && req.method === 'PUT') {
      putVehiclesCount += 1
      servicesList = [{ ...servicesList[0], revision: 2 }]
      return jsonResponse({ serviceId: '15', revision: 2, vehicles: [vehicle] })
    }
    if (url === '/services/15/vehicles' && !req.method) {
      return jsonResponse({ serviceId: '15', revision: servicesList[0]?.revision ?? 1, vehicles: [vehicle] })
    }
    return jsonResponse({}, 404)
  }

  renderPage(api)
  await screen.findByText('Nenhum tipo de serviço cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Novo tipo' }))

  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: /Nome/ }), 'Serviço Commitado Sem Resposta')
  await user.click(within(dialog).getByRole('combobox', { name: 'Veículos compatíveis' }))
  await user.click(await screen.findByRole('option', { name: /TQA5V23/ }))
  await closeVehicleListbox(user, dialog)
  await user.type(within(dialog).getByRole('textbox', { name: 'Justificativa' }), 'Cadastro com perda de resposta')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar tipo' }))

  const alert = await within(dialog).findByRole('alert')
  assert.match(alert.textContent ?? '', /ID 15/)
  assert.match(alert.textContent ?? '', /já foi cadastrado/)
  assert.equal(postCount, 1)

  await user.click(within(dialog).getByRole('button', { name: 'Salvar veículos compatíveis' }))
  await waitFor(() => {
    assert.ok(screen.getByText(/cadastrado com os veículos compatíveis\./))
  })
  assert.equal(postCount, 1)
  assert.equal(putVehiclesCount, 1)
})

test('RBAC: perfil sem permissão recebe feedback de acesso restrito sem consultar API', async () => {
  let called = 0
  const api = async () => {
    called += 1
    return jsonResponse([])
  }
  renderPage(api, 'SOLICITANTE')
  assert.ok(await screen.findByText('Acesso restrito'))
  assert.equal(called, 0)
})
