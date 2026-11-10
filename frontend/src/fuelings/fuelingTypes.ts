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
}
