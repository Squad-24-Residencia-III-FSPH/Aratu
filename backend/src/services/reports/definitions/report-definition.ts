import type { ReportColumnDefinition, ReportColumnType, ReportFilterDefinition } from '../../../types/report.types'
import { REPORT_MAX_PERIOD_DAYS, REPORT_SELECT_FILTER_TYPE } from '../../../types/report.types'

export const MANAGEMENT_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const
export const SVO_REPORT_ROLES = [...MANAGEMENT_ROLES, 'ATENDENTE_SVO'] as const
export function column(key: string, label: string, type: ReportColumnType = 'text', defaultSelected = true, totalizable = false): ReportColumnDefinition {
  return { key, label, type, defaultSelected, totalizable, align: type === 'number' || type === 'currency' ? 'right' : 'left' }
}
export function period(required: boolean, label: string) { return { required, label, maxDays: REPORT_MAX_PERIOD_DAYS } }
export function selectFilter(key: string, label: string, options: Readonly<Record<string, string>>): ReportFilterDefinition {
  return { key, label, type: REPORT_SELECT_FILTER_TYPE, options: Object.entries(options).map(([value, text]) => ({ value, label: text })) }
}
export const PLATE_FILTER: ReportFilterDefinition = { key: 'licensePlatePrefix', label: 'Prefixo da placa', type: 'text', placeholder: 'Ex.: ABC' }
export const VALIDITY_OPTIONS = { VALID: 'Válida', EXPIRING: 'Próxima do vencimento', EXPIRED: 'Vencida' }
