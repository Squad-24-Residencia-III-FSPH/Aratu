import type { ApiRequest } from '../api/client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { TripRequestError } from '../trips/tripTypes.ts'
import type { ApprovedRequestSummary, DriverAvailability, VehicleAvailability } from '../trips/tripTypes.ts'

const INVALID_RESPONSE = 'A resposta da API de agendamento está em um formato inválido.'

/** Quantidade de solicitações pedida por página na consulta consolidada. */
const APPROVED_PAGE_SIZE = 100

/** Página da consulta de solicitações já validada quanto ao envelope mínimo. */
interface RequestsPage {
  requests: unknown[]
  totalPages: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function parseApprovedRequest(value: unknown): ApprovedRequestSummary {
  if (!isRecord(value) || !isString(value.id) || !isNullableString(value.serviceId)
    || !isNullableString(value.serviceName) || !isString(value.requestedDate)
    || !isString(value.requestedTime) || !isString(value.origin)
    || !isString(value.destination) || !isString(value.purpose)
    || typeof value.passengers !== 'number' || !Number.isInteger(value.passengers)
    || !isNullableString(value.specialRequirements)
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
    || (value.status !== 'PENDING' && value.status !== 'APPROVED')) throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
  return {
    id: value.id,
    serviceId: value.serviceId,
    serviceName: value.serviceName,
    requestedDate: value.requestedDate,
    requestedTime: value.requestedTime,
    origin: value.origin,
    destination: value.destination,
    purpose: value.purpose,
    passengers: value.passengers,
    specialRequirements: value.specialRequirements,
    revision: value.revision,
    status: value.status,
  }
}

function parseRequestsPage(value: unknown): RequestsPage {
  if (!isRecord(value) || !Array.isArray(value.requests)
    || typeof value.totalPages !== 'number' || !Number.isInteger(value.totalPages)
    || value.totalPages < 0) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
  }
  return { requests: value.requests, totalPages: value.totalPages }
}

function parseVehicleAvailability(value: unknown): VehicleAvailability {
  if (!isRecord(value) || !isString(value.id) || !isString(value.licensePlate)
    || !(isString(value.brand) || value.brand === null)
    || !(isString(value.model) || value.model === null)
    || !isStringArray(value.categories) || typeof value.seats !== 'number'
    || typeof value.bodyLimit !== 'number' || !isString(value.status)
    || typeof value.available !== 'boolean' || !isStringArray(value.reasons)) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
  }
  return {
    id: value.id,
    licensePlate: value.licensePlate,
    brand: value.brand,
    model: value.model,
    categories: value.categories,
    seats: value.seats,
    bodyLimit: value.bodyLimit,
    status: value.status,
    available: value.available,
    reasons: value.reasons,
  }
}

function parseDriverAvailability(value: unknown): DriverAvailability {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)
    || !isString(value.cnhCategory) || !isString(value.cnhExpiresAt)
    || !isString(value.status) || typeof value.available !== 'boolean'
    || !isStringArray(value.reasons)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
  return {
    id: value.id,
    name: value.name,
    cnhCategory: value.cnhCategory,
    cnhExpiresAt: value.cnhExpiresAt,
    status: value.status,
    available: value.available,
    reasons: value.reasons,
  }
}

async function readError(response: Response, fallback: string): Promise<TripRequestError> {
  const kind = response.status === 401 ? 'session'
    : response.status === 403 ? 'forbidden'
    : response.status === 404 ? 'notFound'
      : response.status === 409 ? 'conflict'
        : response.status === 400 || response.status === 422 ? 'validation'
          : response.status >= 500 ? 'server' : 'rejected'
  const body: unknown = await response.json().catch(() => null)
  const message = kind !== 'server' && isRecord(body) && isString(body.erro) && body.erro.trim()
    ? body.erro
    : fallback
  return new TripRequestError(kind, message, response.status)
}

async function getJson<T>(api: ApiRequest, path: string, fallback: string,
  parse: (value: unknown) => T): Promise<T> {
  let response: Response
  try {
    response = await api(path)
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) {
      throw new TripRequestError('session', SESSION_EXPIRED, 401)
    }
    throw new TripRequestError('network', 'Não foi possível se comunicar com o servidor. Verifique a conexão.')
  }
  if (!response.ok) throw await readError(response, fallback)
  return parse(await response.json().catch(() => null))
}

/**
 * Lista solicitações pendentes e aprovações legadas que ainda não receberam viagem.
 *
 * Consome a consulta paginada `GET /requests?status=APPROVED` (FROTA-82) e
 * percorre todas as páginas para que nenhuma solicitação deixe de aparecer no
 * seletor da tela de agendamento.
 */
export async function listApprovedRequests(api: ApiRequest): Promise<ApprovedRequestSummary[]> {
  const schedulable: ApprovedRequestSummary[] = []

  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      statuses: 'PENDING,APPROVED',
      page: String(page),
      pageSize: String(APPROVED_PAGE_SIZE),
    })
    const current = await getJson(
      api,
      `/requests?${query}`,
      'Não foi possível carregar as solicitações pendentes.',
      parseRequestsPage,
    )
    schedulable.push(...current.requests.map(parseApprovedRequest))
    // Uma página vazia encerra a leitura mesmo que `totalPages` divirja do
    // conteúdo, evitando uma sequência de requisições sem fim.
    if (current.requests.length === 0 || page >= current.totalPages) break
  }

  return schedulable
}

/** Consulta candidatos de veículo, mantendo os motivos de compatibilidade e agenda da API. */
export async function listAvailableVehicles(api: ApiRequest, start: string, end: string,
  serviceId: string, requestId?: string): Promise<VehicleAvailability[]> {
  const query = new URLSearchParams({ start, end, serviceId, ...(requestId ? { requestId } : {}) })
  return getJson(api, `/vehicles/available?${query}`, 'Não foi possível consultar os veículos disponíveis.', (value) => {
    if (!Array.isArray(value)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
    return value.map(parseVehicleAvailability)
  })
}

/** Consulta candidatos de motorista, incluindo CNH e conflitos de agenda. */
export async function listAvailableDrivers(api: ApiRequest, start: string,
  end: string, requestId?: string): Promise<DriverAvailability[]> {
  const query = new URLSearchParams({ start, end, ...(requestId ? { requestId } : {}) })
  return getJson(api, `/drivers/available?${query}`, 'Não foi possível consultar os motoristas disponíveis.', (value) => {
    if (!Array.isArray(value)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE)
    return value.map(parseDriverAvailability)
  })
}
