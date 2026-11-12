import type { ApiRequest } from '../api/client'
import { REQUEST_STATUSES } from '../requests/requestTypes'
import type { PaginatedRequests, RequestDetail, RequestListFilters, RequestStatus, RequestSummary, RequestTrip } from '../requests/requestTypes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isSummary(value: unknown): value is RequestSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.requesterId === 'string'
    && typeof value.requesterName === 'string'
    && typeof value.serviceId === 'string'
    && typeof value.serviceName === 'string'
    && typeof value.requestedDate === 'string'
    && typeof value.requestedTime === 'string'
    && typeof value.origin === 'string'
    && typeof value.destination === 'string'
    && typeof value.purpose === 'string'
    && Number.isInteger(value.passengers)
    && REQUEST_STATUSES.some(status => status === value.status)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
}

function isRequestTrip(value: unknown): value is RequestTrip {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string'
    && typeof value.scheduledStart === 'string' && typeof value.scheduledEnd === 'string'
    && isRecord(value.vehicle) && typeof value.vehicle.id === 'string'
    && typeof value.vehicle.licensePlate === 'string' && isNullableText(value.vehicle.brand)
    && isNullableText(value.vehicle.model) && isRecord(value.driver)
    && typeof value.driver.id === 'string' && typeof value.driver.name === 'string'
}

function parseRequestDetail(value: unknown): RequestDetail {
  if (!isSummary(value) || !isRecord(value)
    || !isNullableText(value.decidedBy)
    || !isNullableText(value.decidedByName)
    || !isNullableText(value.decidedAt)
    || !isNullableText(value.decisionReason)
    || (value.trip !== null && !isRequestTrip(value.trip))) {
    throw new Error('Não foi possível interpretar os dados da solicitação. Tente novamente.')
  }
  return value as unknown as RequestDetail
}

async function parseResponse(response: Response, fallback: string): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(isRecord(body) && typeof body.erro === 'string' ? body.erro : fallback)
  }
  return body
}

/** Lista solicitações com filtros e paginação enviados ao endpoint autenticado. */
export async function listRequests(api: ApiRequest, filters: RequestListFilters): Promise<PaginatedRequests> {
  const query = new URLSearchParams()
  for (const key of ['status', 'from', 'to', 'requester', 'service', 'page', 'pageSize'] as const) {
    const value = filters[key]
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const response = await api(`/requests?${query}`)
  const body = await parseResponse(response, 'Não foi possível carregar as solicitações. Tente novamente.')
  if (!isRecord(body) || !Array.isArray(body.requests) || !body.requests.every(isSummary)
    || !Number.isInteger(body.total) || !Number.isInteger(body.page)
    || !Number.isInteger(body.pageSize) || !Number.isInteger(body.totalPages)) {
    throw new Error('Não foi possível interpretar a lista de solicitações. Tente novamente.')
  }
  return body as unknown as PaginatedRequests
}

/** Busca o detalhe que o Gestor precisa para analisar uma solicitação. */
export async function getRequest(api: ApiRequest, id: string): Promise<RequestDetail> {
  const response = await api(`/requests/${encodeURIComponent(id)}`)
  return parseRequestDetail(await parseResponse(response, 'Não foi possível carregar a solicitação. Tente novamente.'))
}

/** Registra a decisão do Gestor e preserva a mensagem de domínio retornada pela API. */
export async function decideRequest(api: ApiRequest, id: string, decision: 'approve' | 'reject', reason?: string): Promise<void> {
  const response = await api(`/requests/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason === undefined ? {} : { reason }),
  })
  await parseResponse(response, 'Não foi possível registrar a decisão. Tente novamente.')
}

export type { RequestStatus }
