import type { ApiRequest } from '../api/client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { DRIVER_TRIP_STATUSES, TripRequestError } from '../trips/tripTypes.ts'
import type { TripConfirmationFilters, TripConfirmationItem, TripConfirmationResult } from '../trips/tripConfirmationTypes.ts'
import type { DriverTrip, DriverTripStatus, ScheduleTripInput, Trip, TripRequestErrorKind } from '../trips/tripTypes.ts'

const NETWORK_MESSAGE = 'Não foi possível se comunicar com o servidor. Verifique a conexão.'
const INVALID_RESPONSE_MESSAGE = 'A resposta do servidor não pôde ser confirmada.'

const KIND_BY_STATUS: Readonly<Record<number, TripRequestErrorKind>> = {
  400: 'validation',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  422: 'validation',
}

const FALLBACK_MESSAGES: Readonly<Record<TripRequestErrorKind, string>> = {
  session: SESSION_EXPIRED,
  validation: 'Os dados informados não foram aceitos. Revise a quilometragem e tente novamente.',
  forbidden: 'Você não tem permissão para registrar a execução desta viagem.',
  notFound: 'Viagem não encontrada.',
  conflict: 'A situação da viagem mudou. Atualize a lista antes de continuar.',
  rejected: 'A operação não foi aceita pelo servidor.',
  server: 'O servidor não conseguiu concluir a operação.',
  network: NETWORK_MESSAGE,
  invalidResponse: INVALID_RESPONSE_MESSAGE,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isNullable<T>(value: unknown, guard: (candidate: unknown) => candidate is T): value is T | null {
  return value === null || guard(value)
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isKm = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Executa a chamada convertendo falhas de transporte e de sessão em erros tipados. */
async function send(api: ApiRequest, path: string, init?: RequestInit): Promise<Response> {
  try {
    return await api(path, init)
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) throw new TripRequestError('session', SESSION_EXPIRED, 401)
    throw new TripRequestError('network', NETWORK_MESSAGE)
  }
}

/** Usa o texto da API em rejeições (4xx); em falhas 5xx mostra só texto genérico, sem detalhes internos. */
async function failureFrom(response: Response): Promise<TripRequestError> {
  const kind = KIND_BY_STATUS[response.status] ?? (response.status >= 500 ? 'server' : 'rejected')
  const body: unknown = await response.json().catch(() => null)
  const apiMessage = isRecord(body) && typeof body.erro === 'string' && body.erro.trim() ? body.erro : null
  return new TripRequestError(kind, kind !== 'server' && apiMessage ? apiMessage : FALLBACK_MESSAGES[kind], response.status)
}

function parseDriverTrip(value: unknown): DriverTrip {
  if (!isRecord(value)
    || !isString(value.id)
    || !DRIVER_TRIP_STATUSES.includes(value.status as DriverTripStatus)
    || !isIsoDate(value.scheduledStart)
    || !isIsoDate(value.scheduledEnd)
    || !isNullable(value.startKm, isKm)
    || !isNullable(value.startedAt, isIsoDate)
    || !isString(value.origin)
    || !isString(value.destination)
    || !isString(value.purpose)
    || !isString(value.vehicleLicensePlate)) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: value.id,
    status: value.status as DriverTripStatus,
    scheduledStart: value.scheduledStart,
    scheduledEnd: value.scheduledEnd,
    startKm: value.startKm,
    startedAt: value.startedAt,
    origin: value.origin,
    destination: value.destination,
    purpose: value.purpose,
    vehicleLicensePlate: value.vehicleLicensePlate,
  }
}

function parseTrip(value: unknown): Trip {
  if (!isRecord(value)
    || !isString(value.id)
    || !isString(value.requestId)
    || !isString(value.vehicleId)
    || !isString(value.driverId)
    || !isIsoDate(value.scheduledStart)
    || !isIsoDate(value.scheduledEnd)
    || !isString(value.status)
    || !isNullable(value.startKm, isKm)
    || !isNullable(value.endKm, isKm)
    || !isNullable(value.startedAt, isIsoDate)
    || !isNullable(value.finishedAt, isIsoDate)
    || typeof value.revision !== 'number'
    || !isIsoDate(value.createdAt)) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: value.id,
    requestId: value.requestId,
    vehicleId: value.vehicleId,
    driverId: value.driverId,
    scheduledStart: value.scheduledStart,
    scheduledEnd: value.scheduledEnd,
    status: value.status,
    startKm: value.startKm,
    endKm: value.endKm,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    revision: value.revision,
    createdAt: value.createdAt,
  }
}

