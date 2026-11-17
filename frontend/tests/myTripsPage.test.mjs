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
import { jsonResponse, makeDriverTrip, makeTrip } from './my-trips.fixture.mjs'

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

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), plugins: [react()],
  cacheDir: viteCacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: MyTripsPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/MyTripsPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const NOW_ISO = new Date().toISOString()
const IN_THREE_DAYS = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function renderPage(api, session = sessionFor('MOTORISTA')) {
  const element = (current) => createElement(AuthContext.Provider,
    { value: { session: current, signIn: async () => {}, logout() {}, api, notice: '' } }, createElement(MyTripsPage))
  const view = render(element(session))
  return { ...view, switchSession: (next) => view.rerender(element(next)) }
}

/** API fictícia: GET devolve `state.list`; POSTs delegam ao handler do cenário. */
function makeApi(state) {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    if (path === '/trips/mine') return state.onList ? state.onList() : jsonResponse(state.list)
    return state.onPost(path, init)
  }
  return { api, calls, posts: () => calls.filter(({ init }) => init.method === 'POST') }
}

async function openAndType(user, buttonName, fieldName, text) {
  await user.click(await screen.findByRole('button', { name: buttonName }))
  const dialog = await screen.findByRole('dialog')
  const field = within(dialog).getByRole('textbox', { name: fieldName })
  if (text !== undefined) await user.type(field, text)
  return { dialog, field }
}

test('mostra carregamento e depois só as viagens de hoje e em andamento, com título do documento', async () => {
  const pending = deferred()
  const list = [
    makeDriverTrip(1, { scheduledStart: NOW_ISO }),
    makeDriverTrip(2, { scheduledStart: IN_THREE_DAYS }),
    makeDriverTrip(3, { status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO, scheduledStart: '2026-01-05T12:00:00.000Z' }),
  ]
  const { api } = makeApi({ list, onList: () => pending.promise })
  renderPage(api)
  assert.ok(await screen.findByText('Carregando suas viagens...'))
  pending.resolve(jsonResponse(list))
  assert.ok(await screen.findByText('Unidade fictícia 1'))
  assert.ok(screen.getByText('Unidade fictícia 3'))
  assert.equal(screen.queryByText('Unidade fictícia 2'), null)
  assert.equal(document.title, 'Minhas viagens — Aratu')
  assert.ok(screen.getByRole('heading', { level: 1, name: 'Minhas viagens' }))
  assert.ok(screen.getByText('Quilometragem inicial: 1.500 km'))
  assert.ok(screen.getByText('Em andamento'))
  assert.ok(screen.getByText('Agendada'))
  // Sem controles de gestor: apenas a ação compatível com cada situação.
  assert.ok(screen.getByRole('button', { name: 'Iniciar viagem #1 para Unidade fictícia 1' }))
  assert.ok(screen.getByRole('button', { name: 'Finalizar viagem #3 para Unidade fictícia 3' }))
})

test('estado vazio de hoje oferece todas as pendentes; vazio total oferece atualização', async () => {
  const state = { list: [makeDriverTrip(2, { scheduledStart: IN_THREE_DAYS })] }
  const { api } = makeApi(state)
  renderPage(api)
  assert.ok(await screen.findByText('Nenhuma viagem para hoje ou em andamento'))
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ver todas as pendentes' }))
  assert.ok(await screen.findByText('Unidade fictícia 2'))
  cleanup()

  const empty = makeApi({ list: [] })
  renderPage(empty.api)
  assert.ok(await screen.findByText('Nenhuma viagem pendente'))
  assert.ok(screen.getAllByRole('button', { name: 'Atualizar', exact: true }).length >= 1)
})

test('erro de carregamento mostra mensagem e permite tentar novamente', async () => {
  let attempts = 0
  const { api } = makeApi({ list: [makeDriverTrip(1, { scheduledStart: NOW_ISO })], onList: () => {
    attempts += 1
    return attempts === 1 ? jsonResponse({ erro: 'Falha fictícia ao listar.' }, 403) : jsonResponse([makeDriverTrip(1, { scheduledStart: NOW_ISO })])
  } })
  renderPage(api)
  assert.ok(await screen.findByText('Falha fictícia ao listar.'))
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Unidade fictícia 1'))
})

