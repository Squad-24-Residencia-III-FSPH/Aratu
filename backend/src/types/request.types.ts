import type { UserRole } from './auth'

/**
 * Situações canônicas de uma solicitação de transporte institucional.
 *
 * Os valores espelham a constraint `trip_requests_status_valid` de
 * `trip.requests` e são traduzidos para português apenas na interface.
 */
export const REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'CANCELED',
] as const

/** Situação vigente de uma solicitação de transporte. */
export type RequestStatus = typeof REQUEST_STATUSES[number]

/** Situação atribuída no momento em que o Solicitante abre a requisição. */
export const INITIAL_REQUEST_STATUS: RequestStatus = 'PENDING'

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
  status: RequestStatus
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

/** Filtros aceitos pela consulta paginada de solicitações. */
export interface RequestListFilters {
  /** Situação desejada; quando ausente, todas são consideradas. */
  status?: RequestStatus
  /** Data inicial inclusiva no formato `YYYY-MM-DD`. */
  from?: string
  /** Data final inclusiva no formato `YYYY-MM-DD`. */
  to?: string
  /** Página solicitada, iniciando em 1. */
  page?: number
  /** Quantidade de registros por página, entre 1 e 100. */
  pageSize?: number
}

/** Dados do usuário autenticado usados para aplicar o escopo de consulta. */
export interface RequestActor {
  /** Identificador do usuário logado (`auth.users.id`). */
  id: string
  /** Perfil RBAC vigente na sessão. */
  role: UserRole
}

/** Resumo de uma solicitação exibido na listagem. */
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

/** Dados da viagem vinculada a uma solicitação agendada. */
export interface RequestTrip {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  vehicle: {
    id: string
    licensePlate: string
    /** Marca pode ser desconhecida no cadastro do veículo (coluna anulável). */
    brand: string | null
    /** Modelo pode ser desconhecido no cadastro do veículo (coluna anulável). */
    model: string | null
  }
  driver: {
    id: string
    name: string
  }
}

/** Detalhe completo de uma solicitação, incluindo decisão e viagem. */
export interface RequestDetail extends RequestSummary {
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionReason: string | null
  trip: RequestTrip | null
}

/** Resultado paginado da consulta de solicitações. */
export interface PaginatedRequests {
  requests: RequestSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
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
