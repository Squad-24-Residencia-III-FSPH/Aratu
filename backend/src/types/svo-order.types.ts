import type { SvoActorSnapshot, SvoOccurrenceDetail } from './svo-occurrence.types'
import type { Vehicle } from './vehicle.types'

export const SVO_ORDER_INITIAL_STATUS = 'OPEN' as const
export const SVO_ORDER_STATUS_AUDIT_OPERATION = 'UPDATE' as const
export const SVO_ORDER_OCCUPYING_STATUSES = ['OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS'] as const
export type SvoOrderStatus = typeof SVO_ORDER_OCCUPYING_STATUSES[number] | 'COMPLETED' | 'NOT_PERFORMED' | 'CANCELED'
export const SVO_ORDER_STATUSES = [...SVO_ORDER_OCCUPYING_STATUSES, 'COMPLETED', 'NOT_PERFORMED', 'CANCELED'] as const
export const SVO_ORDER_READ_ROLES = ['EQUIPE_SVO', 'ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'] as const
export const SVO_ORDER_UPDATE_ROLES = ['EQUIPE_SVO'] as const
export type SvoOrderTransition = 'IN_TRANSIT' | 'IN_SERVICE'
export const SVO_ORDER_TRANSITIONS: Record<SvoOrderStatus, readonly SvoOrderTransition[]> = {
  OPEN: ['IN_TRANSIT'], IN_TRANSIT: ['IN_SERVICE'], IN_SERVICE: [], IN_PROGRESS: [],
  COMPLETED: [], NOT_PERFORMED: [], CANCELED: [],
}
export const SVO_ORDER_RESULTS = ['COMPLETED', 'NOT_PERFORMED'] as const
export type SvoOrderResult = typeof SVO_ORDER_RESULTS[number]
export const SVO_ORDER_ALLOWED_RESULTS: Record<SvoOrderStatus, readonly SvoOrderResult[]> = {
  OPEN: [], IN_TRANSIT: ['NOT_PERFORMED'], IN_SERVICE: ['COMPLETED', 'NOT_PERFORMED'],
  IN_PROGRESS: [], COMPLETED: [], NOT_PERFORMED: [], CANCELED: [],
}

export interface SvoOrderState {
  id: string
  occurrenceId: string
  teamId: string
  vehicleId: string
  status: SvoOrderStatus
  result: SvoOrderResult | null
  failureReason: string | null
  notes: string | null
  revision: number
  openedAt: Date
  departedAt: Date | null
  arrivedAt: Date | null
  collectedAt: Date | null
  closedAt: Date | null
  closedBy: string | null
}
export interface SvoOrderSummary extends Omit<SvoOrderState, 'failureReason' | 'notes' | 'closedBy'> {
  dispatch: { location: string | null; teamName: string | null; vehicleLicensePlate: string | null }
  current: { location: string; teamName: string; vehicleLicensePlate: string }
  allowedTransitions: readonly SvoOrderTransition[]
  allowedResults: readonly SvoOrderResult[]
}
export interface SvoOrderDetail extends SvoOrderSummary {
  failureReason: string | null
  notes: string | null
  closedBy: string | null
  occurrenceSnapshot: SvoOrderOccurrenceSnapshot | null
  teamSnapshot: SvoTeamSnapshot | null
  vehicleSnapshot: SvoOrderVehicleSnapshot | null
  allocationSnapshot: SvoAllocationSnapshot | null
}
/** Metadado interno de autorização; nunca integra a resposta HTTP. */
export interface SvoOrderReadRow extends Omit<SvoOrderSummary, 'allowedTransitions' | 'allowedResults'> { teamActive: boolean }
export interface SvoOrderDetailRow extends SvoOrderReadRow {
  failureReason: string | null
  notes: string | null
  closedBy: string | null
  occurrenceSnapshot: SvoOrderOccurrenceSnapshot | null
  teamSnapshot: SvoTeamSnapshot | null
  vehicleSnapshot: SvoOrderVehicleSnapshot | null
  allocationSnapshot: SvoAllocationSnapshot | null
}
export interface SvoOrderMembership { active: boolean; joinedAt: Date; leftAt: Date | null }
export interface UpdateSvoOrderStatusInput { status: SvoOrderStatus; revision: number }
export interface RecordSvoOrderResultInput {
  result: SvoOrderResult
  revision: number
  failureReason: string | null
  notes: string | null
}
export interface SvoOrderStatusEvent {
  before: SvoOrderState
  after: SvoOrderState
  eventType: 'DEPARTED' | 'ARRIVED' | SvoOrderResult
  occurredAt: Date
  actor: SvoActorSnapshot
  reason: string
  evidenceDescription: string
}

