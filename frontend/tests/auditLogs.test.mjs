import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createTestViteServer } from './viteTestServer.mjs'
import react from '@vitejs/plugin-react'
import { sessionFor } from './fixtures.mjs'

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-audit-test-'))
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
const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createTestViteServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), cacheDir: viteCacheDir, plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const [{ default: AuditLogsPage }, { AuthContext }, service] = await Promise.all([
  vite.ssrLoadModule('/src/pages/AuditLogsPage.tsx'), vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/services/auditLogs.ts'),
])
afterEach(() => { cleanup(); dom.window.localStorage.clear() })
after(async () => { await vite.close(); dom.window.close() })

const log = (overrides = {}) => ({
  id: '41', registeredAt: '2026-11-18T12:15:00.000Z', userId: '7', actorName: null,
  operation: 'LOGIN_SUCCESS', table: 'auth.users', recordId: '7', reason: 'Acesso autorizado',
  before: null, after: { email: 'gestor@example.test', cpf: '***.***.***-09' },
  actorSnapshot: { email: 'gestor@example.test', role: 'GESTOR' }, sensitiveDataHidden: false,
  ...overrides,
})
const page = (logs = [log()], overrides = {}) => ({ logs, total: logs.length, page: 1, pageSize: 20, totalPages: 1, ...overrides })

function mount(api) {
  render(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: { session: sessionFor('GESTOR'), api, notice: '', logout() {}, signIn: async () => {} } }, createElement(AuditLogsPage))))
  return userEvent.setup()
}

test('rota de auditoria só fica disponível para Gestor e Administrador', async () => {
  const { resolveRoute } = await vite.ssrLoadModule('/src/routing/routeDecision.ts')
  for (const profile of ['GESTOR', 'ADMINISTRADOR']) assert.equal(resolveRoute(sessionFor(profile), '/auditoria').kind, 'audit')
  for (const profile of ['MOTORISTA', 'SOLICITANTE', 'ATENDENTE_SVO', 'EQUIPE_SVO']) assert.equal(resolveRoute(sessionFor(profile), '/auditoria').kind, 'redirect')
  assert.deepEqual(resolveRoute(null, '/auditoria'), { kind: 'redirect', to: '/login' })
})

test('envia contrato da API com pageSize e transforma data final inclusiva em exclusiva', async () => {
  const filters = { from: '2026-11-18', to: '2026-11-18', userId: '7', operation: 'UPDATE', table: 'fleet.vehicles' }
  const responseLog = log({ registeredAt: '2026-11-19T02:00:00Z', actorName: 'Gestor QA', operation: 'UPDATE', table: 'fleet.vehicles' })
  const user = mount(async (url, options) => {
    const request = new URL(url, 'http://localhost')
    assert.equal(request.pathname, '/audit-logs')
    assert.deepEqual(Object.fromEntries(request.searchParams), { page: '1', pageSize: '20', from: '2026-11-18', to: '2026-11-19', userId: '7', operation: 'UPDATE', table: 'fleet.vehicles' })
    assert.equal(options.method, 'GET')
    return Response.json(page([responseLog], { total: 8, totalPages: 1 }))
  })
  fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: filters.from } })
  fireEvent.change(screen.getByLabelText('Data final'), { target: { value: filters.to } })
  await user.type(screen.getByLabelText('ID do usuário'), filters.userId)
  await user.type(screen.getByLabelText('Ação'), filters.operation)
  await user.type(screen.getByLabelText('Entidade'), filters.table)
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  assert.ok(await screen.findByText('Gestor QA'))
  assert.equal(screen.queryByRole('columnheader', { name: 'Resumo' }), null)
  assert.ok(screen.getByText(/Horário de Maceió \(America\/Maceio\)/))
})

test('cliente envia os nomes de campos do contrato e descarta propriedades não contratadas', async () => {
  const filters = { from: '', to: '', userId: '', operation: '', table: '' }
  const raw = { ...log(), rawPassword: 'secreto' }
  const result = await service.readAuditLogs(async url => {
    const request = new URL(url, 'http://localhost')
    assert.deepEqual(Object.fromEntries(request.searchParams), { page: '2', pageSize: '20' })
    return Response.json(page([raw], { page: 2, total: 21, totalPages: 2 }))
  }, filters, 2, new AbortController().signal)
  assert.deepEqual(result.logs, [log()])
  assert.deepEqual([result.page, result.pageSize, result.totalPages], [2, 20, 2])
  assert.equal(result.partial, false)
})

test('valida formato dos filtros, datas e limite inclusivo de 366 dias', async () => {
  assert.equal(service.validateAuditFilters({ ...serviceFilters(), from: '2026-11-18', to: '2026-11-18' }), null)
  assert.deepEqual(service.validateAuditFilters({ ...serviceFilters(), from: '2026-11-18', to: '2027-11-19' }), {
    field: 'to', message: 'O período máximo da consulta é de 366 dias.',
  })
  assert.deepEqual(service.validateAuditFilters({ ...serviceFilters(), from: '2026-02-30' }), {
    field: 'from', message: 'Informe uma data inicial válida.',
  })
  assert.deepEqual(service.validateAuditFilters({ ...serviceFilters(), operation: 'drop table' }), {
    field: 'operation', message: 'Use o código da ação em letras maiúsculas, por exemplo: CREATE ou STATUS_CHANGE.',
  })
  assert.equal(service.validateAuditFilters({ ...serviceFilters(), table: 'logs; --' })?.field, 'table')
  assert.equal(service.validateAuditFilters({ ...serviceFilters(), userId: '0' })?.field, 'userId')
  assert.deepEqual(service.validateAuditFilters({ ...serviceFilters(), to: '9999-12-31' }), {
    field: 'to', message: 'A data final informada não pode ser convertida para o período da consulta.',
  })
  assert.equal(service.nextCivilDate('0099-12-31'), '0100-01-01')
  assert.equal(service.nextCivilDate('2026-11-18'), '2026-11-19')
})

