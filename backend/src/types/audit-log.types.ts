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
  recordId?: unknown
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
  recordId: string | null
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

/** Evento histórico seguro de um registro consultado na área central de Auditoria. */
export interface AuditHistoryEntry {
  id: string
  source: 'DOMAIN_EVENT' | 'AUDIT_LOG'
  eventType: string
  occurredAt: Date
  registeredAt: Date
  reportedBy: string | null
  actor: { id: string | null; name: string | null; role: string | null }
  reason: string | null
  before: unknown
  after: unknown
  sensitiveDataHidden: boolean
}

/** Paginação de eventos de um registro individual. */
export interface AuditHistoryPage {
  entityType: AuditEntityType
  recordId: string
  items: AuditHistoryEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Parâmetros não confiáveis da consulta central de histórico. */
export interface AuditHistoryQuery {
  entityType: unknown
  recordId: unknown
  eventType?: unknown
  from?: unknown
  to?: unknown
  page?: unknown
  pageSize?: unknown
}

/** Recorte de leitura repassado a um reader de histórico com escopo de domínio. */
export interface AuditHistoryScope {
  kind: 'all' | 'own' | 'assigned'
  actorId: string
}

/** Contexto de autorização atual usado para preservar o escopo próprio/atribuído. */
export interface AuditHistoryActor {
  id: string
  permissions: readonly string[]
}

/** Tipos de registro para os quais a área central possui leitor aprovado. */
export type AuditEntityType =
  | 'vehicle' | 'driver' | 'service'
  | 'trip-request' | 'trip'
  | 'maintenance-order' | 'fueling' | 'fine' | 'vehicle-document'
  | 'svo-occurrence' | 'svo-order' | 'svo-team'
  | 'user' | 'profile'

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class AuditLogsError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AuditLogsError'
    this.statusCode = statusCode
  }
}
