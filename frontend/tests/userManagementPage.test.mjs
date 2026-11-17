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
import { sessionFor } from './fixtures.mjs'

// O cache precisa ficar fora de `node_modules`, que pode ser somente leitura
// quando as dependências foram instaladas por outro usuário (ex: container).
const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-test-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
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

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: viteCacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const [{ default: UserManagementPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/UserManagementPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const profiles = [
  { id: '1', name: 'ADMINISTRADOR', description: 'Administração do sistema', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'GESTOR', description: 'Gestão de frota', createdAt: '2026-01-01T00:00:00.000Z' },
]

function makeUser(id, overrides = {}) {
  return {
    id: String(id),
    name: `Pessoa Fictícia ${id}`,
    email: `pessoa${id}@example.test`,
    roleId: id === 1 ? '1' : '2',
    role: id === 1 ? 'ADMINISTRADOR' : 'GESTOR',
    active: true,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createApi(initialUsers = [], options = {}) {
  const calls = []
  const users = [...initialUsers]
  let nextId = Math.max(0, ...users.map(({ id }) => Number(id))) + 1

  const api = async (path, request = {}) => {
    calls.push({ path, request })
    if (path === '/profiles') return jsonResponse(profiles)

    if (request.method !== 'POST' && (path.startsWith('/users?') || path === '/users')) {
      if (options.listResponse) return options.listResponse(path, request, calls)
      if (options.listError) return jsonResponse({ erro: options.listError }, 503)
      const url = new URL(path, 'http://aratu.test')
      const name = (url.searchParams.get('nome') ?? '').toLocaleLowerCase()
      const role = url.searchParams.get('perfil')
      const active = url.searchParams.get('ativo')
      const filtered = users.filter((user) => (
        (!name || `${user.name} ${user.email}`.toLocaleLowerCase().includes(name))
        && (!role || user.role === role)
        && (active === null || user.active === (active === 'true'))
      ))
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 10)
      const totalPages = Math.ceil(filtered.length / pageSize)
      return jsonResponse({
        users: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
        totalPages,
      })
    }

    if (request.method === 'POST') {
      if (options.createError) return jsonResponse({ erro: options.createError }, 409)
      const input = JSON.parse(request.body)
      const created = makeUser(nextId++, {
        ...input,
        role: profiles.find(({ id }) => id === input.roleId)?.name ?? 'GESTOR',
      })
      users.push(created)
      return jsonResponse(created, 201)
    }

    const match = path.match(/^\/users\/(\d+)(?:\/(activate|deactivate))?$/)
    if (!match) return jsonResponse({ erro: 'Rota não encontrada.' }, 404)
    const [, id, action] = match
    const user = users.find((item) => item.id === id)
    if (!user) return jsonResponse({ erro: 'Usuário não encontrado.' }, 404)

    if (action) {
      user.active = action === 'activate'
      if (options.statusResponse) return options.statusResponse(path, request, calls)
      return jsonResponse(user)
    }
    if (request.method === 'PUT') {
      if (options.updateError) return jsonResponse({ erro: options.updateError }, 409)
      const input = JSON.parse(request.body)
      Object.assign(user, input, {
        role: profiles.find(({ id: profileId }) => profileId === input.roleId)?.name ?? user.role,
        revision: user.revision + 1,
      })
      return jsonResponse(user)
    }
    return jsonResponse(user)
  }

  return { api, calls, users }
}

function renderPage(api) {
  const auth = {
    session: sessionFor('ADMINISTRADOR'),
    signIn: async () => {},
    logout() {},
    api,
    notice: '',
  }
  return render(createElement(
    AuthContext.Provider,
    { value: auth },
    createElement(UserManagementPage),
  ))
}

async function selectOption(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

test('mostra carregamento acessível e depois a lista de usuários', async () => {
  let resolveList
  const pendingList = new Promise((resolve) => { resolveList = resolve })
  const { api } = createApi([makeUser(2)], {
    listResponse: () => pendingList,
  })

  renderPage(api)
  assert.ok(await screen.findByText('Carregando usuários...'))
  assert.equal(screen.getByRole('region', { name: /Usuários cadastrados/ }).getAttribute('aria-busy'), 'true')

  resolveList(jsonResponse({
    users: [makeUser(2)], total: 1, page: 1, pageSize: 10, totalPages: 1,
  }))
  assert.ok(await screen.findByText('Pessoa Fictícia 2'))
  assert.equal(screen.getByRole('region', { name: /Usuários cadastrados/ }).getAttribute('aria-busy'), null)
})

test('mostra estado vazio e preserva a ação de limpar filtros', async () => {
  const { api } = createApi()
  renderPage(api)
  assert.ok(await screen.findByText('Nenhum usuário cadastrado'))

  const user = userEvent.setup()
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar usuários por nome ou e-mail' }), {
    target: { value: 'sem resultado' },
  })
  assert.ok(await screen.findByText('Nenhum usuário encontrado'))
  await user.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0])
  assert.ok(await screen.findByText('Nenhum usuário cadastrado'))
})

