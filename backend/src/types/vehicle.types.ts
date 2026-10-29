/** Categorias operacionais suportadas pelo cadastro de veículos. */
export const VEHICLE_CATEGORIES = ['PASSENGER', 'BODY', 'OTHER'] as const
export type VehicleCategory = typeof VEHICLE_CATEGORIES[number]

/** Situações vigentes possíveis para um veículo da frota. */
export const VEHICLE_STATUSES = ['AVAILABLE', 'IN_MAINTENANCE', 'INACTIVE'] as const
export type VehicleStatus = typeof VEHICLE_STATUSES[number]

/** Operações atendidas pelo veículo. */
export const VEHICLE_OPERATION_TYPES = ['ADMINISTRATIVE', 'SVO'] as const
export type VehicleOperationType = typeof VEHICLE_OPERATION_TYPES[number]

/** Regimes de propriedade suportados pelo cadastro de veículos. */
export const VEHICLE_OWNERSHIP_TYPES = ['OWNED', 'LEASED'] as const
export type VehicleOwnership = typeof VEHICLE_OWNERSHIP_TYPES[number]

/** Operações de auditoria associadas às mutações de veículo. */
export const VEHICLE_AUDIT_OPERATIONS = {
  create: 'CREATE',
  edit: 'UPDATE',
  statusChange: 'STATUS_CHANGE',
} as const

/** Estado atual e projeção segura de um veículo da frota. */
export interface Vehicle {
  id: string
  licensePlate: string
  brand: string | null
  model: string | null
  year: number | null
  vehicleType: string | null
  ownership: VehicleOwnership
  categories: VehicleCategory[]
  seats: number
  bodyLimit: number
  weightLimit: number | null
  operationType: VehicleOperationType
  status: VehicleStatus
  revision: number
  createdAt: Date
  updatedAt: Date
}

/** Dados comuns exigidos para registrar a origem e justificativa da mutação. */
export interface VehicleChangeMetadata {
  reportedBy: string
  reason: string
}

/** Campos editáveis no cadastro de um veículo. */
export interface VehicleAttributes {
  licensePlate: string
  brand?: string | null
  model?: string | null
  year?: number | null
  vehicleType?: string | null
  ownership?: VehicleOwnership
  categories: VehicleCategory[]
  seats: number
  bodyLimit: number
  weightLimit: number | null
  operationType: VehicleOperationType
}

/** Entrada para cadastro de veículo. */
export interface CreateVehicleInput extends VehicleAttributes, VehicleChangeMetadata {}

/** Entrada para edição completa protegida por revisão otimista. */
export interface UpdateVehicleInput extends VehicleAttributes, VehicleChangeMetadata {
  expectedRevision: number
}

/** Entrada para alteração de situação protegida por revisão otimista. */
export interface ChangeVehicleStatusInput extends VehicleChangeMetadata {
  status: VehicleStatus
  expectedRevision: number
}

/** Filtros opcionais aceitos pela listagem de veículos. */
export interface VehicleFilters {
  status?: VehicleStatus
  category?: VehicleCategory
  operationType?: VehicleOperationType
}

/** Snapshot público do ator autenticado preservado no histórico. */
export interface VehicleActorSnapshot {
  id: string
  name: string
  email: string
  role: string
}

/** Evento append-only da história de um veículo. */
export interface CreateVehicleEventInput {
  vehicleId: string
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED'
  reportedBy: string
  registeredBy: string
  actorSnapshot: VehicleActorSnapshot
  reason: string
  beforeState: Vehicle | null
  afterState: Vehicle
}

/** Resultado discriminado de uma alteração concorrente protegida por revision. */
export type VehicleMutationResult =
  | { kind: 'updated'; vehicle: Vehicle }
  | { kind: 'not-found' }
  | { kind: 'revision-conflict' }

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class VehicleServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'VehicleServiceError'
    this.statusCode = statusCode
  }
}
