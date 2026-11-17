import type { UserRole } from './auth'

export const REPORT_MODULES = ['FROTA', 'MOTORISTAS', 'VIAGENS', 'MANUTENCOES', 'AUTENTICACAO_RBAC', 'SVO'] as const
export type ReportModule = typeof REPORT_MODULES[number]
export const REPORT_EXPORT_FORMATS = ['csv', 'print'] as const
export type ReportExportFormat = typeof REPORT_EXPORT_FORMATS[number]
export const REPORT_PREVIEW_DEFAULT_PAGE_SIZE = 50
export const REPORT_PREVIEW_MAX_PAGE_SIZE = 50
export const REPORT_MAX_PERIOD_DAYS = 366
export const REPORT_CSV_MAX_ROWS = 50_000
export const REPORT_PRINT_MAX_ROWS = 2_000
export const REPORT_SELECT_FILTER_TYPE = 'select' as const
export type ReportColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'status'
export type ReportCell = string | number | boolean | null
export type ReportRow = Record<string, ReportCell>
export interface ReportColumnDefinition {
  readonly key: string
  readonly label: string
  readonly type: ReportColumnType
  readonly defaultSelected: boolean
  readonly totalizable?: boolean
  readonly align?: 'left' | 'right' | 'center'
}
export interface ReportFilterDefinition {
  readonly key: string
  readonly label: string
  readonly type: 'select' | 'text' | 'boolean'
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly placeholder?: string
}
export interface ReportPeriodRule { readonly required: boolean; readonly label: string; readonly maxDays: number }
export interface BuiltReportQuery {
  readonly dataSql: string
  readonly countAndTotalsSql: string
  readonly values: readonly unknown[]
}
export interface ReportCatalogEntry {
  readonly key: string
  readonly module: ReportModule
  readonly title: string
  readonly description: string
  readonly period: ReportPeriodRule
  readonly filters: readonly ReportFilterDefinition[]
  readonly columns: readonly ReportColumnDefinition[]
}
export interface ReportDefinition extends ReportCatalogEntry {
  readonly allowedRoles: readonly UserRole[]
  buildQuery(input: ValidatedReportQueryInput): BuiltReportQuery
  formatRow(rawRow: Record<string, unknown>): ReportRow
}
export interface ValidatedReportQueryInput {
  readonly from: string | null
  readonly to: string | null
  readonly filters: Readonly<Record<string, string>>
  readonly selectedColumns: readonly ReportColumnDefinition[]
  readonly limit: number
  readonly offset: number
}
export interface ReportPreviewResult {
  readonly reportKey: string
  readonly title: string
  readonly module: ReportModule
  readonly period: { readonly from: string | null; readonly to: string | null }
  readonly columns: readonly ReportColumnDefinition[]
  readonly rows: readonly ReportRow[]
  readonly page: number
  readonly pageSize: number
  readonly totalCount: number
  readonly totalPages: number
  readonly totals: Readonly<Record<string, string>>
}
export interface ReportPrintPayload {
  readonly reportKey: string
  readonly title: string
  readonly module: ReportModule
  readonly generatedAt: string
  readonly generatedBy: { readonly id: string; readonly name: string; readonly role: UserRole }
  readonly period: { readonly from: string | null; readonly to: string | null }
  readonly appliedFilters: readonly { readonly label: string; readonly value: string }[]
  readonly columns: readonly ReportColumnDefinition[]
  readonly rows: readonly ReportRow[]
  readonly totalCount: number
  readonly totals: Readonly<Record<string, string>>
}
export type ReportExportResult = { format: 'csv'; buffer: Buffer; filename: string } | { format: 'print'; payload: ReportPrintPayload }
export type ReportErrorCode = 'REPORT_NOT_FOUND' | 'FORBIDDEN_REPORT' | 'INVALID_INPUT' | 'INVALID_PERIOD'
  | 'INVALID_DATE_RANGE' | 'PERIOD_TOO_LARGE' | 'NO_COLUMNS_SELECTED' | 'INVALID_COLUMN' | 'INVALID_FILTER'
  | 'INVALID_EXPORT_FORMAT' | 'EXPORT_LIMIT_EXCEEDED' | 'PRINT_LIMIT_EXCEEDED' | 'INACTIVE_ACTOR'
export class ReportServiceError extends Error {
  constructor(public readonly code: ReportErrorCode, message: string) { super(message); this.name = 'ReportServiceError' }
}