test('mostra erro da API e permite tentar carregar a lista novamente', async () => {
  let attempts = 0
  const { api } = createApi([makeUser(2)], {
    listResponse: () => {
      attempts += 1
      return attempts === 1
        ? jsonResponse({ erro: 'Serviço temporariamente indisponível.' }, 503)
        : jsonResponse({ users: [makeUser(2)], total: 1, page: 1, pageSize: 10, totalPages: 1 })
    },
  })
  renderPage(api)
  assert.ok(await screen.findByText('Serviço temporariamente indisponível.'))
  assert.equal(screen.queryByText('Nenhum usuário cadastrado'), null)
  assert.equal(screen.queryByText('Nenhum registro'), null)
  assert.equal(screen.queryByRole('region', { name: /Usuários cadastrados/ }), null)

  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Pessoa Fictícia 2'))
})

test('busca, filtros e paginação mantêm os parâmetros da API', async () => {
  const { api, calls } = createApi(Array.from({ length: 12 }, (_, index) => makeUser(index + 1)))
  renderPage(api)
  assert.ok(await screen.findByText('Pessoa Fictícia 1'))

  const search = screen.getByRole('textbox', { name: 'Buscar usuários por nome ou e-mail' })
  fireEvent.change(search, { target: { value: 'pessoa12' } })
  assert.ok(await screen.findByText('Pessoa Fictícia 12'))
  assert.ok(calls.some(({ path }) => path.includes('nome=pessoa12')))

  fireEvent.change(search, { target: { value: '' } })
  await waitFor(() => assert.ok(screen.getByText('Pessoa Fictícia 1')))
  const user = userEvent.setup()
  await selectOption(user, 'Filtrar por perfil', 'Administrador do Sistema')
  await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('perfil=ADMINISTRADOR'))))

  await selectOption(user, 'Filtrar por situação', 'Inativo')
  await waitFor(() => assert.ok(calls.some(({ path }) => path.includes('ativo=false'))))

  await selectOption(user, 'Filtrar por situação', 'Todos os status')
  await selectOption(user, 'Filtrar por perfil', 'Todos os perfis')
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Próxima' }).disabled, false))
  await user.click(screen.getByRole('button', { name: 'Próxima' }))
  assert.ok(await screen.findByText('Pessoa Fictícia 11'))
  assert.ok(calls.some(({ path }) => path.includes('page=2&pageSize=10')))
})

