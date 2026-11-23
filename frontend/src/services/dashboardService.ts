import type { ApiRequest } from '../api/client.ts'

export interface DashboardSummary {
  generatedAt: string
  fleet: { available: number; inMaintenance: number; inactive: number; total: number }
  drivers: { active: number; away: number; inactive: number; total: number; cnhExpiring: number; cnhExpired: number }
  fines: { pending: number; paid: number; contested: number }
  pendingRequests: number
  tripsInProgress: number
  vehiclesInTrip: number
  tripsToConfirm: number
  documents: { expiring: number; expired: number; alertDays: number }
  svo?: {
    ordersInProgress: number
    vehicles: { total: number; busy: number; occupancyRate: number | null }
  }
}

export interface DashboardMeasures {
  tripsCount: number
  kmDriven: number
  litersFueled: number
  fuelCost: number
  averageConsumptionKmPerLiter: number | null
  maintenanceOrdersOpened: number
  preventiveMaintenanceOrdersOpened: number
  correctiveMaintenanceOrdersOpened: number
  vehiclesWithCorrectiveMaintenance: number
  maintenanceCost: number
}

export interface DashboardVehicleIndicators extends DashboardMeasures {
  vehicleId: string
  licensePlate: string
}

export interface DashboardIndicators {
  period: { from: string; to: string }
  activityBucket: 'day' | 'month'
  activitySeries: {
    period: string; tripsCount: number; fuelCost: number; maintenanceOpened: number; maintenanceClosed: number
    requestsCreated: number; requestsApproved: number; requestsRejected: number; requestsScheduled: number; requestsCanceled: number
    finesRegistered: number; finesPaid: number; finesContested: number; driversCreated: number; driversStatusChanged: number
    documentsRegistered: number; documentsRenewed: number
  }[]
  vehicles: DashboardVehicleIndicators[]
  totals: DashboardMeasures
  svo?: {
    ordersOpened: number
    ordersCollected: number
    averageMinutesToCollection: number | null
  }
  pendingValidation: string[]
}

