import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { dom, testing, vite, userEvent, closeAuthDom } from './auth-dom.fixture.mjs'
import { sessionFor as createSession } from './fixtures.mjs'

const { render, cleanup, screen, act, waitFor } = testing
const [{ AuthProvider }, { default: Layout }, { default: LoginPage }, { default: App }, { theme }] = await Promise.all([
  vite.ssrLoadModule('/src/auth/AuthProvider.tsx'), vite.ssrLoadModule('/src/components/layout.tsx'),
  vite.ssrLoadModule('/src/pages/loginPage/LoginPage.tsx'), vite.ssrLoadModule('/src/App.tsx'), vite.ssrLoadModule('/src/theme.ts'),
])
const KEY = 'aratu.auth.session'
const originalFetch = globalThis.fetch
const sessionFor = (...args) => ({ ...createSession(...args), permissions: [] })
afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear(); globalThis.fetch = originalFetch; window.history.replaceState(null, '', '/') })
after(closeAuthDom)

function Content() {
  const [value, setValue] = useState('')
  return createElement('label', null, 'Rascunho fictício', createElement('input', { value, onChange: (event) => setValue(event.target.value) }))
}
function renderFlow(profile) {
  if (profile) window.localStorage.setItem(KEY, JSON.stringify(sessionFor(profile)))
  return render(createElement(ThemeProvider, { theme }, createElement(AuthProvider, null,
    createElement(MemoryRouter, { initialEntries: ['/protected'] }, createElement(Routes, null,
      createElement(Route, { path: '/protected', element: createElement(Layout, null, createElement(Content)) }),
      createElement(Route, { path: '/login', element: createElement(LoginPage) }),
    )),
  )))
}
async function openLogoutMenu(user) {
  await user.click(screen.getByRole('button', { name: /^Conta de / }))
  return screen.getByRole('menuitem', { name: 'Sair', exact: true })
}
for (const profile of ['ADMINISTRADOR', 'GESTOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
  test(`Sair disponível para ${profile}, desmonta conteúdo e leva ao login`, async () => {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ mensagem: 'ok' }) }
    renderFlow(profile)
    const user = userEvent.setup()
    await user.click(await openLogoutMenu(user))
    assert.ok(await screen.findByRole('heading', { name: 'Acesse o Aratu' }))
    assert.equal(screen.queryByLabelText('Rascunho fictício'), null)
    assert.equal(screen.queryByRole('button', { name: /^Conta de / }), null)
    assert.equal(window.localStorage.getItem(KEY), null)
    assert.equal(calls, 1)
    assert.equal(document.activeElement, screen.getByRole('textbox', { name: 'E-mail institucional' }))
    assert.ok(screen.getByText('Você saiu deste navegador.').closest('[role=status]'))
  })
}

test('Sair é alcançável por Tab e acionável com Enter', async () => {
  globalThis.fetch = async () => Response.json({ mensagem: 'ok' })
  renderFlow('GESTOR')
  const user = userEvent.setup(), button = screen.getByRole('button', { name: /^Conta de / })
  for (let step = 0; step < 30 && document.activeElement !== button; step++) await user.tab()
  assert.equal(document.activeElement, button)
  await user.keyboard('{Enter}')
  const logoutItem = screen.getByRole('menuitem', { name: 'Sair', exact: true })
  assert.equal(document.activeElement, logoutItem)
  await user.keyboard('{Enter}')
  assert.ok(await screen.findByRole('heading', { name: 'Acesse o Aratu' }))
})

test('troca de token descarta formulários da sessão anterior', async () => {
  renderFlow('GESTOR')
  await userEvent.setup().type(screen.getByLabelText('Rascunho fictício'), 'informação sintética da conta A')
  window.localStorage.setItem(KEY, JSON.stringify(sessionFor('MOTORISTA')))
  act(() => window.dispatchEvent(new dom.window.StorageEvent('storage', { key: KEY, storageArea: window.localStorage })))
  assert.equal(screen.getByLabelText('Rascunho fictício').value, '')
})

test('layout sem sessão redireciona sem mostrar conteúdo', async () => {
  renderFlow()
  assert.ok(await screen.findByRole('heading', { name: 'Acesse o Aratu' }))
  assert.equal(screen.queryByLabelText('Rascunho fictício'), null)
})

test('rota real legada também exige sessão após logout', async () => {
  window.history.replaceState(null, '', '/#/minhas-solicitacoes')
  window.localStorage.setItem(KEY, JSON.stringify({ ...sessionFor('SOLICITANTE'), permissions: ['requests:read:own'] }))
  globalThis.fetch = async () => Response.json({ mensagem: 'ok' })
  render(createElement(ThemeProvider, { theme }, createElement(AuthProvider, null, createElement(App))))
  const user = userEvent.setup()
  await user.click(await openLogoutMenu(user))
  await waitFor(() => assert.equal(window.location.hash, '#/login'))
  assert.ok(screen.getByRole('heading', { name: 'Acesse o Aratu' }))
  act(() => { window.location.hash = '/minhas-solicitacoes'; window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')) })
  await waitFor(() => assert.equal(window.location.hash, '#/login'))
  assert.equal(screen.queryByRole('button', { name: /^Conta de / }), null)
})

test('falha de confirmação aparece no login como mensagem de status', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline') }
  renderFlow('GESTOR')
  const user = userEvent.setup()
  await user.click(await openLogoutMenu(user))
  assert.ok(await screen.findByText('Você saiu deste navegador, mas não foi possível confirmar a saída com o servidor.'))
  assert.ok(screen.getByText('Você saiu deste navegador, mas não foi possível confirmar a saída com o servidor.').closest('[role=status]'))
})
