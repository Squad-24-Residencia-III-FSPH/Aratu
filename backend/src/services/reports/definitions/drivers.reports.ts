import { driversReportQueries } from '../../../repositories/reports/drivers.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { column as c, MANAGEMENT_ROLES, period, selectFilter, VALIDITY_OPTIONS } from './report-definition'

/** Oculta extremidades do CPF antes de qualquer resposta ou exportação. */
export function maskCpfForReport(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  return digits.length === 11 ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : '***.***.***-**'
}

const queries = driversReportQueries
export const driverReports = [createReportDefinition({
  ...queries['drivers-roster']!,
  key: 'drivers-roster',
  module: 'MOTORISTAS',
  title: 'Motoristas',
  description: 'Cadastro, situação e validade da CNH; CPF mascarado.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(false, 'Vencimento da CNH'),
  columns: [c('name', 'Nome'), c('maskedCpf', 'CPF mascarado'), c('cnhNumber', 'CNH'), c('cnhCategory', 'Categoria CNH'), c('cnhExpiresAt', 'Vencimento CNH', 'date'), c('cnhValidity', 'Validade CNH', 'status'), c('status', 'Situação', 'status'), c('phone', 'Telefone', 'text', false), c('createdAt', 'Cadastro', 'datetime', false)],
  filters: [selectFilter('status', 'Situação', { ACTIVE: 'Ativo', AWAY: 'Afastado', INACTIVE: 'Inativo' }), selectFilter('cnhCategory', 'Categoria CNH', Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'].map(value => [value, value]))), selectFilter('cnhValidity', 'Validade CNH', VALIDITY_OPTIONS)]
})]
