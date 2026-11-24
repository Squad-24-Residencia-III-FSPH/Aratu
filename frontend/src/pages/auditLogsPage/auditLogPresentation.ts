import { PROFILE_HOMES } from '../../auth/profiles'
import type { Profile } from '../../auth/profiles'
import type { FormSelectOption } from '../../components/ui/FormField'
import type { StatusTone } from '../../components/ui/StatusChip'
import { canAccessFuelings, FUELINGS_PATH } from '../../fuelings/fuelingAccess'
import { canManageMaintenance, MAINTENANCE_PATH } from '../../maintenance/maintenanceTypes'
import { canAccessReports } from '../../reports/reportAccess'
import { REPORTS_PATH } from '../../reports/reportTypes'
import { canAnalyzeRequests, REQUEST_ANALYSIS_PATH } from '../../requests/requestAccess'
import { canManageServiceTypes, SERVICE_TYPES_PATH } from '../../services/fleetServicesAccess'
import { SVO_ORDERS_PATH } from '../../svo/svoOrderTypes'
import { TRIP_CONFIRMATION_PATH } from '../../trips/tripConfirmationTypes'
import { canReadDrivers, DRIVERS_PATH } from '../../drivers/driverAccess'
import { canReadVehicles, VEHICLES_PATH } from '../../vehicles/vehicleAccess'
import type { AuditLogEntry } from '../../types/auditLog'
import { OPERATIONAL_TIME_ZONE } from '../../utils/dates'

const AUDIT_DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const OPERATION_METADATA: Readonly<Record<string, { label: string; tone: StatusTone }>> = {
  CREATE: { label: 'Criação', tone: 'success' },
  REGISTERED: { label: 'Registro', tone: 'success' },
  OPENED: { label: 'Abertura', tone: 'info' },
  RENEWED: { label: 'Renovação', tone: 'info' },
  UPDATE: { label: 'Alteração', tone: 'info' },
  UPDATED: { label: 'Atualização', tone: 'info' },
  RECTIFY: { label: 'Retificação', tone: 'warning' },
  RECTIFIED: { label: 'Retificação', tone: 'warning' },
  STATUS_CHANGE: { label: 'Mudança de situação', tone: 'warning' },
  COMPATIBILITY_CHANGE: { label: 'Compatibilidade', tone: 'info' },
  CLOSED: { label: 'Encerramento', tone: 'neutral' },
  REOPENED: { label: 'Reabertura', tone: 'warning' },
  PAID: { label: 'Pagamento', tone: 'success' },
  APPEALED: { label: 'Recurso', tone: 'warning' },
  CANCELLED: { label: 'Cancelamento', tone: 'neutral' },
  ANNULLED: { label: 'Anulação', tone: 'neutral' },
  DELETE: { label: 'Exclusão', tone: 'neutral' },
  EXPORT: { label: 'Exportação', tone: 'info' },
  LOGIN_SUCCESS: { label: 'Login realizado', tone: 'success' },
  LOGIN_FAILURE: { label: 'Falha de login', tone: 'warning' },
  LOGIN_INACTIVE: { label: 'Login bloqueado', tone: 'warning' },
  LOGOUT: { label: 'Logout', tone: 'neutral' },
}

const TABLE_LABELS: Readonly<Record<string, string>> = {
  'auth.users': 'Usuários',
  'fleet.vehicles': 'Veículos',
  'fleet.drivers': 'Motoristas',
  'fleet.services': 'Tipos de serviço',
  'fleet.maintenance_orders': 'Ordens de manutenção',
  'fleet.fuelings': 'Abastecimentos',
  'fleet.vehicle_documents': 'Documentos de veículos',
  'fleet.fines': 'Multas e infrações',
  'trip.requests': 'Solicitações de viagem',
  'trip.trips': 'Viagens',
  'svo.occurrences': 'Ocorrências SVO',
  'svo.execution_orders': 'Ordens SVO',
}