export interface CreateSvoOrderInput {
  occurrenceId: string
  teamId: string
  vehicleId: string
  expectedRevision?: number
  reason?: string
}
export interface SvoOrderCreationResult { id: string; status: typeof SVO_ORDER_INITIAL_STATUS }
export interface SvoTeamSnapshot { id: string; name: string; active: boolean; revision: number }
export interface SvoDispatchCandidateTeam { id: string; name: string }
export interface SvoDispatchCandidateVehicleRow {
  id: string
  plate: string
  brand: string | null
  model: string | null
  bodyLimit: number
  occupyingOrders: number
}
export interface SvoDispatchCandidateVehicle extends SvoDispatchCandidateVehicleRow {
  availableSlots: number
}
export interface SvoDispatchCandidatesResult {
  teams: SvoDispatchCandidateTeam[]
  vehicles: SvoDispatchCandidateVehicle[]
}
export interface SvoAllocationSnapshot {
  teamShiftId: string
  shiftStartsAt: Date | string
  shiftEndsAt: Date | string
  teamActiveOrderCount: number
  teamLastDispatchAt: Date | string | null
  selectionRule: 'LOWEST_ACTIVE_ORDERS_THEN_LONGEST_WITHOUT_DISPATCH' | 'MANUAL_MANAGER_OVERRIDE'
}
export interface SvoDispatchTeamCandidate extends SvoTeamSnapshot {
  shiftId: string
  shiftStartsAt: Date
  shiftEndsAt: Date
  activeOrderCount: number
  lastDispatchAt: Date | null
}
export type SvoOrderOccurrenceSnapshot = Pick<SvoOccurrenceDetail,
  'id' | 'status' | 'revision' | 'requesterName' | 'requesterPhone' | 'requesterType' | 'location' |
  'description' | 'notes' | 'receivedAt' | 'triagedAt' | 'triagedBy' | 'attendantId' | 'evidenceDescription'>
export type SvoOrderVehicleSnapshot = Pick<Vehicle,
  'id' | 'licensePlate' | 'categories' | 'operationType' | 'status' | 'bodyLimit' | 'revision'>
export interface NewSvoOrder extends CreateSvoOrderInput {
  status: typeof SVO_ORDER_INITIAL_STATUS
  openedAt: Date
  createdBy: string
  revision: number
  occurrenceSnapshot: SvoOrderOccurrenceSnapshot
  teamSnapshot: SvoTeamSnapshot
  vehicleSnapshot: SvoOrderVehicleSnapshot
  teamShiftId: string | null
  allocationSnapshot: SvoAllocationSnapshot | null
}
export interface SvoOrderRecord extends NewSvoOrder { id: string }
export interface OpenSvoOrderEvent {
  order: SvoOrderRecord
  actor: SvoActorSnapshot
  reason: string
  evidenceDescription: string
}
export type SvoOrderErrorCode = 'INVALID_INPUT' | 'ACCOUNT_UNAVAILABLE' | 'ACCESS_DENIED' | 'NOT_FOUND' |
  'OCCURRENCE_NOT_CONFIRMED' | 'ORDER_ALREADY_EXISTS' | 'TEAM_UNAVAILABLE' | 'VEHICLE_UNAVAILABLE' | 'CAPACITY_EXCEEDED' | 'INVALID_TRANSITION' |
  'NO_TEAM' | 'NO_VEHICLE' | 'CONFLICT' | 'DISPATCH_NOT_REQUESTED'

/** Mantém erros de domínio independentes do protocolo HTTP. */
export class SvoOrderServiceError extends Error {
  constructor(readonly code: SvoOrderErrorCode, message: string) {
    super(message)
    this.name = 'SvoOrderServiceError'
  }
}
