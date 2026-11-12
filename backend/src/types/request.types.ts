import type { UserRole } from './auth'

/** Estado inicial permitido quando o Solicitante registra uma solicitação de viagem. */
export const REQUEST_STATUSES = {
  pending: 'PENDING',
} as const

/** Situações visíveis no histórico e na análise de solicitações. */
export const REQUEST_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'] as const
export type RequestStatus = typeof REQUEST_STATUS_VALUES[number]

/** Escopo autenticado aplicado às consultas de solicitações. */
export interface RequestActor {
  id: string
  role: UserRole
}

/** Filtros e paginação da lista de solicitações. */
export interface RequestListFilters {
  status?: RequestStatus
  from?: string
  to?: string
  requester?: string
  service?: string
  page?: number
  pageSize?: number
}

/** Campos da solicitação mostrados na tabela de análise. */
export interface RequestSummary {
  id: string
  requesterId: string
  requesterName: string
  serviceId: string
  serviceName: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  status: RequestStatus
  createdAt: string
  updatedAt: string
}

/** Viagem criada a partir de uma solicitação agendada. */
export interface RequestTrip {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  vehicle: { id: string; licensePlate: string; brand: string | null; model: string | null }
  driver: { id: string; name: string }
}

/** Detalhe completo da solicitação e da decisão registrada. */
export interface RequestDetail extends RequestSummary {
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionReason: string | null
  trip: RequestTrip | null
}

/** Página da consulta, com total para navegação entre páginas. */
export interface PaginatedRequests {
  requests: RequestSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

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
