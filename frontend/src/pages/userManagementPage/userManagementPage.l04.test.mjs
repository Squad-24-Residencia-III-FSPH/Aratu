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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l04-users-'))

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
  Event: { configurable: true, value: dom.window.Event },
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
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
const [
  { default: UserManagementPage },
  { AuthContext },
  { getUserById, UserRequestError },
  { describeSavedUserVisibility, firstInvalidUserField, mapUserApiError },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/userManagementPage/UserManagementPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/services/usersService.ts'),
  vite.ssrLoadModule('/src/pages/userManagementPage/userManagementHelpers.ts'),
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
  { id: '3', name: 'SOLICITANTE', description: 'Solicitações internas', createdAt: '2026-01-01T00:00:00.000Z' },
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
  const users = initialUsers.map((user) => ({ ...user }))
  let nextId = Math.max(0, ...users.map(({ id }) => Number(id))) + 1

  const api = async (requestPath, request = {}) => {
    calls.push({ path: requestPath, request })

    if (requestPath === '/profiles') {
      if (options.profilesResponse) return options.profilesResponse(calls)
      return jsonResponse(profiles)
    }

    if (request.method !== 'POST' && (requestPath.startsWith('/users?') || requestPath === '/users')) {
      const url = new URL(requestPath, 'http://aratu.test')
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
      if (options.createResponse) return options.createResponse(request, calls, users)
      const input = JSON.parse(request.body)
      const created = makeUser(nextId++, {
        ...input,
        role: profiles.find(({ id }) => id === input.roleId)?.name ?? 'GESTOR',
      })
      users.push(created)
      return jsonResponse(created, 201)
    }

    const match = requestPath.match(/^\/users\/(\d+)(?:\/(activate|deactivate))?$/)
    if (!match) return jsonResponse({ erro: 'Rota não encontrada.' }, 404)
    const [, id, action] = match
    const user = users.find((item) => item.id === id)
    if (!user) return jsonResponse({ erro: 'Usuário não encontrado.' }, 404)

    if (action) {
      user.active = action === 'activate'
      user.revision += 1
      return jsonResponse(user)
    }

    if (request.method === 'PUT') {
      if (options.updateResponse) return options.updateResponse(user, request, calls)
      const input = JSON.parse(request.body)
      if (input.revision !== user.revision) {
        return jsonResponse({
          erro: 'O usuário foi alterado por outra operação. Atualize os dados e tente novamente.',
        }, 409)
      }
      Object.assign(user, {
        name: input.name,
        email: input.email,
        roleId: input.roleId,
        role: profiles.find(({ id: profileId }) => profileId === input.roleId)?.name ?? user.role,
        revision: user.revision + 1,
      })
      return jsonResponse(user)
    }

    return jsonResponse({ ...user })
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

test('helpers identificam ordem de foco, mapeiam erros da API e visibilidade pós-salvamento', () => {
  assert.equal(firstInvalidUserField({ email: 'erro', password: 'erro' }), 'email')
  assert.equal(firstInvalidUserField({ name: 'erro', email: 'erro' }), 'name')
  assert.equal(firstInvalidUserField({ roleId: 'erro', password: 'erro' }), 'roleId')
  assert.equal(firstInvalidUserField({}), null)

  assert.deepEqual(mapUserApiError('E-mail já cadastrado.'), {
    field: 'email',
    message: 'E-mail já cadastrado.',
  })
  assert.deepEqual(mapUserApiError('Perfil de acesso inválido.'), {
    field: 'roleId',
    message: 'Perfil de acesso inválido.',
  })
  assert.deepEqual(mapUserApiError('O usuário foi alterado por outra operação.'), {
    message: 'O usuário foi alterado por outra operação.',
  })

  const user = makeUser(11, { email: 'novo@example.test', role: 'SOLICITANTE', active: true })
  assert.equal(
    describeSavedUserVisibility(user, [user], { search: '', roleFilter: '', statusFilter: '' }),
    'visible',
  )
  assert.equal(
    describeSavedUserVisibility(user, [], { search: '', roleFilter: '', statusFilter: '' }),
    'other-page',
  )
  assert.equal(
    describeSavedUserVisibility(user, [], { search: 'antigo@example.test', roleFilter: '', statusFilter: '' }),
    'filtered-out',
  )
  assert.equal(
    describeSavedUserVisibility(user, [], { search: '', roleFilter: '', statusFilter: 'inactive' }),
    'filtered-out',
  )
})

test('getUserById consulta /users/:id e propaga UserRequestError com status', async () => {
  const user = makeUser(11)
  const fetched = await getUserById(async (requestPath) => {
    assert.equal(requestPath, '/users/11')
    return jsonResponse(user)
  }, '11')
  assert.equal(fetched.id, '11')

  await assert.rejects(
    getUserById(async () => jsonResponse({ erro: 'Usuário não encontrado.' }, 404), '999'),
    (error) => error instanceof UserRequestError
      && error.status === 404
      && error.message === 'Usuário não encontrado.',
  )
})

test('T02-P01: todos os campos com erro têm role="alert", aria-invalid e foco automático no primeiro inválido', async () => {
  const { api } = createApi()
  renderPage(api)
  await screen.findByText('Nenhum usuário cadastrado')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))

  const dialog = screen.getByRole('dialog')
  const submitButton = within(dialog).getByRole('button', { name: 'Cadastrar usuário' })
  await user.click(submitButton)

  const nameInput = within(dialog).getByRole('textbox', { name: /Nome completo/ })
  const emailInput = within(dialog).getByRole('textbox', { name: /E-mail institucional/ })
  const roleSelect = within(dialog).getByRole('combobox', { name: /Perfil de acesso/ })
  const passwordInput = dialog.querySelector('input[type="password"]')

  await waitFor(() => assert.equal(document.activeElement, nameInput))
  assert.equal(nameInput.getAttribute('aria-invalid'), 'true')
  assert.equal(emailInput.getAttribute('aria-invalid'), 'true')
  assert.equal(roleSelect.getAttribute('aria-invalid'), 'true')
  assert.equal(passwordInput.getAttribute('aria-invalid'), 'true')

  const alerts = within(dialog).getAllByRole('alert')
  const alertTexts = alerts.map((node) => node.textContent)
  assert.ok(alertTexts.some((text) => text.includes('Informe o nome do usuário.')))
  assert.ok(alertTexts.some((text) => text.includes('Informe o e-mail institucional.')))
  assert.ok(alertTexts.some((text) => text.includes('Selecione um perfil de acesso.')))
  assert.ok(alertTexts.some((text) => text.includes('Informe uma senha inicial.')))

  // Preenche nome válido com e-mail malformado -> foco deve ir para E-mail institucional
  await user.type(nameInput, 'Servidora Fictícia')
  await user.type(emailInput, 'invalido')
  await user.click(submitButton)
  await waitFor(() => assert.equal(document.activeElement, emailInput))

  // Corrige e-mail sem selecionar perfil -> foco deve ir para Perfil de acesso
  await user.clear(emailInput)
  await user.type(emailInput, 'servidora@example.test')
  await user.click(submitButton)
  await waitFor(() => assert.equal(document.activeElement, roleSelect))

  // Seleciona perfil sem preencher senha -> foco deve ir para Senha inicial
  await selectOption(user, /Perfil de acesso/, 'Gestor de Frota')
  await user.click(submitButton)
  await waitFor(() => assert.equal(document.activeElement, passwordInput))
})

