import type { UserRole } from './auth'

/** Estado inicial permitido quando o Solicitante registra uma solicitação de viagem. */
export const REQUEST_STATUSES = {
  pending: 'PENDING',
} as const

/** Campos recebidos do corpo HTTP antes da validação de domínio. */
export interface CreateRequestBody {
  requestedDate?: unknown
  requestedTime?: unknown
  origin?: unknown
  destination?: unknown
  purpose?: unknown
  serviceId?: unknown
}

/** Dados normalizados da solicitação, prontos para persistência. */
export interface CreateRequestInput {
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  serviceId: string
}

/** Ator autenticado preservado no contexto histórico da solicitação. */
export interface RequestActorSnapshot {
  id: string
  name: string
  email: string
  role: UserRole
}

/** Serviço ativo copiado para o contexto vigente no momento da solicitação. */
export interface RequestServiceSnapshot {
  id: string
  name: string
  requiresTriage: boolean
  requiresWeight: boolean
  requiresIdentification: boolean
}

/** Solicitação persistida e projetada para o service de domínio. */
export interface TripRequest {
  id: string
  requesterId: string
  serviceId: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  status: typeof REQUEST_STATUSES.pending
  requesterSnapshot: RequestActorSnapshot
  serviceSnapshot: RequestServiceSnapshot
}

/** Evento imutável que registra a abertura da solicitação. */
export interface CreateRequestEventInput {
  requestId: string
  reportedBy: string
  registeredBy: string
  actorSnapshot: RequestActorSnapshot
  reason: string
  afterState: TripRequest
}

/** Erro de domínio convertido pelo controller em resposta HTTP. */
export class RequestServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'RequestServiceError'
    this.statusCode = statusCode
  }
}
