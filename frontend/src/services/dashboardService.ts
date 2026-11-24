import type { ApiRequest } from '../api/client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import {
  DashboardRequestError,
  type DashboardIndicators,
  type DashboardIndicatorsQuery,
  type DashboardRequestErrorKind,
  type DashboardSummary,
  type DashboardSvoIndicators,
  type DashboardSvoSummary,
  type GestorTripAgendaFilters,
  type GestorTripAgendaItem,
  type VehicleIndicatorMeasures,
  type VehicleIndicators,
} from '../types/dashboard.ts'

const NETWORK_MESSAGE = 'Não foi possível se comunicar com o servidor. Verifique a conexão.'
const INVALID_RESPONSE_MESSAGE = 'A resposta do painel operacional não está no formato esperado.'

const KIND_BY_STATUS: Readonly<Record<number, DashboardRequestErrorKind>> = {
  400: 'validation',
  403: 'forbidden',
  404: 'notFound',
  422: 'validation',
}

const FALLBACK_MESSAGES: Readonly<Record<DashboardRequestErrorKind, string>> = {
  session: SESSION_EXPIRED,
  validation: 'Os parâmetros informados para o painel são inválidos.',
  forbidden: 'Seu perfil não tem permissão para consultar estes indicadores.',
  notFound: 'Veículo não encontrado para o filtro selecionado.',
  server: 'O servidor não conseguiu carregar os indicadores no momento.',
  network: NETWORK_MESSAGE,
  invalidResponse: INVALID_RESPONSE_MESSAGE,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function invalid(): never {
  throw new DashboardRequestError('invalidResponse', INVALID_RESPONSE_MESSAGE)
}

async function send(api: ApiRequest, path: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await api(path, signal ? { signal } : undefined)
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) {
      throw new DashboardRequestError('session', SESSION_EXPIRED, 401)
    }
    throw new DashboardRequestError('network', NETWORK_MESSAGE)
  }
}

async function failureFrom(response: Response): Promise<DashboardRequestError> {
  const kind = KIND_BY_STATUS[response.status] ?? (response.status >= 500 ? 'server' : 'validation')
  const body: unknown = await response.json().catch(() => null)
  const apiMessage = isRecord(body) && typeof body.erro === 'string' && body.erro.trim() ? body.erro : null
  return new DashboardRequestError(kind, kind !== 'server' && apiMessage ? apiMessage : FALLBACK_MESSAGES[kind], response.status)
}

function parseSvoSummary(value: unknown): DashboardSvoSummary {
  if (!isRecord(value)
    || !isNonNegativeInt(value.ordersInProgress)
    || !isRecord(value.vehicles)
    || !isNonNegativeInt(value.vehicles.total)
    || !isNonNegativeInt(value.vehicles.busy)
    || !isNullableNumber(value.vehicles.occupancyRate)) {
    invalid()
  }
  return {
    ordersInProgress: value.ordersInProgress,
    vehicles: {
      total: value.vehicles.total,
      busy: value.vehicles.busy,
      occupancyRate: value.vehicles.occupancyRate,
    },
  }
}

function parseMeasures(value: unknown): VehicleIndicatorMeasures {
  if (!isRecord(value)
    || !isNonNegativeInt(value.tripsCount)
    || !isFiniteNumber(value.kmDriven)
    || !isFiniteNumber(value.litersFueled)
    || !isFiniteNumber(value.fuelCost)
    || !isNullableNumber(value.averageConsumptionKmPerLiter)
    || !isFiniteNumber(value.maintenanceCost)) {
    invalid()
  }
  return {
    tripsCount: value.tripsCount,
    kmDriven: value.kmDriven,
    litersFueled: value.litersFueled,
    fuelCost: value.fuelCost,
    averageConsumptionKmPerLiter: value.averageConsumptionKmPerLiter,
    maintenanceCost: value.maintenanceCost,
  }
}

function parseVehicleIndicator(value: unknown): VehicleIndicators {
  if (!isRecord(value) || !isString(value.vehicleId) || !isString(value.licensePlate)) {
    invalid()
  }
  return {
    vehicleId: value.vehicleId,
    licensePlate: value.licensePlate,
    ...parseMeasures(value),
  }
}

function parseSvoIndicators(value: unknown): DashboardSvoIndicators {
  if (!isRecord(value)
    || !isNonNegativeInt(value.ordersOpened)
    || !isNonNegativeInt(value.ordersCollected)
    || !isNullableNumber(value.averageMinutesToCollection)) {
    invalid()
  }
  return {
    ordersOpened: value.ordersOpened,
    ordersCollected: value.ordersCollected,
    averageMinutesToCollection: value.averageMinutesToCollection,
  }
}

