/** Tipos de combustível aceitos pela API FROTA-64. */
export const FUEL_TYPES = ['GASOLINE', 'ETHANOL', 'DIESEL', 'DIESEL_S10', 'GNV', 'FLEX', 'OTHER'] as const
export type FuelType = typeof FUEL_TYPES[number]

export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = {
  GASOLINE: 'Gasolina',
  ETHANOL: 'Etanol',
  DIESEL: 'Diesel',
  DIESEL_S10: 'Diesel S10',
  GNV: 'GNV',
  FLEX: 'Flex',
  OTHER: 'Outro',
}

export interface FuelingVersion {
  id: string
  vehicleId: string
  driverId: string | null
  fueledAt: string
  fuelType: FuelType
  liters: string
  totalValue: string
  odometerKm: number
  station: string | null
  vehicleSnapshot: Record<string, unknown> | null
  driverSnapshot: { id: string; name: string } | null
  isAnnulled: boolean
  reportedBy?: string
  notes?: string | null
  reason?: string | null
  evidenceDescription?: string | null
  attachmentUrl?: string | null
  createdBy?: string
  actorSnapshot?: Record<string, unknown> | null
  supersedesId?: string | null
  annulmentReason?: string | null
  revision?: number
  registeredAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface FuelingHistoryEvent {
  id: string
  eventType: 'RECORDED' | 'UPDATED' | 'RECTIFIED' | 'ANNULLED'
  occurredAt: string
  registeredAt: string
  reportedBy: string
  registeredBy: string
  actorSnapshot: Record<string, unknown>
  reason: string
  evidenceDescription: string | null
  attachmentUrl: string | null
  supersedesId: string | null
  isAnnulled: boolean
  beforeState: FuelingVersion | null
  afterState: FuelingVersion
}

export interface FuelingDetail {
  fueling: FuelingVersion
  currentId: string
  versions: FuelingVersion[]
  events: FuelingHistoryEvent[]
}

export interface FuelingList {
  items: FuelingVersion[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  totalLiters: string
  totalValue: string
}

export interface FuelingFilters {
  vehicleId?: string
  driverId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface CreateFuelingInput {
  vehicleId: string
  driverId?: string | null
  fueledAt: string
  fuelType: FuelType
  liters: string
  totalValue: string
  odometerKm: number
  station?: string | null
  reportedBy: string
  reason: string
  evidenceDescription?: string | null
  attachmentUrl?: string | null
  notes?: string | null
}

export interface RectifyFuelingInput extends Partial<Pick<CreateFuelingInput,
  'driverId' | 'fueledAt' | 'fuelType' | 'liters' | 'totalValue' | 'odometerKm' | 'station' | 'notes'>> {
  expectedRevision: number
  reportedBy: string
  reason: string
  evidenceDescription?: string | null
  attachmentUrl?: string | null
}
