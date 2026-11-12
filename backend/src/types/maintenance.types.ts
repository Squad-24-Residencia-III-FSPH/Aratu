import type { Vehicle, VehicleActorSnapshot } from './vehicle.types'

export const MAINTENANCE_TYPES = ['PREVENTIVE', 'CORRECTIVE'] as const
export const MAINTENANCE_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'] as const
export type MaintenanceType = typeof MAINTENANCE_TYPES[number]
export type MaintenanceStatus = typeof MAINTENANCE_STATUSES[number]
export const ACTIVE_MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = ['OPEN', 'IN_PROGRESS']

export type MaintenanceItem =
  | { kind: 'PART'; description: string; quantity: string; unitPrice: string }
  | { kind: 'LABOR'; description: string; amount: string }
export type PricedMaintenanceItem = MaintenanceItem & { subtotal: string }

export interface MaintenanceMetadata {
  reportedBy: string
  reason: string
}

export interface MaintenanceAttributes {
  type: MaintenanceType
  description: string
  blocksVehicle: boolean
  workshop: string | null
  odometerKm: number | null
  expectedCompletionDate: string | null
  estimateItems: MaintenanceItem[] | null
}

export interface CreateMaintenanceInput extends MaintenanceMetadata {
  vehicleId: string
  type: MaintenanceType
  description: string
  blocksVehicle: boolean
  workshop?: string | null
  odometerKm?: number | null
  expectedCompletionDate?: string | null
  estimateItems?: MaintenanceItem[] | null
  openedAt?: string
}

export interface UpdateMaintenanceInput extends Partial<MaintenanceAttributes>, MaintenanceMetadata {
  expectedRevision: number
}

export interface CloseMaintenanceInput extends MaintenanceMetadata {
  expectedRevision: number
  closedAt?: string
  confirmEstimate?: boolean
  actualItems?: MaintenanceItem[]
  cost?: string
}

export interface MaintenanceOrder extends MaintenanceAttributes {
  id: string
  vehicleId: string
  status: MaintenanceStatus
  openedAt: Date
  closedAt: Date | null
  cost: string | null
  actualItems: MaintenanceItem[] | null
  vehicleSnapshot: Vehicle | null
  createdBy: string
  closedBy: string | null
  revision: number
  createdAt: Date
  updatedAt: Date
}

export interface MaintenanceDetail extends Omit<MaintenanceOrder, 'estimateItems' | 'actualItems'> {
  estimateItems: PricedMaintenanceItem[] | null
  estimatedTotal: string | null
  actualItems: PricedMaintenanceItem[] | null
  finalCost: string | null
}

export interface MaintenanceFilters {
  vehicleId?: string
  type?: MaintenanceType
  status?: MaintenanceStatus
  from?: string
  to?: string
}

export interface MaintenanceList {
  items: MaintenanceDetail[]
  totalSpent: string
}

export interface MaintenanceEvent {
  orderId: string
  eventType: 'OPENED' | 'UPDATED' | 'CLOSED'
  occurredAt: Date
  actor: VehicleActorSnapshot
  metadata: MaintenanceMetadata
  before: MaintenanceOrder | null
  after: MaintenanceOrder
  openingRequest?: Record<string, unknown>
}

/** Erro de domínio traduzido pela borda HTTP, preservando mensagens operacionais. */
export class MaintenanceServiceError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
    this.name = 'MaintenanceServiceError'
  }
}
