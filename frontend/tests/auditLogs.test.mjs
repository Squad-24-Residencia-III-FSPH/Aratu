import test from 'node:test'
import assert from 'node:assert/strict'
import { readAuditLogs, AuditAccessDenied } from '../src/services/auditLogs.ts'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { sessionFor } from './fixtures.mjs'

test('a rota de auditoria está disponível somente para Gestor e Administrador', () => {
  for (const profile of ['GESTOR', 'ADMINISTRADOR']) {
    assert.equal(resolveRoute(sessionFor(profile), '/auditoria').kind, 'audit')
  }
  for (const profile of ['MOTORISTA', 'SOLICITANTE', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    assert.equal(resolveRoute(sessionFor(profile), '/auditoria').kind, 'redirect')
  }
  assert.deepEqual(resolveRoute(null, '/auditoria'), { kind: 'redirect', to: '/login' })
})

test('envia filtros e paginação, descartando dados fora da projeção da tela', async () => {
  const filters = { inicio: '2026-11-01', fim: '2026-11-18', usuario_id: '7', acao: 'ALTERAR', entidade: 'Veículo' }
  const row = { id: '1', created_at: '2026-11-18T12:00:00Z', usuario: 'Usuário de teste',
    acao: 'ALTERAR', entidade: 'Veículo', resumo: 'Registro atualizado', detalhes_mascarados: '***' }
  const page = await readAuditLogs(async (url, options) => {
    const request = new URL(url, 'http://localhost')
    assert.equal(request.pathname, '/audit-logs')
    assert.deepEqual(Object.fromEntries(request.searchParams), { page: '2', ...filters })
    assert.equal(options.method, 'GET')
    return Response.json({ total: 10, rows: [{ ...row, dados_brutos: { campo: 'exemplo' } }, null] })
  }, filters, 2, new AbortController().signal)
  assert.deepEqual(page.rows, [row])
  assert.equal(page.partial, true)
})

test('distingue acesso negado de resposta incompatível', async () => {
  const signal = new AbortController().signal
  await assert.rejects(readAuditLogs(async () => new Response(null, { status: 403 }), {}, 1, signal), AuditAccessDenied)
  await assert.rejects(readAuditLogs(async () => Response.json({}), {}, 1, signal), /incompatível/)
})