test('km vazio, zero decimal, negativo e texto não enviam; erro fica associado ao campo', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => jsonResponse({}) }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/)
  await waitFor(() => assert.equal(document.activeElement, field, 'abertura foca o campo após a transição'))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  const alert = await within(dialog).findByText('Informe a quilometragem em km.')
  assert.equal(alert.getAttribute('role'), 'alert')
  assert.equal(field.getAttribute('aria-invalid'), 'true')
  assert.ok(field.getAttribute('aria-describedby').includes(alert.id))
  assert.equal(document.activeElement, field, 'confirmação vazia foca o campo inválido')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.equal(document.activeElement, field, 'repetir o mesmo erro também foca o campo')
  for (const bad of ['-1', '1,5', '1e3', 'abc']) {
    await user.clear(field)
    await user.type(field, bad)
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
    assert.ok(await within(dialog).findByText(/Use apenas números inteiros/), `deveria rejeitar ${bad}`)
  }
  assert.equal(posts().length, 0)
})

test('inicia a viagem com startKm, anuncia o resultado do servidor e troca a ação do card', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })] }
  state.onPost = (path, init) => {
    assert.equal(path, '/trips/5/start')
    assert.deepEqual(JSON.parse(init.body), { startKm: 1500 })
    state.list = [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO })]
    return jsonResponse(makeTrip(5, { startKm: 1500, startedAt: NOW_ISO }))
  }
  const { api, posts, calls } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  const status = await screen.findByText(/Viagem #5 iniciada em .* com 1\.500 km/)
  assert.equal(status.closest('[role="status"]') !== null, true)
  assert.ok(await screen.findByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' }))
  assert.equal(screen.queryByRole('dialog'), null)
  assert.equal(posts().length, 1)
  assert.equal(calls.filter(({ path }) => path === '/trips/mine').length >= 2, true, 'a lista é consultada de novo')
})

test('finaliza com endKm, retira da lista de pendentes e move o foco para o aviso de resultado', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO })] }
  state.onPost = (path, init) => {
    assert.equal(path, '/trips/5/finish')
    assert.deepEqual(JSON.parse(init.body), { endKm: 1580 })
    state.list = []
    return jsonResponse(makeTrip(5, { status: 'FINISHED', endKm: 1580, finishedAt: NOW_ISO }))
  }
  const { api } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog } = await openAndType(user, 'Finalizar viagem #5 para Unidade fictícia 5', /Quilometragem final/, '1580')
  assert.ok(within(dialog).getByText('Quilometragem inicial registrada: 1.500 km.'))
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar término' }))
  assert.ok(await screen.findByText(/Viagem #5 finalizada em .* com 1\.580 km/))
  await waitFor(() => assert.ok(screen.queryByText('Unidade fictícia 5') === null))
  await waitFor(() => assert.equal(document.activeElement?.getAttribute('role'), 'status'))
  assert.ok(await screen.findByText('Nenhuma viagem pendente'))
})

test('duplo toque em confirmar gera um único envio e o botão informa o registro em andamento', async () => {
  const response = deferred()
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => response.promise }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  const confirm = within(dialog).getByRole('button', { name: 'Confirmar início' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  const busy = await within(dialog).findByRole('button', { name: 'Registrando...' })
  assert.equal(busy.disabled, true)
  assert.equal(posts().length, 1)
  response.resolve(jsonResponse(makeTrip(5)))
  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
  assert.equal(posts().length, 1)
})

test('422 mantém o valor digitado e mostra o erro da API no campo', async () => {
  const message = 'A quilometragem inicial (10 km) é menor que a última registrada para o veículo (1400 km).'
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => jsonResponse({ erro: message }, 422) }
  const { api } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '10')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  const alert = await within(dialog).findByText(message)
  assert.equal(alert.getAttribute('role'), 'alert')
  assert.equal(field.value, '10')
  assert.equal(field.getAttribute('aria-invalid'), 'true')
  await waitFor(() => assert.equal(document.activeElement, field, 'erro da API devolve o foco ao campo'))
  assert.equal((await within(dialog).findByRole('button', { name: 'Confirmar início' })).disabled, false)
  assert.equal(screen.queryByText(/iniciada/), null)
})

