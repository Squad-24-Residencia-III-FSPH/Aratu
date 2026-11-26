import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createTestViteServer } from './viteTestServer.mjs'
import react from '@vitejs/plugin-react'
import { sessionFor } from './fixtures.mjs'

// O cache precisa ficar fora de `node_modules`, que pode ser somente leitura
// quando as dependências foram instaladas por outro usuário (ex: container).
const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-test-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node }, DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot }, MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createTestViteServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  cacheDir: viteCacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: DriversPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/driversPage/DriversPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

function makeDriver(id, overrides = {}) {
  return { id: String(id), name: `Motorista Fictício ${id}`, cpf: '12345678901', cnhNumber: `CNH${id}`,
    cnhCategory: 'B', cnhExpiresAt: '2027-05-20', phone: null, status: 'ACTIVE', userId: null, revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides }
}
function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }) }
function driversPageResponse(requestUrl, items) {
  const url = new URL(requestUrl, 'http://localhost')
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
  const search = url.searchParams.get('search')?.toLowerCase() ?? ''
  const filteredItems = search
    ? items.filter(({ name }) => name.toLowerCase().startsWith(search))
    : items
  return jsonResponse({
    items: filteredItems.slice((page - 1) * pageSize, page * pageSize),
    total: filteredItems.length,
    page,
    pageSize,
    totalPages: Math.ceil(filteredItems.length / pageSize),
  })
}
function renderPage(api, profile = 'GESTOR') {
  const auth = { session: sessionFor(profile), signIn: async () => {}, logout() {}, api, notice: '' }
  return render(createElement(AuthContext.Provider, { value: auth }, createElement(DriversPage)))
}

test('mostra carregamento, paginação e busca por prefixo do nome', async () => {
  let resolveList
  const pending = new Promise((resolve) => { resolveList = resolve })
  const drivers = Array.from({ length: 25 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return makeDriver(index + 1, { name: `Motorista Fictício ${number}` })
  })
  const requestedUrls = []
  let firstLoad = true
  const api = async (path) => {
    requestedUrls.push(path)
    if (firstLoad) { firstLoad = false; return pending }
    return driversPageResponse(path, drivers)
  }
  renderPage(api)
  assert.ok(await screen.findByText('Carregando motoristas…'))
  resolveList(driversPageResponse('/drivers?page=1&pageSize=20', drivers))
  assert.ok(await screen.findByText('Motorista Fictício 01'))
  assert.equal(Boolean(screen.queryByText('Motorista Fictício 21')), false, 'A primeira página não deve mostrar a linha 21.')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Próxima' }))
  assert.ok(await screen.findByText('Motorista Fictício 21'))
  const search = screen.getByRole('textbox', { name: 'Buscar pelo nome' })
  fireEvent.change(search, { target: { value: 'Motorista Fictício 02' } })
  assert.ok(await screen.findByText('Motorista Fictício 02'))
  assert.equal(Boolean(screen.queryByText('Motorista Fictício 12')), false, 'A busca pelo nome 02 não deve incluir o nome 12.')
  const searchRequest = new URL(requestedUrls.at(-1), 'http://localhost')
  assert.equal(searchRequest.searchParams.get('search'), 'Motorista Fictício 02')
  assert.equal(searchRequest.searchParams.get('page'), '1')
  assert.equal(searchRequest.searchParams.get('pageSize'), '20')
  fireEvent.change(search, { target: { value: 'Nome inexistente' } })
  assert.ok(await screen.findByText('Nenhum motorista encontrado'))
})

test('mostra erro sem estado vazio e mantém retry', async () => {
  let attempts = 0
  const api = async () => {
    attempts += 1
    if (attempts === 1) return jsonResponse({ erro: 'Falha fictícia ao listar.' }, 503)
    return driversPageResponse('/drivers?page=1&pageSize=20', [])
  }
  renderPage(api)
  assert.ok(await screen.findByText('Falha fictícia ao listar.'))
  assert.equal(screen.queryByText('Nenhum motorista cadastrado'), null)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhum motorista cadastrado'))
})

