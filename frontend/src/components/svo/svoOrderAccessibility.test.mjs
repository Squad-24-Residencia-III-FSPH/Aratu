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
import { jsonResponse, makeDetail, makeOrder } from '../../../tests/svo-orders.fixture.mjs'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-svo-a11y-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
dom.window.innerWidth = 320
dom.window.innerHeight = 568
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { cleanup, render, screen, waitFor, within, act } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [react()],
  cacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const [
  { ThemeProvider },
  { theme },
  { default: TeamPage },
  { default: AttendantPage },
  { AuthContext },
] = await Promise.all([
  vite.ssrLoadModule('@mui/material/styles'),
  vite.ssrLoadModule('/src/theme.ts'),
  vite.ssrLoadModule('/src/pages/svoOrdersPage/SvoTeamOrdersPage.tsx'),
  vite.ssrLoadModule('/src/pages/svoOrdersPage/SvoOrdersPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(cleanup)
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function renderPage(api, operational = true) {
  const profile = operational ? 'EQUIPE_SVO' : 'ATENDENTE_SVO'
  return render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(
        AuthContext.Provider,
        { value: { session: sessionFor(profile), api, signIn: async () => {}, logout() {}, notice: '' } },
        createElement(operational ? TeamPage : AttendantPage),
      ),
    ),
  )
}

function makeApi(state) {
  const calls = []
  const api = async (reqPath, init = {}) => {
    calls.push({ path: reqPath, init })
    if (init.method === 'PATCH') return state.onPatch(reqPath, init)
    if (init.method === 'POST') return state.onPost(reqPath, init)
    if (/\/svo\/orders\/\d+$/.test(reqPath)) return state.onDetail ? state.onDetail(reqPath) : jsonResponse(makeDetail(state.list[0]))
    return state.onList ? state.onList(reqPath) : jsonResponse(state.list)
  }
  return {
    api,
    calls,
    posts: () => calls.filter(({ init }) => init.method === 'POST'),
  }
}

test('T20-P03: resultado reconciliado e encerrado usa única região role="status" sem role="alert" aninhado', async () => {
  const order = makeOrder({
    status: 'IN_TRANSIT',
    revision: 2,
    departedAt: '2026-11-15T12:05:00.000Z',
    allowedTransitions: ['IN_SERVICE'],
    allowedResults: ['NOT_PERFORMED'],
  })
  const state = {
    list: [order],
    onPatch: () => { throw new Error('Conexão perdida') },
    onDetail: () => jsonResponse(makeDetail(order)),
  }
  renderPage(makeApi(state).api)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Confirmar chegada da ordem #1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Confirmar chegada' })
  await user.click(within(dialog).getByRole('button', { name: 'Confirmar chegada' }))
  await user.click(await within(dialog).findByRole('button', { name: 'Consultar situação' }))

  const statusRegion = await screen.findByRole('status')
  assert.match(statusRegion.textContent ?? '', /Situação da ordem #1 consultada: Em deslocamento/)
  assert.equal(within(statusRegion).queryByRole('alert'), null)
  assert.equal(screen.queryByRole('alert'), null)
})

test('T21-P01: abrir revisão de encerramento foca ação segura e segundo Enter não envia POST', async () => {
  const order = makeOrder({
    status: 'IN_SERVICE',
    revision: 3,
    departedAt: '2026-11-15T12:05:00.000Z',
    arrivedAt: '2026-11-15T12:10:00.000Z',
    allowedTransitions: [],
    allowedResults: ['COMPLETED', 'NOT_PERFORMED'],
  })
  const closed = makeDetail({
    ...order,
    status: 'NOT_PERFORMED',
    result: 'NOT_PERFORMED',
    revision: 4,
    closedAt: '2026-11-15T12:20:00.000Z',
    closedBy: '7',
    failureReason: 'Motivo fictício QA',
    allowedTransitions: [],
    allowedResults: [],
  })
  const state = { list: [order], onPost: () => { state.list = [closed]; return jsonResponse(closed) } }
  const { api, posts } = makeApi(state)
  renderPage(api)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Encerrar ordem #1' }))
  const formDialog = await screen.findByRole('dialog', { name: 'Encerrar ordem #1' })
  await user.click(within(formDialog).getByRole('combobox', { name: /Resultado do atendimento/ }))
  await user.click(await screen.findByRole('option', { name: 'Não realizada' }))
  await user.type(within(formDialog).getByLabelText(/Motivo da não realização/), 'Motivo fictício QA')

  const reviewBtn = within(formDialog).getByRole('button', { name: 'Revisar encerramento' })
  act(() => { reviewBtn.focus() })
  await user.keyboard('{Enter}')

  const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar encerramento da ordem #1' })
  const backBtn = within(confirmDialog).getByRole('button', { name: 'Voltar ao formulário' })
  await waitFor(() => assert.equal(document.activeElement, backBtn))

  // Segundo Enter imediato aciona apenas o retorno seguro ao formulário, preservando o rascunho.
  await user.keyboard('{Enter}')
  const restoredDialog = await screen.findByRole('dialog', { name: 'Encerrar ordem #1' })
  assert.equal(within(restoredDialog).getByLabelText(/Motivo da não realização/).value, 'Motivo fictício QA')
  assert.equal(posts().length, 0)

  // Para confirmar, é necessário avançar e navegar explicitamente até Confirmar encerramento.
  await user.click(within(restoredDialog).getByRole('button', { name: 'Revisar encerramento' }))
  const secondConfirm = await screen.findByRole('dialog', { name: 'Confirmar encerramento da ordem #1' })
  const confirmBtn = within(secondConfirm).getByRole('button', { name: 'Confirmar encerramento' })
  assert.notEqual(document.activeElement, confirmBtn)
  act(() => { confirmBtn.focus() })
  await user.keyboard('{Enter}')
  assert.equal(posts().length, 1)
})

test('T21-P02: erro de validação leva foco ao primeiro campo inválido sem roubar foco ao digitar', async () => {
  const order = makeOrder({
    status: 'IN_SERVICE',
    revision: 3,
    allowedTransitions: [],
    allowedResults: ['COMPLETED', 'NOT_PERFORMED'],
  })
  renderPage(makeApi({ list: [order] }).api)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Encerrar ordem #1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Encerrar ordem #1' })
  const reviewBtn = within(dialog).getByRole('button', { name: 'Revisar encerramento' })

  await user.click(reviewBtn)
  assert.ok(await within(dialog).findByText('Selecione o resultado do atendimento.'))
  const select = within(dialog).getByRole('combobox', { name: /Resultado do atendimento/ })
  await waitFor(() => assert.equal(document.activeElement, select))

  // Repetir tentativa inválida mantém retorno de foco para o seletor.
  await user.click(reviewBtn)
  await waitFor(() => assert.equal(document.activeElement, select))

  await user.click(select)
  await user.click(await screen.findByRole('option', { name: 'Não realizada' }))
  await user.click(reviewBtn)
  assert.ok(await within(dialog).findByText('Informe o motivo da não realização.'))
  const reasonInput = within(dialog).getByLabelText(/Motivo da não realização/)
  await waitFor(() => assert.equal(document.activeElement, reasonInput))

  // Espaços em branco falham e devolvem foco ao campo de motivo.
  await user.type(reasonInput, '   ')
  await user.click(reviewBtn)
  assert.ok(await within(dialog).findByText('Informe o motivo da não realização.'))
  await waitFor(() => assert.equal(document.activeElement, reasonInput))

  // Digitar texto válido limpa o erro mantendo o foco no próprio campo.
  await user.clear(reasonInput)
  await user.type(reasonInput, 'Local fictício fechado')
  assert.equal(document.activeElement, reasonInput)
  assert.equal(reasonInput.value, 'Local fictício fechado')
})

test('T22-P02: recuperar detalhe mantém foco dentro do diálogo e fecha com um único Esc devolvendo ao acionador', async () => {
  const pending = deferred()
  let attempt = 0
  const order = makeOrder({ id: '2', status: 'NOT_PERFORMED', result: 'NOT_PERFORMED', allowedTransitions: [], allowedResults: [] })
  const state = {
    list: [order],
    onDetail: () => {
      attempt += 1
      if (attempt === 1) return jsonResponse({}, 500)
      return pending.promise
    },
  }
  renderPage(makeApi(state).api, false)
  const user = userEvent.setup()

  const detailTrigger = await screen.findByRole('button', { name: 'Ver detalhes da ordem #2' })
  await user.click(detailTrigger)
  const dialog = await screen.findByRole('dialog', { name: 'Detalhes da ordem #2' })
  const retryBtn = await within(dialog).findByRole('button', { name: 'Tentar detalhe novamente' })
  await user.click(retryBtn)

  await waitFor(() => {
    assert.ok(dialog.contains(document.activeElement))
    assert.notEqual(document.activeElement, document.body)
  })

  await act(async () => {
    pending.resolve(jsonResponse(makeDetail(order)))
  })
  assert.ok(await within(dialog).findByRole('heading', { name: 'Cadastro atual' }))
  assert.ok(dialog.contains(document.activeElement))

  await user.keyboard('{Escape}')
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null))
  await waitFor(() => assert.equal(document.activeElement, detailTrigger))
})

