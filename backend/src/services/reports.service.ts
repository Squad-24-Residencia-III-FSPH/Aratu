import type { ReportsRepositoryContract } from '../repositories/reports.repository'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { AuditLogger } from '../types/audit.types'
import type { AuthenticatedUser, User, UserRole } from '../types/auth'
import type { ReportCatalogEntry, ReportDefinition, ReportExportResult, ReportPreviewResult, ReportPrintPayload, ReportRow, ValidatedReportQueryInput } from '../types/report.types'
import { REPORT_CSV_MAX_ROWS, REPORT_PRINT_MAX_ROWS, REPORT_MAX_PERIOD_DAYS, REPORT_PREVIEW_DEFAULT_PAGE_SIZE, REPORT_PREVIEW_MAX_PAGE_SIZE, ReportServiceError } from '../types/report.types'
import { ReportRegistry } from './reports/report-registry'
import { ReportExporterContext } from './reports/export/report-exporter.strategy'

const DAY_MS = 86_400_000
const BASE_QUERY_KEYS = ['from', 'to', 'columns', 'page', 'pageSize', 'format']
function date(value: string | undefined): string | null {
  if (value === undefined || value === '') return null
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '0001-01-01') {
    throw new ReportServiceError('INVALID_PERIOD', 'Informe uma data válida no formato AAAA-MM-DD.')
  }
  return value
}
function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed) || parsed > max) throw new ReportServiceError('INVALID_INPUT', 'Informe uma página válida e até 50 registros por página.')
  return parsed
}

/** Valida consultas gerenciais e mantém a mesma projeção em prévia, CSV e impressão. */
export class ReportsService {
  constructor(private readonly repository: ReportsRepositoryContract, private readonly registry: ReportRegistry,
    private readonly users: Pick<UsersRepositoryContract, 'findById'>, private readonly audit: AuditLogger,
    private readonly exporter = new ReportExporterContext()) {}

  /** Retorna somente metadados públicos dos relatórios permitidos ao perfil atual. @throws {ReportServiceError} Se o perfil não tiver relatórios. */
  getCatalogForRole(role: UserRole): { module: string; reports: ReportCatalogEntry[] }[] {
    const definitions = this.registry.forRole(role)
    if (!definitions.length) throw new ReportServiceError('FORBIDDEN_REPORT', 'Seu perfil não tem permissão para gerar relatórios.')
    const groups = new Map<string, ReportCatalogEntry[]>()
    for (const definition of definitions) {
      const { key, module, title, description, period, filters, columns } = definition
      if (!groups.has(module)) groups.set(module, [])
      groups.get(module)!.push({ key, module, title, description, period, filters, columns })
    }
    return [...groups].map(([module, reports]) => ({ module, reports }))
  }

  /** Consulta página e somas globais, preservando a ordem solicitada das colunas. @throws {ReportServiceError} Se o acesso ou os filtros forem inválidos. */
  async previewReport(key: string, raw: Record<string, unknown>, actor: AuthenticatedUser): Promise<ReportPreviewResult> {
    const user = await this.currentActor(actor)
    const definition = this.authorize(key, user.role)
    const { input, page } = this.validate(definition, raw)
    const result = await this.read(definition, input)
    return { reportKey: key, title: definition.title, module: definition.module, period: { from: input.from, to: input.to },
      columns: input.selectedColumns, rows: result.rows, page, pageSize: input.limit, totalCount: result.totalCount,
      totalPages: Math.ceil(result.totalCount / input.limit), totals: result.totals }
  }

  /** Exporta o conjunto completo dentro do limite e só libera o resultado após auditar. @throws {ReportServiceError} Se exceder o volume permitido ou a consulta for inválida. */
  async exportReport(key: string, raw: Record<string, unknown>, actor: AuthenticatedUser): Promise<ReportExportResult> {
    const user = await this.currentActor(actor)
    const definition = this.authorize(key, user.role)
    if (raw.format !== 'csv' && raw.format !== 'print') throw new ReportServiceError('INVALID_EXPORT_FORMAT', 'Escolha exportar em CSV ou imprimir o relatório.')
    const format = raw.format
    const { input: validated } = this.validate(definition, raw)
    const input = { ...validated, offset: 0, limit: format === 'csv' ? REPORT_CSV_MAX_ROWS : REPORT_PRINT_MAX_ROWS }
    const result = await this.read(definition, input, format)
    const payload: ReportPrintPayload = { reportKey: key, title: definition.title, module: definition.module,
      generatedAt: new Date().toISOString(), generatedBy: { id: user.id, name: user.name, role: user.role },
      period: { from: input.from, to: input.to }, appliedFilters: definition.filters.filter(filter => input.filters[filter.key]).map(filter => ({
        label: filter.label, value: filter.options?.find(option => option.value === input.filters[filter.key])?.label ?? input.filters[filter.key]!,
      })), columns: input.selectedColumns, rows: result.rows, totalCount: result.totalCount, totals: result.totals }
    const exported = this.exporter.export(format, payload)
    await this.audit.recordAudit({ userId: user.id, table: `reports.${key}`, recordId: key, operation: 'EXPORT',
      actorSnapshot: { id: user.id, name: user.name, email: user.email, role: user.role },
      after: { module: definition.module, format, period: payload.period, filters: input.filters, selectedColumns: input.selectedColumns.map(column => column.key), rowCount: result.rows.length },
      reason: `Exportação de relatório (${format.toUpperCase()}) pelo painel gerencial` })
    return exported
  }