test('valida e cadastra usuário sem alterar o payload do serviço', async () => {
  const { api, calls } = createApi()
  renderPage(api)
  await screen.findByText('Nenhum usuário cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const submitButton = () => screen.getAllByRole('button', { name: 'Cadastrar usuário' }).at(-1)
  await user.click(submitButton())
  assert.ok(await screen.findByText('Informe o nome do usuário.'))
  assert.equal(calls.filter(({ request }) => request.method === 'POST').length, 0)

  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Usuária de Teste')
  await user.type(screen.getByRole('textbox', { name: 'E-mail institucional' }), 'teste@example.test')
  await screen.findByText('Senha inicial')
  await user.type(document.querySelector('input[type="password"]'), 'senha-ficticia')
  await selectOption(user, 'Perfil de acesso', 'Gestor de Frota')
  await user.click(submitButton())

  await waitFor(() => assert.equal(calls.filter(({ request }) => request.method === 'POST').length, 1))
  const post = calls.find(({ request }) => request.method === 'POST')
  assert.deepEqual(JSON.parse(post.request.body), {
    name: 'Usuária de Teste',
    email: 'teste@example.test',
    roleId: '2',
    password: 'senha-ficticia',
    active: true,
  })
  await waitFor(() => assert.match(document.body.textContent, /Usu.rio cadastrado com sucesso/))
})

test('erro de cadastro retornado pela API aparece no formulário', async () => {
  const { api, calls } = createApi([], { createError: 'E-mail já cadastrado.' })
  renderPage(api)
  await screen.findByText('Nenhum usuário cadastrado')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Usuária Duplicada')
  await user.type(screen.getByRole('textbox', { name: 'E-mail institucional' }), 'duplicada@example.test')
  await screen.findByText('Senha inicial')
  await user.type(document.querySelector('input[type="password"]'), 'senha-ficticia')
  await selectOption(user, 'Perfil de acesso', 'Gestor de Frota')
  await user.click(screen.getAllByRole('button', { name: 'Cadastrar usuário' }).at(-1))
  assert.ok(await screen.findByText('E-mail já cadastrado.'))
  assert.equal(calls.filter(({ request }) => request.method === 'POST').length, 1)
})

test('edição confirma mudança de perfil e envia a revisão atual', async () => {
  const { api, calls } = createApi([makeUser(2)])
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 2')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Editar Pessoa Fictícia 2' }))
  await user.clear(screen.getByRole('textbox', { name: 'Nome completo' }))
  await user.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Nome Atualizado')
  await selectOption(user, 'Perfil de acesso', 'Administrador do Sistema')
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  assert.ok(await screen.findByText(/Confirme a alteração do perfil/))

  await user.click(screen.getByRole('button', { name: 'Cancelar alteração' }))
  assert.equal(calls.filter(({ request }) => request.method === 'PUT').length, 0)
  await screen.findByRole('button', { name: /Salvar/ })
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await user.click(screen.getByRole('button', { name: 'Confirmar mudança de perfil' }))

  await waitFor(() => assert.equal(calls.filter(({ request }) => request.method === 'PUT').length, 1))
  const update = calls.find(({ request }) => request.method === 'PUT')
  assert.equal(update.path, '/users/2')
  assert.deepEqual(JSON.parse(update.request.body), {
    name: 'Nome Atualizado',
    email: 'pessoa2@example.test',
    roleId: '1',
    revision: 1,
  })
  await waitFor(() => assert.match(document.body.textContent, /Usu.rio atualizado com sucesso/))
})

test('inativação e reativação confirmam a ação e bloqueiam repetição enquanto aguardam', async () => {
  let resolveStatus
  let statusCalls = 0
  const { api, calls } = createApi([makeUser(2)], {
    statusResponse: () => {
      statusCalls += 1
      if (statusCalls === 1) {
        return new Promise((resolve) => { resolveStatus = resolve })
      }
      return jsonResponse(makeUser(2, { active: true }))
    },
  })
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 2')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Inativar Pessoa Fictícia 2' }))
  assert.ok(await screen.findByText(/O histórico é preservado/))
  await user.click(screen.getByRole('button', { name: 'Cancelar' }))
  assert.equal(calls.filter(({ path }) => path.endsWith('/deactivate')).length, 0)
  await screen.findByRole('button', { name: /Inativar Pessoa/ })

  await user.click(screen.getByRole('button', { name: 'Inativar Pessoa Fictícia 2' }))
  await user.click(screen.getByRole('button', { name: 'Inativar' }))
  const pendingConfirm = await screen.findByRole('button', { name: 'Aguarde...' })
  assert.equal(pendingConfirm.disabled, true)
  assert.equal(calls.filter(({ path }) => path.endsWith('/deactivate')).length, 1)
  resolveStatus(jsonResponse(makeUser(2, { active: false })))
  await waitFor(() => assert.match(document.body.textContent, /Usu.rio Pessoa Fict.cia 2 inativado com sucesso/))

  await user.click(await screen.findByRole('button', { name: 'Reativar Pessoa Fictícia 2' }))
  await user.click(screen.getByRole('button', { name: 'Reativar' }))
  await waitFor(() => assert.match(document.body.textContent, /Usu.rio Pessoa Fict.cia 2 reativado com sucesso/))
  assert.equal(calls.filter(({ path }) => path.endsWith('/activate')).length, 1)
})
