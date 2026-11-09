import type { Vehicle, VehicleActorSnapshot, VehicleStatus } from './vehicle.types'
import type { UserRole } from './auth'

/** Perfis atuais autorizados a consultar e gerenciar documentos de veículos. */
export const VEHICLE_DOCUMENT_MANAGER_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const satisfies readonly UserRole[]

/** Tipos de documentos obrigatórios ou contratuais de veículos da frota. */
export const VEHICLE_DOCUMENT_TYPES = [
  'CRLV',
  'LICENSING',
  'IPVA',
  'INSURANCE',
  'LEASE_CONTRACT',
  'OTHER',
] as const
export type VehicleDocumentType = typeof VEHICLE_DOCUMENT_TYPES[number]

/** Situações calculadas para documentos de veículos conforme vigência, renovação e anulação. */
export const VEHICLE_DOCUMENT_STATUSES = [
  'VALID',
  'EXPIRING',
  'EXPIRED',
  'RENEWED',
  'ANNULLED',
] as const
export type VehicleDocumentStatus = typeof VEHICLE_DOCUMENT_STATUSES[number]

/** Tipos de eventos registrados na trilha imutável de documentos desta história. */
export const VEHICLE_DOCUMENT_EVENT_TYPES = [
  'REGISTERED',
  'RENEWED',
  'UPDATED',
  'ANNULLED',
] as const
export type VehicleDocumentEventType = typeof VEHICLE_DOCUMENT_EVENT_TYPES[number]

/** Metadados obrigatórios de autoria fática e justificativa operacional. */
export interface VehicleDocumentMetadata {
  reportedBy: string
  reason: string
}

/** Atributos editáveis e normalizados de um documento de veículo. */
export interface VehicleDocumentAttributes {
  documentNumber: string | null
  issuedAt: string | null
  expiresAt: string
  notes: string | null
}

/** Dados de entrada para cadastro ou renovação de documento de veículo. */
export interface CreateVehicleDocumentInput extends VehicleDocumentMetadata {
  vehicleId: string
  documentType: VehicleDocumentType
  documentNumber?: string | null
  issuedAt?: string | null
  expiresAt: string
  notes?: string | null
  supersedesId?: string | null
}

/** Dados de entrada para correção de documento sob revisão otimista. */
export interface UpdateVehicleDocumentInput extends Partial<VehicleDocumentAttributes>, VehicleDocumentMetadata {
  expectedRevision: number
}

/** Dados de entrada para anulação justificada de documento sob revisão otimista. */
export interface AnnulVehicleDocumentInput extends VehicleDocumentMetadata {
  expectedRevision: number
}

/** Resumo do veículo vinculado ao documento nas listagens e detalhes. */
export interface VehicleDocumentVehicleSummary {
  licensePlate: string
  model: string | null
  status: VehicleStatus
}

/** Linha persistida do documento retornada pelo repositório antes do cálculo de vigência. */
export interface VehicleDocumentRecord extends VehicleDocumentAttributes {
  id: string
  vehicleId: string
  vehicle: VehicleDocumentVehicleSummary
  documentType: VehicleDocumentType
  supersedesId: string | null
  supersededById: string | null
  isAnnulled: boolean
  annulmentReason: string | null
  vehicleSnapshot: Vehicle | null
  createdBy: string
  revision: number
  createdAt: Date
  updatedAt: Date
}

/** Documento enriquecido com situação calculada e contagem de dias até o vencimento. */
export interface VehicleDocument extends VehicleDocumentRecord {
  status: VehicleDocumentStatus
  daysUntilExpiration: number
}

/** Dados normalizados para inserção de um novo documento no repositório. */
export interface NewVehicleDocumentRow extends VehicleDocumentAttributes {
  vehicle: Vehicle
  documentType: VehicleDocumentType
  supersedesId: string | null
  actorId: string
}

/** Filtros recebidos na query string da listagem de documentos. */
export interface VehicleDocumentFilters {
  vehicleId?: string
  documentType?: VehicleDocumentType
  status?: VehicleDocumentStatus
}

/** Critérios sargáveis traduzidos pelo service para consulta SQL no repositório. */
export interface VehicleDocumentCriteria {
  vehicleId?: string | null
  documentType?: VehicleDocumentType | null
  isAnnulled?: boolean | null
  superseded?: boolean | null
  expiresFrom?: string | null
  expiresTo?: string | null
}

/** Evento de mutação a ser gravado em `fleet.vehicle_document_events`. */
export interface VehicleDocumentEvent {
  documentId: string
  eventType: VehicleDocumentEventType
  actor: VehicleActorSnapshot
  metadata: VehicleDocumentMetadata
  before: VehicleDocumentRecord | null
  after: VehicleDocumentRecord
}

/** Identificação pública do operador na linha do tempo (sem expor e-mail, em conformidade com LGPD). */
export interface VehicleDocumentEventActor {
  id: string
  name: string
  role: string
}

/** Entrada da linha do tempo retornada na consulta detalhada do documento. */
export interface VehicleDocumentTimelineEntry {
  id: string
  eventType: VehicleDocumentEventType
  occurredAt: Date
  registeredAt: Date
  reportedBy: string
  reason: string
  actor: VehicleDocumentEventActor
  before: VehicleDocumentRecord | null
  after: VehicleDocumentRecord
}

/** Resposta de listagem de documentos e de alerta de vencimentos. */
export interface VehicleDocumentList {
  referenceDate: string
  alertDays: number
  items: VehicleDocument[]
}

/** Resposta detalhada de um documento com sua linha do tempo de eventos. */
export interface VehicleDocumentDetail extends VehicleDocument {
  events: VehicleDocumentTimelineEntry[]
}

/** Erro de domínio traduzido pela borda HTTP, preservando mensagens operacionais. */
export class VehicleDocumentServiceError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
    this.name = 'VehicleDocumentServiceError'
  }
}
