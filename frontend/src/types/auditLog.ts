import type { Profile } from '../auth/profiles'

/** Caminho canônico da tela somente leitura de trilha de auditoria (FROTA-142). */
export const AUDIT_LOGS_PATH = '/auditoria'

/** Perfis autorizados a consultar a trilha de auditoria, espelhando `MANAGEMENT_ROLES` da API. */
const AUDIT_LOG_READ_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

export const AUDIT_LOGS_DEFAULT_PAGE_SIZE = 20
export const AUDIT_LOGS_MAX_PAGE_SIZE = 100
export const AUDIT_LOGS_MAX_PERIOD_DAYS = 366

/** Indica se o perfil autenticado pode consultar registros de auditoria. */
export function canAccessAuditLogs(profile: Profile | null): boolean {
  return profile !== null && AUDIT_LOG_READ_PROFILES.includes(profile)
}

/** Parâmetros suportados por `GET /audit-logs`. */
export interface AuditLogsQuery {
  from?: string
  to?: string
  userId?: string
  operation?: string
  table?: string
  page?: number
  pageSize?: number
}

/** Registro individual retornado pela API de consulta de auditoria. */
export interface AuditLogEntry {
  id: string
  registeredAt: string
  userId: string | null
  actorName: string | null
  operation: string
  table: string
  recordId: string | null
  reason: string | null
  before: unknown
  after: unknown
  actorSnapshot: unknown
  sensitiveDataHidden: boolean
}

/** Envelope paginado devolvido por `GET /audit-logs`. */
export interface AuditLogPage {
  logs: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
