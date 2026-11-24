import type { Profile } from '../auth/profiles.ts'
import type { StatusTone } from '../components/ui/StatusChip.tsx'
import type { Vehicle, VehicleStatus } from '../vehicles/vehicleTypes.ts'

/** Caminho canônico da tela de documentos de veículos e vencimentos (FROTA-70). */
export const VEHICLE_DOCUMENTS_PATH = '/vehicle-documents'

/** Perfis autorizados a consultar e gerenciar documentos de veículos, espelhando `vehicle-documents.routes.ts`. */
export const VEHICLE_DOCUMENT_MANAGER_ROLES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Limites aceitos pelo backend para a janela de alerta em dias corridos (`GET /vehicle-documents/expiring?days=`). */
export const MIN_ALERT_DAYS = 1
export const MAX_ALERT_DAYS = 365
export const DEFAULT_ALERT_DAYS = 30

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

/** Situações calculadas pelo backend para documentos de veículos. */
export const VEHICLE_DOCUMENT_STATUSES = [
  'VALID',
  'EXPIRING',
  'EXPIRED',
  'RENEWED',
  'ANNULLED',
] as const
export type VehicleDocumentStatus = typeof VEHICLE_DOCUMENT_STATUSES[number]

/** Tipos de eventos da trilha imutável de documentos de veículos. */
export const VEHICLE_DOCUMENT_EVENT_TYPES = [
  'REGISTERED',
  'RENEWED',
  'UPDATED',
  'ANNULLED',
] as const
export type VehicleDocumentEventType = typeof VEHICLE_DOCUMENT_EVENT_TYPES[number]

export const VEHICLE_DOCUMENT_TYPE_LABELS: Readonly<Record<VehicleDocumentType, string>> = {
  CRLV: 'CRLV',
  LICENSING: 'Licenciamento',
  IPVA: 'IPVA',
  INSURANCE: 'Seguro',
  LEASE_CONTRACT: 'Contrato de locação',
  OTHER: 'Outro',
}

export const VEHICLE_DOCUMENT_STATUS_LABELS: Readonly<Record<VehicleDocumentStatus, string>> = {
  VALID: 'Válido',
  EXPIRING: 'A vencer',
  EXPIRED: 'Vencido',
  RENEWED: 'Renovado',
  ANNULLED: 'Anulado',
}

export const VEHICLE_DOCUMENT_STATUS_TONES: Readonly<Record<VehicleDocumentStatus, StatusTone>> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'warning',
  RENEWED: 'info',
  ANNULLED: 'neutral',
}

export const VEHICLE_DOCUMENT_EVENT_LABELS: Readonly<Record<VehicleDocumentEventType, string>> = {
  REGISTERED: 'Cadastrado',
  RENEWED: 'Renovado',
  UPDATED: 'Corrigido',
  ANNULLED: 'Anulado',
}

export const VEHICLE_DOCUMENT_EVENT_TONES: Readonly<Record<VehicleDocumentEventType, StatusTone>> = {
  REGISTERED: 'success',
  RENEWED: 'info',
  UPDATED: 'warning',
  ANNULLED: 'neutral',
}

/** Resumo do veículo vinculado ao documento nas listagens e detalhes. */
export interface VehicleDocumentVehicleSummary {
  licensePlate: string
  model: string | null
  status: VehicleStatus
}

/** Registro persistido de documento de veículo retornado nos snapshots da trilha. */
export interface VehicleDocumentRecord {
  id: string
  vehicleId: string
  vehicle: VehicleDocumentVehicleSummary
  documentType: VehicleDocumentType
  documentNumber: string | null
  issuedAt: string | null
  expiresAt: string
  notes: string | null
  supersedesId: string | null
  supersededById: string | null
  isAnnulled: boolean
  annulmentReason: string | null
  vehicleSnapshot: Vehicle | null
  createdBy: string
  revision: number
  createdAt: string
  updatedAt: string
}

/** Documento enriquecido com situação calculada e contagem de dias até o vencimento. */
export interface VehicleDocument extends VehicleDocumentRecord {
  status: VehicleDocumentStatus
  daysUntilExpiration: number
}

/** Identificação pública do operador na linha do tempo (sem e-mail, conforme LGPD). */
export interface VehicleDocumentEventActor {
  id: string
  name: string
  role: string
}

