import type { ApiRequest } from '../api/client'
import { REQUEST_STATUSES } from '../requests/requestTypes'
import type {
  PaginatedRequestHistory,
  PaginatedRequests,
  RequestDetail,
  RequestHistoryItem,
  RequestListFilters,
  RequestStatus,
  RequestSubmission,
  RequestSummary,
  RequestTrip,
} from '../requests/requestTypes'

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
    && isNullableText(value.specialRequirements)
    && isNullableText(value.notes)
    && REQUEST_STATUSES.some(status => status === value.status)
    && Number.isInteger(value.revision)
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
    || !Number.isInteger(value.revision)
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

/** Cria uma solicitação persistida pelo Solicitante autenticado. */
export async function createRequest(api: ApiRequest, input: RequestSubmission): Promise<{ id: string; status: RequestStatus }> {
  const response = await api('/requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const body = await parseResponse(response, 'Não foi possível enviar a solicitação. Tente novamente.')
  if (!isRecord(body) || typeof body.id !== 'string' || !REQUEST_STATUSES.some(status => status === body.status)) {
    throw new Error('O servidor não confirmou a solicitação. Atualize a lista antes de tentar novamente.')
  }
  return body as { id: string; status: RequestStatus }
}

/** Reenvia os campos corrigidos usando a revisão que o Solicitante consultou. */
export async function resubmitRequest(
  api: ApiRequest,
  id: string,
  expectedRevision: number,
  input: RequestSubmission,
): Promise<RequestDetail> {
  const response = await api(`/requests/${encodeURIComponent(id)}/resubmit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, ...input }),
  })
  return parseRequestDetail(await parseResponse(response, 'Não foi possível reenviar a solicitação. Atualize os dados antes de tentar novamente.'))
}

/** Busca a história imutável de decisões e versões da solicitação. */
export async function getRequestHistory(api: ApiRequest, id: string, page = 1, pageSize = 20): Promise<PaginatedRequestHistory> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const response = await api(`/requests/${encodeURIComponent(id)}/history?${query}`)
  const body = await parseResponse(response, 'Não foi possível carregar o histórico da solicitação.')
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isRequestHistoryItem)
    || !Number.isInteger(body.total) || !Number.isInteger(body.page)
    || !Number.isInteger(body.pageSize) || !Number.isInteger(body.totalPages)) {
    throw new Error('Não foi possível interpretar o histórico da solicitação.')
  }
  return body as unknown as PaginatedRequestHistory
}

function isRequestHistoryItem(value: unknown): value is RequestHistoryItem {
  return isRecord(value) && typeof value.id === 'string' && typeof value.eventType === 'string'
    && typeof value.occurredAt === 'string' && typeof value.registeredAt === 'string'
    && typeof value.reportedBy === 'string' && typeof value.registeredBy === 'string'
    && isRecord(value.actorSnapshot) && typeof value.reason === 'string'
    && (value.beforeState === null || isRecord(value.beforeState)) && isRecord(value.afterState)
}

/** Registra a decisão do Gestor e preserva a mensagem de domínio retornada pela API. */
export async function decideRequest(
  api: ApiRequest,
  id: string,
  decision: 'approve' | 'reject' | 'return',
  reason?: string,
  expectedRevision?: number,
): Promise<void> {
  const payload = {
    ...(reason === undefined ? {} : { reason }),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
  const response = await api(`/requests/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await parseResponse(response, 'Não foi possível registrar a decisão. Tente novamente.')
}

export type { RequestStatus }
