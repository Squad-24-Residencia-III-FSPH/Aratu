import type { VehicleActorSnapshot } from './vehicle.types'

export const FUEL_TYPES = ['GASOLINE', 'ETHANOL', 'DIESEL', 'DIESEL_S10', 'GNV', 'FLEX', 'OTHER'] as const
export type FuelType = typeof FUEL_TYPES[number]
export const FUELING_AUDIT_OPERATIONS = { create: 'CREATE', rectify: 'UPDATE' } as const

/** Metadados novos em cada ato; evidência e justificativa nunca são herdadas. */
export interface FuelingMetadata {
  reportedBy: string
  reason: string
  evidenceDescription?: string | null
  attachmentUrl?: string | null
}

export interface FuelingAttributes {
  driverId?: string | null
  fueledAt: string
  fuelType: FuelType
  liters: string
  totalValue: string
  odometerKm: number
  station?: string | null
  notes?: string | null
}
export interface CreateFuelingInput extends FuelingAttributes, FuelingMetadata { vehicleId: string }
export interface RectifyFuelingInput extends Partial<FuelingAttributes>, FuelingMetadata { expectedRevision: number }
export interface Fueling extends FuelingAttributes, FuelingMetadata {
  id: string
  vehicleId: string
  driverId: string | null
  station: string | null
  notes: string | null
  evidenceDescription: string | null
  attachmentUrl: string | null
}

/** Uma versão é um fato imutável, inclusive quando foi substituída ou anulada. */
export interface FuelingVersion extends Omit<Fueling, 'reason'> {
  reason: string | null
  createdBy: string
  actorSnapshot: VehicleActorSnapshot | null
  vehicleSnapshot: Record<string, unknown> | null
  driverSnapshot: { id: string; name: string } | null
  supersedesId: string | null
  isAnnulled: boolean
  annulmentReason: string | null
  revision: number
  registeredAt: string
  createdAt: string
  updatedAt: string
}

export interface FuelingHistoryEvent {
  id: string
  fuelingId: string
  eventType: 'RECORDED' | 'UPDATED' | 'RECTIFIED' | 'ANNULLED'
  occurredAt: string
  registeredAt: string
  reportedBy: string
  registeredBy: string
  actorSnapshot: VehicleActorSnapshot
  reason: string
  evidenceDescription: string | null
  attachmentUrl: string | null
  supersedesId: string | null
  isAnnulled: boolean
  beforeState: FuelingVersion | null
  afterState: FuelingVersion
}
export interface FuelingDetail {
  fueling: FuelingVersion
  currentId: string
  versions: FuelingVersion[]
  events: FuelingHistoryEvent[]
}
export interface FuelingFilters {
  vehicleId?: string
  driverId?: string
  from?: string
  to?: string
  page?: string
  pageSize?: string
}
export interface FuelingList {
  items: FuelingVersion[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalLiters: string
  totalValue: string
}
export interface OdometerFact { odometerKm: number; occurredAt: string | null }
export interface FuelingRequest { operation: 'CREATE' | 'RECTIFY'; targetId: string | null; input: Record<string, unknown> }
export interface StoredFuelingRequest { fueling: FuelingVersion; request: FuelingRequest }
export interface FuelingWrite {
  input: CreateFuelingInput
  actor: VehicleActorSnapshot
  vehicleSnapshot: Record<string, unknown> | null
  driverSnapshot: { id: string; name: string } | null
  before: FuelingVersion | null
  requestKey: string
  request: FuelingRequest
}
export type FuelingErrorCode = 'INVALID_INPUT' | 'FUTURE_DATE' | 'ODOMETER_CONFLICT' | 'NOT_FOUND'
  | 'REVISION_CONFLICT' | 'HISTORY_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'INACTIVE_ACTOR'

/** Códigos de domínio são traduzidos para HTTP exclusivamente no controller. */
export class FuelingServiceError extends Error {
  constructor(public readonly code: FuelingErrorCode, message: string) { super(message); this.name = 'FuelingServiceError' }
}
