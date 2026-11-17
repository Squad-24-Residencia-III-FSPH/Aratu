export const REPORTS_PATH = '/relatorios'
export const REPORT_MODULE_LABELS: Record<string, string> = { FROTA: 'Frota', MOTORISTAS: 'Motoristas', VIAGENS: 'Viagens', MANUTENCOES: 'Manutenções', AUTENTICACAO_RBAC: 'Usuários e acesso', SVO: 'SVO' }
export type ReportCell = string | number | boolean | null
export type ReportRow = Record<string, ReportCell>
export interface ReportColumn {
  key: string; label: string; type: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'status'
  defaultSelected: boolean; totalizable?: boolean; align?: 'left' | 'right' | 'center'
}
export interface ReportFilter {
  key: string; label: string; type: 'select' | 'text' | 'boolean'
  options?: readonly { value: string; label: string }[]; placeholder?: string
}
export interface ReportDefinition {
  key: string; module: string; title: string; description: string
  period: { required: boolean; label: string; maxDays: number }
  columns: readonly ReportColumn[]; filters: readonly ReportFilter[]
}
export interface ReportCatalogGroup { module: string; reports: readonly ReportDefinition[] }
export interface ReportSelection { from: string; to: string; columns: string[]; filters: Record<string, string> }
export interface ReportPreview {
  reportKey: string; title: string; module: string; period: { from: string | null; to: string | null }
  columns: readonly ReportColumn[]; rows: readonly ReportRow[]; page: number; pageSize: number
  totalCount: number; totalPages: number; totals: Record<string, string>
}
export interface ReportPrintData {
  reportKey: string; title: string; module: string; generatedAt: string
  generatedBy: { id: string; name: string; role: string }
  period: { from: string | null; to: string | null }; appliedFilters: readonly { label: string; value: string }[]
  columns: readonly ReportColumn[]; rows: readonly ReportRow[]; totalCount: number; totals: Record<string, string>
}