test('T20-P01, T20-P02, T21-P03, T22-P01, T22-P03: seletores têm 44px e alerta parcial empilha botão com alvo mínimo', async () => {
  let failList = false
  const order = makeOrder({
    status: 'IN_SERVICE',
    revision: 3,
    allowedTransitions: [],
    allowedResults: ['COMPLETED', 'NOT_PERFORMED'],
  })
  const next = makeDetail({
    ...order,
    status: 'NOT_PERFORMED',
    result: 'NOT_PERFORMED',
    revision: 4,
    closedAt: '2026-11-15T12:30:00.000Z',
    closedBy: '7',
    failureReason: 'Motivo fictício QA',
    allowedTransitions: [],
    allowedResults: [],
  })
  const state = {
    list: [order],
    onList: () => failList ? jsonResponse({}, 500) : jsonResponse(state.list),
    onPost: () => { failList = true; state.list = [next]; return jsonResponse(next) },
  }
  renderPage(makeApi(state).api)
  const user = userEvent.setup()

  const filterSelect = await screen.findByRole('combobox', { name: 'Situação' })
  const filterStyles = getComputedStyle(filterSelect)
  assert.equal(filterStyles.boxSizing, 'border-box')
  assert.equal(filterStyles.minHeight, '44px')

  await user.click(screen.getByRole('button', { name: 'Encerrar ordem #1' }))
  const formDialog = await screen.findByRole('dialog', { name: 'Encerrar ordem #1' })
  const resultSelect = within(formDialog).getByRole('combobox', { name: /Resultado do atendimento/ })
  const resultStyles = getComputedStyle(resultSelect)
  assert.equal(resultStyles.boxSizing, 'border-box')
  assert.equal(resultStyles.minHeight, '44px')

  await user.click(resultSelect)
  await user.click(await screen.findByRole('option', { name: 'Não realizada' }))
  await user.type(within(formDialog).getByLabelText(/Motivo da não realização/), 'Motivo fictício QA')
  await user.click(within(formDialog).getByRole('button', { name: 'Revisar encerramento' }))
  const confirmDialog = await screen.findByRole('dialog', { name: 'Confirmar encerramento da ordem #1' })
  await user.click(within(confirmDialog).getByRole('button', { name: 'Confirmar encerramento' }))

  const refreshBtn = await screen.findByRole('button', { name: 'Atualizar consulta' })
  const btnStyles = getComputedStyle(refreshBtn)
  assert.equal(btnStyles.minHeight, '44px')
  assert.equal(btnStyles.minWidth, '44px')
  assert.equal(btnStyles.overflowWrap, 'normal')
  const partialAlert = refreshBtn.closest('.MuiAlert-root')
  assert.ok(partialAlert)
  const actionContainer = refreshBtn.closest('.MuiAlert-action')
  assert.ok(actionContainer)

  const cssTexts = Array.from(document.styleSheets).flatMap((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText) } catch { return [] }
  }).join('\n')
  const alertClass = Array.from(partialAlert.classList).find((cls) => cls.startsWith('css-'))
  assert.ok(alertClass)
  assert.match(cssTexts, new RegExp(`\\.${alertClass}[^}]*flex-wrap:\\s*wrap`))
  assert.match(cssTexts, new RegExp(`\\.${alertClass}\\s+\\.MuiAlert-action[^}]*(?:flex:\\s*0\\s+0\\s+100%|flex-basis:\\s*100%)`))
  assert.match(cssTexts, new RegExp(`@media\\s*\\(min-width:\\s*900px\\)\\s*\\{[^}]*\\.${alertClass}[^}]*flex-wrap:\\s*nowrap`))
})
