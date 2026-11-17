import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReportQuery, exportReportCsv, fetchReportPreview, fetchReportPrintData, listReportCatalog } from '../src/services/reportsService.ts'
import { defaultReportSelection, restoreReportSelection, saveReportSelection } from '../src/reports/reportAccess.ts'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { sessionFor } from './fixtures.mjs'
import { formatReportCell } from '../src/reports/reportPresentation.ts'
import { catalog, report, preview, selection } from './reports.fixture.mjs'

test('serializa colunas na ordem escolhida e filtros com URLSearchParams', () => {
  const params = new URLSearchParams(buildReportQuery(selection, 2))
  assert.equal(params.get('columns'), 'licensePlate,liters'); assert.equal(params.get('page'), '2')
  assert.equal(params.get('fuelType'), 'DIESEL'); assert.equal(params.get('from'), '2026-11-01')
  assert.equal(new URLSearchParams(buildReportQuery({ ...selection, columns: [] })).get('columns'), '')
})
test('consulta catálogo e prévia e rejeita respostas inválidas e mensagens de erro', async () => {
  assert.deepEqual(await listReportCatalog(async () => Response.json(catalog)), catalog)
  assert.deepEqual(await fetchReportPreview(async path => { assert.match(path, /\/reports\/fleet-fuelings\/preview\?/); return Response.json(preview) }, report.key, selection), preview)
  await assert.rejects(listReportCatalog(async () => Response.json({})), /formato inválido/)
  await assert.rejects(fetchReportPreview(async () => Response.json({ erro: 'Reduza o período.' }, { status: 422 }), report.key, selection), /Reduza o período/)
  await assert.rejects(fetchReportPrintData(async () => Response.json(preview), report.key, selection), /formato inválido/)
})
test('download mantém BOM e nome recebido, e impressão pede resultado completo sem página', async () => {
  const csv = await exportReportCsv(async path => {
    assert.equal(new URL('http://test' + path).searchParams.get('format'), 'csv')
    return new Response(new Uint8Array([239, 187, 191, 65]), { headers: { 'Content-Disposition': 'attachment; filename="relatorio-ficticio.csv"' } })
  }, report.key, selection)
  assert.equal(csv.filename, 'relatorio-ficticio.csv')
  assert.deepEqual([...new Uint8Array(await csv.blob.arrayBuffer())], [239, 187, 191, 65])
  const print = { ...preview, generatedAt: '2026-11-16T12:00:00Z', generatedBy: { id: '1', name: 'Emissor Fictício', role: 'GESTOR' }, appliedFilters: [] }
  assert.deepEqual(await fetchReportPrintData(async path => {
    const query = new URL('http://test' + path).searchParams
    assert.equal(query.get('format'), 'print'); assert.equal(query.has('page'), false)
    return Response.json(print)
  }, report.key, selection), print)
})
test('preferências são separadas por usuário e relatório; catálogo novo e JSON corrompido geram aviso parcial', () => {
  const items = new Map()
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) }
  assert.equal(saveReportSelection(storage, '1', report, selection), '')
  assert.deepEqual(restoreReportSelection(storage, '1', report).selection, selection)
  assert.deepEqual(restoreReportSelection(storage, '2', report).selection.columns, ['licensePlate', 'liters', 'totalValue'])
  items.set('aratu.reports.prefs.1.fleet-fuelings', JSON.stringify({ ...selection, columns: ['licensePlate', 'removed'] }))
  const partial = restoreReportSelection(storage, '1', report)
  assert.deepEqual(partial.selection.columns, ['licensePlate']); assert.match(partial.warning, /ajustadas/)
  items.set('aratu.reports.prefs.1.fleet-fuelings', '{')
  assert.match(restoreReportSelection(storage, '1', report).warning, /restaurar/)
})
test('últimos 30 dias usam a data civil de Maceió e armazenamento bloqueado não interrompe a operação', () => {
  const result = defaultReportSelection(report, new Date('2026-11-16T01:00:00Z'))
  assert.equal(result.to, '2026-11-15'); assert.equal(result.from, '2026-10-17')
  assert.match(saveReportSelection({ setItem() { throw new Error('quota') } }, '1', report, selection), /não pôde ser salva/)
})
test('menu e rota liberam relatórios somente para os três perfis autorizados', () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO']) {
    const allowed = ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'].includes(role)
    const navigation = getSidebarNavigation(role)
    assert.equal([...navigation.topItems, ...navigation.sections.flatMap(section => section.items)].some(item => item.path === '/relatorios'), allowed)
    assert.equal(resolveRoute(sessionFor(role), '/relatorios').kind, allowed ? 'reports' : 'redirect')
  }
})
test('somas monetárias mantêm centavos além da precisão segura de Number', () => {
  assert.equal(formatReportCell('499999999999999.99', report.columns[2]), 'R$\u00a0499.999.999.999.999,99')
  assert.equal(formatReportCell('1240.500', report.columns[1]), '1.240,5')
  assert.equal(formatReportCell('-0.001', report.columns[1]), '-0,001')
})
