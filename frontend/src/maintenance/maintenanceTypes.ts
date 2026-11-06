import type { Profile } from '../auth/profiles.ts'
import type { Vehicle } from '../vehicles/vehicleTypes.ts'

export const MAINTENANCE_PATH = '/maintenance-orders'
export const MAINTENANCE_TYPES = ['PREVENTIVE', 'CORRECTIVE'] as const
export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'] as const
export type MaintenanceType = typeof MAINTENANCE_TYPES[number]
export type MaintenanceStatus = typeof MAINTENANCE_STATUSES[number]
export const TYPE_LABELS = { PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva' }
export const STATUS_LABELS = { OPEN: 'Em aberto', IN_PROGRESS: 'Em andamento', DONE: 'Concluída', CANCELED: 'Cancelada' }

export type MaintenanceItem =
  | { kind: 'PART'; description: string; quantity: string; unitPrice: string }
  | { kind: 'LABOR'; description: string; amount: string }
export type PricedItem = MaintenanceItem & { subtotal: string }
export interface MaintenanceAttributes {
  type: MaintenanceType
  description: string
  blocksVehicle: boolean
  workshop: string | null
  odometerKm: number | null
  expectedCompletionDate: string | null
  estimateItems: MaintenanceItem[] | null
}
export interface MaintenanceMetadata { reportedBy: string; reason: string }
export interface CreateMaintenanceInput extends MaintenanceAttributes, MaintenanceMetadata {
  vehicleId: string
  openedAt?: string
}
export interface UpdateMaintenanceInput extends MaintenanceAttributes, MaintenanceMetadata { expectedRevision: number }
export interface CloseMaintenanceInput extends MaintenanceMetadata {
  expectedRevision: number
  closedAt?: string
  confirmEstimate?: true
  actualItems?: MaintenanceItem[]
}
export interface MaintenanceOrder extends Omit<MaintenanceAttributes, 'estimateItems'> {
  id: string
  vehicleId: string
  status: MaintenanceStatus
  revision: number
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  closedBy: string | null
  vehicleSnapshot: Vehicle | null
  estimateItems: PricedItem[] | null
  estimatedTotal: string | null
  actualItems: PricedItem[] | null
  cost: string | null
  finalCost: string | null
}
export interface MaintenanceFilters {
  vehicleId?: string
  type?: MaintenanceType
  status?: MaintenanceStatus
  from?: string
  to?: string
}
export interface MaintenanceList { items: MaintenanceOrder[]; totalSpent: string }

/** Espelha os dois perfis autorizados nas cinco operações do backend. */
export function canManageMaintenance(profile: Profile | null): boolean {
  return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
}

export function isActiveOrder(order: MaintenanceOrder): boolean {
  return order.status === 'OPEN' || order.status === 'IN_PROGRESS'
}

/** Formata centavos canônicos sem transformar valores desconhecidos em gratuidade. */
export function formatMoney(value: string | null): string {
  if (value === null) return 'Não informado'
  const [whole, cents] = value.split('.')
  return `R$ ${BigInt(whole!).toLocaleString('pt-BR')},${cents}`
}

/** Datas civis da oficina não sofrem deslocamento de fuso. */
export function formatCivilDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : 'Não informada'
}

export function formatInstant(value: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não informado'
}
