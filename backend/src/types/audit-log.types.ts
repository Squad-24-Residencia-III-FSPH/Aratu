/** Paginação da consulta de auditoria, igual à listagem de usuários. */
export const AUDIT_LOGS_DEFAULT_PAGE_SIZE = 20
export const AUDIT_LOGS_MAX_PAGE_SIZE = 100
export const AUDIT_LOGS_MAX_PERIOD_DAYS = 366

/** Parâmetros brutos de `GET /audit-logs`. */
export interface AuditLogsQuery {
  from?: unknown
  to?: unknown
  userId?: unknown
  operation?: unknown
  table?: unknown
  page?: unknown
  pageSize?: unknown
}

/** Filtros validados; datas civis de Aracaju com `to` excluído. */
export interface AuditLogFilters {
  from: string | null
  to: string | null
  userId: string | null
  operation: string | null
  table: string | null
  limit: number
  offset: number
}

/** Registro de auditoria como gravado, antes da máscara. */
export interface StoredAuditLog {
  id: string
  registeredAt: Date
  userId: string | null
  actorName: string | null
  operation: string
  table: string
  recordId: string | null
  reason: string | null
  before: unknown
  after: unknown
  actorSnapshot: unknown
}

/** Registro devolvido pela API, com dados sensíveis mascarados. */
export interface AuditLogView extends StoredAuditLog {
  sensitiveDataHidden: boolean
}

/** Página da consulta de auditoria. */
export interface AuditLogPage {
  logs: AuditLogView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class AuditLogsError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AuditLogsError'
    this.statusCode = statusCode
  }
}
