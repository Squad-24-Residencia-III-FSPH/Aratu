export const FINE_STATUS_LABELS = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  CONTESTED: 'Em recurso',
  CANCELED: 'Cancelada',
} as const

export type FineStatus = keyof typeof FINE_STATUS_LABELS
export type FineStatusAction = 'PAID' | 'CONTESTED'

export interface Fine {
  id: string
  revision: number
  status: FineStatus
  infractionAt: string
  infractionCode: string
  description: string
  amount: string
  dueAt: string | null
  vehicle: { licensePlate: string }
  driver: { name: string } | null
  vehicleSnapshot: { licensePlate: string } | null
  driverSnapshot: { name: string } | null
}

export interface FineFilters {
  vehicleId: string
  driverId: string
  status: string
  from: string
  to: string
}

export interface FineMetadata {
  reportedBy: string
  reason: string
  evidenceDescription: string
}

export interface CreateFineInput extends FineMetadata {
  vehicleId: string
  driverId: string | null
  tripId: string | null
  infractionAt: string
  infractionCode: string
  description: string
  amount: string
  dueAt: string | null
}

export interface FineDriverSuggestion {
  tripId: string
  driverId: string
  driverName: string
  startedAt: string
}

export type FineStatusInput = FineMetadata & { expectedRevision: number } & (
  { status: 'PAID'; paidAt: string } | { status: 'CONTESTED'; occurredAt: string }
)
