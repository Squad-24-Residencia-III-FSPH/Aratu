import type { Profile } from '../auth/profiles.ts'
import type { ReportDefinition, ReportSelection } from './reportTypes.ts'

export function canAccessReports(profile: Profile | null): boolean { return profile === 'GESTOR' || profile === 'ADMINISTRADOR' || profile === 'ATENDENTE_SVO' }
const DAY_MS = 86_400_000
function civilToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function defaultReportSelection(report: ReportDefinition, now = new Date()): ReportSelection {
  const to = report.period.required ? civilToday(now) : ''
  const from = to ? new Date(Date.parse(to) - 29 * DAY_MS).toISOString().slice(0, 10) : ''
  return { from, to, columns: report.columns.filter(column => column.defaultSelected).map(column => column.key), filters: {} }
}
export function reportSelectionError(report: ReportDefinition, selection: ReportSelection): string {
  if (!selection.columns.length) return 'Selecione ao menos uma coluna para gerar ou exportar o relatório.'
  if ((report.period.required && (!selection.from || !selection.to)) || Boolean(selection.from) !== Boolean(selection.to)) return 'Informe as datas inicial e final do período.'
  if (selection.from && selection.to) {
    for (const value of [selection.from, selection.to]) {
      const parsed = new Date(`${value}T00:00:00Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '0001-01-01') return 'Informe datas válidas.'
    }
    const days = (Date.parse(selection.to) - Date.parse(selection.from)) / DAY_MS + 1
    if (days < 1) return 'A data inicial não pode ser posterior à data final.'
    if (days > report.period.maxDays) return `O intervalo máximo permitido é de ${report.period.maxDays} dias.`
  }
  return ''
}
function prefsKey(userId: string, reportKey: string): string { return `aratu.reports.prefs.${userId}.${reportKey}` }

/** Revalida preferências locais contra o catálogo atual, sem transportar dados de relatórios. */
export function restoreReportSelection(storage: Pick<Storage, 'getItem'>, userId: string, report: ReportDefinition): { selection: ReportSelection; warning: string } {
  const fallback = defaultReportSelection(report)
  try {
    const text = storage.getItem(prefsKey(userId, report.key))
    if (!text) return { selection: fallback, warning: '' }
    const raw: unknown = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Preferência inválida')
    const saved = raw as Record<string, unknown>
    const columns = Array.isArray(saved.columns) ? [...new Set(saved.columns.filter((key): key is string => typeof key === 'string' && report.columns.some(column => column.key === key)))] : fallback.columns
    const filters: Record<string, string> = {}
    if (saved.filters && typeof saved.filters === 'object') {
      for (const filter of report.filters) {
        const value: unknown = (saved.filters as Record<string, unknown>)[filter.key]
        if (typeof value === 'string' && value && (!filter.options || filter.options.some(option => option.value === value))
          && (filter.key !== 'licensePlatePrefix' || /^[a-z0-9]{1,7}$/i.test(value))) filters[filter.key] = value
      }
    }
    const selection: ReportSelection = { from: typeof saved.from === 'string' ? saved.from : fallback.from,
      to: typeof saved.to === 'string' ? saved.to : fallback.to, columns: columns.length ? columns : fallback.columns, filters }
    if (reportSelectionError(report, selection)) { selection.from = fallback.from; selection.to = fallback.to }
    const changed = JSON.stringify(selection) !== JSON.stringify({ from: saved.from, to: saved.to, columns: saved.columns, filters: saved.filters })
    return { selection, warning: changed ? 'Algumas preferências antigas foram ajustadas ao catálogo atual. Confira os filtros e as colunas.' : '' }
  } catch {
    return { selection: fallback, warning: 'Não foi possível restaurar as preferências. Os filtros e as colunas padrão foram aplicados.' }
  }
}
export function saveReportSelection(storage: Pick<Storage, 'setItem'>, userId: string, report: ReportDefinition, selection: ReportSelection): string {
  if (reportSelectionError(report, selection)) return ''
  try { storage.setItem(prefsKey(userId, report.key), JSON.stringify(selection)); return '' }
  catch { return 'A seleção atual foi aplicada, mas não pôde ser salva neste navegador.' }
}
