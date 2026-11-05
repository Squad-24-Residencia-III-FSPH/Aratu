/** Contrato do módulo de veículos espelhado da API REST (FROTA-43/FROTA-45). */

export const VEHICLE_STATUSES = ['AVAILABLE', 'IN_MAINTENANCE', 'INACTIVE'] as const
export type VehicleStatus = typeof VEHICLE_STATUSES[number]

export const VEHICLE_CATEGORIES = ['PASSENGER', 'BODY', 'OTHER'] as const
export type VehicleCategory = typeof VEHICLE_CATEGORIES[number]

export const VEHICLE_OPERATION_TYPES = ['ADMINISTRATIVE', 'SVO'] as const
export type VehicleOperationType = typeof VEHICLE_OPERATION_TYPES[number]

export const VEHICLE_OWNERSHIP_TYPES = ['OWNED', 'LEASED'] as const
export type VehicleOwnership = typeof VEHICLE_OWNERSHIP_TYPES[number]

/** Situação atual e atributos de um veículo persistido. */
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
  createdAt: string
  updatedAt: string
}

/** Filtros aceitos pelo endpoint de listagem. */
export interface VehicleFilters {
  status?: VehicleStatus
  category?: VehicleCategory
  operationType?: VehicleOperationType
}

/** Atributos editáveis enviados na criação e na edição. */
export interface VehicleAttributes {
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
}

/** Dados de auditoria exigidos em toda mutação. */
export interface VehicleChangeMetadata {
  reportedBy: string
  reason: string
}

/** Entrada de cadastro de veículo. */
export interface CreateVehicleInput extends VehicleAttributes, VehicleChangeMetadata {}

/** Entrada de edição protegida por revisão otimista. */
export interface UpdateVehicleInput extends VehicleAttributes, VehicleChangeMetadata {
  expectedRevision: number
}

/** Entrada de mudança de situação protegida por revisão otimista. */
export interface ChangeVehicleStatusInput extends VehicleChangeMetadata {
  status: VehicleStatus
  expectedRevision: number
}

/** Mensagem de conflito de placa devolvida pelo backend (HTTP 409). */
export const DUPLICATE_LICENSE_PLATE_MESSAGE = 'Placa já cadastrada'

/** Transições permitidas pela máquina de estados do backend. */
export const VEHICLE_STATUS_TRANSITIONS: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> = {
  AVAILABLE: ['IN_MAINTENANCE', 'INACTIVE'],
  IN_MAINTENANCE: ['AVAILABLE', 'INACTIVE'],
  INACTIVE: ['AVAILABLE'],
}

export const VEHICLE_STATUS_LABELS: Readonly<Record<VehicleStatus, string>> = {
  AVAILABLE: 'Disponível',
  IN_MAINTENANCE: 'Em manutenção',
  INACTIVE: 'Inativo',
}

export const VEHICLE_CATEGORY_LABELS: Readonly<Record<VehicleCategory, string>> = {
  PASSENGER: 'Passageiro',
  BODY: 'Transporte de corpos',
  OTHER: 'Outro',
}

export const VEHICLE_OPERATION_LABELS: Readonly<Record<VehicleOperationType, string>> = {
  ADMINISTRATIVE: 'Administrativa',
  SVO: 'SVO',
}

export const VEHICLE_OWNERSHIP_LABELS: Readonly<Record<VehicleOwnership, string>> = {
  OWNED: 'Próprio',
  LEASED: 'Locado',
}

/** Rótulo da ação que leva o veículo à situação informada. */
export function statusActionLabel(target: VehicleStatus): string {
  if (target === 'IN_MAINTENANCE') return 'Enviar para manutenção'
  if (target === 'INACTIVE') return 'Inativar veículo'
  return 'Disponibilizar veículo'
}