test('cadastro envia situação inicial, justificativa e bloqueia envio duplicado', async () => {
  let resolveCreate
  const calls = []
  const created = makeDriver(8, { status: 'AWAY' })
  const api = async (path, request = {}) => {
    calls.push({ path, request })
    if (request.method === 'POST') return new Promise((resolve) => { resolveCreate = resolve })
    return path.startsWith('/drivers?') ? driversPageResponse(path, []) : jsonResponse([])
  }
  renderPage(api)
  await screen.findByText('Nenhum motorista cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar motorista' }))
  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Motorista de Teste')
  await user.type(screen.getByRole('textbox', { name: 'CPF' }), '12345678901')
  await user.type(screen.getByRole('textbox', { name: 'Número da CNH' }), '12345678901')
  await user.click(screen.getByRole('combobox', { name: 'Categoria da CNH' }))
  await user.click(await screen.findByRole('option', { name: 'B', exact: true }))
  fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2027-05-20' } })
  await user.click(screen.getByRole('combobox', { name: 'Situação inicial' }))
  await user.click(await screen.findByRole('option', { name: 'Afastado' }))
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Cadastro de teste')
  await user.click(screen.getByRole('button', { name: 'Cadastrar', exact: true }))
  const submit = await screen.findByRole('button', { name: 'Salvando...' })
  assert.equal(submit.disabled, true)
  assert.equal(calls.filter(({ request }) => request.method === 'POST').length, 1)
  const payload = JSON.parse(calls.find(({ request }) => request.method === 'POST').request.body)
  assert.equal(payload.cpf, '12345678901')
  assert.equal(payload.status, 'AWAY')
  assert.equal(payload.reason, 'Cadastro de teste')
  assert.equal(payload.reportedBy, 'Pessoa de teste')
  resolveCreate(jsonResponse(created, 201))
  await waitFor(() => assert.ok(screen.getByText('Motorista cadastrado com sucesso.')))
})

test('confirma inativação com justificativa, revisão e mensagem de erro da API', async () => {
  const calls = []
  const driver = makeDriver(4)
  const api = async (path, request = {}) => {
    calls.push({ path, request })
    if (request.method === 'PATCH') return jsonResponse({ erro: 'Conflito fictício de revisão.' }, 409)
    return path.startsWith('/drivers?') ? driversPageResponse(path, [driver]) : jsonResponse([driver])
  }
  renderPage(api)
  await screen.findByText('Motorista Fictício 4')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ações do motorista Motorista Fictício 4' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Arquivar' }))
  await user.click(screen.getByRole('button', { name: 'Arquivar', exact: true }))
  assert.ok(await screen.findByText('Informe a justificativa da mudança de situação.'))
  assert.equal(calls.filter(({ request }) => request.method === 'PATCH').length, 0)
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Encerramento fictício')
  await user.click(screen.getByRole('button', { name: 'Arquivar', exact: true }))
  assert.ok(await screen.findByText('Conflito fictício de revisão.'))
  const statusCall = calls.find(({ request }) => request.method === 'PATCH')
  assert.equal(statusCall.path, '/drivers/4/status')
  assert.deepEqual(JSON.parse(statusCall.request.body), {
    status: 'INACTIVE', expectedRevision: 1, reportedBy: 'Pessoa de teste', reason: 'Encerramento fictício',
  })
})