/** Opções de ação conhecidas pelo backend para filtro de auditoria. */
export const AUDIT_OPERATION_OPTIONS: readonly FormSelectOption[] = Object.entries(OPERATION_METADATA).map(
  ([value, meta]) => ({
    value,
    label: `${meta.label} (${value})`,
  }),
)

/** Formata o instante ISO no fuso operacional oficial (`America/Maceio`) com precisão de segundos. */
export function formatAuditDateTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : AUDIT_DATE_TIME_FORMAT.format(parsed)
}

/** Retorna o rótulo em português para o código de operação auditada. */
export function formatOperationLabel(operation: string): string {
  return OPERATION_METADATA[operation]?.label ?? operation
}

/** Retorna o tom visual acessível do chip de operação. */
export function operationTone(operation: string): StatusTone {
  return OPERATION_METADATA[operation]?.tone ?? 'neutral'
}

/** Traduz o identificador técnico da entidade (`schema.tabela`) para rótulo amigável. */
export function formatTableLabel(table: string): string {
  if (TABLE_LABELS[table]) return TABLE_LABELS[table]
  if (table.startsWith('reports.')) return 'Relatórios operacionais'
  return table
}

/** Formata o identificador legível do ator responsável pela ação auditada. */
export function formatActorDisplay(log: AuditLogEntry): string {
  if (log.actorName?.trim()) return log.actorName.trim()
  if (log.userId) return `Usuário #${log.userId}`
  return 'Sistema'
}

/** Destino autorizado de navegação para o módulo correspondente ao registro auditado. */
export interface AuditRecordTarget {
  path: string
  label: string
}

/**
 * Resolve uma tela de destino somente quando a rota existe no mapa do aplicativo
 * e o perfil autenticado possui permissão para acessá-la.
 */
export function resolveAuditRecordTarget(
  log: AuditLogEntry,
  profile: Profile | null,
): AuditRecordTarget | null {
  if (!profile) return null

  if (log.table === 'auth.users') {
    return profile === 'ADMINISTRADOR'
      ? { path: PROFILE_HOMES.ADMINISTRADOR.path, label: 'Abrir gerenciamento de usuários' }
      : null
  }
  if (log.table === 'fleet.vehicles') {
    return canReadVehicles(profile)
      ? { path: VEHICLES_PATH, label: 'Abrir tela de veículos' }
      : null
  }
  if (log.table === 'fleet.drivers') {
    return canReadDrivers(profile)
      ? { path: DRIVERS_PATH, label: 'Abrir tela de motoristas' }
      : null
  }
  if (log.table === 'fleet.services') {
    return canManageServiceTypes(profile)
      ? { path: SERVICE_TYPES_PATH, label: 'Abrir tipos de serviço' }
      : null
  }
  if (log.table === 'fleet.maintenance_orders') {
    return canManageMaintenance(profile)
      ? { path: MAINTENANCE_PATH, label: 'Abrir ordens de manutenção' }
      : null
  }
  if (log.table === 'fleet.fuelings') {
    return canAccessFuelings(profile)
      ? { path: FUELINGS_PATH, label: 'Abrir abastecimentos' }
      : null
  }
  if (log.table === 'trip.requests') {
    return canAnalyzeRequests(profile)
      ? { path: REQUEST_ANALYSIS_PATH, label: 'Abrir análise de solicitações' }
      : null
  }
  if (log.table === 'trip.trips') {
    return profile === 'GESTOR'
      ? { path: TRIP_CONFIRMATION_PATH, label: 'Abrir conferência de viagens' }
      : null
  }
  if (log.table === 'svo.execution_orders') {
    return profile === 'GESTOR' || profile === 'ATENDENTE_SVO'
      ? { path: SVO_ORDERS_PATH, label: 'Abrir acompanhamento de ordens SVO' }
      : null
  }
  if (log.table.startsWith('reports.')) {
    return canAccessReports(profile)
      ? { path: REPORTS_PATH, label: 'Abrir relatórios operacionais' }
      : null
  }

  return null
}
