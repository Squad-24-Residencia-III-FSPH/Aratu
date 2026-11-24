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

const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-audit-logs-test-'))
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })

Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  DocumentFragment: { configurable: true, value: dom.window.DocumentFragment },
  ShadowRoot: { configurable: true, value: dom.window.ShadowRoot },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
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
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { cleanup, render, screen, waitFor } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  cacheDir: viteCacheDir,
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

const [
  { default: AuditLogsPage },
  { AuthContext },
  { buildAuditLogsQuery, listAuditLogs },
  { formatAuditDateTime, resolveAuditRecordTarget },
] = await Promise.all([
  vite.ssrLoadModule('/src/pages/auditLogsPage/AuditLogsPage.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('/src/services/auditLogsService.ts'),
  vite.ssrLoadModule('/src/pages/auditLogsPage/auditLogPresentation.ts'),
])

afterEach(() => {
  cleanup()
  dom.window.localStorage.clear()
})

after(async () => {
  await vite.close()
  fs.rmSync(viteCacheDir, { recursive: true, force: true })
  dom.window.close()
})

function makeLog(overrides = {}) {
  return {
    id: '547',
    registeredAt: '2026-11-23T02:59:26.642Z',
    userId: '2',
    actorName: 'Gestor Fictício',
    operation: 'UPDATE',
    table: 'fleet.vehicles',
    recordId: '14',
    reason: 'Atualização cadastral fictícia',
    before: { capacity: 4 },
    after: { capacity: 6 },
    actorSnapshot: { id: '2', name: 'Gestor Fictício', role: 'GESTOR' },
    sensitiveDataHidden: false,
    ...overrides,
  }
}

function mountPage(api, profile = 'GESTOR') {
  render(createElement(
    AuthContext.Provider,
    {
      value: {
        session: sessionFor(profile),
        api,
        notice: '',
        logout() {},
        signIn: async () => {},
      },
    },
    createElement(AuditLogsPage),
  ))
  return userEvent.setup()
}

test('auditLogsService serializa filtros em inglês e valida envelope', async () => {
  assert.equal(buildAuditLogsQuery({}), '')
  assert.equal(
    buildAuditLogsQuery({
      from: '2026-11-22',
      to: '2026-11-23',
      userId: ' 2 ',
      operation: 'EXPORT',
      table: 'reports.fleet-fuelings',
      page: 2,
      pageSize: 20,
    }),
    '?from=2026-11-22&to=2026-11-23&userId=2&operation=EXPORT&table=reports.fleet-fuelings&page=2&pageSize=20',
  )

  const page = await listAuditLogs(async () => Response.json({
    logs: [makeLog()],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }))
  assert.equal(page.logs[0].id, '547')

  await assert.rejects(
    listAuditLogs(async () => Response.json({ erro: 'userId deve ser um identificador válido.' }, { status: 400 })),
    { message: 'userId deve ser um identificador válido.' },
  )
  await assert.rejects(
    listAuditLogs(async () => Response.json({ logs: 'invalido' })),
    /formato inválido/,
  )
})

test('formatAuditDateTime usa fuso America/Maceio e resolveAuditRecordTarget respeita RBAC', () => {
  const formatted = formatAuditDateTime('2026-11-23T02:59:26.642Z')
  assert.match(formatted, /22\/11\/2026/)
  assert.match(formatted, /23:59:26/)

  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'auth.users' }), 'ADMINISTRADOR')?.path, '/administracao/usuarios')
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'auth.users' }), 'GESTOR'), null)
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'trip.requests' }), 'GESTOR')?.path, '/frota/solicitacoes/analise')
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'trip.requests' }), 'ADMINISTRADOR'), null)
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'svo.execution_orders' }), 'GESTOR')?.path, '/svo/acompanhamento')
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'svo.execution_orders' }), 'ADMINISTRADOR'), null)
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'fleet.fines' }), 'GESTOR'), null)
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'svo.occurrences' }), 'GESTOR'), null)
  assert.equal(resolveAuditRecordTarget(makeLog({ table: 'reports.fleet-fuelings' }), 'ADMINISTRADOR')?.path, '/relatorios')
})