test('edição envia campos atualizados e a revisão retornada pela consulta', async () => {
  const calls = []
  const driver = makeDriver(5, { revision: 7 })
  const api = async (path, request = {}) => {
    calls.push({ path, request })
    if (request.method === 'PUT') return jsonResponse({ ...driver, name: 'Nome Atualizado', revision: 8 })
    return path === '/drivers/5' ? jsonResponse(driver) : driversPageResponse(path, [driver])
  }
  renderPage(api)
  await screen.findByText('Motorista Fictício 5')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ações do motorista Motorista Fictício 5' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Editar cadastro' }))
  const name = screen.getByRole('textbox', { name: 'Nome completo' })
  await user.clear(name)
  await user.type(name, 'Nome Atualizado')
  await user.type(screen.getByRole('textbox', { name: 'Justificativa' }), 'Correção fictícia')
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => assert.equal(calls.filter(({ request }) => request.method === 'PUT').length, 1))
  const update = calls.find(({ request }) => request.method === 'PUT')
  assert.equal(update.path, '/drivers/5')
  assert.deepEqual(JSON.parse(update.request.body), {
    name: 'Nome Atualizado', cpf: '12345678901', cnhNumber: 'CNH5', cnhCategory: 'B',
    cnhExpiresAt: '2027-05-20', phone: null, userId: null, reportedBy: 'Pessoa de teste',
    reason: 'Correção fictícia', expectedRevision: 7,
  })
  assert.ok(await screen.findByText('Motorista atualizado com sucesso.'))
})

test('gestor não recebe seletor de contas, administrador recebe e pode carregá-las', async () => {
  const seen = []
  const api = async (path) => {
    seen.push(path)
    if (path.startsWith('/users?')) return jsonResponse({ users: [], total: 0, page: 1, pageSize: 100, totalPages: 0 })
    return path.startsWith('/drivers?') ? driversPageResponse(path, []) : jsonResponse([])
  }
  const { unmount } = renderPage(api, 'GESTOR')
  await screen.findByText('Nenhum motorista cadastrado')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cadastrar motorista' }))
  assert.equal(screen.queryByLabelText('Conta de usuário vinculada (opcional)'), null)
  assert.equal(seen.some((path) => path.startsWith('/users?')), false)
  unmount()
  renderPage(api, 'ADMINISTRADOR')
  await screen.findByText('Nenhum motorista cadastrado')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cadastrar motorista' }))
  assert.ok(await screen.findByRole('combobox', { name: 'Conta de usuário vinculada (opcional)' }))
  await waitFor(() => assert.ok(seen.some((path) => path.startsWith('/users?'))))
})

test('limpar filtros refaz a consulta e volta a exibir a lista completa', async () => {
  let listCalls = 0
  const api = async (path) => {
    if (path.startsWith('/drivers')) listCalls += 1
    return driversPageResponse(path, [makeDriver(1), makeDriver(2)])
  }
  renderPage(api)
  await screen.findByText('Motorista Fictício 1')
  const search = screen.getByRole('textbox', { name: 'Buscar pelo nome' })
  fireEvent.change(search, { target: { value: 'Motorista Fictício 1' } })
  assert.ok(await screen.findByText('Motorista Fictício 1'))
  await waitFor(() => assert.equal(Boolean(screen.queryByText('Motorista Fictício 2')), false))
  await userEvent.setup().click(screen.getByRole('button', { name: 'Limpar filtros' }))
  assert.ok(await screen.findByText('Motorista Fictício 2'))
  assert.ok(listCalls >= 3)
})

test('detalhes exibem CPF mascarado e permitem repetir a consulta após erro', async () => {
  let detailCalls = 0
  const driver = makeDriver(3)
  const api = async (path) => {
    if (path === '/drivers/3') {
      detailCalls += 1
      return detailCalls === 1
        ? jsonResponse({ erro: 'Falha fictícia no detalhe.' }, 503)
        : jsonResponse(driver)
    }
    return path.startsWith('/drivers?') ? driversPageResponse(path, [driver]) : jsonResponse([driver])
  }
  renderPage(api)
  await screen.findByText('Motorista Fictício 3')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ver detalhes de Motorista Fictício 3' }))
  assert.ok(await screen.findByText('Falha fictícia no detalhe.'))
  assert.equal(screen.queryByText('123.456.789-01'), null)
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('123.456.789-01'))
})
