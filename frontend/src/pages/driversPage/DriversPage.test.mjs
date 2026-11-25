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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l06-test-'))

const dom = new JSDOM('<!doctype html><html><head><title>Entrar — Aratu</title></head><body></body></html>', {
  url: 'http://localhost/',
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

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const [{ default: DriversPage }, { AuthContext }, helper, service] = await Promise.all([
  vite.ssrLoadModule('/src/pages/driversPage/DriversPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/pages/driversPage/driverFormHelper.ts'),
  vite.ssrLoadModule('/src/services/driversService.ts'),
])

afterEach(() => {
  cleanup()
  dom.window.document.title = 'Entrar — Aratu'
})

after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

function makeDriver(id, overrides = {}) {
  return {
    id: String(id),
    name: `Motorista Fictício ${id}`,
    cpf: '12345678901',
    cnhNumber: `CNH${id}`,
    cnhCategory: 'B',
    cnhExpiresAt: '2027-05-20',
    phone: null,
    status: 'ACTIVE',
    userId: null,
    revision: 1,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-02T14:30:00.000Z',
    ...overrides,
  }
}

function makeEligibleAccount(id, overrides = {}) {
  return {
    id: String(id),
    name: `Conta Fictícia ${id}`,
    email: `conta${id}@exemplo.invalid`,
    ...overrides,
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(DriversPage)))
}

test('T06-P08: atualiza document.title para Motoristas — Aratu e restaura ao sair', async () => {
  const view = renderPage(async () => jsonResponse([]))
  await screen.findByText('Nenhum motorista cadastrado')
  assert.equal(document.title, 'Motoristas — Aratu')
  view.unmount()
  assert.equal(document.title, 'Entrar — Aratu')
})

test('T06-P01 e T06-P02: gestor e administrador consomem /drivers/eligible-accounts desacoplado de filtro e sem /users', async () => {
  const seen = []
  const inactiveDriver = makeDriver(2, { status: 'INACTIVE', userId: null })
  const api = async (path) => {
    seen.push(path)
    if (path === '/drivers?status=INACTIVE') return jsonResponse([inactiveDriver])
    if (path === '/drivers/eligible-accounts') {
      return jsonResponse([makeEligibleAccount(9, { name: 'Conta Livre QA' })])
    }
    if (path === '/drivers/eligible-accounts?driverId=2') {
      return jsonResponse([makeEligibleAccount(9, { name: 'Conta Livre QA' })])
    }
    return jsonResponse([makeDriver(1, { status: 'ACTIVE', userId: '4' }), inactiveDriver])
  }

  renderPage(api, 'GESTOR')
  await screen.findByText('Motorista Fictício 1')

  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Filtrar por situação' }))
  await user.click(await screen.findByRole('option', { name: 'Inativo' }))
  await waitFor(() => assert.equal(screen.queryByText('Motorista Fictício 1'), null))
  assert.ok(screen.getByText('Motorista Fictício 2'))

  await user.click(screen.getByRole('button', { name: 'Cadastrar Motorista' }))
  const accountSelect = await screen.findByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' })
  await waitFor(() => assert.equal(accountSelect.getAttribute('aria-disabled'), null))
  await user.click(accountSelect)

  assert.equal(screen.queryByRole('option', { name: /Conta Já Vinculada/ }), null)
  assert.ok(await screen.findByRole('option', { name: /Conta Livre QA/ }))
  assert.equal(seen.some((path) => path.startsWith('/users')), false)
  assert.ok(seen.includes('/drivers/eligible-accounts'))
})

test('T06-P02: trata 409 concorrente de conta vinculada no campo, preserva dados e atualiza catálogo', async () => {
  let account9Taken = false
  const api = async (path, request = {}) => {
    if (path === '/drivers' && request.method === 'POST') {
      return jsonResponse({ erro: 'Esta conta já está vinculada a outro motorista.' }, 409)
    }
    if (path === '/drivers/eligible-accounts') {
      return jsonResponse(
        account9Taken
          ? [makeEligibleAccount(12, { name: 'Conta Reserva' })]
          : [makeEligibleAccount(9, { name: 'Conta Disputada' }), makeEligibleAccount(12, { name: 'Conta Reserva' })],
      )
    }
    return jsonResponse([])
  }

  renderPage(api, 'GESTOR')
  await screen.findByText('Nenhum motorista cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar Motorista' }))

  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Condutor Concorrente')
  await user.type(screen.getByRole('textbox', { name: 'CPF' }), '12345678901')
  await user.type(screen.getByRole('textbox', { name: 'Número da CNH' }), '99887766')
  await user.click(screen.getByRole('combobox', { name: 'Categoria da CNH' }))
  await user.click(await screen.findByRole('option', { name: 'D', exact: true }))
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2027-08-10' } })
  const accountSelect = screen.getByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' })
  await waitFor(() => assert.equal(accountSelect.getAttribute('aria-disabled'), null))
  await user.click(accountSelect)
  await user.click(await screen.findByRole('option', { name: /Conta Disputada/ }))
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Teste 409 concorrente')

  account9Taken = true
  await user.click(screen.getByRole('button', { name: 'Cadastrar', exact: true }))

  const conflictMessage = await screen.findByText(/Esta conta já está vinculada a outro motorista/)
  assert.ok(conflictMessage)
  assert.equal(screen.getAllByText(/Esta conta já está vinculada a outro motorista/).length, 1)
  assert.equal(screen.getByRole('textbox', { name: 'Nome completo' }).value, 'Condutor Concorrente')
  assert.equal(screen.getByRole('textbox', { name: 'Justificativa' }).value, 'Teste 409 concorrente')

  await waitFor(() => {
    assert.equal(document.activeElement, screen.getByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' }))
  })
  await user.click(screen.getByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' }))
  assert.equal(screen.queryByRole('option', { name: /Conta Disputada/ }), null)
  assert.ok(await screen.findByRole('option', { name: /Conta Reserva/ }))
})

test('T06-P05: oferece nova tentativa quando catálogo falha com 503 preservando entradas preenchidas', async () => {
  let eligibleCalls = 0
  const api = async (path) => {
    if (path.startsWith('/drivers/eligible-accounts')) {
      eligibleCalls += 1
      if (eligibleCalls === 1) return jsonResponse({ erro: 'Catálogo temporariamente indisponível.' }, 503)
      return jsonResponse([makeEligibleAccount(9, { name: 'Conta Recuperada' })])
    }
    return jsonResponse([])
  }

  renderPage(api, 'ADMINISTRADOR')
  await screen.findByText('Nenhum motorista cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar Motorista' }))

  await screen.findByRole('alert')
  assert.ok(screen.getByText(/Catálogo temporariamente indisponível/))

  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Nome Preservado')
  await user.type(screen.getByRole('textbox', { name: 'CPF' }), '12345678901')
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Motivo preservado')

  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => assert.equal(screen.queryByText(/Catálogo temporariamente indisponível/), null))

  assert.equal(screen.getByRole('textbox', { name: 'Nome completo' }).value, 'Nome Preservado')
  assert.equal(screen.getByRole('textbox', { name: 'CPF' }).value, '123.456.789-01')
  assert.equal(screen.getByRole('textbox', { name: 'Justificativa' }).value, 'Motivo preservado')

  await user.click(screen.getByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' }))
  assert.ok(await screen.findByRole('option', { name: /Conta Recuperada/ }))
})