test('T02-P01: conflito 409 de e-mail associa erro ao campo e foca o e-mail', async () => {
  const { api } = createApi([], {
    createResponse: () => jsonResponse({ erro: 'E-mail já cadastrado.' }, 409),
  })
  renderPage(api)
  await screen.findByText('Nenhum usuário cadastrado')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const dialog = screen.getByRole('dialog')
  const nameInput = within(dialog).getByRole('textbox', { name: /Nome completo/ })
  const emailInput = within(dialog).getByRole('textbox', { name: /E-mail institucional/ })
  const passwordInput = dialog.querySelector('input[type="password"]')

  await user.type(nameInput, 'Servidora Fictícia')
  await user.type(emailInput, 'duplicada@example.test')
  await selectOption(user, /Perfil de acesso/, 'Gestor de Frota')
  await user.type(passwordInput, 'senha-ficticia')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar usuário' }))

  assert.ok(await within(dialog).findByText('E-mail já cadastrado.'))
  assert.equal(emailInput.getAttribute('aria-invalid'), 'true')
  await waitFor(() => assert.equal(document.activeElement, emailInput))
})

test('T02-P05: catálogo de perfis indisponível oferece retry no diálogo sem perder os demais campos', async () => {
  let profileAttempts = 0
  const { api } = createApi([], {
    profilesResponse: () => {
      profileAttempts += 1
      return profileAttempts === 1
        ? jsonResponse({ erro: 'Serviço temporariamente indisponível.' }, 503)
        : jsonResponse(profiles)
    },
  })
  renderPage(api)
  await screen.findByText('Nenhum usuário cadastrado')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  const dialog = screen.getByRole('dialog')

  assert.ok(await within(dialog).findByText(/Não foi possível carregar o catálogo de perfis/))

  const nameInput = within(dialog).getByRole('textbox', { name: /Nome completo/ })
  const emailInput = within(dialog).getByRole('textbox', { name: /E-mail institucional/ })
  await user.type(nameInput, 'Nome Preservado')
  await user.type(emailInput, 'preservado@example.test')

  await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => assert.equal(Boolean(within(dialog).queryByText(/Não foi possível carregar o catálogo de perfis/)), false))

  assert.equal(nameInput.value, 'Nome Preservado')
  assert.equal(emailInput.value, 'preservado@example.test')

  await selectOption(user, /Perfil de acesso/, 'Gestor de Frota')
  await user.type(dialog.querySelector('input[type="password"]'), 'senha-ficticia')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar usuário' }))
  await waitFor(() => assert.match(document.body.textContent, /Usuário cadastrado com sucesso/))
})

