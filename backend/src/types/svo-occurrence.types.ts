import type { UserRole } from './auth'

export const SVO_REQUESTER_TYPES = ['FAMILY', 'HOSPITAL', 'UBS', 'UPA', 'PUBLIC_AGENCY', 'OTHER'] as const
export type SvoRequesterType = typeof SVO_REQUESTER_TYPES[number]
export const SVO_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELED'] as const
export type SvoStatus = typeof SVO_STATUSES[number]
export const SVO_WRITE_ROLES = ['ATENDENTE_SVO', 'ADMINISTRADOR'] as const
export const SVO_READ_ROLES = [...SVO_WRITE_ROLES, 'GESTOR'] as const
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
export type SvoConfirmationResult = Pick<SvoOccurrenceDetail, 'id' | 'status' | 'triagedAt' | 'triagedBy' | 'revision'>
export interface SvoListFilters {
  status: SvoStatus | null
  from: Date | null
  until: Date | null
}

export interface CreateSvoEventInput {
  occurrenceId: string
  eventType: 'RECEIVED' | 'TRIAGED' | 'CONFIRMED' | 'RECTIFIED'
  occurredAt: Date
  reportedBy: string
  actorSnapshot: SvoActorSnapshot
  reason: string
  evidenceDescription: string | null
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown>
}

/** Conteúdo clínico informado para uma versão imutável da triagem; nenhum campo é obrigatório. */
export interface SaveSvoOccurrenceTriageInput {
  deceasedName?: string | null
  estimatedAge?: string | null
  responsiblePhysician?: string | null
  crm?: string | null
  preliminaryCauseOfDeath?: string | null
  availableDocuments?: string[] | null
  referral?: string | null
  triageNotes?: string | null
  reason?: string | null
}

/** Versão clínica dedicada, exposta somente pelo endpoint autenticado de triagem. */
export interface SvoOccurrenceTriage {
  id: string
  occurrenceId: string
  revision: number
  supersedesId: string | null
  deceasedName: string | null
  estimatedAge: string | null
  responsiblePhysician: string | null
  crm: string | null
  preliminaryCauseOfDeath: string | null
  availableDocuments: string[] | null
  referral: string | null
  triageNotes: string | null
  occurredAt: Date
  registeredAt: Date
  registeredBy: string
  reason: string
}

export type SvoErrorCode = 'INVALID_INPUT' | 'ACCOUNT_UNAVAILABLE' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'INVALID_TRANSITION'

/** Erro semântico do domínio; a tradução HTTP pertence à borda. */
export class SvoOccurrenceServiceError extends Error {
  constructor(readonly code: SvoErrorCode, message: string) {
    super(message)
    this.name = 'SvoOccurrenceServiceError'
  }
}