test('T06-P03: move foco ao primeiro campo inválido no cadastro e na mudança de situação', async () => {
  const driver = makeDriver(10)
  const api = async (path) => {
    if (path.startsWith('/drivers/eligible-accounts')) return jsonResponse([])
    return jsonResponse([driver])
  }
  renderPage(api)
  await screen.findByText('Motorista Fictício 10')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Cadastrar Motorista' }))
  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), '   ')
  await user.click(screen.getByRole('button', { name: 'Cadastrar', exact: true }))
  await waitFor(() => {
    assert.equal(document.activeElement, screen.getByRole('textbox', { name: 'Nome completo' }))
  })
  await user.click(screen.getByRole('button', { name: 'Cancelar' }))

  await user.click(screen.getByRole('button', { name: 'Inativar Motorista Fictício 10' }))
  await user.click(screen.getByRole('button', { name: 'Inativar', exact: true }))
  await waitFor(() => {
    assert.equal(document.activeElement, screen.getByRole('textbox', { name: 'Justificativa' }))
  })
})

test('T06-P03 e LGPD: associa 400/409 de CPF ao campo sem ecoar pontuação ou valor digitado', async () => {
  let attempt = 0
  const api = async (path, request = {}) => {
    if (path === '/drivers' && request.method === 'POST') {
      attempt += 1
      return attempt === 1
        ? jsonResponse({ erro: 'CPF inválido. Informe os 11 dígitos, sem pontuação.' }, 400)
        : jsonResponse({ erro: 'CPF já cadastrado para 123.456.789-01.' }, 409)
    }
    if (path.startsWith('/drivers/eligible-accounts')) return jsonResponse([])
    return jsonResponse([])
  }

  renderPage(api)
  await screen.findByText('Nenhum motorista cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar Motorista' }))

  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Motorista Fictício')
  await user.type(screen.getByRole('textbox', { name: 'CPF' }), '12345678901')
  await user.type(screen.getByRole('textbox', { name: 'Número da CNH' }), 'CNH999')
  await user.click(screen.getByRole('combobox', { name: 'Categoria da CNH' }))
  await user.click(await screen.findByRole('option', { name: 'B', exact: true }))
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2027-05-20' } })
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Teste CPF')

  await user.click(screen.getByRole('button', { name: 'Cadastrar', exact: true }))
  const cpfInput = screen.getByRole('textbox', { name: 'CPF' })
  await waitFor(() => assert.equal(cpfInput.getAttribute('aria-invalid'), 'true'))
  assert.ok(screen.getByText('CPF inválido. Confira os 11 dígitos informados.'))
  assert.equal(screen.queryByText(/sem pontuação/i), null)
  assert.equal(document.activeElement, cpfInput)

  await user.click(screen.getByRole('button', { name: 'Cadastrar', exact: true }))
  await waitFor(() => assert.ok(screen.getByText('CPF já cadastrado.')))
  assert.equal(screen.queryByText(/123\.456\.789-01/), null)
  assert.equal(document.activeElement, cpfInput)
  assert.equal(helper.sanitizeCpfFromMessage('Falha no CPF 123.456.789-01 e 12345678901'), 'Falha no CPF [CPF omitido] e [CPF omitido]')
})

