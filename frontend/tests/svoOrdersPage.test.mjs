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
import { makeOrder, makeDetail, jsonResponse } from './svo-orders.fixture.mjs'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-svo-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
const { cleanup, fireEvent, render, screen, waitFor, within, act } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  cacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: TeamPage }, { default: AttendantPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/SvoTeamOrdersPage.tsx'), vite.ssrLoadModule('/src/pages/SvoOrdersPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])
afterEach(cleanup)
after(async () => { await vite.close(); fs.rmSync(cacheDir, { recursive: true, force: true }); dom.window.close() })

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function renderPage(api, operational = true) {
  const element = (session) => createElement(AuthContext.Provider, { value: { session, api, signIn: async () => {}, logout() {}, notice: '' } },
    createElement(operational ? TeamPage : AttendantPage))
  const view = render(element(sessionFor(operational ? 'EQUIPE_SVO' : 'ATENDENTE_SVO')))
  return { ...view, switchSession: (session) => view.rerender(element(session)) }
}
function makeApi(state) {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    if (init.method === 'PATCH') return state.onPatch(path, init)
    if (/\/svo\/orders\/\d+$/.test(path)) return state.onDetail ? state.onDetail(path) : jsonResponse(makeDetail(state.list[0]))
    return state.onList ? state.onList(path) : jsonResponse(state.list)
  }
  return { api, calls, patches: () => calls.filter(({ init }) => init.method === 'PATCH') }
}
async function openAction(user) {
  await user.click(await screen.findByRole('button', { name: 'Confirmar saída da ordem #1' }))
  return screen.findByRole('dialog', { name: 'Confirmar saída' })
}

test('carregamento, cards, despacho e detalhe parcial sem perder lista', async () => {
  const pending = deferred()
  const state = { list: [makeOrder()], onList: () => pending.promise }
  const { api } = makeApi(state); renderPage(api)
  assert.ok(screen.getByText('Carregando ordens...'))
  await act(async () => { pending.resolve(jsonResponse(state.list)) })
  assert.ok(await screen.findByRole('article', { name: 'Ordem #1' }))
  assert.equal(document.title, 'Ordens da equipe — Aratu')
  assert.ok(screen.getByText('Local do despacho: Local Fictício QA'))
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da ordem #1' }))
  assert.ok(await screen.findByRole('dialog', { name: 'Detalhes da ordem #1' }))
  assert.ok(await screen.findByText('O contexto histórico deste chamado não está disponível.'))
  await user.keyboard('{Escape}')
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole('button', { name: 'Ver detalhes da ordem #1' })))
})

test('erro inicial, tentar novamente, vazio e filtro de situação no servidor', async () => {
  let failed = true
  const state = { list: [], onList: () => failed ? jsonResponse({ erro: 'Erro sintético' }, 500) : jsonResponse([]) }
  const { api, calls } = makeApi(state); renderPage(api)
  assert.ok(await screen.findByText('Não foi possível carregar as ordens.'))
  failed = false
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhuma ordem disponível para sua equipe'))
  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Em atendimento' }))
  assert.ok(await screen.findByText('Nenhuma ordem encontrada para esta situação'))
  assert.ok(calls.some((call) => call.path === '/svo/orders?status=IN_SERVICE'))
  await user.click(screen.getByRole('button', { name: 'Limpar filtro' }))
  assert.ok(await screen.findByText('Nenhuma ordem disponível para sua equipe'))
})

test('atendente consulta e atualiza sem ações, mesmo que uma resposta traga allowedTransitions', async () => {
  const state = { list: [makeOrder()] }; const { api } = makeApi(state)
  renderPage(api, false)
  await screen.findByRole('article')
  assert.equal(screen.queryByRole('button', { name: /Confirmar saída/ }), null)
  assert.equal(document.title, 'Acompanhamento de ordens — Aratu')
  state.list = [makeOrder({ status: 'IN_SERVICE', revision: 3, allowedTransitions: [] })]
  await userEvent.setup().click(screen.getByRole('button', { name: 'Atualizar' }))
  assert.ok(await screen.findByText('Em atendimento'))
})

