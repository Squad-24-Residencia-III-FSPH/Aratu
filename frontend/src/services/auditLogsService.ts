import type { ApiRequest } from '../api/client'
import type { AuditLogEntry, AuditLogPage, AuditLogsQuery } from '../types/auditLog'

const INVALID_RESPONSE_MESSAGE = 'A resposta da trilha de auditoria está em um formato inválido.'
const LOAD_ERROR_MESSAGE = 'Não foi possível carregar os registros de auditoria. Tente novamente.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function errorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.erro === 'string' && body.erro.trim()) {
    return body.erro
  }
  return fallback
}

/** Erro tipado para distinguir rejeições de validação/RBAC de falhas inesperadas. */
export class AuditLogsRequestError extends Error {
  readonly statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = 'AuditLogsRequestError'
    this.statusCode = statusCode
  }
}

function parseAuditLogEntry(value: unknown): AuditLogEntry {
  if (
    !isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.registeredAt !== 'string' || Number.isNaN(Date.parse(value.registeredAt))
    || !isNullableString(value.userId)
    || !isNullableString(value.actorName)
    || typeof value.operation !== 'string' || !value.operation.trim()
    || typeof value.table !== 'string' || !value.table.trim()
    || !isNullableString(value.recordId)
    || !isNullableString(value.reason)
    || !('before' in value)
    || !('after' in value)
    || !('actorSnapshot' in value)
    || typeof value.sensitiveDataHidden !== 'boolean'
  ) {
    throw new AuditLogsRequestError(INVALID_RESPONSE_MESSAGE)
  }

  return {
    id: value.id,
    registeredAt: value.registeredAt,
    userId: value.userId,
    actorName: value.actorName,
    operation: value.operation,
    table: value.table,
    recordId: value.recordId,
    reason: value.reason,
    before: value.before,
    after: value.after,
    actorSnapshot: value.actorSnapshot,
    sensitiveDataHidden: value.sensitiveDataHidden,
  }
}

function parseAuditLogPage(value: unknown): AuditLogPage {
  if (
    !isRecord(value)
    || !Array.isArray(value.logs)
    || typeof value.total !== 'number' || !Number.isInteger(value.total) || value.total < 0
    || typeof value.page !== 'number' || !Number.isInteger(value.page) || value.page < 1
    || typeof value.pageSize !== 'number' || !Number.isInteger(value.pageSize) || value.pageSize < 1
    || typeof value.totalPages !== 'number' || !Number.isInteger(value.totalPages) || value.totalPages < 0
  ) {
    throw new AuditLogsRequestError(INVALID_RESPONSE_MESSAGE)
  }

  return {
    logs: value.logs.map(parseAuditLogEntry),
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
    totalPages: value.totalPages,
  }
}

/** Serializa apenas os filtros preenchidos para a query string de `GET /audit-logs`. */
export function buildAuditLogsQuery(query: AuditLogsQuery = {}): string {
  const params = new URLSearchParams()
  if (query.from?.trim()) params.set('from', query.from.trim())
  if (query.to?.trim()) params.set('to', query.to.trim())
  if (query.userId?.trim()) params.set('userId', query.userId.trim())
  if (query.operation?.trim()) params.set('operation', query.operation.trim())
  if (query.table?.trim()) params.set('table', query.table.trim())
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Consulta paginada e somente leitura dos eventos registrados em `audit.logs`. */
export async function listAuditLogs(
  api: ApiRequest,
  query: AuditLogsQuery = {},
  signal?: AbortSignal,
): Promise<AuditLogPage> {
  const response = await api(`/audit-logs${buildAuditLogsQuery(query)}`, signal ? { signal } : undefined)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new AuditLogsRequestError(errorMessage(body, LOAD_ERROR_MESSAGE), response.status)
  }
  return parseAuditLogPage(body)
}
