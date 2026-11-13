import type { ApiRequest } from '../api/client'
import { SESSION_EXPIRED } from '../auth/token'
import { TripRequestError } from '../trips/tripTypes'
import type { ApprovedRequestSummary, DriverAvailability, VehicleAvailability } from '../trips/tripTypes'

const INVALID_RESPONSE = 'A resposta da API de agendamento está em um formato inválido.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function parseApprovedRequest(value: unknown): ApprovedRequestSummary {
  if (!isRecord(value) || !isString(value.id) || !isString(value.serviceId)
    || !isString(value.serviceName) || !isString(value.requestedDate)
    || !isString(value.requestedTime) || !isString(value.origin)
    || !isString(value.destination) || !isString(value.purpose)
    || typeof value.passengers !== 'number' || !Number.isInteger(value.passengers)
    || value.status !== 'APPROVED') throw new Error(INVALID_RESPONSE)
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
    status: 'APPROVED',
  }
}

function parseVehicleAvailability(value: unknown): VehicleAvailability {
  if (!isRecord(value) || !isString(value.id) || !isString(value.licensePlate)
    || !(isString(value.brand) || value.brand === null)
    || !(isString(value.model) || value.model === null)
    || !isStringArray(value.categories) || typeof value.seats !== 'number'
    || typeof value.bodyLimit !== 'number' || !isString(value.status)
    || typeof value.available !== 'boolean' || !isStringArray(value.reasons)) {
    throw new Error(INVALID_RESPONSE)
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
    || !isStringArray(value.reasons)) throw new Error(INVALID_RESPONSE)
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

/** Lista as solicitações aprovadas liberadas para agendamento ao Gestor. */
export async function listApprovedRequests(api: ApiRequest): Promise<ApprovedRequestSummary[]> {
  return getJson(api, '/requests/approved', 'Não foi possível carregar as solicitações aprovadas.', (value) => {
    if (!Array.isArray(value)) throw new Error(INVALID_RESPONSE)
    return value.map(parseApprovedRequest)
  })
}

/** Consulta candidatos de veículo, mantendo os motivos de compatibilidade e agenda da API. */
export async function listAvailableVehicles(api: ApiRequest, start: string, end: string,
  serviceId: string): Promise<VehicleAvailability[]> {
  const query = new URLSearchParams({ start, end, serviceId })
  return getJson(api, `/vehicles/available?${query}`, 'Não foi possível consultar os veículos disponíveis.', (value) => {
    if (!Array.isArray(value)) throw new Error(INVALID_RESPONSE)
    return value.map(parseVehicleAvailability)
  })
}

/** Consulta candidatos de motorista, incluindo CNH e conflitos de agenda. */
export async function listAvailableDrivers(api: ApiRequest, start: string,
  end: string): Promise<DriverAvailability[]> {
  const query = new URLSearchParams({ start, end })
  return getJson(api, `/drivers/available?${query}`, 'Não foi possível consultar os motoristas disponíveis.', (value) => {
    if (!Array.isArray(value)) throw new Error(INVALID_RESPONSE)
    return value.map(parseDriverAvailability)
  })
}

