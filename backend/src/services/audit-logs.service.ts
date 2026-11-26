import {
  AUDIT_LOGS_DEFAULT_PAGE_SIZE,
  AUDIT_LOGS_MAX_PAGE_SIZE,
  AUDIT_LOGS_MAX_PERIOD_DAYS,
  AuditLogsError,
} from '../types/audit-log.types'
import type { AuditHistoryActor, AuditLogFilters, AuditLogPage, AuditLogView, AuditLogsQuery, StoredAuditLog } from '../types/audit-log.types'
import type { AuditLogsRepositoryContract } from '../repositories/audit-logs.repository'
import type { AuditEntityType, AuditHistoryPage, AuditHistoryQuery } from '../types/audit-log.types'
import { EntityHistoryQueryError, normalizeEntityHistoryFilters } from './entity-history'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ID_PATTERN = /^[1-9]\d{0,18}$/
const OPERATION_PATTERN = /^[A-Z][A-Z_]{0,63}$/
const TABLE_PATTERN = /^[a-z][a-z_]*\.[a-z0-9_-]{1,94}$/
const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/
const DAY_MS = 86_400_000
const SECRET_KEY = /password|senha|token|secret|hash/i
const CPF_KEY = /^cpf$/i
const CNH_NUMBER_KEY = /^cnh_?number$/i
const SVO_TABLE_PREFIX = 'svo.'
const AUDIT_HISTORY_ENTITY_TYPES: readonly AuditEntityType[] = [
  'vehicle', 'driver', 'service', 'trip-request', 'trip', 'maintenance-order', 'fueling', 'fine',
  'vehicle-document', 'svo-occurrence', 'svo-order', 'svo-team', 'user', 'profile',
]
const DOMAIN_HISTORY_PERMISSIONS: Readonly<Partial<Record<AuditEntityType, readonly string[]>>> = {
  vehicle: ['vehicles:read', 'vehicles:history:read'],
  driver: ['drivers:read', 'drivers:history:read'],
  service: ['services:read', 'services:history:read'],
  'maintenance-order': ['maintenance:read'],
  fueling: ['fuelings:read'],
  fine: ['fines:read'],
  'vehicle-document': ['vehicle-documents:read'],
  'svo-occurrence': ['svo:occurrences:read'],
  'svo-order': [],
  'svo-team': ['svo:teams:read'],
  user: ['users:read'],
  profile: ['profiles:read'],
}

function resolveHistoryScope(entityType: AuditEntityType, actor: AuditHistoryActor): 'all' | 'own' | 'assigned' {
  const grants = new Set(actor.permissions)
  if (!grants.has('audit:history:read')) throw new AuditLogsError(403, 'Seu perfil não pode consultar o histórico central.')

  if (entityType === 'trip-request') {
    if (grants.has('requests:history:read:all') && grants.has('requests:read:all')) return 'all'
    if (grants.has('requests:history:read:own') && grants.has('requests:read:own')) return 'own'
    throw new AuditLogsError(403, 'Seu perfil não pode consultar este histórico de solicitações.')
  }

  if (entityType === 'trip') {
    if (grants.has('trips:read:all')) return 'all'
    if (grants.has('trips:read:assigned')) return 'assigned'
    throw new AuditLogsError(403, 'Seu perfil não pode consultar este histórico de viagens.')
  }

  if (entityType === 'svo-order') {
    if (grants.has('svo:orders:read:all')) return 'all'
    if (grants.has('svo:orders:read:assigned')) return 'assigned'
    throw new AuditLogsError(403, 'Seu perfil não pode consultar este histórico de ordens SVO.')
  }

  const required = DOMAIN_HISTORY_PERMISSIONS[entityType] ?? []
  if (!required.every((permission) => grants.has(permission))) {
    throw new AuditLogsError(403, 'Seu perfil não pode consultar este histórico.')
  }
  return 'all'
}

function maskCpf(value: unknown): string {
  const digits = String(value).replace(/\D/g, '')
  return digits.length >= 2 ? `***.***.***-${digits.slice(-2)}` : '***'
}

function maskCnhNumber(value: unknown): string {
  const text = String(value)
  return text.length > 2 ? `${'*'.repeat(text.length - 2)}${text.slice(-2)}` : '**'
}

/**
 * Mascara dados sensíveis em qualquer nível de um snapshot de auditoria (LGPD).
 *
 * Remove senhas, hashes, tokens e segredos; mostra só os 2 últimos dígitos de CPF e número da CNH.
 * Não altera o registro gravado: a máscara vale apenas para a resposta.
 */
export function maskAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskAuditPayload)
  if (value === null || typeof value !== 'object') return value
  const masked: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue
    if (CPF_KEY.test(key) && field !== null && field !== undefined) masked[key] = maskCpf(field)
    else if (CNH_NUMBER_KEY.test(key) && field !== null && field !== undefined) masked[key] = maskCnhNumber(field)
    else masked[key] = maskAuditPayload(field)
  }
  return masked
}

function toView(log: StoredAuditLog): AuditLogView {
  const hideSnapshots = log.table.startsWith(SVO_TABLE_PREFIX)
  return {
    ...log,
    reason: hideSnapshots ? null : log.reason,
    before: hideSnapshots ? null : maskAuditPayload(log.before),
    after: hideSnapshots ? null : maskAuditPayload(log.after),
    actorSnapshot: maskAuditPayload(log.actorSnapshot),
    sensitiveDataHidden: hideSnapshots,
  }
}

