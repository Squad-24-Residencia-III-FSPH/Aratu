import { REQUEST_STATUSES } from '../../requests/requestTypes'
import type { RequestListFilters, RequestStatus } from '../../requests/requestTypes'

export const DEFAULT_REQUEST_PAGE_SIZE = 20
export const REQUEST_PAGE_SIZE_OPTIONS = [10, 20, 50] as const

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const POSITIVE_INT_PATTERN = /^[1-9]\d*$/

/** Filtros sincronizados com a URL e suportados pelo contrato `GET /requests`. */
export interface RequestFilterValues {
  status: RequestStatus | ''
  from: string
  to: string
  service: string
}

/** Estado completo da listagem e gatilhos lidos dos query params da rota. */
export interface RequestUrlState {
  filters: RequestFilterValues
  page: number
  pageSize: number
  openNewRequested: boolean
}

export const EMPTY_REQUEST_FILTERS: RequestFilterValues = {
  status: '',
  from: '',
  to: '',
  service: '',
}

function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isRequestStatus(value: string | null): value is RequestStatus {
  return value !== null && REQUEST_STATUSES.some((status) => status === value)
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value || !POSITIVE_INT_PATTERN.test(value.trim())) return fallback
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback
}

/** Lê os parâmetros permitidos da URL ignorando valores fora do contrato de `GET /requests`. */
export function parseRequestUrlState(searchParams: URLSearchParams): RequestUrlState {
  const rawStatus = searchParams.get('status')?.trim() ?? null
  const rawFrom = searchParams.get('from')?.trim() ?? ''
  const rawTo = searchParams.get('to')?.trim() ?? ''
  const rawService = searchParams.get('service')?.trim().slice(0, 120) ?? ''
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const rawPageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_REQUEST_PAGE_SIZE)
  const pageSize = rawPageSize >= 1 && rawPageSize <= 100 ? rawPageSize : DEFAULT_REQUEST_PAGE_SIZE
  const openNewRequested = searchParams.get('nova') === '1' || searchParams.get('action') === 'new'

  return {
    filters: {
      status: isRequestStatus(rawStatus) ? rawStatus : '',
      from: isValidCalendarDate(rawFrom) ? rawFrom : '',
      to: isValidCalendarDate(rawTo) ? rawTo : '',
      service: rawService,
    },
    page,
    pageSize,
    openNewRequested,
  }
}

/** Serializa os filtros e a paginação ativos para a URL sem manter gatilhos transitórios de abertura. */
export function buildRequestSearchParams(
  filters: RequestFilterValues,
  page: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const trimmedService = filters.service.trim()
  if (trimmedService) params.set('service', trimmedService)
  if (page > 1) params.set('page', String(page))
  if (pageSize !== DEFAULT_REQUEST_PAGE_SIZE) params.set('pageSize', String(pageSize))
  return params
}

/** Valida o intervalo inclusivo `from` / `to` antes de consultar `GET /requests`. */
export function validateFilterDateRange(from: string, to: string): { fromError?: string; toError?: string } {
  const trimmedFrom = from.trim()
  const trimmedTo = to.trim()
  const fromValid = !trimmedFrom || isValidCalendarDate(trimmedFrom)
  const toValid = !trimmedTo || isValidCalendarDate(trimmedTo)

  if (!fromValid || !toValid) {
    return {
      ...(!fromValid ? { fromError: 'Data inicial inválida.' } : {}),
      ...(!toValid ? { toError: 'Data final inválida.' } : {}),
    }
  }

  if (trimmedFrom && trimmedTo && trimmedFrom > trimmedTo) {
    return {
      fromError: 'Data inicial posterior à data final.',
      toError: 'A data final deve ser igual ou posterior à inicial.',
    }
  }

  return {}
}

/** Converte os filtros da interface para o contrato aceito por `listRequests`. */
export function toApiRequestFilters(
  filters: RequestFilterValues,
  page: number,
  pageSize: number,
): RequestListFilters {
  const trimmedService = filters.service.trim()
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(trimmedService ? { service: trimmedService } : {}),
    page,
    pageSize,
  }
}

/** Compara dois conjuntos de filtros de listagem. */
export function areRequestFiltersEqual(left: RequestFilterValues, right: RequestFilterValues): boolean {
  return (
    left.status === right.status
    && left.from === right.from
    && left.to === right.to
    && left.service.trim() === right.service.trim()
  )
}

/** Indica se há algum filtro ativo aplicado na consulta atual. */
export function hasActiveRequestFilters(filters: RequestFilterValues): boolean {
  return Boolean(filters.status || filters.from || filters.to || filters.service.trim())
}
