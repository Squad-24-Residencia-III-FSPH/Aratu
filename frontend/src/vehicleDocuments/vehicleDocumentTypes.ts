export const VEHICLE_DOCUMENTS_PATH = '/frota/documentos'
export const VEHICLE_DOCUMENT_TYPES = ['CRLV', 'LICENSING', 'IPVA', 'INSURANCE', 'LEASE_CONTRACT', 'OTHER'] as const
export type VehicleDocumentType = typeof VEHICLE_DOCUMENT_TYPES[number]
export const VEHICLE_DOCUMENT_STATUSES = ['VALID', 'EXPIRING', 'EXPIRED', 'RENEWED', 'ANNULLED'] as const
export type VehicleDocumentStatus = typeof VEHICLE_DOCUMENT_STATUSES[number]

export interface VehicleDocument {
  id: string
  vehicleId: string
  vehicle: { licensePlate: string; model: string | null; status: string }
  documentType: VehicleDocumentType
  documentNumber: string | null
  issuedAt: string | null
  expiresAt: string
  notes: string | null
  supersedesId: string | null
  supersededById: string | null
  isAnnulled: boolean
  annulmentReason: string | null
  status: VehicleDocumentStatus
  daysUntilExpiration: number
  revision: number
  createdAt: string
  updatedAt: string
}

export interface VehicleDocumentEvent {
  id: string
  eventType: 'REGISTERED' | 'RENEWED' | 'UPDATED' | 'ANNULLED'
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  actor: { id: string; name: string; role: string }
}

export interface VehicleDocumentDetail extends VehicleDocument { events: VehicleDocumentEvent[] }
export interface VehicleDocumentList { referenceDate: string; alertDays: number; items: VehicleDocument[] }
export interface VehicleDocumentFilters { vehicleId?: string; documentType?: VehicleDocumentType; status?: VehicleDocumentStatus }
export interface VehicleDocumentMetadata { reportedBy: string; reason: string }
export interface CreateVehicleDocumentInput extends VehicleDocumentMetadata {
  vehicleId: string
  documentType: VehicleDocumentType
  documentNumber?: string | null
  issuedAt?: string | null
  expiresAt: string
  notes?: string | null
  supersedesId?: string | null
}
export interface UpdateVehicleDocumentInput extends VehicleDocumentMetadata {
  expectedRevision: number
  documentNumber?: string | null
  issuedAt?: string | null
  expiresAt?: string
  notes?: string | null
}

export const VEHICLE_DOCUMENT_TYPE_LABELS: Record<VehicleDocumentType, string> = {
  CRLV: 'CRLV', LICENSING: 'Licenciamento', IPVA: 'IPVA', INSURANCE: 'Seguro',
  LEASE_CONTRACT: 'Contrato de locação', OTHER: 'Outro',
}
export const VEHICLE_DOCUMENT_STATUS_LABELS: Record<VehicleDocumentStatus, string> = {
  VALID: 'Vigente', EXPIRING: 'Vence em breve', EXPIRED: 'Vencido', RENEWED: 'Renovado', ANNULLED: 'Anulado',
}

export function canManageVehicleDocuments(profile: string | null): boolean {
  return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
}
