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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-l04-profiles-'))

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  Event: { configurable: true, value: dom.window.Event },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
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
globalThis.requestAnimationFrame ??= dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame ??= dom.window.cancelAnimationFrame.bind(dom.window)

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  cacheDir: viteCacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})
const [{ default: ProfilePermissionsPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/profilePermissionsPage/ProfilePermissionsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const profilesPayload = [
  { id: '1', name: 'ADMINISTRADOR', description: 'Administração do sistema', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'GESTOR', description: 'Gestão de frota', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', name: 'SOLICITANTE', description: 'Solicitações internas', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', name: 'MOTORISTA', description: 'Viagens atribuídas', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '5', name: 'ATENDENTE_SVO', description: 'Atendimento SVO', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '6', name: 'EQUIPE_SVO', description: 'Equipe SVO', createdAt: '2026-01-01T00:00:00.000Z' },
]

function renderProfilesPage(api) {
  const auth = {
    session: sessionFor('ADMINISTRADOR'),
    signIn: async () => {},
    logout() {},
    api,
    notice: '',
  }
  return render(createElement(
    AuthContext.Provider,
    { value: auth },
    createElement(ProfilePermissionsPage),
  ))
}

test('T03-P01: rotula perfis como consulta somente leitura e encaminha atribuição para Usuários', async () => {
  renderProfilesPage(async (requestPath) => {
    assert.equal(requestPath, '/profiles')
    return new Response(JSON.stringify(profilesPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  await screen.findByRole('heading', { name: 'Gestor de Frota' })
  assert.equal(document.title, 'Perfis e permissões (consulta) — Aratu')
  assert.equal(screen.queryByRole('button', { name: /Editar Permissões/i }), null)
  assert.ok(screen.getByText(/Consulta somente leitura/))

  const headerShortcut = screen.getByRole('link', { name: 'Atribuir perfil em Usuários' })
  assert.equal(headerShortcut.getAttribute('href'), '#/administracao/usuarios')

  const matrixRegion = screen.getByRole('region', { name: /Matriz provisória de permissões/ })
  assert.equal(matrixRegion.getAttribute('tabindex'), '0')

  const user = userEvent.setup()
  const inspectButton = screen.getByRole('button', { name: 'Consultar detalhes do perfil Gestor de Frota' })
  await user.click(inspectButton)

  const dialog = await screen.findByRole('dialog')
  assert.ok(within(dialog).getByText('Consulta de perfil: Gestor de Frota'))
  assert.ok(within(dialog).getByText(/Esta tela é somente consultiva/))

  const dialogShortcut = within(dialog).getByRole('link', { name: 'Atribuir em Usuários' })
  assert.equal(dialogShortcut.getAttribute('href'), '#/administracao/usuarios')

  await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))

  // Confirma que Esc também fecha o diálogo consultivo e devolve foco ao botão acionador
  await user.click(inspectButton)
  const reopenedDialog = await screen.findByRole('dialog')
  assert.ok(within(reopenedDialog).getByText('Consulta de perfil: Gestor de Frota'))
  await user.keyboard('{Escape}')
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('dialog')), false))
  await waitFor(() => assert.equal(document.activeElement, inspectButton))
})