export interface ScheduledTripSummary {
  id: string
  scheduledStart: string
  scheduledEnd: string
  vehicleLicensePlate: string
  driverName: string
  origin: string
  destination: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

async function getJson<T>(api: ApiRequest, path: string, parse: (value: unknown) => T, fallback: string): Promise<T> {
  let response: Response
  try {
    response = await api(path)
  } catch {
    throw new Error(fallback)
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
      ? body.erro
      : fallback
    throw new Error(response.status >= 500 ? fallback : message)
  }
  const body: unknown = await response.json().catch(() => null)
  try {
    return parse(body)
  } catch {
    throw new Error(fallback)
  }
}

function parseSummary(value: unknown): DashboardSummary {
  if (!isRecord(value) || !isIsoDate(value.generatedAt) || !isRecord(value.fleet) || !isRecord(value.drivers)
    || !isRecord(value.fines) || !isRecord(value.documents)
    || !isNonNegativeNumber(value.fleet.available) || !isNonNegativeNumber(value.fleet.inMaintenance)
    || !isNonNegativeNumber(value.fleet.inactive) || !isNonNegativeNumber(value.fleet.total)
    || !isNonNegativeNumber(value.drivers.active) || !isNonNegativeNumber(value.drivers.away)
    || !isNonNegativeNumber(value.drivers.inactive) || !isNonNegativeNumber(value.drivers.total)
    || !isNonNegativeNumber(value.drivers.cnhExpiring) || !isNonNegativeNumber(value.drivers.cnhExpired)
    || !isNonNegativeNumber(value.fines.pending) || !isNonNegativeNumber(value.fines.paid)
    || !isNonNegativeNumber(value.fines.contested)
    || !isNonNegativeNumber(value.pendingRequests) || !isNonNegativeNumber(value.tripsInProgress)
    || !isNonNegativeNumber(value.vehiclesInTrip) || !isNonNegativeNumber(value.tripsToConfirm)
    || !isNonNegativeNumber(value.documents.expiring) || !isNonNegativeNumber(value.documents.expired)
    || !isNonNegativeNumber(value.documents.alertDays)) {
    throw new Error('invalid')
  }
  let svo: DashboardSummary['svo']
  if (value.svo !== undefined) {
    if (!isRecord(value.svo) || !isRecord(value.svo.vehicles)
      || !isNonNegativeNumber(value.svo.ordersInProgress)
      || !isNonNegativeNumber(value.svo.vehicles.total) || !isNonNegativeNumber(value.svo.vehicles.busy)
      || !isNullableNumber(value.svo.vehicles.occupancyRate)) throw new Error('invalid')
    svo = {
      ordersInProgress: value.svo.ordersInProgress,
      vehicles: { total: value.svo.vehicles.total, busy: value.svo.vehicles.busy, occupancyRate: value.svo.vehicles.occupancyRate },
    }
  }
  return {
    generatedAt: value.generatedAt,
    fleet: { available: value.fleet.available, inMaintenance: value.fleet.inMaintenance, inactive: value.fleet.inactive, total: value.fleet.total },
    drivers: {
      active: value.drivers.active, away: value.drivers.away, inactive: value.drivers.inactive,
      total: value.drivers.total, cnhExpiring: value.drivers.cnhExpiring, cnhExpired: value.drivers.cnhExpired,
    },
    fines: { pending: value.fines.pending, paid: value.fines.paid, contested: value.fines.contested },
    pendingRequests: value.pendingRequests,
    tripsInProgress: value.tripsInProgress,
    vehiclesInTrip: value.vehiclesInTrip,
    tripsToConfirm: value.tripsToConfirm,
    documents: { expiring: value.documents.expiring, expired: value.documents.expired, alertDays: value.documents.alertDays },
    ...(svo ? { svo } : {}),
  }
}

function parseMeasures(value: unknown): DashboardMeasures {
  if (!isRecord(value)
    || !isNonNegativeNumber(value.tripsCount) || !isNonNegativeNumber(value.kmDriven)
    || !isNonNegativeNumber(value.litersFueled) || !isNonNegativeNumber(value.fuelCost)
    || !isNullableNumber(value.averageConsumptionKmPerLiter)
    || !isNonNegativeNumber(value.maintenanceOrdersOpened)
    || !isNonNegativeNumber(value.preventiveMaintenanceOrdersOpened)
    || !isNonNegativeNumber(value.correctiveMaintenanceOrdersOpened)
    || !isNonNegativeNumber(value.vehiclesWithCorrectiveMaintenance)
    || !isNonNegativeNumber(value.maintenanceCost)) throw new Error('invalid')
  return {
    tripsCount: value.tripsCount,
    kmDriven: value.kmDriven,
    litersFueled: value.litersFueled,
    fuelCost: value.fuelCost,
    averageConsumptionKmPerLiter: value.averageConsumptionKmPerLiter,
    maintenanceOrdersOpened: value.maintenanceOrdersOpened,
    preventiveMaintenanceOrdersOpened: value.preventiveMaintenanceOrdersOpened,
    correctiveMaintenanceOrdersOpened: value.correctiveMaintenanceOrdersOpened,
    vehiclesWithCorrectiveMaintenance: value.vehiclesWithCorrectiveMaintenance,
    maintenanceCost: value.maintenanceCost,
  }
}

function parseIndicators(value: unknown): DashboardIndicators {
  if (!isRecord(value) || !isRecord(value.period)
    || !isIsoDate(value.period.from) || !isIsoDate(value.period.to)
    || (value.activityBucket !== 'day' && value.activityBucket !== 'month')
    || !Array.isArray(value.activitySeries)
    || !Array.isArray(value.vehicles)
    || !Array.isArray(value.pendingValidation) || value.pendingValidation.some((item) => typeof item !== 'string')) throw new Error('invalid')
  const vehicles = value.vehicles.map((item): DashboardVehicleIndicators => {
    if (!isRecord(item) || typeof item.vehicleId !== 'string' || typeof item.licensePlate !== 'string') throw new Error('invalid')
    return { vehicleId: item.vehicleId, licensePlate: item.licensePlate, ...parseMeasures(item) }
  })
  const totals = parseMeasures(value.totals)
  const activitySeries = value.activitySeries.map((item) => {
    if (!isRecord(item) || typeof item.period !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.period)
      || !['tripsCount', 'fuelCost', 'maintenanceOpened', 'maintenanceClosed', 'requestsCreated', 'requestsApproved', 'requestsRejected', 'requestsScheduled', 'requestsCanceled', 'finesRegistered', 'finesPaid', 'finesContested', 'driversCreated', 'driversStatusChanged', 'documentsRegistered', 'documentsRenewed'].every((key) => isNonNegativeNumber(item[key]))) throw new Error('invalid')
    return {
      period: item.period, tripsCount: item.tripsCount as number, fuelCost: item.fuelCost as number,
      maintenanceOpened: item.maintenanceOpened as number, maintenanceClosed: item.maintenanceClosed as number,
      requestsCreated: item.requestsCreated as number, requestsApproved: item.requestsApproved as number,
      requestsRejected: item.requestsRejected as number, requestsScheduled: item.requestsScheduled as number,
      requestsCanceled: item.requestsCanceled as number, finesRegistered: item.finesRegistered as number,
      finesPaid: item.finesPaid as number, finesContested: item.finesContested as number,
      driversCreated: item.driversCreated as number, driversStatusChanged: item.driversStatusChanged as number,
      documentsRegistered: item.documentsRegistered as number, documentsRenewed: item.documentsRenewed as number,
    }
  })
  let svo: DashboardIndicators['svo']
  if (value.svo !== undefined) {
    if (!isRecord(value.svo) || !isNonNegativeNumber(value.svo.ordersOpened)
      || !isNonNegativeNumber(value.svo.ordersCollected) || !isNullableNumber(value.svo.averageMinutesToCollection)) throw new Error('invalid')
    svo = {
      ordersOpened: value.svo.ordersOpened,
      ordersCollected: value.svo.ordersCollected,
      averageMinutesToCollection: value.svo.averageMinutesToCollection,
    }
  }
  return {
    period: { from: value.period.from, to: value.period.to },
    activityBucket: value.activityBucket,
    activitySeries,
    vehicles,
    totals,
    pendingValidation: value.pendingValidation as string[],
    ...(svo ? { svo } : {}),
  }
}

