import { createFleetReportQueries } from '../../../repositories/reports/fleet.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import type { ReportDefinition } from '../../../types/report.types'
import { DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS } from '../../vehicle-document-config.service'
import { column as c, MANAGEMENT_ROLES, period, PLATE_FILTER, selectFilter, VALIDITY_OPTIONS } from './report-definition'




/** Mantém o mesmo prazo de alerta injetado na API de documentos. */
export function createFleetReports(alertDays = DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS): readonly ReportDefinition[] {
  const queries = createFleetReportQueries(alertDays)

  return [
    createReportDefinition({
  ...queries['fleet-vehicles']!,
  key: 'fleet-vehicles',
  module: 'FROTA',
  title: 'Veículos',
  description: 'Cadastro e capacidade da frota.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(false, 'Data de cadastro'),
  columns: [c('licensePlate', 'Placa'), c('vehicleDescription', 'Veículo'), c('status', 'Situação', 'status'), c('operationType', 'Operação', 'status'),
        c('ownership', 'Propriedade', 'status'), c('seats', 'Assentos', 'number', true, true), c('bodyLimit', 'Capacidade de corpos', 'number', false, true),
        c('weightLimitKg', 'Limite de peso (kg)', 'number', false), c('categories', 'Categorias', 'text', false), c('createdAt', 'Cadastro', 'datetime', false)],
  filters: [selectFilter('status', 'Situação', { AVAILABLE: 'Disponível', IN_MAINTENANCE: 'Em manutenção', INACTIVE: 'Inativo' }),
        selectFilter('operationType', 'Operação', { ADMINISTRATIVE: 'Administrativa', SVO: 'SVO' }), selectFilter('ownership', 'Propriedade', { OWNED: 'Próprio', LEASED: 'Locado' }), PLATE_FILTER]
}),
    createReportDefinition({
  ...queries['fleet-fuelings']!,
  key: 'fleet-fuelings',
  module: 'FROTA',
  title: 'Abastecimentos por período',
  description: 'Somente versões vigentes, com contexto histórico.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(true, 'Data do abastecimento'),
  columns: [c('fueledAt', 'Abastecimento', 'datetime'), c('licensePlate', 'Placa'), c('driverName', 'Motorista'), c('fuelType', 'Combustível', 'status'),
        c('liters', 'Litros', 'number', true, true), c('totalValue', 'Valor total', 'currency', true, true), c('odometerKm', 'Hodômetro (km)', 'number'),
        c('station', 'Posto', 'text', false), c('reportedBy', 'Informado por', 'text', false), c('isRectified', 'Retificado', 'boolean', false)],
  filters: [selectFilter('fuelType', 'Combustível', { GASOLINE: 'Gasolina', ETHANOL: 'Etanol', DIESEL: 'Diesel', DIESEL_S10: 'Diesel S10', GNV: 'GNV', FLEX: 'Flex', OTHER: 'Outro' }), PLATE_FILTER]
}),
    createReportDefinition({
  ...queries['fleet-vehicle-documents']!,
  key: 'fleet-vehicle-documents',
  module: 'FROTA',
  title: 'Documentos de veículos',
  description: 'Vencimentos, renovações e anulações.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(false, 'Vencimento'),
  columns: [c('licensePlate', 'Placa'), c('documentType', 'Tipo', 'status'), c('documentNumber', 'Número'), c('issuedAt', 'Emissão', 'date'), c('expiresAt', 'Vencimento', 'date'), c('status', 'Situação', 'status'), c('daysToExpire', 'Dias até vencer', 'number'), c('notes', 'Observações', 'text', false)],
  filters: [selectFilter('documentType', 'Tipo de documento', { CRLV: 'CRLV', LICENSING: 'Licenciamento', IPVA: 'IPVA', INSURANCE: 'Seguro', LEASE_CONTRACT: 'Contrato de locação', OTHER: 'Outro' }), selectFilter('status', 'Situação', { ...VALIDITY_OPTIONS, RENEWED: 'Renovado', ANNULLED: 'Anulado' }), PLATE_FILTER]
}),
    createReportDefinition({
  ...queries['fleet-fines']!,
  key: 'fleet-fines',
  module: 'FROTA',
  title: 'Multas por período',
  description: 'Infrações e valores da frota.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(true, 'Data da infração'),
  columns: [c('infractionAt', 'Infração', 'datetime'), c('licensePlate', 'Placa'), c('driverName', 'Motorista'), c('infractionCode', 'Código'), c('description', 'Descrição'), c('amount', 'Valor', 'currency', true, true), c('status', 'Situação', 'status'), c('dueAt', 'Vencimento', 'date'), c('paidAt', 'Pagamento', 'datetime', false), c('location', 'Local', 'text', false)],
  filters: [selectFilter('status', 'Situação', { PENDING: 'Pendente', PAID: 'Paga', CANCELED: 'Cancelada' }), PLATE_FILTER]
}),
  ]
}
