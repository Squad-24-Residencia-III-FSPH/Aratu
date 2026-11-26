export const FINES_PATH = '/frota/multas'
export const FINE_STATUSES = ['PENDING', 'PAID', 'CONTESTED', 'CANCELED'] as const
export type FineStatus = typeof FINE_STATUSES[number]
export const FINE_TRANSITIONS: Record<FineStatus, readonly FineStatus[]> = {
  PENDING: ['CONTESTED', 'PAID', 'CANCELED'], CONTESTED: ['PENDING', 'PAID', 'CANCELED'],
  PAID: ['PENDING'], CANCELED: ['PENDING'],
}
export const FINE_STATUS_LABELS: Record<FineStatus, string> = {
  PENDING: 'Pendente', PAID: 'Paga', CONTESTED: 'Em contestação', CANCELED: 'Cancelada',
}
export interface Fine {
  id: string
  vehicleId: string
  driverId: string | null
  tripId: string | null
  infractionAt: string
  infractionCode: string
  description: string
  location: string | null
  amount: string
  dueAt: string | null
  notes: string | null
  status: FineStatus
  paidAt: string | null
  cancellationReason: string | null
  createdBy: string
  revision: number
  createdAt: string
  updatedAt: string
  vehicle: { id: string; licensePlate: string; model: string | null }
  driver: { id: string; name: string } | null
  vehicleSnapshot: { id: string; licensePlate: string; model: string | null; source: string; capturedAt: string } | null
  driverSnapshot: { id: string; name: string; source: string; capturedAt: string } | null
  tripSnapshot: { id: string; vehicleId: string; driverId: string; status: string; startedAt: string | null; finishedAt: string | null; capturedAt: string } | null
}
export interface FineTimelineEntry {
  id: string
  eventType: string
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  evidenceDescription: string | null
  attachmentUrl: string | null
  actor: { id: string; name: string; role: string }
}
export interface FineDetail extends Fine { events: FineTimelineEntry[] }
export interface FineDriverSuggestion {
  tripId: string
  driverId: string
  driverName: string
  vehicleId: string
  startedAt: string
  finishedAt: string | null
  tripStatus: string
  nameSource: 'TRIP_SNAPSHOT' | 'CURRENT_REGISTRY'
}
export interface FineMetadata { reportedBy: string; reason: string; evidenceDescription: string; attachmentUrl?: string | null }
export interface CreateFineInput extends FineMetadata {
  vehicleId: string; driverId?: string | null; tripId?: string | null; infractionAt: string
  infractionCode: string; description: string; location?: string | null; amount: string; dueAt?: string | null; notes?: string | null
}
export interface FineFilters { vehicleId?: string; driverId?: string; status?: FineStatus; from?: string; to?: string }
export function canManageFines(profile: string | null): boolean { return profile === 'GESTOR' || profile === 'ADMINISTRADOR' }
