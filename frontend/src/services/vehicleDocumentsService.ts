import type { ApiRequest } from '../api/client.ts'
import { VEHICLE_STATUSES } from '../vehicles/vehicleTypes.ts'
import type { Vehicle, VehicleStatus } from '../vehicles/vehicleTypes.ts'
import {
  isVehicleDocumentEventType,
  isVehicleDocumentStatus,
  isVehicleDocumentType,
} from '../types/vehicleDocument.ts'
import type {
  AnnulVehicleDocumentInput,
  CreateVehicleDocumentInput,
  UpdateVehicleDocumentInput,
  VehicleDocument,
  VehicleDocumentDetail,
  VehicleDocumentFilters,
  VehicleDocumentList,
  VehicleDocumentRecord,
  VehicleDocumentTimelineEntry,
  VehicleDocumentVehicleSummary,
} from '../types/vehicleDocument.ts'

const INVALID_RESPONSE_MESSAGE = 'A resposta de documentos da API está em um formato inválido.'
const UNAVAILABLE_MESSAGE = 'Não foi possível carregar os documentos de veículos.'

/** Classificação das falhas tratadas pela tela de documentos de veículos. */
export type VehicleDocumentRequestErrorKind =
  | 'validation'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unavailable'

/** Erro tipado de comunicação com `/vehicle-documents`, preservando HTTP status e orientação. */
export class VehicleDocumentRequestError extends Error {
  readonly kind: VehicleDocumentRequestErrorKind
  readonly status: number | null

