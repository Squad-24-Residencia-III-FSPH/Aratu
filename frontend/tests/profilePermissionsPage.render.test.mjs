import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createTestViteServer } from './viteTestServer.mjs'
import react from '@vitejs/plugin-react'
import { PROFILE_ACCESS_DENIED_MESSAGE } from '../src/services/profileService.ts'
import { sessionFor } from './fixtures.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-profile-page-test-'))
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node }, DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot }, MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } })
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = id => clearTimeout(id)

const { act, cleanup, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createTestViteServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), cacheDir: viteCacheDir,
  plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: ProfilePermissionsPage }, { AuthContext }] = await Promise.all([
  vite.ssrLoadModule('/src/pages/profilePermissionsPage/ProfilePermissionsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
])

afterEach(() => { cleanup(); dom.window.localStorage.clear() })
after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

const profiles = [
  { id: '1', name: 'ADMINISTRADOR', displayName: 'Administrador do Sistema', description: 'Administração do sistema', active: true, revision: 1, defaultPath: '/administracao/usuarios', activeUserCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', name: 'GESTOR', displayName: 'Gestor de Frota', description: 'Gestão de frota', active: true, revision: 1, defaultPath: '/solicitacoes/analisar', activeUserCount: 2, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', name: 'SOLICITANTE', displayName: 'Solicitante Interno', description: 'Solicitações internas', active: true, revision: 1, defaultPath: '/solicitacoes/minhas', activeUserCount: 3, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', name: 'MOTORISTA', displayName: 'Motorista', description: 'Viagens atribuídas', active: true, revision: 1, defaultPath: '/viagens/minhas', activeUserCount: 4, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '5', name: 'ATENDENTE_SVO', displayName: 'Atendente SVO', description: 'Atendimento SVO', active: true, revision: 1, defaultPath: '/svo/solicitacoes', activeUserCount: 5, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '6', name: 'EQUIPE_SVO', displayName: 'Equipe SVO', description: 'Equipe SVO', active: true, revision: 1, defaultPath: '/svo/ordens', activeUserCount: 6, createdAt: '2026-01-01T00:00:00.000Z' },
]

function page(items = profiles) {
  return { profiles: items, total: items.length, page: 1, pageSize: 10, totalPages: items.length ? 1 : 0 }
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function mount(api, profile = 'ADMINISTRADOR') {
  render(createElement(AuthContext.Provider, {
    value: { session: sessionFor(profile), api, notice: '', logout() {}, signIn: async () => {} },
  }, createElement(ProfilePermissionsPage)))
}

test('renderiza o carregamento acessível e os perfis retornados pela API', async () => {
  let resolveProfiles
  const api = async (url) => {
    if (url === '/profiles/permissions') return response([])
    if (url.startsWith('/profiles?')) return new Promise((resolve) => { resolveProfiles = resolve })
    throw new Error(`Rota inesperada: ${url}`)
  }
  mount(api)

  assert.ok(screen.getByRole('heading', { name: 'Perfis de acesso' }))
  assert.ok(screen.getByText('Carregando perfis...'))
  await act(async () => resolveProfiles(response(page())))

  for (const displayName of profiles.map(({ displayName }) => displayName)) {
    assert.ok(await screen.findByText(displayName), `O perfil ${displayName} deve aparecer.`)
  }
  assert.ok(screen.getByRole('table', { name: 'Perfis de acesso' }))
})

test('preserva o estado de erro e permite consultar novamente', async () => {
  let attempts = 0
  const api = async (url) => {
    if (url === '/profiles/permissions') return response([])
    if (url.startsWith('/profiles?')) {
      attempts += 1
      return attempts === 1 ? response({ erro: 'Serviço de perfis indisponível.' }, 503) : response(page(profiles.slice(0, 1)))
    }
    throw new Error(`Rota inesperada: ${url}`)
  }
  const user = userEvent.setup()
  mount(api)

  assert.ok(await screen.findByText('Serviço de perfis indisponível.'))
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Administrador do Sistema'))
  assert.equal(attempts, 2)
})

test('apresenta acesso negado informado pela API', async () => {
  const api = async (url) => url === '/profiles/permissions'
    ? response([])
    : response({ erro: 'Acesso negado' }, 403)
  mount(api)

  assert.ok(await screen.findByText(PROFILE_ACCESS_DENIED_MESSAGE))
  assert.ok(screen.getByRole('alert'))
})

test('bloqueia perfil sem leitura e não consulta o servidor', async () => {
  let calls = 0
  mount(async () => { calls += 1; throw new Error('Perfil sem acesso não deve chamar a API.') }, 'MOTORISTA')

  assert.ok(screen.getByText('Acesso restrito'))
  assert.ok(screen.getByText('Seu perfil não pode consultar os perfis de acesso.'))
  await waitFor(() => assert.equal(calls, 0))
})