test('T02-P07 e T03-P05: envio em andamento expõe aria-busy, anúncio único de espera e evita duplicação', async () => {
  let resolvePost
  let resolvePut
  const { api, calls } = createApi([makeUser(2)], {
    createResponse: () => new Promise((resolve) => { resolvePost = resolve }),
    updateResponse: () => new Promise((resolve) => { resolvePut = resolve }),
  })
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 2')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  let dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: /Nome completo/ }), 'Pessoa Nova')
  await user.type(within(dialog).getByRole('textbox', { name: /E-mail institucional/ }), 'nova@example.test')
  await selectOption(user, /Perfil de acesso/, 'Gestor de Frota')
  await user.type(dialog.querySelector('input[type="password"]'), 'senha-ficticia')

  const form = dialog.querySelector('form')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar usuário' }))
  fireEvent.submit(form)

  assert.equal(dialog.getAttribute('aria-busy'), 'true')
  assert.equal(form.getAttribute('aria-busy'), 'true')
  assert.equal(within(dialog).getAllByRole('status').length, 1)
  assert.match(within(dialog).getByRole('status').textContent, /Cadastrando usuário, aguarde/)
  assert.equal(calls.filter(({ request }) => request.method === 'POST').length, 1)

  resolvePost(jsonResponse(makeUser(3, { name: 'Pessoa Nova', email: 'nova@example.test' }), 201))
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))
  assert.match(document.body.textContent, /Usuário cadastrado com sucesso \(ID #3\)/)

  // Edição lenta com PUT
  await user.click(screen.getByRole('button', { name: 'Editar Pessoa Fictícia 2' }))
  dialog = screen.getByRole('dialog')
  const editForm = dialog.querySelector('form')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))
  fireEvent.submit(editForm)

  assert.equal(dialog.getAttribute('aria-busy'), 'true')
  assert.equal(editForm.getAttribute('aria-busy'), 'true')
  assert.equal(within(dialog).getAllByRole('status').length, 1)
  assert.match(within(dialog).getByRole('status').textContent, /Salvando alterações do usuário, aguarde/)
  assert.equal(calls.filter(({ request }) => request.method === 'PUT').length, 1)

  resolvePut(jsonResponse(makeUser(2, { revision: 2 })))
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))
  assert.match(document.body.textContent, /Usuário atualizado com sucesso \(ID #2\)/)
})