  constructor(kind: VehicleDocumentRequestErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'VehicleDocumentRequestError'
    this.kind = kind
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function parseNullableText(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function parseVehicleSummary(value: unknown): VehicleDocumentVehicleSummary {
  if (!isRecord(value)) throw new Error(INVALID_RESPONSE_MESSAGE)
  const model = parseNullableText(value.model)
  if (
    typeof value.licensePlate !== 'string'
    || !value.licensePlate.trim()
    || model === undefined
    || !isOneOf(value.status, VEHICLE_STATUSES)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    licensePlate: value.licensePlate,
    model,
    status: value.status as VehicleStatus,
  }
}

function parseVehicleDocumentRecord(value: unknown): VehicleDocumentRecord {
  if (!isRecord(value)) throw new Error(INVALID_RESPONSE_MESSAGE)
  const documentNumber = parseNullableText(value.documentNumber)
  const issuedAt = parseNullableText(value.issuedAt)
  const notes = parseNullableText(value.notes)
  const supersedesId = parseNullableText(value.supersedesId)
  const supersededById = parseNullableText(value.supersededById)
  const annulmentReason = parseNullableText(value.annulmentReason)

  if (
    typeof value.id !== 'string' || !value.id.trim()
    || typeof value.vehicleId !== 'string' || !value.vehicleId.trim()
    || !isVehicleDocumentType(value.documentType)
    || documentNumber === undefined
    || issuedAt === undefined
    || typeof value.expiresAt !== 'string' || !value.expiresAt.trim()
    || notes === undefined
    || supersedesId === undefined
    || supersededById === undefined
    || typeof value.isAnnulled !== 'boolean'
    || annulmentReason === undefined
    || (value.createdBy !== undefined && typeof value.createdBy !== 'string')
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }

  // Snapshots históricos de `before`/`after` em eventos vêm da tabela sem `vehicle` agregado.
  const vehicle = value.vehicle !== undefined
    ? parseVehicleSummary(value.vehicle)
    : isRecord(value.vehicleSnapshot)
      && typeof value.vehicleSnapshot.licensePlate === 'string'
      && isOneOf(value.vehicleSnapshot.status, VEHICLE_STATUSES)
      ? {
          licensePlate: value.vehicleSnapshot.licensePlate,
          model: parseNullableText(value.vehicleSnapshot.model) ?? null,
          status: value.vehicleSnapshot.status as VehicleStatus,
        }
      : {
          licensePlate: `Veículo #${value.vehicleId}`,
          model: null,
          status: 'AVAILABLE' as VehicleStatus,
        }

  return {
    id: value.id,
    vehicleId: value.vehicleId,
    vehicle,
    documentType: value.documentType,
    documentNumber,
    issuedAt,
    expiresAt: value.expiresAt,
    notes,
    supersedesId,
    supersededById,
    isAnnulled: value.isAnnulled,
    annulmentReason,
    vehicleSnapshot: isRecord(value.vehicleSnapshot) ? (value.vehicleSnapshot as unknown as Vehicle) : null,
    createdBy: typeof value.createdBy === 'string' ? value.createdBy : '',
    revision: value.revision,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function parseVehicleDocument(value: unknown): VehicleDocument {
  const base = parseVehicleDocumentRecord(value)
  if (!isRecord(value)) throw new Error(INVALID_RESPONSE_MESSAGE)
  if (
    !isVehicleDocumentStatus(value.status)
    || typeof value.daysUntilExpiration !== 'number'
    || !Number.isFinite(value.daysUntilExpiration)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    ...base,
    status: value.status,
    daysUntilExpiration: value.daysUntilExpiration,
  }
}

function parseVehicleDocumentList(value: unknown): VehicleDocumentList {
  if (!isRecord(value)) throw new Error(INVALID_RESPONSE_MESSAGE)
  if (
    typeof value.referenceDate !== 'string'
    || !value.referenceDate.trim()
    || typeof value.alertDays !== 'number'
    || !Number.isInteger(value.alertDays)
    || !Array.isArray(value.items)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    referenceDate: value.referenceDate,
    alertDays: value.alertDays,
    items: value.items.map(parseVehicleDocument),
  }
}

function parseTimelineEntry(value: unknown, fallbackRecord: VehicleDocumentRecord): VehicleDocumentTimelineEntry {
  if (!isRecord(value) || !isRecord(value.actor)) throw new Error(INVALID_RESPONSE_MESSAGE)
  if (
    typeof value.id !== 'string' || !value.id.trim()
    || !isVehicleDocumentEventType(value.eventType)
    || typeof value.occurredAt !== 'string'
    || typeof value.registeredAt !== 'string'
    || typeof value.reportedBy !== 'string'
    || typeof value.reason !== 'string'
    || typeof value.actor.id !== 'string'
    || typeof value.actor.name !== 'string'
    || typeof value.actor.role !== 'string'
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: value.id,
    eventType: value.eventType,
    occurredAt: value.occurredAt,
    registeredAt: value.registeredAt,
    reportedBy: value.reportedBy,
    reason: value.reason,
    actor: {
      id: value.actor.id,
      name: value.actor.name,
      role: value.actor.role,
    },
    before: value.before === undefined || value.before === null ? null : parseVehicleDocumentRecord(value.before),
    after: value.after === undefined ? fallbackRecord : parseVehicleDocumentRecord(value.after),
  }
}

function parseVehicleDocumentDetail(value: unknown): VehicleDocumentDetail {
  const doc = parseVehicleDocument(value)
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    ...doc,
    events: value.events.map((entry) => parseTimelineEntry(entry, doc)),
  }
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.erro === 'string' && body.erro.trim()) {
    return body.erro
  }
  return fallback
}

async function throwRequestError(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  const message = readErrorMessage(body, fallback)
  if (response.status === 403) throw new VehicleDocumentRequestError('forbidden', message, 403)
  if (response.status === 404) throw new VehicleDocumentRequestError('not-found', message, 404)
  if (response.status === 409) throw new VehicleDocumentRequestError('conflict', message, 409)
  if (response.status === 400 || response.status === 422) {
    throw new VehicleDocumentRequestError('validation', message, response.status)
  }
  throw new VehicleDocumentRequestError('unavailable', message, response.status)
}

function jsonBody(payload: object): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

/** Serializa os filtros suportados por `GET /vehicle-documents`. */
export function buildVehicleDocumentsQuery(filters: VehicleDocumentFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId)
  if (filters.documentType) params.set('documentType', filters.documentType)
  if (filters.status) params.set('status', filters.status)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Serializa o parâmetro opcional `days` suportado por `GET /vehicle-documents/expiring`. */
export function buildExpiringDocumentsQuery(days?: number): string {
  if (days === undefined) return ''
  const params = new URLSearchParams()
  params.set('days', String(days))
  return `?${params.toString()}`
}

/** Lista documentos de veículos aplicando filtros opcionais de veículo, tipo e situação. */
export async function listVehicleDocuments(
  api: ApiRequest,
  filters: VehicleDocumentFilters = {},
): Promise<VehicleDocumentList> {
  const response = await api(`/vehicle-documents${buildVehicleDocumentsQuery(filters)}`)
  if (!response.ok) await throwRequestError(response, UNAVAILABLE_MESSAGE)
  return parseVehicleDocumentList(await response.json().catch(() => null))
}

/** Lista documentos vigentes vencidos ou a vencer dentro da janela configurada. */
export async function listExpiringVehicleDocuments(
  api: ApiRequest,
  days = 30,
): Promise<VehicleDocumentList> {
  const response = await api(`/vehicle-documents/expiring${buildExpiringDocumentsQuery(days)}`)
  if (!response.ok) {
    await throwRequestError(response, 'Não foi possível consultar os vencimentos de documentos.')
  }
  return parseVehicleDocumentList(await response.json().catch(() => null))
}

/** Consulta o detalhe completo de um documento com sua linha do tempo cronológica. */
export async function getVehicleDocument(
  api: ApiRequest,
  id: string,
): Promise<VehicleDocumentDetail> {
  const response = await api(`/vehicle-documents/${encodeURIComponent(id)}`)
  if (!response.ok) {
    await throwRequestError(response, 'Não foi possível carregar os detalhes do documento.')
  }
  return parseVehicleDocumentDetail(await response.json().catch(() => null))
}

/** Cadastra um novo documento ou registra renovação encadeada (`supersedesId`). */
export async function createVehicleDocument(
  api: ApiRequest,
  input: CreateVehicleDocumentInput,
): Promise<VehicleDocument> {
  const response = await api('/vehicle-documents', { method: 'POST', ...jsonBody(input) })
  if (!response.ok) {
    await throwRequestError(response, 'Não foi possível cadastrar o documento.')
  }
  return parseVehicleDocument(await response.json().catch(() => null))
}

/** Corrige os atributos editáveis de um documento sob revisão otimista. */
export async function updateVehicleDocument(
  api: ApiRequest,
  id: string,
  input: UpdateVehicleDocumentInput,
): Promise<VehicleDocument> {
  const response = await api(`/vehicle-documents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    ...jsonBody(input),
  })
  if (!response.ok) {
    await throwRequestError(response, 'Não foi possível atualizar o documento.')
  }
  return parseVehicleDocument(await response.json().catch(() => null))
}

/** Anula justificadamente um documento preservando o histórico e restaurando o anterior se aplicável. */
export async function annulVehicleDocument(
  api: ApiRequest,
  id: string,
  input: AnnulVehicleDocumentInput,
): Promise<VehicleDocument> {
  const response = await api(`/vehicle-documents/${encodeURIComponent(id)}/annul`, {
    method: 'PATCH',
    ...jsonBody(input),
  })
  if (!response.ok) {
    await throwRequestError(response, 'Não foi possível anular o documento.')
  }
  return parseVehicleDocument(await response.json().catch(() => null))
}
