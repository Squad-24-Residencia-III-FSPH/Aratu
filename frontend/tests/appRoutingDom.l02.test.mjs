import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { testing, vite, closeAuthDom } from './auth-dom.fixture.mjs'
import { sessionFor } from './fixtures.mjs'

const { render, cleanup, screen, waitFor, within } = testing
const [{ AuthProvider }, { default: App }, { theme }] = await Promise.all([
  vite.ssrLoadModule('/src/auth/AuthProvider.tsx'),
  vite.ssrLoadModule('/src/App.tsx'),
  vite.ssrLoadModule('/src/theme.ts'),
])

const KEY = 'aratu.auth.session'
const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  globalThis.fetch = originalFetch
  window.history.replaceState(null, '', '/')
  document.title = 'Aratu — Acesso ao sistema FSPH'
})
after(closeAuthDom)

function renderApp(profile, hashPath) {
  if (profile) window.localStorage.setItem(KEY, JSON.stringify(sessionFor(profile)))
  window.history.replaceState(null, '', `/#${hashPath}`)
  return render(
    createElement(ThemeProvider, { theme }, createElement(AuthProvider, null, createElement(App))),
  )
}

test('App aplica guarda no alias /minhas-solicitacoes e abre Nova Solicitação com ?nova=1', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/requests')) return Response.json({ items: [], total: 0, page: 1, pageSize: 20 })
    if (url.includes('/services')) return Response.json([])
    return Response.json({ items: [] })
  }

  renderApp('MOTORISTA', '/minhas-solicitacoes')
  await waitFor(() => assert.equal(window.location.hash, '#/viagens/minhas'))
  assert.equal(document.querySelectorAll('main').length, 1)
  assert.equal(document.title, 'Minhas viagens — Aratu')

  cleanup()
  window.localStorage.clear()
  renderApp('SOLICITANTE', '/minhas-solicitacoes?status=PENDING')
  await waitFor(() => assert.equal(window.location.hash, '#/solicitacoes/minhas?status=PENDING'))
  assert.equal(document.querySelectorAll('main').length, 1)
  assert.equal(document.title, 'Minhas solicitações — Aratu')

  cleanup()
  window.localStorage.clear()
  renderApp('SOLICITANTE', '/solicitacoes/minhas?nova=1')
  const dialog = await screen.findByRole('dialog')
  assert.ok(within(dialog).getByRole('heading', { name: 'Nova Solicitação de Viagem' }))
})

test('App integra as 4 novas telas (L10, L11, L16, L20), alias /audit-logs e mantém único main e título', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/vehicle-documents')) return Response.json({ referenceDate: '2026-11-24', alertDays: 30, items: [] })
    if (url.includes('/audit-logs')) return Response.json({ logs: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
    if (url.includes('/svo/occurrences')) return Response.json([])
    if (url.includes('/svo/orders')) return Response.json([])
    return Response.json([])
  }

  renderApp('ADMINISTRADOR', '/audit-logs?operation=UPDATE')
  await waitFor(() => assert.equal(window.location.hash, '#/auditoria?operation=UPDATE'))
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Trilha de Auditoria — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('ATENDENTE_SVO', '/svo/solicitacoes')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Solicitações SVO — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('GESTOR', '/vehicle-documents')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Documentos de Veículos — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('GESTOR', '/multas')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Multas e Infrações — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('GESTOR', '/viagens/agenda?from=2026-11-24&to=2026-11-24')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Agenda de viagens — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('ADMINISTRADOR', '/viagens/agenda')
  await waitFor(() => assert.equal(window.location.hash, '#/administracao/usuarios'))

  cleanup()
  window.localStorage.clear()
  renderApp('ADMINISTRADOR', '/frota/dashboard')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Dashboard da frota — Aratu'))

  cleanup()
  window.localStorage.clear()
  renderApp('ADMINISTRADOR', '/svo/acompanhamento')
  assert.equal(document.querySelectorAll('main').length, 1)
  await waitFor(() => assert.equal(document.title, 'Acompanhamento de ordens — Aratu'))
})