test('409 preserva a digitação, consulta a lista e bloqueia ação incompatível com a situação atual', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })] }
  state.onPost = () => {
    state.list = [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1490, startedAt: NOW_ISO })]
    return jsonResponse({ erro: 'Somente viagens agendadas podem ser iniciadas.' }, 409)
  }
  const { api, calls } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await within(dialog).findByText('Somente viagens agendadas podem ser iniciadas.'))
  assert.ok(await within(dialog).findByText(/A situação desta viagem mudou/))
  assert.equal(field.value, '1500')
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)
  assert.equal(calls.filter(({ path }) => path === '/trips/mine').length >= 2, true)
})

test('409 bloqueia novo envio por clique e Enter enquanto a consulta de reconciliação está pendente', async () => {
  const pending = deferred()
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })] }
  state.onPost = () => {
    state.onList = () => pending.promise
    return jsonResponse({ erro: 'Conflito fictício. Atualize a situação.' }, 409)
  }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await within(dialog).findByText('Conflito fictício. Atualize a situação.'))
  const confirm = within(dialog).getByRole('button', { name: 'Confirmar início' })
  assert.equal(confirm.disabled, true)
  assert.equal(field.value, '1500')
  fireEvent.click(confirm)
  await user.click(field)
  await user.keyboard('{Enter}')
  assert.equal(posts().length, 1, 'não deve repetir POST antes de concluir a reconciliação')
  pending.resolve(jsonResponse(state.list))
  await waitFor(() => assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, false))
})

test('409 com falha na consulta mantém confirmação bloqueada no clique e no Enter e permite reconciliar pelo diálogo', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })] }
  state.onPost = () => {
    state.onList = async () => { throw new Error('Falha fictícia de rede') }
    return jsonResponse({ erro: 'Conflito fictício. Atualize a situação.' }, 409)
  }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await within(dialog).findByText('Conflito fictício. Atualize a situação.'))
  await waitFor(() => assert.ok(screen.getByText('A lista pode estar desatualizada.')))
  const confirm = within(dialog).getByRole('button', { name: 'Confirmar início' })
  assert.equal(confirm.disabled, true)
  assert.equal(field.value, '1500')
  fireEvent.click(confirm)
  await user.click(field)
  await user.keyboard('{Enter}')
  assert.equal(posts().length, 1, 'lista desatualizada após 409 deve bloquear POST também pelo teclado')
  const refreshDialogButton = within(dialog).getByRole('button', { name: 'Atualizar situação' })
  assert.equal(refreshDialogButton.disabled, false)
  state.onList = undefined
  state.list = [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1490, startedAt: NOW_ISO })]
  await user.click(refreshDialogButton)
  assert.ok(await within(dialog).findByText(/A situação desta viagem mudou/))
  assert.equal(field.value, '1500')
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)
  assert.equal(posts().length, 1)
})

test('403 bloqueia a confirmação, explica acesso negado e atualiza a lista', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })] }
  state.onPost = () => jsonResponse({ erro: 'Somente o motorista alocado pode registrar a execução desta viagem.' }, 403)
  const { api, calls } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await within(dialog).findByText('Somente o motorista alocado pode registrar a execução desta viagem.'))
  assert.equal(field.value, '1500')
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)
  assert.equal(calls.filter(({ path }) => path === '/trips/mine').length >= 2, true)
})