function serviceFilters() { return { from: '', to: '', userId: '', operation: '', table: '' } }

test('informa estado parcial quando a API devolve registros incompatíveis junto com resultados válidos', async () => {
  mount(async () => Response.json(page([log(), null], { total: 2 })))
  assert.ok(await screen.findByText('A resposta contém registros inválidos que foram ocultados.'))
  assert.ok(screen.getByRole('table'))
})

test('mostra o estado de carregamento, vazio e o erro 400 que a API devolve', async () => {
  let resolveFirst
  mount(async () => new Promise(resolve => { resolveFirst = resolve }))
  assert.equal(screen.getByRole('status').getAttribute('aria-busy'), 'true')
  resolveFirst(Response.json(page([], { total: 0, totalPages: 0 })))
  assert.ok(await screen.findByText('Nenhum registro encontrado.'))
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Próxima' }).disabled, true))
})

test('exibe o erro 400 da API e distingue acesso negado (403)', async () => {
  const user = mount(async () => Response.json({ erro: 'O período máximo da consulta é de 366 dias.' }, { status: 400 }))
  assert.ok(await screen.findByText('O período máximo da consulta é de 366 dias.'))
  cleanup()
  mount(async () => new Response(null, { status: 403 }))
  assert.ok(await screen.findByText('Seu perfil não pode consultar estes registros.'))
  assert.equal(screen.queryByRole('table'), null)
})

test('período acima de 366 dias é avisado antes da chamada à API', async () => {
  let calls = 0
  const user = mount(async () => { calls++; return Response.json(page()) })
  await screen.findByRole('table')
  fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2025-11-18' } })
  fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-11-19' } })
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  const alert = screen.getByRole('alert')
  const startDate = screen.getByLabelText('Data inicial')
  const endDate = screen.getByLabelText('Data final')
  assert.ok(alert.textContent.includes('366 dias'))
  assert.equal(startDate.getAttribute('aria-invalid'), 'false')
  assert.equal(endDate.getAttribute('aria-invalid'), 'true')
  assert.ok(endDate.getAttribute('aria-describedby').includes(alert.id))
  assert.equal(calls, 1)
})

test('associa erro de formato ao campo de ação sem marcar os outros filtros inválidos', async () => {
  const user = mount(async () => Response.json(page()))
  await screen.findByRole('table')
  await user.type(screen.getByLabelText('Ação'), 'invalid')
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
  const action = screen.getByLabelText('Ação')
  const entity = screen.getByLabelText('Entidade')
  const alert = screen.getByRole('alert')
  assert.equal(action.getAttribute('aria-invalid'), 'true')
  assert.equal(entity.getAttribute('aria-invalid'), 'false')
  assert.ok(action.getAttribute('aria-describedby').includes(alert.id))
  assert.ok(alert.textContent.includes('letras maiúsculas'))
})

test('usa a paginação retornada pelo backend, fallback do usuário e detalhes com máscara da API', async () => {
  const calls = []
  const user = mount(async url => {
    const params = new URL(url, 'http://localhost').searchParams
    const currentPage = Number(params.get('page'))
    calls.push(currentPage)
    return Response.json(page([log({ id: String(currentPage), sensitiveDataHidden: currentPage === 2,
      before: currentPage === 2 ? null : { cpf: '***.***.***-09' }, after: currentPage === 2 ? null : { email: 'gestor@example.test' } })],
    { page: currentPage, total: 21, totalPages: 2 }))
  })
  await screen.findByRole('table')
  assert.ok(screen.getByText('gestor@example.test'))
  const trigger = screen.getByRole('button', { name: 'Ver detalhes do registro 1' })
  await user.click(trigger)
  let dialog = await screen.findByRole('dialog', { name: 'Detalhes do registro 1' })
  assert.ok(dialog.textContent.includes('Login realizado em Usuários'))
  assert.ok(dialog.textContent.includes('***.***.***-09'))
  assert.equal(dialog.textContent.includes('Acesso autorizado'), true)
  fireEvent.keyDown(document.querySelector('.MuiModal-root'), { key: 'Escape', code: 'Escape', which: 27 })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)) })
  assert.equal(screen.queryByRole('dialog'), null)
  assert.equal(document.activeElement, trigger)
  await user.click(screen.getByRole('button', { name: 'Próxima' }))
  assert.deepEqual(calls, [1, 2])
  assert.equal(screen.getByRole('button', { name: 'Anterior' }).disabled, false)
  assert.equal(screen.getByRole('button', { name: 'Próxima' }).disabled, true)
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes do registro 2' }))
  assert.ok(await screen.findByText('Dados sensíveis do SVO ocultados por política (LGPD).'))
})

test('400 de serviço preserva a orientação devolvida e datas usam zona America/Maceio', async () => {
  const request = service.readAuditLogs(async () => Response.json({ erro: 'Ação desconhecida.' }, { status: 400 }), serviceFilters(), 1, new AbortController().signal)
  await assert.rejects(request, error => error instanceof service.AuditRequestError && error.message === 'Ação desconhecida.')
  assert.equal(service.AUDIT_TIME_ZONE, 'America/Maceio')
})
