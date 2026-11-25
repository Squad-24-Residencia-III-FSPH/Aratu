import type { ApiRequest } from '../api/client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import {
  DashboardRequestError,
  type DashboardActivityBucket,
  type DashboardDriversSummary,
  type DashboardFinesSummary,
  type DashboardIndicators,
  type DashboardIndicatorsQuery,
  type DashboardMeasures,
  type DashboardRequestErrorKind,
  type DashboardSummary,
  type DashboardSvoIndicators,
  type DashboardSvoSummary,
  type DashboardVehicleIndicators,
  type GestorTripAgendaFilters,
  type GestorTripAgendaItem,
  type ScheduledTripSummary,
  type VehicleIndicatorMeasures,
  type VehicleIndicators,
} from '../types/dashboard.ts'

export type {
  DashboardIndicators,
  DashboardMeasures,
  DashboardSummary,
  DashboardVehicleIndicators,
  ScheduledTripSummary,
}

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

const ACTIVITY_BUCKET_KEYS = [
  'tripsCount',
  'fuelCost',
  'maintenanceOpened',
  'maintenanceClosed',
  'requestsCreated',
  'requestsApproved',
  'requestsRejected',
  'requestsScheduled',
  'requestsCanceled',
  'finesRegistered',
  'finesPaid',
  'finesContested',
  'driversCreated',
  'driversStatusChanged',
  'documentsRegistered',
  'documentsRenewed',
] as const

const EMPTY_DRIVERS_SUMMARY: DashboardDriversSummary = {
  active: 0,
  away: 0,
  inactive: 0,
  total: 0,
  cnhExpiring: 0,
  cnhExpired: 0,
}

