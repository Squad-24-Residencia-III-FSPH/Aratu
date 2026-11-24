import type { EntityHistoryFilters, EntityHistoryQueryInput } from '../types/entity-history.types'

const EVENT_TYPES = ['CREATED', 'UPDATED', 'STATUS_CHANGED'] as const
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Erro de filtro traduzido pelo serviço para o status HTTP do domínio. */
export class EntityHistoryQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntityHistoryQueryError'
  }
}

function positiveInteger(value: unknown, fallback: number, label: string, max?: number): number {
  if (value === undefined) return fallback
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
    throw new EntityHistoryQueryError(`${label} inválido.`)
  }
  return parsed
}

function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new EntityHistoryQueryError(`Data ${label} inválida. Use AAAA-MM-DD.`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new EntityHistoryQueryError(`Data ${label} inválida. Use AAAA-MM-DD.`)
  }
  return value
}

/** Valida filtros de histórico compartilhados por veículos e motoristas. */
export function normalizeEntityHistoryFilters(input: EntityHistoryQueryInput): EntityHistoryFilters {
  const page = positiveInteger(input.page, DEFAULT_PAGE, 'Página')
  const pageSize = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, 'Tamanho da página', MAX_PAGE_SIZE)
  if (!Number.isSafeInteger((page - 1) * pageSize)) {
    throw new EntityHistoryQueryError('Página inválida.')
  }
  let eventType: string | undefined
  if (input.eventType !== undefined) {
    if (typeof input.eventType !== 'string' || !EVENT_TYPES.includes(input.eventType as typeof EVENT_TYPES[number])) {
      throw new EntityHistoryQueryError('Tipo de evento inválido.')
    }
    eventType = input.eventType
  }
  const from = optionalDate(input.from, 'inicial')
  const to = optionalDate(input.to, 'final')
  if (from && to && from > to) throw new EntityHistoryQueryError('A data inicial não pode ser posterior à data final.')
  return {
    page,
    pageSize,
    ...(eventType ? { eventType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}