function parseScheduledTrip(value: unknown): ScheduledTripSummary {
  if (!isRecord(value) || typeof value.id !== 'string' || value.status !== 'SCHEDULED'
    || !isIsoDate(value.scheduledStart) || !isIsoDate(value.scheduledEnd)
    || typeof value.vehicleLicensePlate !== 'string' || typeof value.driverName !== 'string'
    || typeof value.origin !== 'string' || typeof value.destination !== 'string') throw new Error('invalid')
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

export function getDashboardSummary(api: ApiRequest, vehicleId?: string): Promise<DashboardSummary> {
  const query = vehicleId ? `?${new URLSearchParams({ vehicleId })}` : ''
  return getJson(api, `/dashboard/summary${query}`, parseSummary, 'Não foi possível carregar o resumo da frota.')
}

export function getDashboardIndicators(
  api: ApiRequest,
  filters: { from: string; toExclusive: string; vehicleId?: string },
): Promise<DashboardIndicators> {
  const query = new URLSearchParams({ from: filters.from, to: filters.toExclusive })
  if (filters.vehicleId) query.set('vehicleId', filters.vehicleId)
  return getJson(api, `/dashboard/indicators?${query}`, parseIndicators, 'Não foi possível carregar os indicadores do período.')
}

export function listScheduledTrips(
  api: ApiRequest,
  filters: { from: string; to: string },
): Promise<ScheduledTripSummary[]> {
  const query = new URLSearchParams({ status: 'SCHEDULED', from: filters.from, to: filters.to })
  return getJson(api, `/trips?${query}`, (value) => {
    if (!Array.isArray(value)) throw new Error('invalid')
    return value.map(parseScheduledTrip)
  }, 'Não foi possível carregar as viagens agendadas.')
}
