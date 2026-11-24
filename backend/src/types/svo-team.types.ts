import type { SvoActorSnapshot } from './svo-occurrence.types'

export interface SvoTeamMember {
  id: string
  userId: string
  name: string
  active: boolean
  joinedAt: string
  leftAt: string | null
}

export interface SvoTeamShift {
  id: string
  startsAt: string
  endsAt: string
  canceledAt: string | null
  cancellationReason: string | null
  revision: number
}

export interface SvoTeam {
  id: string
  name: string
  active: boolean
  revision: number
  members: SvoTeamMember[]
  shifts: SvoTeamShift[]
}

export interface SvoEligibleMember { id: string; name: string; email: string }

export interface SvoTeamEventInput {
  teamId: string
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'SHIFT_CREATED' | 'SHIFT_UPDATED' | 'SHIFT_CANCELED'
  actor: SvoActorSnapshot
  occurredAt: Date
  reason: string
  beforeState: unknown | null
  afterState: unknown
}

export type SvoTeamErrorCode = 'INVALID_INPUT' | 'ACCOUNT_UNAVAILABLE' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'CONFLICT'

/** Erros de gestão SVO, independentes do transporte HTTP. */
export class SvoTeamServiceError extends Error {
  constructor(readonly code: SvoTeamErrorCode, message: string) {
    super(message)
    this.name = 'SvoTeamServiceError'
  }
}