test('rede caída no POST não anuncia sucesso, preserva o km, não reenvia sozinho e oferece atualizar a situação', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: async () => { throw new Error('Serviço temporariamente indisponível') } }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog, field } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await within(dialog).findByText(/Não foi possível confirmar se o registro foi concluído/))
  assert.equal(field.value, '1500')
  assert.equal(screen.queryByText(/Viagem #5 iniciada/), null)
  assert.equal(posts().length, 1)
  // Viagem sumiu da consulta: não afirma finalização, orienta conferir com o gestor.
  state.list = []
  await user.click(within(dialog).getByRole('button', { name: 'Atualizar situação' }))
  assert.ok(await within(dialog).findByText(/não está mais entre as pendentes/))
  assert.equal(screen.queryByText(/finalizada/), null)
  assert.equal(within(dialog).getByRole('button', { name: 'Confirmar início' }).disabled, true)
  assert.equal(posts().length, 1)
})

test('POST confirmado seguido de falha na atualização mantém o resultado e avisa lista desatualizada', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => jsonResponse(makeTrip(5)) }
  const { api } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  state.onList = async () => { throw new Error('Serviço temporariamente indisponível') }
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await screen.findByText(/Viagem #5 iniciada/))
  assert.ok(await screen.findByText(/O registro foi confirmado, mas não foi possível atualizar a lista/))
  assert.ok(screen.getByText('A lista pode estar desatualizada.'))
  assert.ok(screen.getByText(/Viagem #5 iniciada/), 'resultado confirmado permanece')
  const action = await screen.findByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' })
  assert.equal(action.disabled, true, 'ações ficam bloqueadas até reconciliar')
  state.onList = undefined
  state.list = [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO })]
  await user.click(screen.getByRole('button', { name: 'Atualizar situação' }))
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' }).disabled, false))
  assert.equal(screen.queryByText('A lista pode estar desatualizada.'), null)
})

test('resposta antiga de consulta iniciada antes do POST não desfaz o resultado confirmado', async () => {
  const stale = deferred()
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => jsonResponse(makeTrip(5)) }
  let listCalls = 0
  state.onList = () => {
    listCalls += 1
    if (listCalls === 2) return stale.promise // consulta de "Atualizar", iniciada antes do POST
    return jsonResponse(listCalls === 1 ? state.list : [makeDriverTrip(5, { scheduledStart: NOW_ISO, status: 'IN_PROGRESS', startKm: 1500, startedAt: NOW_ISO })])
  }
  const { api } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  await screen.findByText('Unidade fictícia 5')
  await user.click(screen.getByRole('button', { name: 'Atualizar', exact: true }))
  const { dialog } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar início' }))
  assert.ok(await screen.findByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' }))
  stale.resolve(jsonResponse([makeDriverTrip(5, { scheduledStart: NOW_ISO })]))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(screen.getByRole('button', { name: 'Finalizar viagem #5 para Unidade fictícia 5' }), 'lista antiga descartada')
  assert.equal(screen.queryByRole('button', { name: 'Iniciar viagem #5 para Unidade fictícia 5' }), null)
})

test('cancelar o diálogo descarta o rascunho e Esc fecha fora do envio', async () => {
  const state = { list: [makeDriverTrip(5, { scheduledStart: NOW_ISO })], onPost: () => jsonResponse({}) }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()
  const { dialog } = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/, '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Voltar' }))
  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
  const reopened = await openAndType(user, 'Iniciar viagem #5 para Unidade fictícia 5', /Quilometragem inicial/)
  assert.equal(reopened.field.value, '')
  await user.keyboard('{Escape}')
  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
  assert.equal(posts().length, 0)
})

test('trocar a sessão limpa as viagens do usuário anterior', async () => {
  const first = { list: [makeDriverTrip(1, { scheduledStart: NOW_ISO })] }
  const second = { list: [makeDriverTrip(9, { scheduledStart: NOW_ISO })] }
  let active = first
  const { api } = makeApi({ onList: () => jsonResponse(active.list) })
  const view = renderPage(api, sessionFor('MOTORISTA', 3600))
  assert.ok(await screen.findByText('Unidade fictícia 1'))
  active = second
  view.switchSession(sessionFor('MOTORISTA', 7200))
  assert.equal(screen.queryByText('Unidade fictícia 1'), null)
  assert.ok(await screen.findByText('Unidade fictícia 9'))
})
