import type { UserRole } from './auth'

export const SVO_REQUESTER_TYPES = ['FAMILY', 'HOSPITAL', 'UBS', 'UPA', 'PUBLIC_AGENCY', 'OTHER'] as const
export type SvoRequesterType = typeof SVO_REQUESTER_TYPES[number]
export const SVO_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELED'] as const
export type SvoStatus = typeof SVO_STATUSES[number]
export const SVO_WRITE_ROLES = ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const
export const SVO_READ_ROLES = [...SVO_WRITE_ROLES, 'GESTOR'] as const
export const SVO_TRIAGE_ROLES = ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const
export const SVO_MAINTAIN_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const
export const SVO_TRANSITIONS: Record<SvoStatus, readonly SvoStatus[]> = {
  PENDING: ['CONFIRMED'], CONFIRMED: [], CANCELED: [],
}

export interface CreateSvoOccurrenceInput {
  requesterName: string
  requesterPhone: string
  requesterType: SvoRequesterType
  location: string
  description: string
  notes?: string | null
  receivedAt?: string
  evidenceDescription: string
}

export interface SvoActorSnapshot {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface SvoOccurrenceSummary {
  id: string
  requesterType: SvoRequesterType
  location: string
  status: SvoStatus
  receivedAt: Date
  createdAt: Date
  revision: number
  dispatchRequestedAt?: Date | null
  dispatchRequestedBy?: string | null
  dispatchWaitReason?: 'NO_TEAM' | 'NO_VEHICLE' | null
  executionOrderId?: string | null
}

export interface SvoOccurrenceDetail extends SvoOccurrenceSummary {
  requesterName: string
  requesterPhone: string
  description: string
  notes: string | null
  attendantId: string
  triagedAt: Date | null
  triagedBy: string | null
  updatedAt: Date
  evidenceDescription: string | null
}

export type SvoCreationResult = Pick<SvoOccurrenceSummary, 'id' | 'status' | 'receivedAt' | 'createdAt' | 'revision'>
export type SvoDispatchResult =
  | { status: 'DISPATCHED'; orderId: string; teamId: string; vehicleId: string; revision: number }
  | { status: 'WAITING'; reason: 'NO_TEAM' | 'NO_VEHICLE'; revision: number }
export type SvoDispatchAfterTriage = (
  occurrenceId: string,
  userId: string,
  permissions: readonly string[],
) => Promise<SvoDispatchResult>
export type SvoConfirmationResult = Pick<SvoOccurrenceDetail, 'id' | 'status' | 'triagedAt' | 'triagedBy' | 'revision'> & { dispatch?: SvoDispatchResult }
export interface SvoListFilters {
  status: SvoStatus | null
  from: Date | null
  until: Date | null
}

export interface CreateSvoEventInput {
  occurrenceId: string
  eventType: 'RECEIVED' | 'CONFIRMED' | 'DISPATCH_REQUESTED' | 'DISPATCH_ATTEMPTED' | 'DISPATCHED' | 'DISPATCH_WAITING'
  occurredAt: Date
  reportedBy: string
  actorSnapshot: SvoActorSnapshot
  reason: string
  evidenceDescription: string
  beforeState: SvoOccurrenceDetail | null
  afterState: SvoOccurrenceDetail
}

export type SvoErrorCode = 'INVALID_INPUT' | 'ACCOUNT_UNAVAILABLE' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'CONFLICT'

/** Erro semântico do domínio; a tradução HTTP pertence à borda. */
export class SvoOccurrenceServiceError extends Error {
  constructor(readonly code: SvoErrorCode, message: string) {
    super(message)
    this.name = 'SvoOccurrenceServiceError'
  }
}
