import type { ApiRequest } from '../api/client.ts'

export const AUDIT_PATH = '/auditoria'
export const AUDIT_PAGE_SIZE = 20
export const AUDIT_MAX_PERIOD_DAYS = 366
export const AUDIT_TIME_ZONE = 'America/Maceio'
export const canReadAudit = (profile: string) => profile === 'GESTOR' || profile === 'ADMINISTRADOR'

export interface AuditFilters {
  from: string
  to: string
  userId: string
  operation: string
  table: string
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
