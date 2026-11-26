import type { ApiRequest } from '../api/client.ts'

export const AUDIT_PATH = '/auditoria'
export const AUDIT_PAGE_SIZE = 20
export const AUDIT_MAX_PERIOD_DAYS = 366
export const AUDIT_TIME_ZONE = 'America/Maceio'

export interface AuditFilters {
  from: string
  to: string
  userId: string
  operation: string
  table: string
  recordId?: string
}

export interface AuditFilterError {
  field: keyof AuditFilters
  message: string
}

export interface AuditLog {
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

export interface AuditPage {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  partial: boolean
}

export type AuditEntityType =
  | 'vehicle' | 'driver' | 'service'
  | 'trip-request' | 'trip'
  | 'maintenance-order' | 'fueling' | 'fine' | 'vehicle-document'
  | 'svo-occurrence' | 'svo-order' | 'svo-team'
  | 'user' | 'profile'

export interface AuditHistoryEntry {
  id: string
  source: 'DOMAIN_EVENT' | 'AUDIT_LOG'
  eventType: string
  occurredAt: string
  registeredAt: string
  reportedBy: string | null
  actor: { id: string | null; name: string | null; role: string | null }
  reason: string | null
  before: unknown
  after: unknown
  sensitiveDataHidden: boolean
}

export interface AuditHistoryPage {
  entityType: AuditEntityType
  recordId: string
  items: AuditHistoryEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export class AuditAccessDenied extends Error {}
export class AuditRequestError extends Error {}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const operationPattern = /^[A-Z][A-Z_]{0,63}$/
const tablePattern = /^[a-z][a-z_]*\.[a-z0-9_-]{1,94}$/
const positiveIdPattern = /^[1-9]\d{0,18}$/
const dayMs = 86_400_000

function isCivilDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function nextCivilDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const nextDate = new Date(0)
  nextDate.setUTCHours(0, 0, 0, 0)
  nextDate.setUTCFullYear(year, month - 1, day + 1)
  return nextDate.toISOString().slice(0, 10)
}

export function validateAuditFilters(filters: AuditFilters): AuditFilterError | null {
  const from = filters.from.trim()
  const inclusiveTo = filters.to.trim()
  if (from && !isCivilDate(from)) return { field: 'from', message: 'Informe uma data inicial válida.' }
  if (inclusiveTo && !isCivilDate(inclusiveTo)) return { field: 'to', message: 'Informe uma data final válida.' }
  if (inclusiveTo === '9999-12-31') {
    return { field: 'to', message: 'A data final informada não pode ser convertida para o período da consulta.' }
  }
  if (from && inclusiveTo) {
    if (inclusiveTo < from) return { field: 'to', message: 'A data final deve ser igual ou posterior à data inicial.' }
    const days = (Date.parse(`${inclusiveTo}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs + 1
    if (days > AUDIT_MAX_PERIOD_DAYS) {
      return { field: 'to', message: `O período máximo da consulta é de ${AUDIT_MAX_PERIOD_DAYS} dias.` }
    }
  }
  const userId = filters.userId.trim()
  if (userId && !positiveIdPattern.test(userId)) {
    return { field: 'userId', message: 'O ID do usuário deve ser um número inteiro positivo.' }
  }
  const operation = filters.operation.trim()
  if (operation && !operationPattern.test(operation)) {
    return { field: 'operation', message: 'Use o código da ação em letras maiúsculas, por exemplo: CREATE ou STATUS_CHANGE.' }
  }
  const table = filters.table.trim()
  if (table && !tablePattern.test(table)) {
    return { field: 'table', message: 'Use o nome da entidade no formato schema.tabela, por exemplo: fleet.vehicles.' }
  }
  const recordId = filters.recordId?.trim() ?? ''
  if (recordId && !positiveIdPattern.test(recordId)) {
    return { field: 'recordId', message: 'O ID do registro deve ser um número inteiro positivo.' }
  }
  if (recordId && !table) return { field: 'recordId', message: 'Informe também a entidade do registro.' }
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function parseLog(value: unknown): AuditLog | null {
  if (!isObject(value) || !['string', 'number'].includes(typeof value.id)
    || typeof value.registeredAt !== 'string'
    || !/(Z|[+-]\d{2}:\d{2})$/i.test(value.registeredAt) || !Number.isFinite(Date.parse(value.registeredAt))
    || !isNullableString(value.userId) || !isNullableString(value.actorName)
    || typeof value.operation !== 'string' || typeof value.table !== 'string'
    || !isNullableString(value.recordId) || !isNullableString(value.reason)
    || typeof value.sensitiveDataHidden !== 'boolean'
    || !('before' in value) || !('after' in value) || !('actorSnapshot' in value)) return null
  return {
    id: String(value.id), registeredAt: value.registeredAt, userId: value.userId,
    actorName: value.actorName, operation: value.operation, table: value.table,
    recordId: value.recordId, reason: value.reason, before: value.before, after: value.after,
    actorSnapshot: value.actorSnapshot, sensitiveDataHidden: value.sensitiveDataHidden,
  }
}

/** Consulta o endpoint de leitura da auditoria e valida os registros antes de exibi-los. */
export async function readAuditLogs(api: ApiRequest, filters: AuditFilters, page: number, signal: AbortSignal): Promise<AuditPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(AUDIT_PAGE_SIZE) })
  const values: [keyof AuditFilters, string][] = [
    ['from', filters.from], ['to', filters.to], ['userId', filters.userId],
    ['operation', filters.operation], ['table', filters.table],
    ['recordId', filters.recordId ?? ''],
  ]
  for (const [key, value] of values) if (value.trim()) params.set(key, value.trim())
  const response = await api('/audit-logs?' + params, { method: 'GET', signal, cache: 'no-store' })
  if (response.status === 403) throw new AuditAccessDenied()
  if (!response.ok) {
    if (response.status === 400) {
      try {
        const body: unknown = await response.json()
        if (isObject(body) && typeof body.erro === 'string' && body.erro.trim()) throw new AuditRequestError(body.erro)
      } catch (error) {
        if (error instanceof AuditRequestError) throw error
      }
    }
    throw new Error('Não foi possível consultar a auditoria.')
  }
  const data: unknown = await response.json()
  if (!isObject(data) || !Array.isArray(data.logs)
    || !Number.isSafeInteger(data.total) || (data.total as number) < 0
    || !Number.isSafeInteger(data.page) || (data.page as number) < 1
    || !Number.isSafeInteger(data.pageSize) || (data.pageSize as number) < 1
    || !Number.isSafeInteger(data.totalPages) || (data.totalPages as number) < 0) {
    throw new Error('Resposta de auditoria incompatível.')
  }
  const parsed = data.logs.map(parseLog)
  const logs = parsed.filter((log): log is AuditLog => log !== null)
  if (data.logs.length && !logs.length) throw new Error('Nenhum registro válido na resposta.')
  return {
    logs, total: data.total as number, page: data.page as number,
    pageSize: data.pageSize as number, totalPages: data.totalPages as number,
    partial: logs.length !== data.logs.length,
  }
}

/** Lê o histórico de uma entidade por identificador via fachada central protegida. */
export async function readAuditHistory(
  api: ApiRequest,
  entityType: AuditEntityType,
  recordId: string,
  from: string,
  to: string,
  page: number,
  signal: AbortSignal,
): Promise<AuditHistoryPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(AUDIT_PAGE_SIZE) })
  if (from.trim()) params.set('from', from.trim())
  if (to.trim()) params.set('to', to.trim())
  const response = await api(
    `/audit-logs/records/${encodeURIComponent(entityType)}/${encodeURIComponent(recordId)}/history?${params}`,
    { method: 'GET', signal, cache: 'no-store' },
  )
  if (response.status === 403) throw new AuditAccessDenied()
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new AuditRequestError(isObject(body) && typeof body.erro === 'string' ? body.erro : 'Não foi possível consultar o histórico do registro.')
  }
  const body: unknown = await response.json()
  if (!isObject(body) || body.entityType !== entityType || body.recordId !== recordId
    || !Array.isArray(body.items) || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || body.page !== page || body.pageSize !== AUDIT_PAGE_SIZE
    || !Number.isSafeInteger(body.totalPages) || Number(body.totalPages) < 0) {
    throw new AuditRequestError('A resposta do histórico do registro está em formato inválido.')
  }
  const items = body.items.flatMap((item): AuditHistoryEntry[] => {
    if (!isObject(item) || typeof item.id !== 'string'
      || !['DOMAIN_EVENT', 'AUDIT_LOG'].includes(String(item.source))
      || typeof item.eventType !== 'string'
      || typeof item.occurredAt !== 'string' || !Number.isFinite(Date.parse(item.occurredAt))
      || typeof item.registeredAt !== 'string' || !Number.isFinite(Date.parse(item.registeredAt))
      || typeof item.sensitiveDataHidden !== 'boolean' || !isObject(item.actor)
      || !(item.actor.id === null || typeof item.actor.id === 'string')
      || !(item.actor.name === null || typeof item.actor.name === 'string')
      || !(item.actor.role === null || typeof item.actor.role === 'string')
      || !(item.reason === null || typeof item.reason === 'string')
      || !(item.reportedBy === null || typeof item.reportedBy === 'string')
      || !('before' in item) || !('after' in item)) return []
    return [{
      id: item.id,
      source: item.source as AuditHistoryEntry['source'],
      eventType: item.eventType,
      occurredAt: item.occurredAt,
      registeredAt: item.registeredAt,
      reportedBy: item.reportedBy,
      actor: { id: item.actor.id, name: item.actor.name, role: item.actor.role },
      reason: item.reason,
      before: item.before,
      after: item.after,
      sensitiveDataHidden: item.sensitiveDataHidden,
    }]
  })
  if (body.items.length > 0 && items.length === 0) throw new AuditRequestError('Nenhum evento válido na resposta.')
  return {
    entityType,
    recordId,
    items,
    total: Number(body.total),
    page,
    pageSize: AUDIT_PAGE_SIZE,
    totalPages: Number(body.totalPages),
  }
}
