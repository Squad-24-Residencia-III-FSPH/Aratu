import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { dom, testing, vite, closeAuthDom } from './auth-dom.fixture.mjs'
import { sessionFor as createSession, tokenFor } from './fixtures.mjs'

const { render, cleanup, act } = testing
const { AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthProvider.tsx')
const { useAuth } = await vite.ssrLoadModule('/src/auth/useAuth.ts')
const KEY = 'aratu.auth.session'
const originalFetch = globalThis.fetch
const credentials = { email: 'teste@example.invalid', senha: 'senha-ficticia' }
const sessionFor = (...args) => ({ ...createSession(...args), permissions: [] })
const sessionResponse = (url, session) => String(url).endsWith('/auth/me')
  ? Response.json({ id: '1', nome: session.nome, perfil: session.perfil, permissions: session.permissions ?? [] })
  : Response.json(session)
afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear(); globalThis.fetch = originalFetch; window.history.replaceState(null, '', '/') })
after(closeAuthDom)

function mount(session = null) {
  if (session) window.localStorage.setItem(KEY, JSON.stringify(session))
  let auth
  function Probe() { auth = useAuth(); return createElement('p', null, auth.session?.perfil ?? 'LOGIN') }
  const view = render(createElement(AuthProvider, null, createElement(Probe)))
  return { ...view, auth: () => auth }
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function storage(key = KEY, area = window.localStorage, newValue = null) {
  window.dispatchEvent(new dom.window.StorageEvent('storage', { key, storageArea: area, newValue }))
}

test('login persiste DTO mínimo e restaura o mesmo exp ao remontar', async () => {
  const session = sessionFor()
  const loginDto = { ...session }
  delete loginDto.permissions
  globalThis.fetch = async (url) => String(url).endsWith('/auth/me')
    ? sessionResponse(url, session)
    : Response.json({ ...loginDto, senha: 'não persistir' })
  const first = mount()
  await act(async () => { await first.auth().signIn(credentials) })
  assert.deepEqual(JSON.parse(window.localStorage.getItem(KEY)), session)
  first.unmount()
  const second = mount()
  assert.deepEqual(second.auth().session, session)
})

test('dados inválidos e legado não autenticam', () => {
  window.localStorage.setItem(KEY, '{invalid')
  window.sessionStorage.setItem(KEY, JSON.stringify(sessionFor()))
  const view = mount()
  assert.equal(view.auth().session, null)
  assert.equal(window.localStorage.getItem(KEY), null)
  assert.equal(window.sessionStorage.getItem(KEY), null)
})

test('logout limpa duas abas antes da resposta e só a originadora consulta API', async () => {
  const session = sessionFor()
  const pending = deferred()
  let calls = 0
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.headers.Authorization, 'Bearer ' + session.token); return pending.promise }
  const a = mount(session), b = mount()
  act(() => { a.auth().logout(); storage() })
  assert.equal(a.auth().session, null)
  assert.equal(b.auth().session, null)
  assert.match(b.auth().notice, /outra aba/)
  assert.equal(window.localStorage.getItem(KEY), null)
  assert.equal(calls, 1)
  await act(async () => { pending.resolve(Response.json({ mensagem: 'ok' })) })
  assert.equal(a.auth().notice, 'Você saiu deste navegador.')
})

for (const failure of ['offline', 401, 500]) {
  test(`saída permanece encerrada com ${failure}`, async () => {
    globalThis.fetch = async () => { if (failure === 'offline') throw new TypeError('offline'); return new Response(null, { status: failure }) }
    const view = mount(sessionFor())
    await act(async () => { view.auth().logout() })
    assert.equal(view.auth().session, null)
    assert.equal(window.localStorage.getItem(KEY), null)
    assert.match(view.auth().notice, /não foi possível confirmar/)
    act(() => window.dispatchEvent(new dom.window.Event('focus')))
    assert.equal(view.auth().session, null)
  })
}

test('evento antigo relê sessão corrente, ignora outra chave e sessionStorage', () => {
  const a = sessionFor(), b = sessionFor('MOTORISTA')
  const view = mount(a)
  window.localStorage.setItem(KEY, JSON.stringify(b))
  act(() => { storage('outra'); storage(KEY, window.sessionStorage) })
  assert.equal(view.auth().session.token, a.token)
  act(() => storage(KEY, window.localStorage, JSON.stringify(a)))
  assert.equal(view.auth().session.token, b.token)
  window.localStorage.clear()
  act(() => storage(null))
  assert.equal(view.auth().session, null)
})

test('retomada reconcilia foco, visibilidade e credencial antes da API', async () => {
  const view = mount(sessionFor())
  const b = sessionFor('MOTORISTA')
  window.localStorage.setItem(KEY, JSON.stringify(b))
  act(() => window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(view.auth().session.token, b.token)
  window.localStorage.removeItem(KEY)
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({}) }
  await act(async () => { await assert.rejects(view.auth().api('/protected'), /expirou/) })
  assert.equal(calls, 0)
  assert.equal(view.auth().session, null)
  window.localStorage.setItem(KEY, JSON.stringify(b))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => document.dispatchEvent(new dom.window.Event('visibilitychange')))
  assert.equal(view.auth().session.token, b.token)
})

