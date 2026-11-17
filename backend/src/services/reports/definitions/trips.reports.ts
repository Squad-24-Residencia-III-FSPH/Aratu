import { tripsReportQueries } from '../../../repositories/reports/trips.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { column as c, MANAGEMENT_ROLES, period, PLATE_FILTER, selectFilter } from './report-definition'


const queries = tripsReportQueries
export const tripReports = [
  createReportDefinition({
  ...queries['trips-requests']!,
  key: 'trips-requests',
  module: 'VIAGENS',
  title: 'Solicitações de transporte',
  description: 'Pedidos institucionais e decisões.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(true, 'Data solicitada'),
  columns: [c('id', 'Solicitação'), c('requestedDate', 'Data solicitada', 'date'), c('requesterName', 'Solicitante'), c('serviceName', 'Serviço'), c('origin', 'Origem'), c('destination', 'Destino'), c('passengers', 'Passageiros', 'number', true, true), c('status', 'Situação', 'status'), c('purpose', 'Finalidade', 'text', false), c('decidedAt', 'Decisão', 'datetime', false), c('decisionReason', 'Justificativa', 'text', false)],
  filters: [selectFilter('status', 'Situação', { PENDING: 'Pendente', APPROVED: 'Aprovada', REJECTED: 'Recusada', SCHEDULED: 'Agendada', CANCELED: 'Cancelada' })]
}),
  createReportDefinition({
  ...queries['trips-executions']!,
  key: 'trips-executions',
  module: 'VIAGENS',
  title: 'Viagens',
  description: 'Execuções e distância registrada.',
  allowedRoles: MANAGEMENT_ROLES,
  period: period(true, 'Início agendado'),
  columns: [c('id', 'Viagem'), c('scheduledStart', 'Início agendado', 'datetime'), c('scheduledEnd', 'Fim agendado', 'datetime'), c('licensePlate', 'Placa'), c('driverName', 'Motorista'), c('origin', 'Origem'), c('destination', 'Destino'), c('status', 'Situação', 'status'), c('distanceKm', 'Distância (km)', 'number', true, true), c('startKm', 'Km inicial', 'number', false), c('endKm', 'Km final', 'number', false), c('startedAt', 'Início efetivo', 'datetime', false), c('finishedAt', 'Fim efetivo', 'datetime', false), c('confirmedAt', 'Confirmação', 'datetime', false)],
  filters: [selectFilter('status', 'Situação', { SCHEDULED: 'Agendada', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', CONFIRMED: 'Confirmada', CANCELED: 'Cancelada' }), PLATE_FILTER]
}),
]