test('T02-P06: registro criado na página 2 ou fora do filtro ativo oferece consulta direta por ID', async () => {
  const initialUsers = Array.from({ length: 10 }, (_, index) => makeUser(index + 1))
  const { api, calls } = createApi(initialUsers)
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 1')
  assert.equal(document.title, 'Gerenciar usuários — Aratu')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }))
  let dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: /Nome completo/ }), 'Pessoa Página Dois')
  await user.type(within(dialog).getByRole('textbox', { name: /E-mail institucional/ }), 'pagina2@example.test')
  await selectOption(user, /Perfil de acesso/, 'Gestor de Frota')
  await user.type(dialog.querySelector('input[type="password"]'), 'senha-ficticia')
  await user.click(within(dialog).getByRole('button', { name: 'Cadastrar usuário' }))

  assert.ok(await screen.findByText(/está em outra página da listagem/))
  await user.click(await screen.findByRole('button', { name: 'Localizar registro #11' }))
  assert.ok(await screen.findByText('Pessoa Página Dois'))
  assert.ok(calls.some(({ path: requestPath }) => requestPath === '/users/11'))

  // Edição de e-mail mantendo filtro pelo termo anterior
  const searchInput = screen.getByRole('textbox', { name: 'Buscar usuários por nome ou e-mail' })
  fireEvent.change(searchInput, { target: { value: 'pagina2@example.test' } })
  await screen.findByText('Pessoa Página Dois')
  await user.click(screen.getByRole('button', { name: 'Editar Pessoa Página Dois' }))
  dialog = screen.getByRole('dialog')
  const emailInput = within(dialog).getByRole('textbox', { name: /E-mail institucional/ })
  await user.clear(emailInput)
  await user.type(emailInput, 'novo-email@example.test')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))

  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))
  assert.ok(await screen.findByText(/ficou fora dos filtros aplicados no momento/))
  await user.click(await screen.findByRole('button', { name: 'Localizar registro #11' }))
  assert.ok(await screen.findByText('novo-email@example.test'))
})

test('T02-P03: filtros agrupados em FilterBar e tabela em região rolável focável com cabeçalhos scope="col"', async () => {
  const { api } = createApi([makeUser(2)])
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 2')

  const filterRegion = screen.getByRole('region', { name: 'Filtros de usuários' })
  assert.ok(within(filterRegion).getByRole('textbox', { name: 'Buscar usuários por nome ou e-mail' }))
  assert.ok(within(filterRegion).getByRole('combobox', { name: 'Filtrar por perfil' }))
  assert.ok(within(filterRegion).getByRole('combobox', { name: 'Filtrar por situação' }))

  const tableRegion = screen.getByRole('region', { name: /Usuários cadastrados/ })
  assert.equal(tableRegion.getAttribute('tabindex'), '0')
  const headers = within(tableRegion).getAllByRole('columnheader')
  assert.equal(headers.length, 5)
  for (const header of headers) {
    assert.equal(header.getAttribute('scope'), 'col')
  }
})

test('conflito 409 de revisão na edição permite recarregar dados atuais do usuário', async () => {
  const { api } = createApi([makeUser(2, { revision: 1 })], {
    updateResponse: (user, request) => {
      const input = JSON.parse(request.body)
      if (input.revision === 1) {
        user.revision = 2
        user.name = 'Pessoa Atualizada Externamente'
        return jsonResponse({
          erro: 'O usuário foi alterado por outra operação. Atualize os dados e tente novamente.',
        }, 409)
      }
      return jsonResponse({ ...user, name: input.name, revision: user.revision + 1 })
    },
  })
  renderPage(api)
  await screen.findByText('Pessoa Fictícia 2')

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Editar Pessoa Fictícia 2' }))
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))

  assert.ok(await within(dialog).findByText(/O usuário foi alterado por outra operação/))
  await user.click(within(dialog).getByRole('button', { name: 'Recarregar dados atuais' }))
  await waitFor(() => {
    assert.equal(
      within(dialog).getByRole('textbox', { name: /Nome completo/ }).value,
      'Pessoa Atualizada Externamente',
    )
  })
})
