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
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { sessionFor } from './fixtures.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-l02-sidebar-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
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
dom.window.requestAnimationFrame ??= (callback) => setTimeout(callback, 0)
dom.window.cancelAnimationFrame ??= (id) => clearTimeout(id)
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

const { render, cleanup, screen, fireEvent, act, within } = await import('@testing-library/react')
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: viteCacheDir,
  optimizeDeps: { noDiscovery: true },
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

const [{ AuthProvider }, { default: Sidebar }, { theme }] = await Promise.all([
  vite.ssrLoadModule('/src/auth/AuthProvider.tsx'),
  vite.ssrLoadModule('/src/components/Sidebar.tsx'),
  vite.ssrLoadModule('/src/theme.ts'),
])

const KEY = 'aratu.auth.session'
const originalMatchMedia = window.matchMedia

function mockCompactViewport(compact) {
  window.matchMedia = (query) => ({
    matches: compact && /max-width:\s*899\.95px/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.matchMedia = originalMatchMedia
})

after(async () => {
  await vite.close()
  dom.window.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
})

function renderSidebar(profile, initialEntries) {
  window.localStorage.setItem(KEY, JSON.stringify(sessionFor(profile)))
  return render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(
        AuthProvider,
        null,
        createElement(MemoryRouter, { initialEntries }, createElement(Sidebar)),
      ),
    ),
  )
}

test('Sidebar expõe landmark nav e aria-current="page" apenas na rota ativa', () => {
  mockCompactViewport(false)
  renderSidebar('GESTOR', ['/vehicle-documents?status=EXPIRING&days=15'])

  const nav = screen.getByRole('navigation', { name: 'Menu principal' })
  const documentsLink = within(nav).getByRole('link', { name: 'Documentos' })
  const inicioLink = within(nav).getByRole('link', { name: 'Início' })
  assert.equal(documentsLink.getAttribute('aria-current'), 'page')
  assert.equal(inicioLink.getAttribute('aria-current'), null)
})

test('Sidebar destaca Agenda de viagens com query params preservados', () => {
  mockCompactViewport(false)
  renderSidebar('GESTOR', ['/viagens/agenda?from=2026-11-24&to=2026-11-24'])

  const nav = screen.getByRole('navigation', { name: 'Menu principal' })
  const agendaLink = within(nav).getByRole('link', { name: 'Agenda de viagens' })
  assert.equal(agendaLink.getAttribute('aria-current'), 'page')
})

test('Sidebar distingue /solicitacoes/minhas de /solicitacoes/minhas?nova=1 em aria-current', () => {
  mockCompactViewport(false)
  renderSidebar('SOLICITANTE', ['/solicitacoes/minhas?nova=1'])

  const nav = screen.getByRole('navigation', { name: 'Menu principal' })
  const newRequestLink = within(nav).getByRole('link', { name: 'Nova Solicitação' })
  const myRequestsLink = within(nav).getByRole('link', { name: 'Minhas Solicitações' })
  assert.equal(newRequestLink.getAttribute('aria-current'), 'page')
  assert.equal(myRequestsLink.getAttribute('aria-current'), null)
})

test('Em viewport compacto (320/375px), o menu permite revelar todos os rótulos pelo toque e fecha ao acionar', async () => {
  mockCompactViewport(true)
  renderSidebar('GESTOR', ['/frota/inicio'])

  const expandButton = screen.getByRole('button', { name: 'Expandir menu' })
  assert.equal(expandButton.getAttribute('aria-expanded'), 'false')
  assert.equal(screen.queryByText('Documentos'), null)

  fireEvent.click(expandButton)

  const drawerNav = await screen.findByRole('navigation', { name: 'Menu principal' })
  assert.ok(within(drawerNav).getByText('Documentos'))
  assert.ok(within(drawerNav).getByText('Multas e Infrações'))
  assert.ok(within(drawerNav).getByText('Solicitações SVO'))
  assert.ok(within(drawerNav).getByText('CONTROLE'))

  fireEvent.click(within(drawerNav).getByRole('button', { name: 'Recolher menu' }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350))
  })
  assert.equal(screen.queryByText('Documentos'), null)
  assert.equal(expandButton.getAttribute('aria-expanded'), 'false')
})
