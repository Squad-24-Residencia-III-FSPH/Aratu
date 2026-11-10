import type { DriverAvailability, VehicleAvailability } from './availability.types'

/** Situações de solicitação e viagem envolvidas no agendamento. */
export const SCHEDULING_STATUSES = {
  approvedRequest: 'APPROVED',
  scheduled: 'SCHEDULED',
} as const

/** Motivo gravado no histórico quando o Gestor agenda sem justificar. */
export const DEFAULT_SCHEDULING_REASON = 'Viagem agendada'

/** Corpo bruto de `POST /trips`. */
export interface ScheduleTripInput {
  requestId?: unknown
  vehicleId?: unknown
  driverId?: unknown
  scheduledStart?: unknown
  scheduledEnd?: unknown
  reason?: unknown
}

/** Viagem agendada devolvida pela API. */
export interface Trip {
  id: string
  requestId: string
  vehicleId: string
  driverId: string
  scheduledStart: Date
  scheduledEnd: Date
  status: string
  revision: number
  createdAt: Date
}

/** Solicitação travada para o agendamento, usada também como snapshot do histórico. */
export interface SchedulableRequest {
  id: string
  requesterId: string
  serviceId: string
  status: string
  revision: number
}

/** Dados validados para gravar a viagem. */
export interface CreateTripData {
  requestId: string
  vehicleId: string
  driverId: string
  scheduledStart: Date
  scheduledEnd: Date
  vehicleSnapshot: VehicleAvailability
  driverSnapshot: DriverAvailability
}

/** Snapshot público do Gestor autenticado preservado no histórico. */
export interface TripActor {
  id: string
  name: string
  email: string
  role: string
}

/** Metadados comuns dos eventos append-only do agendamento. */
export interface SchedulingEventMetadata {
  reportedBy: string
  registeredBy: string
  actorSnapshot: TripActor
  reason: string
}

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class TripServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'TripServiceError'
    this.statusCode = statusCode
  }
}
