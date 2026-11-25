import type { ApiRequest } from '../api/client'
import { SESSION_EXPIRED } from '../auth/token'
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

/** Campos aceitos pelo endpoint `POST /requests` (FROTA-79 + extensão L12 + necessidades especiais). */
export interface CreateRequestPayload {
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  serviceId: string
  passengers?: number
  specialRequirements?: string | null
  notes?: string | null
}

/** Dados enviados ao endpoint versionado `POST /requests/:id/resubmit`. */
export interface ResubmitRequestPayload extends CreateRequestPayload {
  expectedRevision: number
  reason?: string
}

/** Confirmação mínima devolvida pela API após persistir a solicitação (`201 Created`). */
export interface CreatedRequestResult {
  id: string
  status: RequestStatus
}

/** Confirmação retornada pela API após reenviar solicitação devolvida ou rejeitada (`200 OK`). */
export interface ResubmitRequestResult {
  id: string
  status: RequestStatus
  revision: number
}

/** Evento imutável da trilha histórica exibida no acompanhamento da solicitação. */
export interface RequestEventSummary {
  id: string
  eventType: string
  occurredAt: string
  reportedBy: string
  reason: string
}

/** Detalhe autorizado de solicitação estendido com setor histórico, observações, revisão e eventos. */
export interface RequestDetailView extends RequestDetail {
  events?: RequestEventSummary[]
}

export type RequestActionErrorKind =
  | 'session'
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'server'
  | 'network'
  | 'invalidResponse'

/** Erro tipado para distinguir falhas definitivas de resultados incertos na criação de solicitações. */
export class RequestActionError extends Error {
  readonly kind: RequestActionErrorKind
  readonly status?: number

  constructor(kind: RequestActionErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'RequestActionError'
    this.kind = kind
    this.status = status
  }
}

/** Indica falha de transporte, 5xx ou resposta malformada em que o servidor pode ter gravado o pedido. */
export function isUncertainRequestError(error: unknown): boolean {
  if (error instanceof RequestActionError) {
    return error.kind === 'network' || error.kind === 'server' || error.kind === 'invalidResponse'
  }
  return true
}

const NETWORK_ERROR_MESSAGE = 'Não foi possível se comunicar com o servidor. Verifique a conexão.'
const SERVER_ERROR_MESSAGE = 'O servidor não conseguiu concluir o envio da solicitação.'
const INVALID_CREATE_RESPONSE_MESSAGE = 'A resposta do servidor não confirmou o número da solicitação.'

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
    && (value.specialRequirements === undefined || isNullableText(value.specialRequirements))
    && (value.notes === undefined || isNullableText(value.notes))
    && (value.requesterSector === undefined || isNullableText(value.requesterSector))
    && REQUEST_STATUSES.some(status => status === value.status)
    && (value.revision === undefined || Number.isInteger(value.revision))
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
}

function isRequestEventSummary(value: unknown): value is RequestEventSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.eventType === 'string'
    && typeof value.occurredAt === 'string'
    && typeof value.reportedBy === 'string'
    && typeof value.reason === 'string'
}

function isRequestTrip(value: unknown): value is RequestTrip {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string'
    && typeof value.scheduledStart === 'string' && typeof value.scheduledEnd === 'string'
    && isRecord(value.vehicle) && typeof value.vehicle.id === 'string'
    && typeof value.vehicle.licensePlate === 'string' && isNullableText(value.vehicle.brand)
    && isNullableText(value.vehicle.model) && isRecord(value.driver)
    && typeof value.driver.id === 'string' && typeof value.driver.name === 'string'
}