test('401 antigo não apaga login B ainda não recebido por storage', async () => {
  const a = sessionFor(), b = sessionFor('MOTORISTA')
  const pending = deferred()
  globalThis.fetch = () => pending.promise
  const view = mount(a)
  const request = view.auth().api('/protected')
  const rejection = assert.rejects(request, /expirou/)
  window.localStorage.setItem(KEY, JSON.stringify(b))
  await act(async () => { pending.resolve(new Response(null, { status: 401 })); await rejection })
  assert.equal(view.auth().session.token, b.token)
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).token, b.token)
})

test('401 corrente remove sessão e 403 preserva acesso', async () => {
  const view = mount(sessionFor())
  globalThis.fetch = async () => new Response(null, { status: 403 })
  await act(async () => { assert.equal((await view.auth().api('/protected')).status, 403) })
  assert.ok(view.auth().session)
  globalThis.fetch = async () => new Response(null, { status: 401 })
  await act(async () => { await assert.rejects(view.auth().api('/protected'), /expirou/) })
  assert.equal(view.auth().session, null)
  assert.equal(window.localStorage.getItem(KEY), null)
})

test('resultado de logout antigo não afeta login e aviso posteriores', async () => {
  const pending = deferred(), b = sessionFor('MOTORISTA')
  globalThis.fetch = (url) => url.endsWith('/logout') ? pending.promise : Promise.resolve(sessionResponse(url, b))
  const view = mount(sessionFor())
  act(() => view.auth().logout())
  await act(async () => { await view.auth().signIn(credentials) })
  await act(async () => { pending.resolve(new Response(null, { status: 500 })) })
  assert.equal(view.auth().session.token, b.token)
  assert.equal(view.auth().notice, '')
})

test('expiração limpa sessão; temporizador A não remove sessão B', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const a = { ...sessionFor(), token: tokenFor('GESTOR', 1) }, b = sessionFor('MOTORISTA')
  const view = mount(a)
  window.localStorage.setItem(KEY, JSON.stringify(b))
  act(() => t.mock.timers.tick(1100))
  assert.equal(view.auth().session.token, b.token)
  act(() => t.mock.timers.tick(3_600_000))
  assert.equal(view.auth().session, null)
  assert.equal(window.localStorage.getItem(KEY), null)
  assert.match(view.auth().notice, /expirou/)
})

test('renova token somente após login e identidade/perfil atuais coincidirem', async () => {
  const prior = sessionFor('GESTOR')
  const renewed = { ...prior, token: tokenFor('GESTOR', 7200), nome: 'Nome retornado no login' }
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    if (String(url).endsWith('/auth/login')) return Response.json(renewed)
    if (String(url).endsWith('/auth/me')) return Response.json({ id: '1', nome: 'Pessoa de teste', perfil: 'GESTOR' })
    return new Response(null, { status: 404 })
  }
  const view = mount(prior)
  await act(async () => { await view.auth().renewSession(credentials) })
  assert.equal(view.auth().session.token, renewed.token)
  assert.equal(view.auth().session.nome, 'Pessoa de teste')
  assert.deepEqual(JSON.parse(window.localStorage.getItem(KEY)), view.auth().session)
  assert.deepEqual(requests.map(({ url }) => url), ['/api/auth/login', '/api/auth/me'])
  assert.equal(requests[1].options.headers.Authorization, `Bearer ${renewed.token}`)
  assert.equal(JSON.stringify(JSON.parse(window.localStorage.getItem(KEY))).includes('senha-ficticia'), false)
})

test('renovação com conta ou perfil diferente limpa a sessão anterior', async () => {
  const prior = sessionFor('GESTOR')
  const other = sessionFor('MOTORISTA', 7200)
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/login')) return Response.json(other)
    return Response.json({ id: '1', nome: 'Pessoa de teste', perfil: 'MOTORISTA' })
  }
  const view = mount(prior)
  await act(async () => { await view.auth().renewSession(credentials) })
  assert.equal(view.auth().session, null)
  assert.equal(window.localStorage.getItem(KEY), null)
  assert.match(view.auth().notice, /conta ou o perfil mudou/i)
})

test('aviso para renovar a sessão é apresentado dois minutos antes do vencimento', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const view = mount({ ...sessionFor(), token: tokenFor('GESTOR', 150) })
  assert.equal(view.auth().renewalPrompt, false)
  act(() => t.mock.timers.tick(29_900))
  assert.equal(view.auth().renewalPrompt, false)
  act(() => t.mock.timers.tick(200))
  assert.equal(view.auth().renewalPrompt, true)
})

test('escrita bloqueada impede login; remoção bloqueada não restaura memória', async (t) => {
  const view = mount()
  globalThis.fetch = async (url) => sessionResponse(url, sessionFor())
  const write = t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('bloqueado') })
  await act(async () => { await assert.rejects(view.auth().signIn(credentials), /Permita o armazenamento/) })
  assert.equal(view.auth().session, null)
  write.mock.restore()
  await act(async () => { await view.auth().signIn(credentials) })
  const remove = t.mock.method(dom.window.Storage.prototype, 'removeItem', () => { throw new Error('bloqueado') })
  await act(async () => { view.auth().logout() })
  assert.equal(view.auth().session, null)
  assert.match(view.auth().notice, /Limpe os dados/)
  act(() => window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(view.auth().session, null)
  remove.mock.restore()
})

test('prévia DEV permanece local e não é compartilhada', () => {
  window.history.replaceState(null, '', '/?preview=gestor')
  const view = mount()
  assert.equal(view.auth().session.nome, 'Prévia do Gestor')
  assert.equal(window.localStorage.getItem(KEY), null)
  act(() => window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(view.auth().session.nome, 'Prévia do Gestor')
})
