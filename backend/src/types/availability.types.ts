import type { CnhCategory, DriverStatus } from './driver.types'
import type { VehicleCategory, VehicleStatus } from './vehicle.types'

/** Motivos estáveis de indisponibilidade; a tela os traduz para o Gestor. */
export const AVAILABILITY_REASONS = {
  conflict: 'CONFLICT',
  maintenance: 'MAINTENANCE',
  incompatible: 'INCOMPATIBLE',
  away: 'AWAY',
  cnhExpired: 'CNH_EXPIRED',
  inactive: 'INACTIVE',
  insufficientCapacity: 'INSUFFICIENT_CAPACITY',
  accountUnavailable: 'ACCOUNT_UNAVAILABLE',
} as const
export type AvailabilityReason = typeof AVAILABILITY_REASONS[keyof typeof AVAILABILITY_REASONS]

/** Período validado da consulta ou do agendamento. */
export interface Period {
  start: Date
  end: Date
}

/** Fatos de um veículo candidato, lidos do banco, a partir dos quais o service decide. */
export interface VehicleAvailabilityFacts {
  id: string
  licensePlate: string
  brand: string | null
  model: string | null
  categories: VehicleCategory[]
  seats: number
  bodyLimit: number
  status: VehicleStatus
  compatible: boolean
  hasConflict: boolean
}

/** Fatos de um motorista candidato, lidos do banco, a partir dos quais o service decide. */
export interface DriverAvailabilityFacts {
  id: string
  name: string
  cnhCategory: CnhCategory
  cnhExpiresAt: string
  status: DriverStatus
  hasConflict: boolean
  accountEligible: boolean
}

/** Item devolvido por `GET /vehicles/available`. */
export interface VehicleAvailability extends Omit<VehicleAvailabilityFacts, 'compatible' | 'hasConflict'> {
  available: boolean
  reasons: AvailabilityReason[]
}

/** Item devolvido por `GET /drivers/available`. */
export interface DriverAvailability extends Omit<DriverAvailabilityFacts, 'hasConflict'> {
  available: boolean
  reasons: AvailabilityReason[]
}

/** Parâmetros brutos de consulta recebidos pela borda HTTP. */
export interface AvailabilityQuery {
  start?: unknown
  end?: unknown
  serviceId?: unknown
  requestId?: unknown
}

/** Dados confirmados da solicitação usados para filtrar candidatos à alocação. */
export interface AvailabilityRequest {
  id: string
  serviceId: string | null
  status: string
  passengers: number
  specialRequirements: string | null
  revision: number
}

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class AvailabilityError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AvailabilityError'
    this.statusCode = statusCode
  }
}