function parseRequestDetail(value: unknown): RequestDetailView {
  if (!isSummary(value) || !isRecord(value)
    || (value.requesterSector !== undefined && !isNullableText(value.requesterSector))
    || !isNullableText(value.decidedBy)
    || !isNullableText(value.decidedByName)
    || !isNullableText(value.decidedAt)
    || !isNullableText(value.decisionReason)
    || (value.revision !== undefined && (typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 1))
    || (value.events !== undefined && (!Array.isArray(value.events) || !value.events.every(isRequestEventSummary)))
    || (value.trip !== null && !isRequestTrip(value.trip))) {
    throw new Error('Não foi possível interpretar os dados da solicitação. Tente novamente.')
  }
  return value as unknown as RequestDetailView
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

/** Busca o detalhe autorizado de uma solicitação para o Solicitante ou Gestor. */
export async function getRequest(api: ApiRequest, id: string): Promise<RequestDetailView> {
  const response = await api(`/requests/${encodeURIComponent(id)}`)
  return parseRequestDetail(await parseResponse(response, 'Não foi possível carregar a solicitação. Tente novamente.'))
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

function createErrorKindFromStatus(status: number): RequestActionErrorKind {
  if (status === 401) return 'session'
  if (status === 400 || status === 422) return 'validation'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status === 409) return 'conflict'
  if (status >= 500) return 'server'
  return 'validation'
}

function fallbackCreateMessage(kind: RequestActionErrorKind): string {
  if (kind === 'session') return SESSION_EXPIRED
  if (kind === 'forbidden') return 'Seu perfil não tem permissão para criar solicitações.'
  if (kind === 'server') return SERVER_ERROR_MESSAGE
  return 'Não foi possível enviar a solicitação. Revise os dados e tente novamente.'
}

async function sendRequestMutation(
  api: ApiRequest,
  path: string,
  payload: object,
  expectedStatus: number,
): Promise<{ status: number; body: unknown }> {
  let response: Response
  try {
    response = await api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) {
      throw new RequestActionError('session', SESSION_EXPIRED, 401)
    }
    throw new RequestActionError('network', NETWORK_ERROR_MESSAGE)
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const kind = createErrorKindFromStatus(response.status)
    const apiMessage = isRecord(body) && typeof body.erro === 'string' && body.erro.trim() ? body.erro.trim() : null
    const message = kind !== 'server' && apiMessage ? apiMessage : fallbackCreateMessage(kind)
    throw new RequestActionError(kind, message, response.status)
  }

  if (response.status !== expectedStatus) {
    throw new RequestActionError('invalidResponse', INVALID_CREATE_RESPONSE_MESSAGE, response.status)
  }

  return { status: response.status, body }
}

/**
 * Envia uma nova solicitação institucional (`POST /requests`) e exige `201 Created` com ID real.
 *
 * Falhas de rede, erros 5xx e envelopes inválidos são convertidos em `RequestActionError` incerto
 * para que a tela preserve os dados digitados e oriente consultar a lista antes de reenviar.
 */
export async function createRequest(api: ApiRequest, payload: CreateRequestPayload): Promise<CreatedRequestResult> {
  const { status, body } = await sendRequestMutation(api, '/requests', payload, 201)

  if (
    !isRecord(body)
    || typeof body.id !== 'string'
    || body.id.trim().length === 0
    || !REQUEST_STATUSES.some((itemStatus) => itemStatus === body.status)
  ) {
    throw new RequestActionError('invalidResponse', INVALID_CREATE_RESPONSE_MESSAGE, status)
  }

  return {
    id: body.id.trim(),
    status: body.status as RequestStatus,
  }
}

/**
 * Reenvia uma solicitação devolvida ou rejeitada (`POST /requests/:id/resubmit`) com controle otimista de revisão.
 *
 * Em `409 Conflict` lança `RequestActionError` com `kind: 'conflict'` para que a tela recarregue o
 * estado vigente antes de tentar novamente.
 */
export async function resubmitRequest(
  api: ApiRequest,
  id: string,
  payload: ResubmitRequestPayload,
): Promise<ResubmitRequestResult>
export async function resubmitRequest(
  api: ApiRequest,
  id: string,
  expectedRevision: number,
  input: RequestSubmission,
): Promise<RequestDetailView>
export async function resubmitRequest(
  api: ApiRequest,
  id: string,
  payloadOrRevision: ResubmitRequestPayload | number,
  input?: RequestSubmission,
): Promise<ResubmitRequestResult | RequestDetailView> {
  if (typeof payloadOrRevision === 'number') {
    const { body } = await sendRequestMutation(
      api,
      `/requests/${encodeURIComponent(id)}/resubmit`,
      { expectedRevision: payloadOrRevision, ...(input ?? {}) },
      200,
    )
    return parseRequestDetail(body)
  }

  const { status, body } = await sendRequestMutation(
    api,
    `/requests/${encodeURIComponent(id)}/resubmit`,
    payloadOrRevision,
    200,
  )

  if (
    !isRecord(body)
    || typeof body.id !== 'string'
    || body.id.trim().length === 0
    || !REQUEST_STATUSES.some((itemStatus) => itemStatus === body.status)
    || typeof body.revision !== 'number'
    || !Number.isInteger(body.revision)
    || body.revision < 1
  ) {
    throw new RequestActionError('invalidResponse', INVALID_CREATE_RESPONSE_MESSAGE, status)
  }

  return {
    id: body.id.trim(),
    status: body.status as RequestStatus,
    revision: body.revision,
  }
}

export type { RequestStatus }
