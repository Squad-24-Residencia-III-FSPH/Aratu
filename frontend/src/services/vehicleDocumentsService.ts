import type { ApiRequest } from '../api/client'
import { VEHICLE_DOCUMENT_STATUSES, VEHICLE_DOCUMENT_TYPES } from '../vehicleDocuments/vehicleDocumentTypes.ts'
import type {
  CreateVehicleDocumentInput, UpdateVehicleDocumentInput, VehicleDocument, VehicleDocumentDetail,
  VehicleDocumentEvent, VehicleDocumentFilters, VehicleDocumentList,
} from '../vehicleDocuments/vehicleDocumentTypes'

const INVALID_RESPONSE = 'A resposta de documentos de veículos da API está em um formato inválido.'
type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isNullableString(value: unknown): value is string | null { return typeof value === 'string' || value === null }
function readError(body: unknown, fallback: string): string { return isRecord(body) && typeof body.erro === 'string' ? body.erro : fallback }

function parseDocument(value: unknown): VehicleDocument {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.vehicleId !== 'string'
    || !isRecord(value.vehicle) || typeof value.vehicle.licensePlate !== 'string'
    || !isNullableString(value.vehicle.model) || typeof value.vehicle.status !== 'string'
    || typeof value.documentType !== 'string' || !VEHICLE_DOCUMENT_TYPES.includes(value.documentType as typeof VEHICLE_DOCUMENT_TYPES[number])
    || !isNullableString(value.documentNumber) || !isNullableString(value.issuedAt)
    || typeof value.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.expiresAt)
    || !isNullableString(value.notes) || !isNullableString(value.supersedesId) || !isNullableString(value.supersededById)
    || typeof value.isAnnulled !== 'boolean' || !isNullableString(value.annulmentReason)
    || typeof value.status !== 'string' || !VEHICLE_DOCUMENT_STATUSES.includes(value.status as typeof VEHICLE_DOCUMENT_STATUSES[number])
    || typeof value.daysUntilExpiration !== 'number' || !Number.isInteger(value.daysUntilExpiration)
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') throw new Error(INVALID_RESPONSE)
  return {
    id: value.id, vehicleId: value.vehicleId,
    vehicle: { licensePlate: value.vehicle.licensePlate, model: value.vehicle.model, status: value.vehicle.status },
    documentType: value.documentType as VehicleDocument['documentType'], documentNumber: value.documentNumber,
    issuedAt: value.issuedAt, expiresAt: value.expiresAt, notes: value.notes,
    supersedesId: value.supersedesId, supersededById: value.supersededById,
    isAnnulled: value.isAnnulled, annulmentReason: value.annulmentReason,
    status: value.status as VehicleDocument['status'], daysUntilExpiration: value.daysUntilExpiration,
    revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt,
  }
}

function parseList(value: unknown): VehicleDocumentList {
  if (!isRecord(value) || typeof value.referenceDate !== 'string' || typeof value.alertDays !== 'number' || !Array.isArray(value.items)) {
    throw new Error(INVALID_RESPONSE)
  }
  return { referenceDate: value.referenceDate, alertDays: value.alertDays, items: value.items.map(parseDocument) }
}

function parseEvent(value: unknown): VehicleDocumentEvent {
  if (!isRecord(value) || typeof value.id !== 'string'
    || !['REGISTERED', 'RENEWED', 'UPDATED', 'ANNULLED'].includes(String(value.eventType))
    || typeof value.occurredAt !== 'string' || typeof value.registeredAt !== 'string'
    || typeof value.reportedBy !== 'string' || typeof value.reason !== 'string' || !isRecord(value.actor)
    || typeof value.actor.id !== 'string' || typeof value.actor.name !== 'string' || typeof value.actor.role !== 'string') {
    throw new Error(INVALID_RESPONSE)
  }
  return { id: value.id, eventType: value.eventType as VehicleDocumentEvent['eventType'], occurredAt: value.occurredAt,
    registeredAt: value.registeredAt, reportedBy: value.reportedBy, reason: value.reason,
    actor: { id: value.actor.id, name: value.actor.name, role: value.actor.role } }
}

async function readJson<T>(response: Response, fallback: string, parse: (value: unknown) => T): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(readError(body, fallback))
  return parse(body)
}

function json(input: object): RequestInit { return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } }

export function buildVehicleDocumentsQuery(filters: VehicleDocumentFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId)
  if (filters.documentType) params.set('documentType', filters.documentType)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function listVehicleDocuments(api: ApiRequest, filters: VehicleDocumentFilters = {}): Promise<VehicleDocumentList> {
  return readJson(await api(`/vehicle-documents${buildVehicleDocumentsQuery(filters)}`), 'Não foi possível carregar os documentos dos veículos.', parseList)
}

export async function listExpiringVehicleDocuments(api: ApiRequest, days = 30): Promise<VehicleDocumentList> {
  return readJson(await api(`/vehicle-documents/expiring?days=${encodeURIComponent(String(days))}`), 'Não foi possível consultar os vencimentos.', parseList)
}

export async function getVehicleDocument(api: ApiRequest, id: string): Promise<VehicleDocumentDetail> {
  return readJson(await api(`/vehicle-documents/${encodeURIComponent(id)}`), 'Não foi possível consultar o documento.', (value) => {
    if (!isRecord(value) || !Array.isArray(value.events)) throw new Error(INVALID_RESPONSE)
    return { ...parseDocument(value), events: value.events.map(parseEvent) }
  })
}

export async function createVehicleDocument(api: ApiRequest, input: CreateVehicleDocumentInput): Promise<VehicleDocument> {
  return readJson(await api('/vehicle-documents', { method: 'POST', ...json(input) }), 'Não foi possível cadastrar o documento.', parseDocument)
}

export async function updateVehicleDocument(api: ApiRequest, id: string, input: UpdateVehicleDocumentInput): Promise<VehicleDocument> {
  return readJson(await api(`/vehicle-documents/${encodeURIComponent(id)}`, { method: 'PUT', ...json(input) }), 'Não foi possível corrigir o documento.', parseDocument)
}

export async function annulVehicleDocument(api: ApiRequest, id: string, input: { expectedRevision: number; reportedBy: string; reason: string }): Promise<VehicleDocument> {
  return readJson(await api(`/vehicle-documents/${encodeURIComponent(id)}/annul`, { method: 'PATCH', ...json(input) }), 'Não foi possível anular o documento.', parseDocument)
}
