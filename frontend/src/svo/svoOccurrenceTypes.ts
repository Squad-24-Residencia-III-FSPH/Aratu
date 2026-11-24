export const SVO_OCCURRENCES_PATH = '/svo/solicitacoes'

export const SVO_OCCURRENCE_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELED'] as const
export type SvoOccurrenceStatus = typeof SVO_OCCURRENCE_STATUSES[number]

export const SVO_REQUESTER_TYPES = ['FAMILY', 'HOSPITAL', 'UBS', 'UPA', 'PUBLIC_AGENCY', 'OTHER'] as const
export type SvoRequesterType = typeof SVO_REQUESTER_TYPES[number]

export interface SvoOccurrenceFilters {
  status: SvoOccurrenceStatus | ''
  from: string
  to: string
}

export interface CreateSvoOccurrenceInput {
  requesterName: string
  requesterPhone: string
  requesterType: SvoRequesterType
  location: string
  description: string
  evidenceDescription: string
  notes: string | null
  receivedAt?: string
}

export interface SvoOccurrenceSummary {
  id: string
  requesterType: SvoRequesterType
  location: string
  status: SvoOccurrenceStatus
  receivedAt: string
  createdAt: string
  revision: number
  dispatchRequestedAt?: string | null
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
  triagedAt: string | null
  triagedBy: string | null
  updatedAt: string
  evidenceDescription: string | null
}

export interface SvoOccurrenceCreationResult {
  id: string
  status: 'PENDING'
  receivedAt: string
  createdAt: string
  revision: number
}

export interface SvoOccurrenceConfirmationResult {
  id: string
  status: 'CONFIRMED'
  triagedAt: string
  triagedBy: string
  revision: number
  dispatch?:
    | { status: 'DISPATCHED'; orderId: string; teamId: string; vehicleId: string; revision: number }
    | { status: 'WAITING'; reason: 'NO_TEAM' | 'NO_VEHICLE'; revision: number }
}

export type SvoOccurrenceErrorKind =
  | 'session'
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'server'
  | 'network'
  | 'invalidResponse'
  | 'rejected'

/** Erro tipado da integração de ocorrências, preservando mensagens públicas da API. */
export class SvoOccurrenceRequestError extends Error {
  readonly kind: SvoOccurrenceErrorKind

  constructor(kind: SvoOccurrenceErrorKind, message: string) {
    super(message)
    this.name = 'SvoOccurrenceRequestError'
    this.kind = kind
  }
}
