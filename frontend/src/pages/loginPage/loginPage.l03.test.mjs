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

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-l03-login-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', {
  url: 'http://localhost/',
})
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

const { cleanup, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default

const frontendRoot = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

const [{ ThemeProvider }, { theme }, { AuthContext }, { default: LoginPage }] = await Promise.all([
  vite.ssrLoadModule('@mui/material/styles'),
  vite.ssrLoadModule('/src/theme.ts'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/pages/loginPage/LoginPage.tsx'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

function relativeLuminance(hex) {
  const clean = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(clean.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA)
  const lumB = relativeLuminance(hexB)
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05)
}

function renderLogin(overrides = {}) {
  const calls = []
  const auth = {
    session: null,
    notice: '',
    logout() {},
    api: async () => new Response(),
    signIn: async (credentials, options) => {
      calls.push({ credentials, options })
      if (overrides.onSignIn) return overrides.onSignIn(credentials, options)
    },
    ...overrides,
  }
  const view = render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(AuthContext.Provider, { value: auth }, createElement(LoginPage)),
    ),
  )
  return { ...view, calls }
}

test('LoginPage.module.css segue camelCase sem :global(.Mui...) e mantém contraste >= 4,5:1', () => {
  const cssPath = path.join(frontendRoot, 'src/pages/loginPage/LoginPage.module.css')
  const css = fs.readFileSync(cssPath, 'utf-8')
  assert.doesNotMatch(css, /:global\(\.Mui/)
  assert.doesNotMatch(css, /\.[a-zA-Z0-9]+-[a-zA-Z0-9-]+\s*[,{:\s]/)

  assert.ok(contrastRatio('#111827', '#FF6B00') >= 4.5, 'Texto escuro sobre laranja institucional')
  assert.ok(contrastRatio('#b94700', '#ffffff') >= 4.5, 'Link de recuperação sobre branco')
  assert.ok(contrastRatio('#4b5563', '#ffffff') >= 4.5, 'Rodapé e subtítulo sobre branco')
})

test('T01-P02/P03 e validação cliente: foca e-mail, valida campos obrigatórios e formato, e abre recuperação acessível', async () => {
  const { calls } = renderLogin()
  const user = userEvent.setup()

  const emailInput = screen.getByRole('textbox', { name: /E-mail institucional/ })
  const passwordInput = document.querySelector('input[name="senha"]')
  assert.ok(passwordInput)
  assert.equal(document.activeElement, emailInput)
  assert.equal(document.title, 'Entrar — Aratu')

  const submitButton = screen.getByRole('button', { name: 'Entrar' })
  await user.click(submitButton)

  assert.equal(calls.length, 0)
  assert.equal(document.activeElement, emailInput)
  assert.equal(emailInput.getAttribute('aria-invalid'), 'true')
  assert.equal(passwordInput.getAttribute('aria-invalid'), 'true')
  const alerts = screen.getAllByRole('alert')
  assert.ok(alerts.some((node) => node.textContent === 'Informe seu e-mail.'))
  assert.ok(alerts.some((node) => node.textContent === 'Informe sua senha.'))

  // E-mail malformado com senha preenchida mantém foco no e-mail e não chama API
  await user.type(emailInput, 'usuario-sem-arroba')
  await user.type(passwordInput, 'senha-ficticia')
  await user.click(submitButton)
  assert.equal(calls.length, 0)
  assert.equal(document.activeElement, emailInput)
  assert.ok(screen.getByText('Informe um e-mail válido.'))

  // E-mail válido sem senha move o foco para a senha
  await user.clear(emailInput)
  await user.type(emailInput, 'pessoa@example.test')
  await user.clear(passwordInput)
  await user.click(submitButton)
  assert.equal(calls.length, 0)
  assert.equal(document.activeElement, passwordInput)
  assert.ok(screen.getByText('Informe sua senha.'))

  // Recuperação de senha permanece acessível com botão dedicado e feedback claro
  const recoveryButton = screen.getByRole('button', { name: 'Esqueci minha senha' })
  await user.click(recoveryButton)
  assert.ok(await screen.findByText('A recuperação de senha ainda não está disponível.'))
})

test('LoginPage permite cancelar espera de preparação e previne submissão dupla', async () => {
  let rejectPending
  const { calls } = renderLogin({
    onSignIn: (_credentials, options) => {
      options?.onPreparing?.(true)
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('Operação cancelada.')), { once: true })
        rejectPending = reject
      })
    },
  })

  const user = userEvent.setup()
  const emailInput = screen.getByRole('textbox', { name: /E-mail institucional/ })
  const passwordInput = document.querySelector('input[name="senha"]')
  await user.type(emailInput, 'pessoa@example.test')
  await user.type(passwordInput, 'senha-ficticia')

  const submitButton = screen.getByRole('button', { name: 'Entrar' })
  await user.click(submitButton)
  assert.equal(calls.length, 1)

  const form = emailInput.closest('form')
  assert.equal(form?.getAttribute('aria-busy'), 'true')

  const cancelWaitBtn = await screen.findByRole('button', { name: 'Cancelar espera' })
  await user.click(cancelWaitBtn)
  await waitFor(() => assert.ok(screen.getByText('Operação cancelada.')))
  if (rejectPending) rejectPending(new Error('Operação cancelada.'))
})