/** Entrada da linha do tempo retornada em `GET /vehicle-documents/:id`. */
export interface VehicleDocumentTimelineEntry {
  id: string
  eventType: VehicleDocumentEventType
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  actor: VehicleDocumentEventActor
  before: VehicleDocumentRecord | null
  after: VehicleDocumentRecord
}

/** Resposta de `GET /vehicle-documents` e `GET /vehicle-documents/expiring`. */
export interface VehicleDocumentList {
  referenceDate: string
  alertDays: number
  items: VehicleDocument[]
}

/** Resposta detalhada de `GET /vehicle-documents/:id` com linha do tempo. */
export interface VehicleDocumentDetail extends VehicleDocument {
  events: VehicleDocumentTimelineEntry[]
}

/** Filtros suportados por `GET /vehicle-documents`. */
export interface VehicleDocumentFilters {
  vehicleId?: string
  documentType?: VehicleDocumentType
  status?: VehicleDocumentStatus
}

/** Dados de entrada para cadastro ou renovação (`POST /vehicle-documents`). */
export interface CreateVehicleDocumentInput {
  vehicleId: string
  documentType: VehicleDocumentType
  documentNumber?: string | null
  issuedAt?: string | null
  expiresAt: string
  notes?: string | null
  supersedesId?: string | null
  reportedBy: string
  reason: string
}

/** Dados de entrada para correção sob revisão otimista (`PUT /vehicle-documents/:id`). */
export interface UpdateVehicleDocumentInput {
  expectedRevision: number
  documentNumber?: string | null
  issuedAt?: string | null
  expiresAt?: string
  notes?: string | null
  reportedBy: string
  reason: string
}

/** Dados de entrada para anulação justificada (`PATCH /vehicle-documents/:id/annul`). */
export interface AnnulVehicleDocumentInput {
  expectedRevision: number
  reportedBy: string
  reason: string
}

/** Indica se o perfil autenticado pode consultar e gerenciar documentos de veículos. */
export function canManageVehicleDocuments(profile: Profile | null): boolean {
  return profile !== null && VEHICLE_DOCUMENT_MANAGER_ROLES.includes(profile)
}

/** Verifica se o texto corresponde a um tipo de documento conhecido pelo contrato. */
export function isVehicleDocumentType(value: unknown): value is VehicleDocumentType {
  return typeof value === 'string' && VEHICLE_DOCUMENT_TYPES.some((item) => item === value)
}

/** Verifica se o texto corresponde a uma situação de documento conhecida pelo contrato. */
export function isVehicleDocumentStatus(value: unknown): value is VehicleDocumentStatus {
  return typeof value === 'string' && VEHICLE_DOCUMENT_STATUSES.some((item) => item === value)
}

/** Verifica se o texto corresponde a um evento de documento conhecido pelo contrato. */
export function isVehicleDocumentEventType(value: unknown): value is VehicleDocumentEventType {
  return typeof value === 'string' && VEHICLE_DOCUMENT_EVENT_TYPES.some((item) => item === value)
}

/**
 * Valida a janela de alerta (em dias corridos de 1 a 365) informada pelo usuário ou URL.
 *
 * @returns Número inteiro validado ou erro legível em português.
 */
export function parseAlertDaysInput(raw: string): { days?: number; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return { error: 'Informe a janela do alerta como número inteiro entre 1 e 365 dias.' }
  }
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < MIN_ALERT_DAYS || parsed > MAX_ALERT_DAYS) {
    return { error: 'Informe a janela do alerta como número inteiro entre 1 e 365 dias.' }
  }
  return { days: parsed }
}

/** Formata a contagem relativa retornada pelo backend sem recalcular datas no cliente. */
export function formatDaysUntilExpiration(days: number, status: VehicleDocumentStatus): string {
  if (status === 'ANNULLED') return 'Documento anulado'
  if (status === 'RENEWED') return 'Substituído por renovação'
  if (days < 0) {
    const overdue = Math.abs(days)
    return overdue === 1 ? 'Vencido há 1 dia' : `Vencido há ${overdue} dias`
  }
  if (days === 0) return 'Vence hoje (data de referência)'
  return days === 1 ? 'Vence em 1 dia' : `Vence em ${days} dias`
}
