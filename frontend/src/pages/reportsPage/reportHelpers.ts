import type { ReportDefinition, ReportSelection } from '../../reports/reportTypes'

export const REPORT_TIMEZONE = 'America/Maceio'
export const REPORT_TIMEZONE_DISPLAY = 'America/Maceio, UTC-03:00'

const DAY_MS = 86_400_000

export type ReportInvalidTarget = 'from' | 'to' | 'columns' | `filter:${string}`

export interface ReportValidationErrors {
  from?: string
  to?: string
  columns?: string
  filters: Record<string, string>
  summary: string
  firstInvalid: ReportInvalidTarget | null
}

export interface AppliedReportFilterSummary {
  label: string
  value: string
}

function isValidIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function formatIsoDateBr(value: string): string {
  const parts = value.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

/**
 * Valida período, filtros e colunas associando mensagens de erro diretamente aos campos afetados.
 *
 * @param report - Definição do relatório selecionado no catálogo.
 * @param selection - Critérios atuais informados pelo usuário.
 * @returns Erros por campo, resumo acessível e alvo prioritário para foco.
 */
export function validateReportSelection(report: ReportDefinition, selection: ReportSelection): ReportValidationErrors {
  let fromError: string | undefined
  let toError: string | undefined
  let columnsError: string | undefined
  const filterErrors: Record<string, string> = {}
  let firstInvalid: ReportInvalidTarget | null = null

  const setFirst = (target: ReportInvalidTarget) => {
    if (!firstInvalid) firstInvalid = target
  }

  if (report.period.required) {
    if (!selection.from) {
      fromError = 'Informe a data inicial do período.'
      setFirst('from')
    }
    if (!selection.to) {
      toError = 'Informe a data final do período.'
      setFirst('to')
    }
  } else if (Boolean(selection.from) !== Boolean(selection.to)) {
    if (!selection.from) {
      fromError = 'Informe a data inicial para completar o período.'
      setFirst('from')
    } else {
      toError = 'Informe a data final para completar o período.'
      setFirst('to')
    }
  }

  if (selection.from && !isValidIsoCalendarDate(selection.from)) {
    fromError = 'Informe uma data inicial válida.'
    setFirst('from')
  }
  if (selection.to && !isValidIsoCalendarDate(selection.to)) {
    toError = 'Informe uma data final válida.'
    setFirst('to')
  }

  if (selection.from && selection.to && !fromError && !toError) {
    const days = (Date.parse(selection.to) - Date.parse(selection.from)) / DAY_MS + 1
    if (days < 1) {
      fromError = 'A data inicial não pode ser posterior à data final.'
      toError = 'A data final não pode ser anterior à data inicial.'
      setFirst('from')
    } else if (days > report.period.maxDays) {
      const limitMessage = `O intervalo máximo permitido é de ${report.period.maxDays} dias.`
      fromError = limitMessage
      toError = limitMessage
      setFirst('from')
    }
  }

  for (const filter of report.filters) {
    const value = selection.filters[filter.key] ?? ''
    if (!value) continue
    if (filter.key === 'licensePlatePrefix' && !/^[A-Za-z0-9]{1,7}$/.test(value)) {
      filterErrors[filter.key] = 'Informe apenas letras e números (até 7 caracteres) para o prefixo da placa.'
      setFirst(`filter:${filter.key}`)
    }
  }

  if (!selection.columns.length) {
    columnsError = 'Selecione ao menos uma coluna para gerar ou exportar o relatório.'
    setFirst('columns')
  }

  const firstFilterMessage = Object.values(filterErrors)[0] ?? ''
  const summary = fromError ?? toError ?? firstFilterMessage ?? columnsError ?? ''

  return {
    from: fromError,
    to: toError,
    columns: columnsError,
    filters: filterErrors,
    summary,
    firstInvalid,
  }
}

/**
 * Mapeia erros retornados pelo backend (400/422) para o campo correspondente da tela.
 */
export function mapApiReportErrorToField(
  report: ReportDefinition | null,
  errorMessage: string,
  code?: string,
): Partial<Pick<ReportValidationErrors, 'from' | 'to' | 'columns' | 'filters' | 'firstInvalid'>> {
  const normalized = errorMessage.toLowerCase()

  if (code === 'NO_COLUMNS_SELECTED' || code === 'INVALID_COLUMN' || normalized.includes('coluna')) {
    return { columns: errorMessage, firstInvalid: 'columns' }
  }

  if (code === 'INVALID_DATE_RANGE' || code === 'PERIOD_TOO_LARGE' || code === 'INVALID_PERIOD') {
    return { from: errorMessage, to: errorMessage, firstInvalid: 'from' }
  }

  if (report) {
    for (const filter of report.filters) {
      if (normalized.includes(filter.label.toLowerCase())) {
        return {
          filters: { [filter.key]: errorMessage },
          firstInvalid: `filter:${filter.key}`,
        }
      }
    }
  }

  if (code === 'INVALID_FILTER' && report?.filters.length === 1) {
    const onlyFilter = report.filters[0]
    return {
      filters: { [onlyFilter.key]: errorMessage },
      firstInvalid: `filter:${onlyFilter.key}`,
    }
  }

  if (normalized.includes('data final')) {
    return { to: errorMessage, firstInvalid: 'to' }
  }

  if (normalized.includes('data inicial') || normalized.includes('período') || normalized.includes('intervalo')) {
    return { from: errorMessage, to: errorMessage, firstInvalid: 'from' }
  }

  return {}
}

/**
 * Combina validações locais e erros de campo mapeados a partir da API.
 */
export function mergeReportValidationErrors(
  client: ReportValidationErrors,
  server: Partial<Pick<ReportValidationErrors, 'from' | 'to' | 'columns' | 'filters' | 'firstInvalid'>> | null,
): ReportValidationErrors {
  if (!server) return client
  const from = client.from ?? server.from
  const to = client.to ?? server.to
  const columns = client.columns ?? server.columns
  const filters = { ...(server.filters ?? {}), ...client.filters }
  const firstInvalid = client.firstInvalid ?? server.firstInvalid ?? null
  const firstFilterMessage = Object.values(filters)[0] ?? ''
  const summary = from ?? to ?? firstFilterMessage ?? columns ?? ''
  return { from, to, columns, filters, summary, firstInvalid }
}

/**
 * Gera assinatura determinística da seleção atual (relatório, período, filtros e ordem exata das colunas)
 * para invalidar a conferência da prévia sempre que qualquer critério mudar.
 */
export function buildReportSelectionSignature(reportKey: string, selection: ReportSelection): string {
  const normalizedFilters = Object.entries(selection.filters)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({
    reportKey,
    from: selection.from,
    to: selection.to,
    columns: selection.columns,
    filters: normalizedFilters,
  })
}

/** Formata o período do relatório em português para prévia e impressão. */
export function formatReportPeriod(period: { from: string | null; to: string | null }): string {
  if (!period.from) return 'Todos os registros'
  const fromLabel = formatIsoDateBr(period.from)
  const toLabel = formatIsoDateBr(period.to ?? period.from)
  return `${fromLabel} a ${toLabel}`
}

/** Formata o instante de emissão no fuso operacional de Alagoas (`America/Maceio`). */
export function formatReportIssuedAt(isoString: string): string {
  const date = new Date(isoString)
  if (!Number.isFinite(date.getTime())) return `Data indisponível (${REPORT_TIMEZONE_DISPLAY})`
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: REPORT_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
  return `${formatted} (${REPORT_TIMEZONE_DISPLAY})`
}

/** Resolve rótulos legíveis dos filtros aplicados a partir da definição autorizada do relatório. */
export function resolveAppliedFilterSummaries(
  report: ReportDefinition,
  selection: ReportSelection,
): AppliedReportFilterSummary[] {
  const summaries: AppliedReportFilterSummary[] = []
  for (const filter of report.filters) {
    const rawValue = selection.filters[filter.key]
    if (!rawValue) continue
    const optionLabel = filter.options?.find(option => option.value === rawValue)?.label
    const displayValue = optionLabel ?? (filter.key === 'licensePlatePrefix' ? rawValue.toUpperCase() : rawValue)
    summaries.push({ label: filter.label, value: displayValue })
  }
  return summaries
}

/** Formata lista de filtros aplicados para cabeçalhos de prévia e impressão. */
export function formatAppliedFiltersText(filters: readonly AppliedReportFilterSummary[]): string {
  if (!filters.length) return 'Nenhum filtro adicional'
  return filters.map(filter => `${filter.label}: ${filter.value}`).join(' · ')
}
