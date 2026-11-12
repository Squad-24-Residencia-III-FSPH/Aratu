import type { DriverAvailability, VehicleAvailability } from './availability.types'

/** Situações de solicitação e viagem envolvidas no agendamento e na execução. */
export const SCHEDULING_STATUSES = {
  approvedRequest: 'APPROVED',
  scheduled: 'SCHEDULED',
  inProgress: 'IN_PROGRESS',
  finished: 'FINISHED',
  confirmed: 'CONFIRMED',
} as const

/** Situações possíveis de uma viagem (espelha o CHECK de `trip.trips.status`). */
export const TRIP_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED', 'CANCELED'] as const
export type TripStatus = typeof TRIP_STATUSES[number]

/** Motivo gravado no histórico quando o Gestor confirma sem justificar. */
export const DEFAULT_CONFIRMATION_REASON = 'Viagem confirmada'

/** Filtros brutos de `GET /trips` (datas `YYYY-MM-DD` sobre o início agendado). */
export interface TripListQuery {
  status?: unknown
  from?: unknown
  to?: unknown
}

/** Filtros validados da listagem de conferência. */
export interface TripListFilters {
  status: TripStatus | null
  from: string | null
  to: string | null
}

/** Item da listagem de conferência do Gestor. */
export interface TripSummary {
  id: string
  requestId: string
  status: string
  scheduledStart: Date
  scheduledEnd: Date
  startedAt: Date | null
  finishedAt: Date | null
  startKm: number | null
  endKm: number | null
  vehicleLicensePlate: string
  driverName: string
  origin: string
  destination: string
  confirmedBy: string | null
  confirmedAt: Date | null
}

/** Corpo bruto de `POST /trips/:id/confirm`. */
export interface ConfirmTripInput {
  reason?: unknown
}

/** Resposta da confirmação da viagem. */
export interface TripConfirmation {
  id: string
  status: string
  confirmedBy: string
  confirmedAt: Date
  revision: number
}

/** Motivo gravado no histórico quando o Gestor agenda sem justificar. */
export const DEFAULT_SCHEDULING_REASON = 'Viagem agendada'

/** Motivos gravados no histórico quando o Motorista não justifica o início ou o término. */
export const DEFAULT_EXECUTION_REASONS = {
  start: 'Início da viagem',
  finish: 'Término da viagem',
} as const

/** Corpo bruto de `POST /trips`. */
export interface ScheduleTripInput {
  requestId?: unknown
  vehicleId?: unknown
  driverId?: unknown
  scheduledStart?: unknown
  scheduledEnd?: unknown
  reason?: unknown
}

/** Corpo bruto de `POST /trips/:id/start`. */
export interface StartTripInput {
  startKm?: unknown
  reason?: unknown
}

/** Corpo bruto de `POST /trips/:id/finish`. */
export interface FinishTripInput {
  endKm?: unknown
  reason?: unknown
}

/** Viagem devolvida pela API; km e horários reais ficam nulos até a execução. */
export interface Trip {
  id: string
  requestId: string
  vehicleId: string
  driverId: string
  scheduledStart: Date
  scheduledEnd: Date
  status: string
  startKm: number | null
  endKm: number | null
  startedAt: Date | null
  finishedAt: Date | null
  revision: number
  createdAt: Date
}

/** Viagem exibida ao Motorista em `GET /trips/mine`. */
export interface DriverTrip {
  id: string
  status: string
  scheduledStart: Date
  scheduledEnd: Date
  startKm: number | null
  startedAt: Date | null
  origin: string
  destination: string
  purpose: string
  vehicleLicensePlate: string
}

/** Motorista cadastrado vinculado ao usuário autenticado. */
export interface TripDriverAccount {
  id: string
  name: string
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

/** Snapshot público do usuário autenticado preservado no histórico. */
export interface TripActor {
  id: string
  name: string
  email: string
  role: string
}

/** Metadados comuns dos eventos append-only de viagem e solicitação. */
export interface SchedulingEventMetadata {
  reportedBy: string
  registeredBy: string
  actorSnapshot: TripActor
  reason: string
}

/** Tipos de evento de viagem gravados por esta API (subconjunto do CHECK de `trip.trip_events`). */
export type TripEventType = 'SCHEDULED' | 'STARTED' | 'FINISHED' | 'CONFIRMED'

/** Leitura append-only de hodômetro gerada pela execução da viagem. */
export interface TripOdometerReading {
  vehicleId: string
  tripId: string
  readingType: 'START' | 'END'
  odometerKm: number
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
