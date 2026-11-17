import { svoReportQueries } from '../../../repositories/reports/svo.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { SVO_REQUESTER_TYPES, SVO_STATUSES } from '../../../types/svo-occurrence.types'
import { SVO_ORDER_STATUSES, SVO_ORDER_RESULTS } from '../../../types/svo-order.types'
import { column as c, period, PLATE_FILTER, selectFilter, SVO_REPORT_ROLES } from './report-definition'


const labels: Record<string, string> = { FAMILY: 'Família', HOSPITAL: 'Hospital', UBS: 'UBS', UPA: 'UPA', PUBLIC_AGENCY: 'Órgão público', OTHER: 'Outro', PENDING: 'Pendente', CONFIRMED: 'Confirmada', CANCELED: 'Cancelada', OPEN: 'Aberta', IN_TRANSIT: 'Em deslocamento', IN_SERVICE: 'Em atendimento', IN_PROGRESS: 'Em andamento', COMPLETED: 'Realizado', NOT_PERFORMED: 'Não realizado' }
const options = (values: readonly string[]) => Object.fromEntries(values.map(value => [value, labels[value] ?? value]))
/** Projeções restritas aos campos operacionais aprovados; snapshots completos nunca são retornados. */
const queries = svoReportQueries
export const svoReports = [
  createReportDefinition({
  ...queries['svo-occurrences']!,
  key: 'svo-occurrences',
  module: 'SVO',
  title: 'Ocorrências SVO',
  description: 'Metadados operacionais de recebimento e triagem.',
  allowedRoles: SVO_REPORT_ROLES,
  period: period(true, 'Recebimento'),
  columns: [c('id', 'Ocorrência'), c('receivedAt', 'Recebimento', 'datetime'), c('requesterType', 'Tipo de solicitante', 'status'), c('location', 'Local'), c('status', 'Situação', 'status'), c('attendantName', 'Atendente'), c('triagedAt', 'Triagem', 'datetime', false)],
  filters: [selectFilter('status', 'Situação', options(SVO_STATUSES)), selectFilter('requesterType', 'Tipo de solicitante', options(SVO_REQUESTER_TYPES))]
}),
  createReportDefinition({
  ...queries['svo-orders']!,
  key: 'svo-orders',
  module: 'SVO',
  title: 'Ordens de atendimento SVO',
  description: 'Despacho, etapas e resultado operacional.',
  allowedRoles: SVO_REPORT_ROLES,
  period: period(true, 'Abertura'),
  columns: [c('id', 'Ordem'), c('occurrenceId', 'Ocorrência'), c('openedAt', 'Abertura', 'datetime'), c('teamName', 'Equipe'), c('licensePlate', 'Placa'), c('status', 'Situação', 'status'), c('result', 'Resultado', 'status'), c('departedAt', 'Saída', 'datetime', false), c('arrivedAt', 'Chegada', 'datetime', false), c('closedAt', 'Encerramento', 'datetime', false), c('failureReason', 'Motivo da não realização', 'text', false)],
  filters: [selectFilter('status', 'Situação', options(SVO_ORDER_STATUSES)), selectFilter('result', 'Resultado', options(SVO_ORDER_RESULTS)), PLATE_FILTER]
}),
]