test('perfil sem permissão vê estado proibido e não chama a API', () => {
  let called = false
  mountPage(async () => {
    called = true
    return Response.json({ logs: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  }, 'MOTORISTA')
  assert.ok(screen.getByText('Acesso restrito à auditoria'))
  assert.equal(called, false)
})

test('carregando, lista ideal, erro recuperável e vazio funcionam corretamente', async () => {
  let resolveFirst
  let calls = 0
  const user = mountPage(async () => {
    calls += 1
    if (calls === 1) return new Promise((resolve) => { resolveFirst = resolve })
    if (calls === 2) return Response.json({ erro: 'Falha temporária na auditoria.' }, { status: 503 })
    return Response.json({ logs: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })
  })

  assert.equal(document.title, 'Trilha de Auditoria — Aratu')
  assert.ok(screen.getByText('Carregando registros de auditoria...'))
  assert.equal(screen.getByRole('region', { name: /Registros da trilha de auditoria/ }).getAttribute('aria-busy'), 'true')

  resolveFirst(Response.json({
    logs: [makeLog()],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }))

  assert.ok(await screen.findByText('Gestor Fictício'))
  assert.ok(screen.getByText(/22\/11\/2026.*23:59:26/))
  assert.ok(screen.getByText('Atualização cadastral fictícia'))

  await user.click(screen.getByRole('button', { name: 'Filtrar' }))
  assert.ok(await screen.findByText('Falha temporária na auditoria.'))
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  assert.ok(await screen.findByText('Nenhum evento de auditoria registrado até o momento.'))
})

test('valida userId acima do limite BIGINT antes de chamar API e envia filtros válidos e paginação', async () => {
  const requests = []
  const user = mountPage(async (path) => {
    requests.push(path)
    const url = new URL(path, 'http://aratu.test')
    const page = Number(url.searchParams.get('page') ?? '1')
    return Response.json({
      logs: [makeLog({ id: String(page), actorName: `Ator Página ${page}` })],
      total: 25,
      page,
      pageSize: 20,
      totalPages: 2,
    })
  })

  await screen.findByText('Ator Página 1')
  assert.equal(requests.length, 1)

  const actorInput = screen.getByRole('textbox', { name: /ID do ator/i })
  await user.type(actorInput, '9223372036854775808')
  await user.click(screen.getByRole('button', { name: 'Filtrar' }))
  assert.ok(await screen.findByText(/9223372036854775807/))
  assert.equal(requests.length, 1)

  await user.clear(actorInput)
  await user.type(actorInput, '9223372036854775807')
  await user.type(screen.getByRole('textbox', { name: /Entidade/i }), 'reports.fleet-fuelings')
  await user.click(screen.getByRole('combobox', { name: 'Ação' }))
  await user.click(await screen.findByRole('option', { name: 'Exportação (EXPORT)' }))
  await user.click(screen.getByRole('button', { name: 'Filtrar' }))

  await waitFor(() => assert.equal(requests.length, 2))
  assert.match(requests[1], /userId=9223372036854775807/)
  assert.match(requests[1], /operation=EXPORT/)
  assert.match(requests[1], /table=reports\.fleet-fuelings/)

  await user.click(screen.getByRole('button', { name: 'Próxima página' }))
  await screen.findByText('Ator Página 2')
  assert.match(requests[2], /page=2/)
})

test('detalhe exibe sigilo SVO inclusive com reason nulo, vínculo autorizado apenas quando permitido e restaura foco ao fechar', async () => {
  const svoLog = makeLog({
    id: '914',
    table: 'svo.execution_orders',
    recordId: '2',
    operation: 'UPDATE',
    reason: null,
    before: null,
    after: null,
    sensitiveDataHidden: true,
  })
  const vehicleLog = makeLog({
    id: '915',
    table: 'fleet.vehicles',
    recordId: '14',
    operation: 'UPDATE',
    reason: 'Atualização cadastral não sensível',
    sensitiveDataHidden: false,
  })
  const user = mountPage(async () => Response.json({
    logs: [svoLog, vehicleLog],
    total: 2,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  }), 'GESTOR')

  assert.ok(await screen.findByText('Protegida por sigilo (SVO)'))
  assert.ok(screen.getByText('Atualização cadastral não sensível'))

  const detailsButton = screen.getByRole('button', { name: /Ver detalhes do evento #914/i })
  await user.click(detailsButton)

  assert.ok(await screen.findByText('Detalhes do evento de auditoria #914'))
  assert.ok(screen.getByText('Dados do registro protegidos por sigilo operacional (SVO)'))
  assert.ok(screen.getByText('Protegida por sigilo operacional (SVO)'))
  assert.ok(screen.getByRole('link', { name: 'Abrir acompanhamento de ordens SVO' }))
  assert.equal(screen.queryByRole('button', { name: /Editar|Excluir|Salvar/i }), null)

  await user.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() => {
    assert.equal(screen.queryByText('Detalhes do evento de auditoria #914'), null)
    assert.equal(document.activeElement, detailsButton)
  })
})
