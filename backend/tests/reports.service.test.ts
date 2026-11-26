import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ReportsService } from '../src/services/reports.service'
import { ReportRegistry } from '../src/services/reports/report-registry'
import { maskCpfForReport } from '../src/services/reports/definitions/drivers.reports'
import { AuditService } from '../src/services/audit.service'
import type { NormalizedCreateAuditInput } from '../src/types/audit.types'
import type { User, UserRole } from '../src/types/auth'
import { ReportServiceError } from '../src/types/report.types'
import type { ReportsRepositoryContract } from '../src/repositories/reports.repository'

const actor = {
  id: '1',
  perfil: 'GESTOR' as const,
  permissions: [
    'reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo',
    'reports:export:trips', 'reports:export:fleet', 'reports:export:maintenance', 'reports:export:svo',
  ],
}
const dates = { from: '2026-11-01', to: '2026-11-15' }
function fixture(options: { count?: number; role?: UserRole; rows?: Record<string, unknown>[]; auditFailure?: boolean } = {}) {
  const entries: NormalizedCreateAuditInput[] = []
  let rowCalls = 0
  const user: User = { id: '1', name: 'Gestor Fictício QA', email: 'gestor@example.test', roleId: '1', role: options.role ?? 'GESTOR',
    active: true, revision: 1, createdAt: new Date(), updatedAt: new Date() }
  const repository: ReportsRepositoryContract = {
    async executeCountAndTotals() { return { totalCount: options.count ?? 1, rawTotals: { liters: '1240.500', totalValue: '7430.20' } } },
    async executeRows() { rowCalls++; return options.rows ?? [{ licensePlate: 'QAF1A23', liters: '12.500', totalValue: '80.50', hidden: 'não deve sair' }] },
    async withSnapshot(work) { return work(repository) },
  }
  const service = new ReportsService(repository, new ReportRegistry(), { async findById() { return user } }, new AuditService({
    async create(input) {
      if (options.auditFailure) throw new Error('Auditoria indisponível')
      entries.push(input)
      return { id: '1', ...input, registeredAt: new Date() }
    },
  }))
  return { service, entries, user, rowCalls: () => rowCalls }
}