function parseTripConfirmationItem(value: unknown): TripConfirmationItem {
  if (!isRecord(value)
    || !isString(value.id)
    || !isString(value.requestId)
    || value.status !== 'FINISHED'
    || !isIsoDate(value.scheduledStart)
    || !isIsoDate(value.scheduledEnd)
    || !isNullable(value.startedAt, isIsoDate)
    || !isNullable(value.finishedAt, isIsoDate)
    || !isNullable(value.startKm, isKm)
    || !isNullable(value.endKm, isKm)
    || !isString(value.vehicleLicensePlate)
    || !isString(value.driverName)
    || !isString(value.origin)
    || !isString(value.destination)
    || !isNullable(value.confirmedBy, isString)
    || !isNullable(value.confirmedAt, isIsoDate)) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: value.id,
    requestId: value.requestId,
    status: 'FINISHED',
    scheduledStart: value.scheduledStart,
    scheduledEnd: value.scheduledEnd,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    startKm: value.startKm,
    endKm: value.endKm,
    vehicleLicensePlate: value.vehicleLicensePlate,
    driverName: value.driverName,
    origin: value.origin,
    destination: value.destination,
    confirmedBy: value.confirmedBy,
    confirmedAt: value.confirmedAt,
  }
}

/** Consulta viagens finalizadas com o filtro de período aceito pelo GET gerencial FROTA-106. */
export async function listTripConfirmations(
  api: ApiRequest,
  filters: TripConfirmationFilters = {},
): Promise<TripConfirmationItem[]> {
  const query = new URLSearchParams({ status: 'FINISHED' })
  if (filters.from) query.set('from', filters.from)
  if (filters.to) query.set('to', filters.to)
  const response = await send(api, `/trips?${query.toString()}`)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  return body.map(parseTripConfirmationItem)
}

/** Confirma uma viagem e valida a resposta de transição antes de informar sucesso à tela. */
export async function confirmTrip(api: ApiRequest, tripId: string): Promise<TripConfirmationResult> {
  const response = await send(api, `/trips/${encodeURIComponent(tripId)}/confirm`, { method: 'POST' })
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body)
    || body.id !== tripId
    || body.status !== 'CONFIRMED'
    || !isString(body.confirmedBy)
    || !isIsoDate(body.confirmedAt)
    || typeof body.revision !== 'number'
    || !Number.isSafeInteger(body.revision)) {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: tripId,
    status: 'CONFIRMED',
    confirmedBy: body.confirmedBy,
    confirmedAt: body.confirmedAt,
    revision: body.revision,
  }
}

/** Consulta as viagens pendentes do motorista autenticado (`GET /trips/mine`). */
export async function listMyTrips(api: ApiRequest, signal?: AbortSignal): Promise<DriverTrip[]> {
  const response = await send(api, '/trips/mine', signal ? { signal } : undefined)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  return body.map(parseDriverTrip)
}

/**
 * Envia a transição e só devolve a viagem se a resposta confirmar o mesmo id e a situação esperada;
 * qualquer outra resposta vira resultado incerto, nunca sucesso presumido.
 */
async function postTransition(
  api: ApiRequest,
  tripId: string,
  step: 'start' | 'finish',
  payload: { startKm: number } | { endKm: number },
  isConfirmed: (trip: Trip) => boolean,
): Promise<Trip> {
  const response = await send(api, `/trips/${encodeURIComponent(tripId)}/${step}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await failureFrom(response)
  const trip = parseTrip(await response.json().catch(() => null))
  if (trip.id !== tripId || !isConfirmed(trip)) throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  return trip
}

/** Registra o início da viagem com a quilometragem inicial (`POST /trips/:id/start`). */
export function startTrip(api: ApiRequest, tripId: string, startKm: number): Promise<Trip> {
  return postTransition(api, tripId, 'start', { startKm }, (trip) =>
    trip.status === 'IN_PROGRESS' && trip.startKm !== null && trip.startedAt !== null)
}

/** Registra o término da viagem com a quilometragem final (`POST /trips/:id/finish`). */
export function finishTrip(api: ApiRequest, tripId: string, endKm: number): Promise<Trip> {
  return postTransition(api, tripId, 'finish', { endKm }, (trip) =>
    trip.status === 'FINISHED' && trip.endKm !== null && trip.finishedAt !== null)
}

/** Agenda uma solicitação aprovada com veículo e motorista escolhidos pelo Gestor. */
export async function scheduleTrip(api: ApiRequest, input: ScheduleTripInput): Promise<Trip> {
  const response = await send(api, '/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await failureFrom(response)
  const trip = parseTrip(await response.json().catch(() => null))
  if (trip.requestId !== input.requestId || trip.vehicleId !== input.vehicleId
    || trip.driverId !== input.driverId || trip.status !== 'SCHEDULED') {
    throw new TripRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
  }
  return trip
}
