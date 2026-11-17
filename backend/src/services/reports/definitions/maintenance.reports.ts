import { maintenanceReportQueries } from '../../../repositories/reports/maintenance.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { column as c, MANAGEMENT_ROLES, period, PLATE_FILTER, selectFilter } from './report-definition'


const queries = maintenanceReportQueries
export const maintenanceReports = [createReportDefinition({
  ...queries['maintenance-orders']!,
  key: 'maintenance-orders',
  module: 'MANUTENCOES',
  title: 'Ordens de manutenção',
  description: 'Orçamentos e custos das ordens encerradas.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(true, 'Abertura da ordem'),
  columns: [c('id', 'Ordem'), c('openedAt', 'Abertura', 'datetime'), c('licensePlate', 'Placa'), c('type', 'Tipo', 'status'), c('status', 'Situação', 'status'), c('blocksVehicle', 'Impeditiva', 'boolean'), c('workshop', 'Oficina'), c('estimatedTotal', 'Total estimado', 'currency', true, true), c('finalCost', 'Custo final', 'currency', true, true), c('odometerKm', 'Hodômetro (km)', 'number', false), c('expectedCompletionDate', 'Previsão', 'date', false), c('closedAt', 'Encerramento', 'datetime', false), c('description', 'Descrição', 'text', false)],
  filters: [selectFilter('type', 'Tipo', { PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva' }), selectFilter('status', 'Situação', { OPEN: 'Aberta', IN_PROGRESS: 'Em andamento', DONE: 'Concluída', CANCELED: 'Cancelada' }), PLATE_FILTER]
})]
