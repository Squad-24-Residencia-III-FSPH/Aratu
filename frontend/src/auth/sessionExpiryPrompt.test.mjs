// Somente dados 100% fictícios (LGPD/SVO).
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { tokenFor } from '../../tests/fixtures.mjs'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-session-expiry-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
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

const { render, cleanup, screen, act, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

const [{ ThemeProvider }, { theme }, { AuthProvider }, { useSessionDraft }] = await Promise.all([
  vite.ssrLoadModule('@mui/material/styles'),
  vite.ssrLoadModule('/src/theme.ts'),
  vite.ssrLoadModule('/src/auth/AuthProvider.tsx'),
  vite.ssrLoadModule('/src/auth/sessionDrafts.ts'),
])

const KEY = 'aratu.auth.session'
const originalFetch = globalThis.fetch

function sessionWithId(perfil, id, seconds) {
  return {
    token: tokenFor(perfil, seconds, { id }),
    nome: `Pessoa Fictícia ${id}`,
    perfil,
  }
}

function renderWithAuth(ui) {
  return render(createElement(ThemeProvider, { theme }, createElement(AuthProvider, null, ui)))
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  globalThis.fetch = originalFetch
})
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

test('aviso acessível aparece antes da expiração (incluindo a 1 minuto), valida e-mail/senha, permite colar e devolve foco com Esc', async () => {
  const session = sessionWithId('SOLICITANTE', 101, 60)
  window.localStorage.setItem(KEY, JSON.stringify(session))
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls++
    return Response.json({})
  }

  renderWithAuth(createElement('main', null, 'Conteúdo'))

  const alert = await screen.findByRole('alert')
  assert.match(alert.textContent, /Sua sessão expira em/)
  const renewButton = screen.getByRole('button', { name: 'Renovar sessão' })
  const user = userEvent.setup()
  await user.click(renewButton)

  const dialog = await screen.findByRole('dialog', { name: 'Renovar sessão' })
  assert.ok(dialog.getAttribute('aria-labelledby'))
  assert.ok(dialog.getAttribute('aria-describedby'))

  // Validação cliente sem disparar POST.
  await user.click(screen.getByRole('button', { name: 'Confirmar e continuar' }))
  assert.equal(fetchCalls, 0)
  const emailField = screen.getByRole('textbox', { name: /E-mail institucional/ })
  assert.equal(emailField.getAttribute('aria-invalid'), 'true')
  assert.equal(document.activeElement, emailField)

  await user.type(emailField, 'invalido')
  await user.click(screen.getByRole('button', { name: 'Confirmar e continuar' }))
  assert.equal(fetchCalls, 0)
  assert.ok(screen.getByText('Informe um e-mail válido.').closest('[role=alert]'))

  // WCAG 3.3.8: colar senha precisa funcionar.
  const passwordField = screen.getByLabelText(/Senha/)
  await user.click(passwordField)
  await user.paste('senha-colada-ficticia')
  assert.equal(passwordField.value, 'senha-colada-ficticia')

  // Fechar com Esc devolve foco ao botão acionador.
  await user.keyboard('{Escape}')
  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
  await waitFor(() => assert.ok(document.activeElement === screen.getByRole('button', { name: 'Renovar sessão' })))
})

test('reautenticação rejeita credencial de outro usuário e renova sessão preservando rascunho para o mesmo usuário', async () => {
  const initial = sessionWithId('GESTOR', 101, 60)
  const otherUser = sessionWithId('GESTOR', 202, 3600)
  const renewed = sessionWithId('GESTOR', 101, 3600)
  window.localStorage.setItem(KEY, JSON.stringify(initial))

  let draftApi
  function DraftForm() {
    const [draft, setDraft] = useSessionDraft('trip-confirmation:filters', { from: '' })
    draftApi = { draft, setDraft }
    return createElement('div', null, draft.from || 'SEM_FILTRO')
  }

  renderWithAuth(createElement(DraftForm))
  act(() => draftApi.setDraft({ from: '2026-11-30' }))

  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Renovar sessão' }))
  await user.type(screen.getByRole('textbox', { name: /E-mail institucional/ }), 'outro@example.invalid')
  await user.type(screen.getByLabelText(/Senha/), 'senha-ficticia')

  // Tentativa com outra conta mantém sessão atual e rascunho intactos.
  globalThis.fetch = async () => Response.json(otherUser)
  await user.click(screen.getByRole('button', { name: 'Confirmar e continuar' }))
  const errorAlert = await screen.findByText(/pertencem a outra conta/)
  assert.ok(errorAlert.closest('[role=alert]'))
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).token, initial.token)
  assert.deepEqual(draftApi.draft, { from: '2026-11-30' })

  // Mesma conta renova sessão sem perder rascunho em memória.
  await user.clear(screen.getByRole('textbox', { name: /E-mail institucional/ }))
  await user.type(screen.getByRole('textbox', { name: /E-mail institucional/ }), 'mesmo@example.invalid')
  globalThis.fetch = async () => Response.json(renewed)
  await user.click(screen.getByRole('button', { name: 'Confirmar e continuar' }))

  await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).token, renewed.token)
  assert.deepEqual(draftApi.draft, { from: '2026-11-30' })
  assert.ok(screen.getByText('Sessão renovada com sucesso.').closest('[role=status]'))
})
