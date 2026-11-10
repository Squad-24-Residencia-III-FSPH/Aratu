/** Situações de `trip.requests` envolvidas na análise do Gestor. */
export const REQUEST_DECISION_STATUSES = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
} as const

/** Resultado possível de uma análise. */
export type RequestDecision = typeof REQUEST_DECISION_STATUSES.approved | typeof REQUEST_DECISION_STATUSES.rejected

/** Motivo gravado no histórico quando o Gestor aprova sem justificar. */
export const DEFAULT_APPROVAL_REASON = 'Solicitação aprovada'

/** Estado da solicitação usado como snapshot antes/depois da decisão. */
export interface DecidableRequest {
  id: string
  requesterId: string
  serviceId: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  status: string
  decidedBy: string | null
  decidedAt: Date | null
  decisionReason: string | null
  revision: number
  createdAt: Date
  updatedAt: Date
}

/** Resposta pública da aprovação ou rejeição. */
export interface RequestDecisionResult {
  id: string
  status: RequestDecision
  decidedBy: string
  decidedAt: Date
  decisionReason: string | null
  revision: number
}

/** Corpo aceito pelos endpoints de decisão. */
export interface RequestDecisionInput {
  reason?: string | null
}

/** Snapshot público do Gestor autenticado preservado no histórico. */
export interface RequestDecisionActor {
  id: string
  name: string
  email: string
  role: string
}

/** Evento append-only de `trip.request_events` gerado pela decisão. */
export interface CreateRequestEventInput {
  requestId: string
  eventType: RequestDecision
  reportedBy: string
  registeredBy: string
  actorSnapshot: RequestDecisionActor
  reason: string
  beforeState: DecidableRequest
  afterState: DecidableRequest
}

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class RequestDecisionError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'RequestDecisionError'
    this.statusCode = statusCode
  }
}