const EMPTY_FINES_SUMMARY: DashboardFinesSummary = {
  pending: 0,
  paid: 0,
  contested: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isOptionalNonNegativeInt(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInt(value)
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

function parseDriversSummary(value: unknown): DashboardDriversSummary {
  if (value === undefined) return EMPTY_DRIVERS_SUMMARY
  if (!isRecord(value)
    || !isNonNegativeInt(value.active)
    || !isNonNegativeInt(value.away)
    || !isNonNegativeInt(value.inactive)
    || !isNonNegativeInt(value.total)
    || !isNonNegativeInt(value.cnhExpiring)
    || !isNonNegativeInt(value.cnhExpired)) {
    invalid()
  }
  return {
    active: value.active,
    away: value.away,
    inactive: value.inactive,
    total: value.total,
    cnhExpiring: value.cnhExpiring,
    cnhExpired: value.cnhExpired,
  }
}

function parseFinesSummary(value: unknown): DashboardFinesSummary {
  if (value === undefined) return EMPTY_FINES_SUMMARY
  if (!isRecord(value)
    || !isNonNegativeInt(value.pending)
    || !isNonNegativeInt(value.paid)
    || !isNonNegativeInt(value.contested)) {
    invalid()
  }
  return {
    pending: value.pending,
    paid: value.paid,
    contested: value.contested,
  }
}

function parseMeasures(value: unknown): VehicleIndicatorMeasures {
  if (!isRecord(value)
    || !isNonNegativeInt(value.tripsCount)
    || !isFiniteNumber(value.kmDriven)
    || !isFiniteNumber(value.litersFueled)
    || !isFiniteNumber(value.fuelCost)
    || !isNullableNumber(value.averageConsumptionKmPerLiter)
    || !isOptionalNonNegativeInt(value.maintenanceOrdersOpened)
    || !isOptionalNonNegativeInt(value.preventiveMaintenanceOrdersOpened)
    || !isOptionalNonNegativeInt(value.correctiveMaintenanceOrdersOpened)
    || !isOptionalNonNegativeInt(value.vehiclesWithCorrectiveMaintenance)
    || !isFiniteNumber(value.maintenanceCost)) {
    invalid()
  }
  return {
    tripsCount: value.tripsCount,
    kmDriven: value.kmDriven,
    litersFueled: value.litersFueled,
    fuelCost: value.fuelCost,
    averageConsumptionKmPerLiter: value.averageConsumptionKmPerLiter,
    maintenanceOrdersOpened: value.maintenanceOrdersOpened ?? 0,
    preventiveMaintenanceOrdersOpened: value.preventiveMaintenanceOrdersOpened ?? 0,
    correctiveMaintenanceOrdersOpened: value.correctiveMaintenanceOrdersOpened ?? 0,
    vehiclesWithCorrectiveMaintenance: value.vehiclesWithCorrectiveMaintenance ?? 0,
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

function parseActivityBucket(value: unknown): DashboardActivityBucket {
  if (!isRecord(value)
    || !isString(value.period)
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.period)
    || !ACTIVITY_BUCKET_KEYS.every((key) => isNonNegativeNumber(value[key]))) {
    invalid()
  }
  return {
    period: value.period,
    tripsCount: value.tripsCount as number,
    fuelCost: value.fuelCost as number,
    maintenanceOpened: value.maintenanceOpened as number,
    maintenanceClosed: value.maintenanceClosed as number,
    requestsCreated: value.requestsCreated as number,
    requestsApproved: value.requestsApproved as number,
    requestsRejected: value.requestsRejected as number,
    requestsScheduled: value.requestsScheduled as number,
    requestsCanceled: value.requestsCanceled as number,
    finesRegistered: value.finesRegistered as number,
    finesPaid: value.finesPaid as number,
    finesContested: value.finesContested as number,
    driversCreated: value.driversCreated as number,
    driversStatusChanged: value.driversStatusChanged as number,
    documentsRegistered: value.documentsRegistered as number,
    documentsRenewed: value.documentsRenewed as number,
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
    || !isOptionalNonNegativeInt(body.tripsInProgress)
    || !isOptionalNonNegativeInt(body.vehiclesInTrip)
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
    drivers: parseDriversSummary(body.drivers),
    fines: parseFinesSummary(body.fines),
    pendingRequests: body.pendingRequests,
    tripsInProgress: body.tripsInProgress ?? 0,
    vehiclesInTrip: body.vehiclesInTrip ?? 0,
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
    || !(body.activityBucket === undefined || body.activityBucket === 'day' || body.activityBucket === 'month')
    || !(body.activitySeries === undefined || Array.isArray(body.activitySeries))
    || !Array.isArray(body.vehicles)
    || !Array.isArray(body.pendingValidation)
    || !body.pendingValidation.every(isString)) {
    invalid()
  }
  return {
    period: { from: body.period.from, to: body.period.to },
    activityBucket: body.activityBucket ?? 'day',
    activitySeries: body.activitySeries ? body.activitySeries.map(parseActivityBucket) : [],
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

function parseScheduledTrip(value: unknown): ScheduledTripSummary {
  if (!isRecord(value)
    || !isString(value.id)
    || value.status !== 'SCHEDULED'
    || !isString(value.scheduledStart)
    || Number.isNaN(Date.parse(value.scheduledStart))
    || !isString(value.scheduledEnd)
    || Number.isNaN(Date.parse(value.scheduledEnd))
    || !isString(value.vehicleLicensePlate)
    || !isString(value.driverName)
    || !isString(value.origin)
    || !isString(value.destination)) {
    invalid()
  }
  return {
    id: value.id,
    scheduledStart: value.scheduledStart,
    scheduledEnd: value.scheduledEnd,
    vehicleLicensePlate: value.vehicleLicensePlate,
    driverName: value.driverName,
    origin: value.origin,
    destination: value.destination,
  }
}

/** Busca o retrato atual da operação em `GET /dashboard/summary`. */
export async function fetchDashboardSummary(
  api: ApiRequest,
  signal?: AbortSignal,
  vehicleId?: string,
): Promise<DashboardSummary> {
  const query = vehicleId ? `?${new URLSearchParams({ vehicleId }).toString()}` : ''
  const response = await send(api, `/dashboard/summary${query}`, signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  return parseSummary(body)
}

/** Alias de compatibilidade com a interface da `develop` para `GET /dashboard/summary`. */
export function getDashboardSummary(api: ApiRequest, vehicleId?: string): Promise<DashboardSummary> {
  return fetchDashboardSummary(api, undefined, vehicleId)
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

/** Alias de compatibilidade com a interface da `develop` para `GET /dashboard/indicators`. */
export function getDashboardIndicators(
  api: ApiRequest,
  filters: { from: string; toExclusive: string; vehicleId?: string },
  signal?: AbortSignal,
): Promise<DashboardIndicators> {
  return fetchDashboardIndicators(api, {
    from: filters.from,
    to: filters.toExclusive,
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
  }, signal)
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

/** Lista viagens futuras com status `SCHEDULED` para o bloco de agenda futura do Dashboard. */
export async function listScheduledTrips(
  api: ApiRequest,
  filters: { from: string; to: string },
  signal?: AbortSignal,
): Promise<ScheduledTripSummary[]> {
  const query = new URLSearchParams({ status: 'SCHEDULED', from: filters.from, to: filters.to })
  const response = await send(api, `/trips?${query.toString()}`, signal)
  if (!response.ok) throw await failureFrom(response)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) invalid()
  return body.map(parseScheduledTrip)
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