test('confirmação explícita e duplo toque produzem um PATCH, próximo avanço exige nova escolha', async () => {
  const pending = deferred(); const state = { list: [makeOrder()], onPatch: () => pending.promise }
  const { api, patches } = makeApi(state); renderPage(api)
  const user = userEvent.setup(); const dialog = await openAction(user)
  assert.ok(within(dialog).getByText(/Confirmar saída para a ordem #1/))
  const button = within(dialog).getByRole('button', { name: 'Confirmar saída' })
  fireEvent.click(button); fireEvent.click(button)
  assert.equal(patches().length, 1)
  state.list = [makeOrder({ status: 'IN_TRANSIT', revision: 2, departedAt: '2026-11-15T12:01:00.000Z', allowedTransitions: ['IN_SERVICE'] })]
  await act(async () => { pending.resolve(jsonResponse(state.list[0])) })
  assert.ok(await screen.findByText('Saída da ordem #1 registrada.'))
  assert.ok(await screen.findByRole('button', { name: 'Confirmar chegada da ordem #1' }))
  assert.equal(screen.queryByRole('dialog'), null)
  await waitFor(() => assert.equal(document.activeElement?.getAttribute('role'), 'status'))
  assert.equal(patches().length, 1)
})

test('mutação confirmada com falha de recarga preserva card e bloqueia avanço até atualização', async () => {
  let failList = false
  const next = makeOrder({ status: 'IN_TRANSIT', revision: 2, departedAt: '2026-11-15T12:01:00.000Z', allowedTransitions: ['IN_SERVICE'] })
  const state = { list: [makeOrder()], onList: () => failList ? jsonResponse({}, 500) : jsonResponse(state.list),
    onPatch: () => { failList = true; state.list = [next]; return jsonResponse(next) } }
  renderPage(makeApi(state).api)
  const user = userEvent.setup(); const dialog = await openAction(user)
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar saída' }))
  assert.ok(await screen.findByText('Saída da ordem #1 registrada.'))
  assert.ok(await screen.findByText('A lista pode estar desatualizada.'))
  assert.equal(screen.getByRole('button', { name: 'Confirmar chegada da ordem #1' }).disabled, true)
  failList = false; await user.click(screen.getByRole('button', { name: 'Atualizar consulta' }))
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Confirmar chegada da ordem #1' }).disabled, false))
})

test('rede, 5xx ou resposta inválida bloqueiam reenvio até GET de reconciliação', async () => {
  for (const failure of ['network', 'server', 'invalid']) {
    const state = { list: [makeOrder()], onPatch: () => {
      if (failure === 'network') throw new Error('Resposta perdida')
      return failure === 'server' ? jsonResponse({}, 500) : jsonResponse({})
    } }
    const { api, patches, calls } = makeApi(state); renderPage(api)
    const user = userEvent.setup(); let dialog = await openAction(user)
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar saída' }))
    assert.ok(await within(dialog).findByText(/O resultado é incerto/))
    assert.equal(within(dialog).getByRole('button', { name: 'Confirmar saída' }).disabled, true)
    assert.equal(screen.queryByText('Saída da ordem #1 registrada.'), null)
    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    assert.equal(screen.getByRole('button', { name: 'Confirmar saída da ordem #1' }).disabled, true)
    await user.click(screen.getByRole('button', { name: 'Consultar situação' }))
    assert.ok(await screen.findByText(/Situação da ordem #1 consultada/))
    assert.ok(calls.some((call) => call.path === '/svo/orders/1'))
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Confirmar saída da ordem #1' }).disabled, false))
    assert.equal(patches().length, 1)
    cleanup()
  }
})

test('403/409 exigem consulta e nova escolha sem avançar automaticamente', async () => {
  for (const status of [403, 409]) {
    const state = { list: [makeOrder()], onPatch: () => {
      state.list = [makeOrder({ status: 'IN_SERVICE', allowedTransitions: [] })]
      return jsonResponse({ erro: 'Atualize a consulta antes de continuar.' }, status)
    } }
    const { api, patches } = makeApi(state); renderPage(api)
    const user = userEvent.setup(); const dialog = await openAction(user)
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar saída' }))
    assert.ok(await within(dialog).findByText('Volte à lista atualizada e escolha novamente a ação disponível.'))
    assert.equal(within(dialog).getByRole('button', { name: 'Confirmar saída' }).disabled, true)
    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    assert.equal(screen.queryByRole('button', { name: 'Confirmar saída da ordem #1' }), null)
    assert.equal(patches().length, 1); cleanup()
  }
})

test('respostas antigas de lista e detalhe não reaparecem após filtro ou troca de sessão', async () => {
  const oldList = deferred(); let first = true
  const state = { list: [makeOrder({ id: '9' })], onList: () => { if (first) { first = false; return oldList.promise } return jsonResponse(state.list) } }
  const { api } = makeApi(state); const view = renderPage(api)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Aberta' }))
  assert.ok(await screen.findByRole('article', { name: 'Ordem #9' }))
  await act(async () => oldList.resolve(jsonResponse([makeOrder()])))
  assert.equal(screen.queryByRole('article', { name: 'Ordem #1' }), null)
  const oldDetail = deferred(); state.onDetail = () => oldDetail.promise
  await user.click(screen.getByRole('button', { name: 'Ver detalhes da ordem #9' }))
  state.list = []
  view.switchSession({ ...sessionFor('EQUIPE_SVO'), token: 'segunda-sessao-ficticia' })
  assert.ok(await screen.findByText('Nenhuma ordem disponível para sua equipe'))
  await act(async () => oldDetail.resolve(jsonResponse(makeDetail({ id: '9' }))))
  assert.equal(screen.queryByRole('dialog'), null)
  assert.equal(screen.queryByRole('article'), null)
  view.switchSession(null)
  assert.equal(screen.queryByRole('heading', { name: 'Ordens da equipe' }), null)
})

test('erro de detalhe preserva lista e oferece nova tentativa', async () => {
  let failed = true
  const state = { list: [makeOrder()], onDetail: () => failed ? jsonResponse({}, 500) : jsonResponse(makeDetail()) }
  renderPage(makeApi(state).api)
  const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Ver detalhes da ordem #1' }))
  assert.ok(await screen.findByText('Não foi possível consultar o detalhe.'))
  failed = false; await user.click(screen.getByRole('button', { name: 'Tentar detalhe novamente' }))
  assert.ok(await screen.findByRole('heading', { name: 'Cadastro atual' }))
})

test('PATCH pendente da sessão anterior não publica sucesso na nova sessão', async () => {
  const pending = deferred()
  const state = { list: [makeOrder()], onPatch: () => pending.promise }
  const view = renderPage(makeApi(state).api)
  const user = userEvent.setup(); const dialog = await openAction(user)
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar saída' }))
  state.list = []
  view.switchSession({ ...sessionFor('EQUIPE_SVO'), token: 'sessao-posterior-ficticia' })
  assert.ok(await screen.findByText('Nenhuma ordem disponível para sua equipe'))
  await act(async () => pending.resolve(jsonResponse(makeOrder({ status: 'IN_TRANSIT', revision: 2,
    departedAt: '2026-11-15T12:01:00.000Z', allowedTransitions: ['IN_SERVICE'] }))))
  assert.equal(screen.queryByText('Saída da ordem #1 registrada.'), null)
  assert.equal(screen.queryByRole('dialog'), null)
  assert.equal(screen.queryByRole('article'), null)
})

test('falha da consulta reconciliadora mantém bloqueio, e filtro não libera reenvio', async () => {
  const state = { list: [makeOrder()], onPatch: () => jsonResponse({}, 500), onDetail: () => jsonResponse({}, 500) }
  const { api, patches } = makeApi(state); renderPage(api)
  const user = userEvent.setup(); const dialog = await openAction(user)
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar saída' }))
  await user.click(await within(dialog).findByRole('button', { name: 'Consultar situação' }))
  assert.ok(await within(dialog).findByText(/continua sem resultado conhecido/))
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar saída' }).disabled, true)
  await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
  await user.click(screen.getByRole('combobox', { name: 'Situação' }))
  await user.click(await screen.findByRole('option', { name: 'Aberta' }))
  await screen.findByRole('article')
  assert.equal(screen.getByRole('button', { name: 'Confirmar saída da ordem #1' }).disabled, true)
  assert.equal(patches().length, 1)
})