function optionalText(value: unknown, pattern: RegExp, message: string): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !pattern.test(value)) throw new AuditLogsError(400, message)
  return value
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new AuditLogsError(400, `Informe ${field} no formato AAAA-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AuditLogsError(400, `${field} não é uma data válida.`)
  }
  return value
}

function positiveInteger(value: unknown, fallback: number, max: number, message: string): number {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value) || Number(value) > max) throw new AuditLogsError(400, message)
  return Number(value)
}

/** Consulta somente leitura da trilha de auditoria (US23), com filtros, paginação e máscara de dados sensíveis. */
export class AuditLogsService {
  constructor(private readonly repository: AuditLogsRepositoryContract) {}

  /**
   * Lista registros de auditoria do mais recente para o mais antigo.
   *
   * Registros de tabelas do SVO devolvem `before`/`after` nulos (`sensitiveDataHidden`), mantendo
   * visíveis quem fez, o quê e quando.
   *
   * @throws {AuditLogsError} 400 quando algum filtro ou a paginação é inválido.
   */
  async listLogs(query: AuditLogsQuery): Promise<AuditLogPage> {
    const filters = this.validate(query)
    const [logs, total] = await Promise.all([this.repository.list(filters), this.repository.count(filters)])
    const page = filters.offset / filters.limit + 1
    return { logs: logs.map(toView), total, page, pageSize: filters.limit, totalPages: Math.ceil(total / filters.limit) }
  }

  private validate(query: AuditLogsQuery): AuditLogFilters {
    const from = optionalDate(query.from, 'from')
    const to = optionalDate(query.to, 'to')
    if (from && to) {
      const days = (Date.parse(to) - Date.parse(from)) / DAY_MS
      if (days < 1) throw new AuditLogsError(400, 'A data final (to, excluída) deve ser posterior à data inicial (from).')
      if (days > AUDIT_LOGS_MAX_PERIOD_DAYS) throw new AuditLogsError(400, `O período máximo da consulta é de ${AUDIT_LOGS_MAX_PERIOD_DAYS} dias.`)
    }
    const pageSize = positiveInteger(query.pageSize, AUDIT_LOGS_DEFAULT_PAGE_SIZE, AUDIT_LOGS_MAX_PAGE_SIZE,
      `pageSize deve ser um inteiro entre 1 e ${AUDIT_LOGS_MAX_PAGE_SIZE}.`)
    const page = positiveInteger(query.page, 1, 1_000_000, 'page deve ser um inteiro positivo.')
    const table = optionalText(query.table, TABLE_PATTERN, 'table deve ser o nome de uma entidade, ex.: fleet.vehicles.')
    const recordId = optionalText(query.recordId, ID_PATTERN, 'recordId deve ser um identificador válido.')
    if (recordId && !table) throw new AuditLogsError(400, 'Informe também a entidade para filtrar pelo identificador do registro.')
    return {
      from,
      to,
      userId: optionalText(query.userId, ID_PATTERN, 'userId deve ser um identificador válido.'),
      operation: optionalText(query.operation, OPERATION_PATTERN, 'operation deve ser um código em maiúsculas, ex.: CREATE, STATUS_CHANGE.'),
      table,
      recordId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }
  }

  /** Retorna a trilha de um registro por readers explicitamente liberados. */
  async getRecordHistory(query: AuditHistoryQuery, actor: AuditHistoryActor): Promise<AuditHistoryPage> {
    const entityType = query.entityType
    if (typeof entityType !== 'string' || !AUDIT_HISTORY_ENTITY_TYPES.includes(entityType as AuditEntityType)) {
      throw new AuditLogsError(404, 'Este tipo de registro não está disponível na área de Auditoria.')
    }
    if (typeof query.recordId !== 'string' || !ID_PATTERN.test(query.recordId)) {
      throw new AuditLogsError(400, 'recordId deve ser um identificador válido.')
    }
    if (!actor || typeof actor.id !== 'string' || !ID_PATTERN.test(actor.id)) {
      throw new AuditLogsError(401, 'Sessão autenticada necessária para consultar o histórico.')
    }
    const scopeKind = resolveHistoryScope(entityType as AuditEntityType, actor)
    let filters
    try {
      filters = normalizeEntityHistoryFilters({
        page: query.page,
        pageSize: query.pageSize,
        from: query.from,
        to: query.to,
      })
    } catch (error) {
      if (error instanceof EntityHistoryQueryError) throw new AuditLogsError(400, error.message)
      throw error
    }
    if (filters.from && filters.to) {
      const days = (Date.parse(filters.to) - Date.parse(filters.from)) / DAY_MS + 1
      if (days > AUDIT_LOGS_MAX_PERIOD_DAYS) {
        throw new AuditLogsError(400, `O período máximo da consulta é de ${AUDIT_LOGS_MAX_PERIOD_DAYS} dias.`)
      }
    }
    if (!this.repository.listHistory) throw new AuditLogsError(501, 'A consulta do histórico do registro não está disponível.')
    const safeEntityType = entityType as AuditEntityType
    const { items, total, found } = await this.repository.listHistory(safeEntityType, query.recordId, filters, {
      kind: scopeKind,
      actorId: actor.id,
    })
    if (found === false) throw new AuditLogsError(404, 'Registro não encontrado ou fora do seu escopo de consulta.')
    const page: AuditHistoryPage = {
      entityType: safeEntityType,
      recordId: query.recordId,
      items: items.map((item) => {
        return {
          ...item,
          before: maskAuditPayload(item.before),
          after: maskAuditPayload(item.after),
          actor: item.actor,
        }
      }),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(total / filters.pageSize),
    }
    return page
  }
}
