import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { testing, vite, closeAuthDom } from './auth-dom.fixture.mjs'
import { sessionFor } from './fixtures.mjs'
import { makeDriverTrip } from './my-trips.fixture.mjs'

const { render, cleanup, fireEvent, screen, waitFor, within } = testing
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

test('retoma hodômetro e rota após expiração para o mesmo motorista e descarta na troca de conta', async () => {
  const initial = sessionFor('MOTORISTA', 3600)
  const trip = makeDriverTrip(8, { status: 'IN_PROGRESS', startKm: 1450, startedAt: new Date().toISOString() })
  let renewed = sessionFor('MOTORISTA', 7200)
  let expire = false
  let tripLookupUnavailable = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/login')) {
      expire = false
      return Response.json(renewed)
    }
    if (url.endsWith('/trips/mine')) {
      return tripLookupUnavailable
        ? Response.json({ erro: 'Consulta de viagens indisponível.' }, { status: 503 })
        : Response.json([trip])
    }
    if (url.endsWith('/auth/me') && expire) return Response.json({ erro: 'Token inválido ou expirado.' }, { status: 401 })
    return Response.json({})
  }

  window.localStorage.setItem(KEY, JSON.stringify(initial))
  renderApp(null, '/viagens/minhas?origem=teste')
  fireEvent.click(await screen.findByRole('button', { name: /Finalizar viagem #8/ }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Quilometragem final/ }), { target: { value: '1570' } })

  async function expireAndSignIn() {
    expire = true
    fireEvent.focus(window)
    await waitFor(() => assert.equal(window.location.hash, '#/login'))
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'motorista@example.test' } })
    fireEvent.change(screen.getByLabelText(/senha/i, { selector: 'input' }), { target: { value: 'senha-ficticia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  }

  tripLookupUnavailable = true
  await expireAndSignIn()
  await waitFor(() => assert.equal(window.location.hash, '#/viagens/minhas?origem=teste'))
  const resumed = await screen.findByRole('dialog', { name: /Finalizar viagem #8/ })
  assert.equal(within(resumed).getByRole('textbox', { name: /Quilometragem final/ }).value, '1570')
  const refreshTrip = await within(resumed).findByRole('button', { name: 'Atualizar situação' })
  tripLookupUnavailable = false
  fireEvent.click(refreshTrip)
  await waitFor(() => assert.ok(within(resumed).getByText(/Viagem #8 para Unidade fictícia 8/)))
  assert.equal(within(resumed).getByRole('textbox', { name: /Quilometragem final/ }).value, '1570')

  renewed = sessionFor('MOTORISTA', 7200, { id: 2 })
  await expireAndSignIn()
  await waitFor(() => assert.equal(window.location.hash, '#/viagens/minhas'))
  await screen.findByRole('button', { name: /Finalizar viagem #8/ })
  assert.equal(screen.queryByRole('dialog'), null)
})

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