test('T06-P04: cancela e ignora resposta tardia ao fechar detalhes durante espera', async () => {
  let resolveDetails
  let capturedSignal
  const driver = makeDriver(33)
  const api = async (path, request = {}) => {
    if (path === '/drivers/33') {
      capturedSignal = request.signal
      return new Promise((resolve) => { resolveDetails = resolve })
    }
    return jsonResponse([driver])
  }

  renderPage(api)
  await screen.findByText('Motorista Fictício 33')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Consultar detalhes de Motorista Fictício 33' }))
  assert.ok(await screen.findByText('Atualizando detalhes do motorista...'))
  assert.equal(capturedSignal?.aborted, false)

  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  assert.equal(capturedSignal?.aborted, true)
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null))

  resolveDetails(jsonResponse(driver))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(screen.queryByRole('dialog'), null)
})

test('T06-P10: detalhes exibem revisão, datas e histórico sanitizado e service consulta /events', async () => {
  const driver = makeDriver(15)
  const sampleEvents = [{
    id: 'ev-1',
    eventType: 'CREATED',
    occurredAt: '2026-01-01T12:00:00.000Z',
    reportedBy: 'Gestor Fictício',
    reason: 'Cadastro inicial QA',
    actorName: 'Admin Fictício',
    actorRole: 'ADMINISTRADOR',
  }]
  let returnEvents = false
  const api = async (path) => {
    if (path === '/drivers/15/events') return jsonResponse(sampleEvents)
    if (path === '/drivers/15') {
      return jsonResponse(returnEvents ? { ...driver, events: sampleEvents } : driver)
    }
    return jsonResponse([driver])
  }

  renderPage(api)
  await screen.findByText('Motorista Fictício 15')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Consultar detalhes de Motorista Fictício 15' }))
  assert.ok(await screen.findByText('Histórico de alterações'))
  assert.ok(screen.getByText(/o endpoint atual de consulta não expõe a linha do tempo detalhada/i))
  await user.click(screen.getByRole('button', { name: 'Fechar' }))

  returnEvents = true
  await user.click(screen.getByRole('button', { name: 'Consultar detalhes de Motorista Fictício 15' }))
  assert.ok(await screen.findByText('Cadastro inicial QA'))
  assert.ok(screen.getByText(/Gestor Fictício/))

  const parsedEvents = await service.listDriverEvents(api, '15')
  assert.equal(parsedEvents.length, 1)
  assert.equal(parsedEvents[0].actorName, 'Admin Fictício')

  const eligible = await service.listEligibleDriverAccounts(
    async (path) => {
      assert.equal(path, '/drivers/eligible-accounts?driverId=15')
      return jsonResponse([makeEligibleAccount(9)])
    },
    '15',
  )
  assert.equal(eligible[0].id, '9')
})

test('T06-P01: edição consulta eligible-accounts com driverId e preserva vínculo sem consultar /users', async () => {
  const seen = []
  const linkedDriver = makeDriver(7, { userId: '4', revision: 3 })
  const api = async (path, request = {}) => {
    seen.push({ path, method: request.method ?? 'GET' })
    if (path === '/drivers/eligible-accounts?driverId=7') {
      return jsonResponse([makeEligibleAccount(4, { name: 'Conta Vinculada 4' })])
    }
    if (request.method === 'PUT') return jsonResponse({ ...linkedDriver, revision: 4 })
    return jsonResponse([linkedDriver])
  }

  renderPage(api, 'GESTOR')
  await screen.findByText('Motorista Fictício 7')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Editar Motorista Fictício 7' }))
  const accountSelect = await screen.findByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' })
  await waitFor(() => assert.equal(accountSelect.getAttribute('aria-disabled'), null))
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Atualização de dados')
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

  await waitFor(() => assert.ok(seen.some((item) => item.method === 'PUT')))
  assert.equal(seen.some((item) => item.path.startsWith('/users')), false)
  assert.ok(seen.some((item) => item.path === '/drivers/eligible-accounts?driverId=7'))
})