test('catálogo limita GESTOR a 10, ADMINISTRADOR a 11 e ATENDENTE_SVO a 2 relatórios', () => {
  const { service } = fixture()
  for (const [role, count] of [['GESTOR', 10], ['ADMINISTRADOR', 11], ['ATENDENTE_SVO', 2]] as const) {
    const catalog = service.getCatalogForRole(role)
    assert.equal(catalog.flatMap(group => group.reports).length, count)
    assert.doesNotMatch(JSON.stringify(catalog), /dataSql|source|allowedRoles|buildQuery|password_hash/)
  }
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) assert.throws(() => service.getCatalogForRole(role), { code: 'FORBIDDEN_REPORT' })
})
test('prévia projeta exclusivamente colunas escolhidas, na ordem solicitada, e totais globais visíveis', async () => {
  const { service } = fixture()
  const result = await service.previewReport('fleet-fuelings', { ...dates, columns: 'liters,licensePlate' }, actor)
  assert.deepEqual(Object.keys(result.rows[0]!), ['liters', 'licensePlate'])
  assert.deepEqual(result.totals, { liters: '1240.500' })
  assert.deepEqual(result.columns.map(column => column.key), ['liters', 'licensePlate'])
})
for (const [query, code] of [
  [{}, 'INVALID_PERIOD'], [{ from: '2026-02-30', to: '2026-03-01' }, 'INVALID_PERIOD'],
  [{ from: '2026-02-02', to: '2026-02-01' }, 'INVALID_DATE_RANGE'],
  [{ from: '2025-01-01', to: '2026-01-02' }, 'PERIOD_TOO_LARGE'],
  [{ ...dates, columns: '' }, 'NO_COLUMNS_SELECTED'], [{ ...dates, columns: 'password_hash' }, 'INVALID_COLUMN'],
  [{ ...dates, page: '0' }, 'INVALID_INPUT'], [{ ...dates, pageSize: '51' }, 'INVALID_INPUT'],
  [{ ...dates, fuelType: 'INVALID' }, 'INVALID_FILTER'], [{ ...dates, unknown: 'x' }, 'INVALID_FILTER'],
  [{ ...dates, licensePlatePrefix: "QAF%' OR TRUE--" }, 'INVALID_FILTER'], [{ ...dates, from: ['2026-01-01'] }, 'INVALID_INPUT'],
] as const) test(`rejeita ${code}: ${JSON.stringify(query)}`, async () => {
  const context = fixture()
  await assert.rejects(context.service.previewReport('fleet-fuelings', query, actor), error => error instanceof ReportServiceError && error.code === code)
  assert.equal(context.rowCalls(), 0)
})
test('aceita exatamente 366 dias inclusivos e paginação máxima de 50', async () => {
  const { service } = fixture()
  assert.equal((await service.previewReport('fleet-fuelings', { from: '2025-01-01', to: '2026-01-01', pageSize: '50' }, actor)).pageSize, 50)
})
test('período opcional exige as duas datas quando preenchido', async () => {
  await assert.rejects(fixture().service.previewReport('fleet-vehicles', { from: dates.from }, actor), { code: 'INVALID_PERIOD' })
})
test('RBAC usa o cadastro atual e bloqueia conta desativada', async () => {
  const context = fixture()
  await assert.rejects(context.service.previewReport('auth-users', {}, actor), { code: 'FORBIDDEN_REPORT' })
  context.user.active = false
  await assert.rejects(context.service.previewReport('fleet-vehicles', {}, actor), { code: 'INACTIVE_ACTOR' })
  await assert.rejects(fixture().service.previewReport('inexistente', {}, actor), { code: 'REPORT_NOT_FOUND' })
})
test('máscara de CPF oculta extremidades inclusive para entradas malformadas', () => {
  assert.equal(maskCpfForReport('11122233396'), '***.222.333-**')
  assert.equal(maskCpfForReport('111.222.333-96'), '***.222.333-**')
  assert.equal(maskCpfForReport('inválido'), '***.***.***-**')
})
test('CSV usa BOM, aspas, delimitador, escape, neutralização de fórmulas e totais', async () => {
  const context = fixture({ rows: [{ licensePlate: '=2+2', liters: '12.500', totalValue: '10.00', station: 'Posto; "Fictício"\nQA' }] })
  const result = await context.service.exportReport('fleet-fuelings', { ...dates, format: 'csv', columns: 'licensePlate,liters,station' }, actor)
  assert.equal(result.format, 'csv')
  if (result.format !== 'csv') return
  const text = result.buffer.toString('utf8')
  assert.equal(text.charCodeAt(0), 0xfeff)
  assert.match(text, /"'=2\+2";"12.500";"Posto; ""Fictício""\nQA"/)
  assert.match(text, /"TOTAL";"1240.500";""/)
  assert.equal(context.entries[0]!.operation, 'EXPORT')
  assert.deepEqual(context.entries[0]!.after?.selectedColumns, ['licensePlate', 'liters', 'station'])
  assert.equal(context.entries[0]!.after?.rowCount, 1)
})
test('neutraliza +, -, @ e fórmulas precedidas por espaços ou controles', async () => {
  const context = fixture({ rows: ['+1', '-1', '@sum', '  =1', '\t=1'].map(station => ({ station })) })
  const result = await context.service.exportReport('fleet-fuelings', { ...dates, format: 'csv', columns: 'station' }, actor)
  assert.equal(result.format, 'csv')
  if (result.format === 'csv') for (const value of ['+1', '-1', '@sum', '  =1', '\t=1']) assert.ok(result.buffer.toString().includes(`"'${value}"`))
})
for (const [format, limit, code] of [['csv', 50000, 'EXPORT_LIMIT_EXCEEDED'], ['print', 2000, 'PRINT_LIMIT_EXCEEDED']] as const) {
  test(`${format} bloqueia acima de ${limit} antes de ler linhas ou auditar`, async () => {
    const context = fixture({ count: limit + 1 })
    await assert.rejects(context.service.exportReport('fleet-fuelings', { ...dates, format }, actor), { code })
    assert.equal(context.rowCalls(), 0); assert.equal(context.entries.length, 0)
    const accepted = fixture({ count: limit })
    await accepted.service.exportReport('fleet-fuelings', { ...dates, format }, actor)
    assert.equal(accepted.entries.length, 1)
  })
}
test('impressão inclui emissor atual, filtros legíveis e auditoria, sem colunas ocultas', async () => {
  const context = fixture()
  const result = await context.service.exportReport('fleet-fuelings', { ...dates, format: 'print', fuelType: 'DIESEL', columns: 'licensePlate' }, actor)
  assert.equal(result.format, 'print')
  if (result.format === 'print') {
    assert.equal(result.payload.generatedBy.name, context.user.name)
    assert.deepEqual(result.payload.appliedFilters, [{ label: 'Combustível', value: 'Diesel' }])
    assert.deepEqual(result.payload.totals, {})
  }
  assert.equal(context.entries[0]!.actorSnapshot?.name, context.user.name)
})
test('falha de auditoria impede entregar exportação e formato desconhecido é rejeitado', async () => {
  await assert.rejects(fixture({ auditFailure: true }).service.exportReport('fleet-fuelings', { ...dates, format: 'csv' }, actor), /Auditoria indisponível/)
  await assert.rejects(fixture().service.exportReport('fleet-fuelings', { ...dates, format: 'xlsx' }, actor), { code: 'INVALID_EXPORT_FORMAT' })
})
test('compilador SQL mantém valores hostis exclusivamente nos parâmetros posicionais', () => {
  const definition = new ReportRegistry().get('fleet-fuelings')!
  const hostile = "ABC%' OR TRUE; SELECT pg_sleep(99)--"
  const query = definition.buildQuery({ from: dates.from, to: dates.to, filters: { licensePlatePrefix: hostile }, selectedColumns: definition.columns, limit: 50, offset: 0 })
  assert.ok(query.values.includes(hostile))
  assert.ok(!query.dataSql.includes(hostile))
  assert.ok(!query.countAndTotalsSql.includes(hostile))
  assert.match(query.dataSql, /LIKE \$3 \|\| '%'/)
})
