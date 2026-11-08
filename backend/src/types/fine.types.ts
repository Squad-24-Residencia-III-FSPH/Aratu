import type { VehicleActorSnapshot } from './vehicle.types'

export const FINE_STATUSES = ['PENDING', 'PAID', 'CONTESTED', 'CANCELED'] as const
export type FineStatus = typeof FINE_STATUSES[number]
export const FINE_TRANSITIONS: Record<FineStatus, readonly FineStatus[]> = {
  PENDING: ['CONTESTED', 'PAID', 'CANCELED'],
  CONTESTED: ['PENDING', 'PAID', 'CANCELED'],
  PAID: ['PENDING'],
  CANCELED: ['PENDING'],
}
export type FineEventType = 'REGISTERED' | 'DRIVER_IDENTIFIED' | 'DRIVER_CHANGED'
  | 'RECTIFIED' | 'PAID' | 'CONTESTED' | 'CANCELED' | 'REOPENED'
export interface FineMetadata {
  reportedBy: string
  reason: string
  evidenceDescription: string
  attachmentUrl?: string | null
}
export interface FineAttributes {
  vehicleId: string
  driverId: string | null
  tripId: string | null
  infractionAt: string
  infractionCode: string
  description: string
  location: string | null
  amount: string
  dueAt: string | null
  notes: string | null
}
export type CreateFineInput = FineMetadata
  & Pick<FineAttributes, 'vehicleId' | 'infractionAt' | 'infractionCode' | 'description' | 'amount'>
  & Partial<Omit<FineAttributes, 'vehicleId' | 'infractionAt' | 'infractionCode' | 'description' | 'amount'>>
export type UpdateFineInput = FineMetadata & Partial<FineAttributes> & {
  expectedRevision: number
  occurredAt: string
}
export type ChangeFineStatusInput = FineMetadata & { expectedRevision: number } & (
  { status: 'PAID'; paidAt: string; occurredAt?: string }
  | { status: Exclude<FineStatus, 'PAID'>; occurredAt: string; paidAt?: never }
)
export type FineSnapshotSource = 'TRIP_SNAPSHOT' | 'CURRENT_REGISTRY'
export interface FineVehicleSnapshot {
  id: string
  licensePlate: string
  model: string | null
  source: FineSnapshotSource
  capturedAt: string
}
export interface FineDriverSnapshot {
  id: string
  name: string
  source: FineSnapshotSource
  capturedAt: string
}
export interface FineTripSnapshot {
  id: string
  vehicleId: string
  driverId: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  capturedAt: string
}
export interface FineContext {
  vehicleSnapshot: FineVehicleSnapshot | null
  driverSnapshot: FineDriverSnapshot | null
  tripSnapshot: FineTripSnapshot | null
}
export interface Fine extends FineAttributes, FineContext {
  id: string
  status: FineStatus
  paidAt: string | null
  cancellationReason: string | null
  createdBy: string
  revision: number
  createdAt: string
  updatedAt: string
  vehicle: { id: string; licensePlate: string; model: string | null }
  driver: { id: string; name: string } | null
}
export interface FineTimelineEntry {
  id: string
  eventType: string
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  evidenceDescription: string | null
  attachmentUrl: string | null
  supersedesId: string | null
  actor: { id: string; name: string; role: string }
  before: Partial<Fine> | null
  after: Partial<Fine>
}
export interface FineDetail extends Fine { events: FineTimelineEntry[] }
export interface FineFilters {
  vehicleId?: string
  driverId?: string
  status?: FineStatus
  from?: string
  to?: string
}
export interface FineDriverSuggestion {
  tripId: string
  driverId: string
  driverName: string
  vehicleId: string
  startedAt: string
  finishedAt: string | null
  tripStatus: string
  nameSource: FineSnapshotSource
}
/** Retrato interno restrito às informações necessárias à confirmação do vínculo. */
export interface FineTrip {
  id: string
  vehicleId: string
  driverId: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  vehicleSnapshot: { licensePlate?: string; model?: string | null } | null
  driverSnapshot: { name?: string } | null
}
export interface FineRegistration { fineId: string; request: Record<string, unknown> }
export interface FineEventInput {
  fineId: string
  eventType: FineEventType
  occurredAt: string
  metadata: FineMetadata
  actor: VehicleActorSnapshot
  before: Fine | null
  after: Fine
  supersedesId: string | null
  registrationRequest?: Record<string, unknown>
}
export type FineErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'REVISION_CONFLICT' | 'CLOSED_FINE'
  | 'IDEMPOTENCY_CONFLICT' | 'INVALID_TRANSITION' | 'INVALID_LINK' | 'INACTIVE_ACTOR'
/** Códigos de domínio são traduzidos para HTTP exclusivamente no controller. */
export class FineServiceError extends Error {
  constructor(readonly code: FineErrorCode, message: string) {
    super(message)
    this.name = 'FineServiceError'
  }
}
