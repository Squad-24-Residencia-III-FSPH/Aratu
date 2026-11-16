import type { SvoActorSnapshot, SvoOccurrenceDetail } from './svo-occurrence.types'
import type { Vehicle } from './vehicle.types'

export const SVO_ORDER_INITIAL_STATUS = 'OPEN' as const
export const SVO_ORDER_OCCUPYING_STATUSES = ['OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS'] as const
export type SvoOrderStatus = typeof SVO_ORDER_OCCUPYING_STATUSES[number] | 'COMPLETED' | 'NOT_PERFORMED' | 'CANCELED'

export interface CreateSvoOrderInput {
  occurrenceId: string
  teamId: string
  vehicleId: string
}
export interface SvoOrderCreationResult { id: string; status: typeof SVO_ORDER_INITIAL_STATUS }
export interface SvoTeamSnapshot { id: string; name: string; active: boolean; revision: number }
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
}
export interface SvoOrderRecord extends NewSvoOrder { id: string }
export interface OpenSvoOrderEvent {
  order: SvoOrderRecord
  actor: SvoActorSnapshot
  reason: string
  evidenceDescription: string
}
export type SvoOrderErrorCode = 'INVALID_INPUT' | 'ACCOUNT_UNAVAILABLE' | 'ACCESS_DENIED' | 'NOT_FOUND' |
  'OCCURRENCE_NOT_CONFIRMED' | 'ORDER_ALREADY_EXISTS' | 'TEAM_UNAVAILABLE' | 'VEHICLE_UNAVAILABLE' | 'CAPACITY_EXCEEDED'

/** Mantém erros de domínio independentes do protocolo HTTP. */
export class SvoOrderServiceError extends Error {
  constructor(readonly code: SvoOrderErrorCode, message: string) {
    super(message)
    this.name = 'SvoOrderServiceError'
  }
}