  private async currentActor(actor: AuthenticatedUser): Promise<User> {
    const user = await this.users.findById(actor.id)
    if (!user?.active) throw new ReportServiceError('INACTIVE_ACTOR', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    return user
  }
  private authorize(key: string, role: UserRole): ReportDefinition {
    const definition = this.registry.get(key)
    if (!definition) throw new ReportServiceError('REPORT_NOT_FOUND', 'Relatório não encontrado. Escolha um relatório do catálogo.')
    if (!definition.allowedRoles.includes(role)) throw new ReportServiceError('FORBIDDEN_REPORT', 'Seu perfil não tem permissão para este relatório.')
    return definition
  }
  private validate(definition: ReportDefinition, raw: Record<string, unknown>): { input: ValidatedReportQueryInput; page: number } {
    const allowedKeys = new Set([...BASE_QUERY_KEYS, ...definition.filters.map(filter => filter.key)])
    for (const [key, value] of Object.entries(raw)) {
      if (!allowedKeys.has(key)) throw new ReportServiceError('INVALID_FILTER', 'Um filtro informado não pertence a este relatório.')
      if (typeof value !== 'string') throw new ReportServiceError('INVALID_INPUT', 'Informe cada filtro uma única vez como texto.')
    }
    const query = raw as Record<string, string>
    const from = date(query.from)
    const to = date(query.to)
    if ((definition.period.required && (!from || !to)) || Boolean(from) !== Boolean(to)) throw new ReportServiceError('INVALID_PERIOD', 'Informe as datas inicial e final do período.')
    if (from && to) {
      const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1
      if (days < 1) throw new ReportServiceError('INVALID_DATE_RANGE', 'A data inicial não pode ser posterior à data final.')
      if (days > REPORT_MAX_PERIOD_DAYS) throw new ReportServiceError('PERIOD_TOO_LARGE', 'O intervalo máximo permitido para geração de relatórios é de 366 dias.')
    }
    const keys = query.columns === undefined ? definition.columns.filter(column => column.defaultSelected).map(column => column.key) : query.columns.split(',')
    if (!keys.length || keys.every(key => !key)) throw new ReportServiceError('NO_COLUMNS_SELECTED', 'Selecione ao menos uma coluna para gerar ou exportar o relatório.')
    const selectedColumns = [...new Set(keys)].map(key => {
      const column = definition.columns.find(candidate => candidate.key === key)
      if (!column) throw new ReportServiceError('INVALID_COLUMN', 'Uma coluna selecionada não pertence a este relatório.')
      return column
    })
    const filters: Record<string, string> = {}
    for (const filter of definition.filters) {
      const value = query[filter.key]
      if (value === undefined || value === '') continue
      if ((filter.options && !filter.options.some(option => option.value === value)) || (filter.key === 'licensePlatePrefix' && !/^[A-Za-z0-9]{1,7}$/.test(value))) {
        throw new ReportServiceError('INVALID_FILTER', `Informe um valor válido para o filtro ${filter.label}.`)
      }
      filters[filter.key] = filter.key === 'licensePlatePrefix' ? value.toUpperCase() : value
    }
    const limit = positiveInteger(query.pageSize, REPORT_PREVIEW_DEFAULT_PAGE_SIZE, REPORT_PREVIEW_MAX_PAGE_SIZE)
    const page = positiveInteger(query.page, 1, Math.floor(Number.MAX_SAFE_INTEGER / limit))
    return { page, input: { from, to, filters, selectedColumns, limit, offset: (page - 1) * limit } }
  }
  private async read(definition: ReportDefinition, input: ValidatedReportQueryInput, format?: 'csv' | 'print') {
    return this.repository.withSnapshot(async reader => {
      const query = definition.buildQuery(input)
      const { totalCount, rawTotals } = await reader.executeCountAndTotals(query.countAndTotalsSql, query.values.slice(0, -2))
      if (format && totalCount > input.limit) {
        throw new ReportServiceError(format === 'csv' ? 'EXPORT_LIMIT_EXCEEDED' : 'PRINT_LIMIT_EXCEEDED', format === 'csv'
          ? 'O CSV suporta até 50.000 registros. Reduza o período ou os filtros.'
          : 'A impressão em tela suporta até 2.000 registros. Reduza o período ou utilize a exportação em CSV.')
      }
      const rawRows = await reader.executeRows(query.dataSql, query.values)
      const rows: ReportRow[] = rawRows.map(raw => {
        const formatted = definition.formatRow(raw)
        return Object.fromEntries(input.selectedColumns.map(column => [column.key, formatted[column.key] ?? null]))
    })
    const totals = Object.fromEntries(input.selectedColumns.filter(column => column.totalizable).map(column => [column.key, rawTotals[column.key] ?? '0']))
    return { rows, totalCount, totals }
    })
  }
}