function parseSummary(body: unknown): DashboardSummary {
  if (!isRecord(body)
    || !isString(body.generatedAt)
    || !isRecord(body.fleet)
    || !isNonNegativeInt(body.fleet.available)
    || !isNonNegativeInt(body.fleet.inMaintenance)
    || !isNonNegativeInt(body.fleet.inactive)
    || !isNonNegativeInt(body.fleet.total)
    || !isNonNegativeInt(body.pendingRequests)
    || !isNonNegativeInt(body.tripsToConfirm)
    || !isRecord(body.documents)
    || !isNonNegativeInt(body.documents.expiring)
    || !isNonNegativeInt(body.documents.expired)
    || !isNonNegativeInt(body.documents.alertDays)) {
    invalid()
  }
  return {
    generatedAt: body.generatedAt,
    fleet: {
      available: body.fleet.available,
      inMaintenance: body.fleet.inMaintenance,
      inactive: body.fleet.inactive,
      total: body.fleet.total,
    },
    pendingRequests: body.pendingRequests,
    tripsToConfirm: body.tripsToConfirm,
    documents: {
      expiring: body.documents.expiring,
      expired: body.documents.expired,
      alertDays: body.documents.alertDays,
    },
    ...(body.svo !== undefined ? { svo: parseSvoSummary(body.svo) } : {}),
  }
}

function parseIndicators(body: unknown): DashboardIndicators {
  if (!isRecord(body)
    || !isRecord(body.period)
    || !isString(body.period.from)
    || !isString(body.period.to)
    || !Array.isArray(body.vehicles)
    || !Array.isArray(body.pendingValidation)
    || !body.pendingValidation.every(isString)) {
    invalid()
  }
  return {
    period: { from: body.period.from, to: body.period.to },
    vehicles: body.vehicles.map(parseVehicleIndicator),
    totals: parseMeasures(body.totals),
    ...(body.svo !== undefined ? { svo: parseSvoIndicators(body.svo) } : {}),
    pendingValidation: body.pendingValidation,
  }
}

function parseAgendaTrip(value: unknown): GestorTripAgendaItem {
  if (!isRecord(value)
    || !isString(value.id)
    || !isString(value.requestId)
    || !isString(value.status)
    || !isString(value.scheduledStart)
    || !isString(value.scheduledEnd)
    || !isNullableText(value.startedAt)
    || !isNullableText(value.finishedAt)
    || !isNullableNumber(value.startKm)
    || !isNullableNumber(value.endKm)
    || !isString(value.vehicleLicensePlate)
    || !isString(value.driverName)
    || !isString(value.origin)
    || !isString(value.destination)) {
    invalid()
  }
  return {
    id: value.id,
    requestId: value.requestId,
    status: value.status,
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
  }
}

/** Busca o retrato atual da operação em `GET /dashboard/summary`. */
export async function fetchDashboardSummary(api: ApiRequest, signal?: AbortSignal): Promise<DashboardSummary> {
  const response = await send(api, '/dashboard/summary', signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  return parseSummary(body)
}

/** Busca os indicadores agregados por veículo e período em `GET /dashboard/indicators`. */
export async function fetchDashboardIndicators(
  api: ApiRequest,
  query: DashboardIndicatorsQuery,
  signal?: AbortSignal,
): Promise<DashboardIndicators> {
  const params = new URLSearchParams({ from: query.from, to: query.to })
  if (query.vehicleId) params.set('vehicleId', query.vehicleId)
  const response = await send(api, `/dashboard/indicators?${params.toString()}`, signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  return parseIndicators(body)
}

/** Lista viagens agendadas pelo horário planejado (`GET /trips`) para compor a agenda do Gestor. */
export async function fetchGestorTripAgenda(
  api: ApiRequest,
  filters: GestorTripAgendaFilters,
  signal?: AbortSignal,
): Promise<GestorTripAgendaItem[]> {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  const response = await send(api, query ? `/trips?${query}` : '/trips', signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) invalid()
  return body.map(parseAgendaTrip)
}

/** Conta solicitações pendentes com data desejada para o dia informado via `GET /requests`. */
export async function fetchPendingRequestsCountForDate(
  api: ApiRequest,
  date: string,
  signal?: AbortSignal,
): Promise<number> {
  const params = new URLSearchParams({
    status: 'PENDING',
    from: date,
    to: date,
    page: '1',
    pageSize: '1',
  })
  const response = await send(api, `/requests?${params.toString()}`, signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body) || !isNonNegativeInt(body.total)) invalid()
  return body.total
}
