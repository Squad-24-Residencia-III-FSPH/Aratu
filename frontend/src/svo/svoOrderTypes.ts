export const SVO_TEAM_ORDERS_PATH = '/svo/ordens'
export const SVO_ORDERS_PATH = '/svo/acompanhamento'
export const SVO_ORDER_STATUSES = ['OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS', 'COMPLETED', 'NOT_PERFORMED', 'CANCELED'] as const
export type SvoOrderStatus = typeof SVO_ORDER_STATUSES[number]
export type SvoOrderTransition = 'IN_TRANSIT' | 'IN_SERVICE'
export interface SvoOrderSummary {
  id: string
  occurrenceId: string
  teamId: string
  vehicleId: string
  status: SvoOrderStatus
  revision: number
  openedAt: string
  departedAt: string | null
  arrivedAt: string | null
  collectedAt: string | null
  closedAt: string | null
  dispatch: { location: string | null; teamName: string | null; vehicleLicensePlate: string | null }
  current: { location: string; teamName: string; vehicleLicensePlate: string }
  allowedTransitions: SvoOrderTransition[]
}
export interface SvoOrderOccurrenceSnapshot {
  id: string
  status: string
  revision: number
  requesterName: string
  requesterPhone: string
  requesterType: string
  location: string
  description: string
  notes: string | null
  receivedAt: string
  triagedAt: string | null
  triagedBy: string | null
  attendantId: string
  evidenceDescription: string | null
}
export interface SvoOrderDetail extends SvoOrderSummary {
  occurrenceSnapshot: SvoOrderOccurrenceSnapshot | null
  teamSnapshot: { id: string; name: string; active: boolean; revision: number } | null
  vehicleSnapshot: { id: string; licensePlate: string; categories: string[]; operationType: string; status: string; bodyLimit: number; revision: number } | null
}
export type SvoOrderErrorKind = 'session' | 'validation' | 'forbidden' | 'notFound' | 'conflict' | 'server' | 'network' | 'invalidResponse' | 'rejected'

/** Rede/5xx/resposta inválida após PATCH exigem consulta antes de nova decisão explícita. */
export class SvoOrderRequestError extends Error {
  readonly kind: SvoOrderErrorKind
  constructor(kind: SvoOrderErrorKind, message: string) {
    super(message)
    this.name = 'SvoOrderRequestError'
    this.kind = kind
  }
}
