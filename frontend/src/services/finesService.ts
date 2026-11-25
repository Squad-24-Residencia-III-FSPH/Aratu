import type { ApiRequest } from '../api/client.ts'
import { FINE_STATUSES } from '../types/fine.ts'
import type {
  ChangeFineStatusInput,
  CreateFineInput,
  Fine,
  FineContext,
  FineDetail,
  FineDriverSnapshot,
  FineDriverSuggestion,
  FineFilters,
  FineSnapshotSource,
  FineTimelineEntry,
  FineTripSnapshot,
  FineVehicleSnapshot,
  UpdateFineInput,
} from '../types/fine.ts'

const INVALID_FINE_MESSAGE = 'Não foi possível interpretar os dados da multa recebidos da API.'
const INVALID_SUGGESTION_MESSAGE = 'Não foi possível interpretar as sugestões de motorista recebidas da API.'

/** Erro HTTP de multas que preserva status e mensagem orientadora do backend. */
export class FineRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'FineRequestError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isSnapshotSource(value: unknown): value is FineSnapshotSource {
  return value === 'TRIP_SNAPSHOT' || value === 'CURRENT_REGISTRY'
}

function isFineStatus(value: unknown): value is Fine['status'] {
  return typeof value === 'string' && FINE_STATUSES.some((status) => status === value)
}

function parseFineVehicle(value: unknown): Fine['vehicle'] {
  if (!isRecord(value) || !isPositiveId(value.id) || typeof value.licensePlate !== 'string' || !isNullableString(value.model)) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return { id: value.id, licensePlate: value.licensePlate, model: value.model }
}

function parseFineDriver(value: unknown): Fine['driver'] {
  if (value === null) return null
  if (!isRecord(value) || !isPositiveId(value.id) || typeof value.name !== 'string') {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return { id: value.id, name: value.name }
}

function parseVehicleSnapshot(value: unknown): FineVehicleSnapshot | null {
  if (value === null) return null
  if (
    !isRecord(value)
    || !isPositiveId(value.id)
    || typeof value.licensePlate !== 'string'
    || !isNullableString(value.model)
    || !isSnapshotSource(value.source)
    || !isIsoInstant(value.capturedAt)
  ) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return {
    id: value.id,
    licensePlate: value.licensePlate,
    model: value.model,
    source: value.source,
    capturedAt: value.capturedAt,
  }
}

function parseDriverSnapshot(value: unknown): FineDriverSnapshot | null {
  if (value === null) return null
  if (
    !isRecord(value)
    || !isPositiveId(value.id)
    || typeof value.name !== 'string'
    || !isSnapshotSource(value.source)
    || !isIsoInstant(value.capturedAt)
  ) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return {
    id: value.id,
    name: value.name,
    source: value.source,
    capturedAt: value.capturedAt,
  }
}

function parseTripSnapshot(value: unknown): FineTripSnapshot | null {
  if (value === null) return null
  if (
    !isRecord(value)
    || !isPositiveId(value.id)
    || !isPositiveId(value.vehicleId)
    || !isPositiveId(value.driverId)
    || !(value.startedAt === null || isIsoInstant(value.startedAt))
    || !(value.finishedAt === null || isIsoInstant(value.finishedAt))
    || typeof value.status !== 'string'
    || !isIsoInstant(value.capturedAt)
  ) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return {
    id: value.id,
    vehicleId: value.vehicleId,
    driverId: value.driverId,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    status: value.status,
    capturedAt: value.capturedAt,
  }
}

function parseFine(value: unknown): Fine {
  if (
    !isRecord(value)
    || !isPositiveId(value.id)
    || !isPositiveId(value.vehicleId)
    || !(value.driverId === null || isPositiveId(value.driverId))
    || !(value.tripId === null || isPositiveId(value.tripId))
    || !isIsoInstant(value.infractionAt)
    || typeof value.infractionCode !== 'string'
    || typeof value.description !== 'string'
    || !isNullableString(value.location)
    || typeof value.amount !== 'string' || !/^\d+\.\d{2}$/.test(value.amount)
    || !(value.dueAt === null || (typeof value.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dueAt)))
    || !isNullableString(value.notes)
    || !isFineStatus(value.status)
    || !(value.paidAt === null || isIsoInstant(value.paidAt))
    || !isNullableString(value.cancellationReason)
    || !isPositiveId(value.createdBy)
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
    || !isIsoInstant(value.createdAt)
    || !isIsoInstant(value.updatedAt)
  ) {
    throw new Error(INVALID_FINE_MESSAGE)
  }

  const vehicle = parseFineVehicle(value.vehicle)
  const driver = parseFineDriver(value.driver)
  const context: FineContext = {
    vehicleSnapshot: parseVehicleSnapshot(value.vehicleSnapshot),
    driverSnapshot: parseDriverSnapshot(value.driverSnapshot),
    tripSnapshot: parseTripSnapshot(value.tripSnapshot),
  }

  return {
    id: value.id,
    vehicleId: value.vehicleId,
    driverId: value.driverId,
    tripId: value.tripId,
    infractionAt: value.infractionAt,
    infractionCode: value.infractionCode,
    description: value.description,
    location: value.location,
    amount: value.amount,
    dueAt: value.dueAt,
    notes: value.notes,
    status: value.status,
    paidAt: value.paidAt,
    cancellationReason: value.cancellationReason,
    createdBy: value.createdBy,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    vehicle,
    driver,
    ...context,
  }
}

function parseTimelineEntry(value: unknown): FineTimelineEntry {
  if (
    !isRecord(value)
    || !isPositiveId(value.id)
    || typeof value.eventType !== 'string'
    || !isIsoInstant(value.occurredAt)
    || !isIsoInstant(value.registeredAt)
    || typeof value.reportedBy !== 'string'
    || typeof value.reason !== 'string'
    || !isNullableString(value.evidenceDescription)
    || !isNullableString(value.attachmentUrl)
    || !(value.supersedesId === undefined || value.supersedesId === null || isPositiveId(value.supersedesId))
    || !isRecord(value.actor)
    || typeof value.actor.id !== 'string'
    || typeof value.actor.name !== 'string'
    || typeof value.actor.role !== 'string'
    || !(value.before === undefined || value.before === null || isRecord(value.before))
    || !(value.after === undefined || isRecord(value.after))
  ) {
    throw new Error(INVALID_FINE_MESSAGE)
  }

  return {
    id: value.id,
    eventType: value.eventType,
    occurredAt: value.occurredAt,
    registeredAt: value.registeredAt,
    reportedBy: value.reportedBy,
    reason: value.reason,
    evidenceDescription: value.evidenceDescription,
    attachmentUrl: value.attachmentUrl,
    supersedesId: value.supersedesId ?? null,
    actor: {
      id: value.actor.id,
      name: value.actor.name,
      role: value.actor.role,
    },
    before: (value.before ?? null) as Partial<Fine> | null,
    after: (value.after ?? {}) as Partial<Fine>,
  }
}

function parseFineDetail(value: unknown): FineDetail {
  const fine = parseFine(value)
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return {
    ...fine,
    events: value.events.map(parseTimelineEntry),
  }
}

function parseDriverSuggestion(value: unknown): FineDriverSuggestion {
  if (
    !isRecord(value)
    || !isPositiveId(value.tripId)
    || !isPositiveId(value.driverId)
    || typeof value.driverName !== 'string'
    || !isPositiveId(value.vehicleId)
    || !isIsoInstant(value.startedAt)
    || !(value.finishedAt === null || isIsoInstant(value.finishedAt))
    || typeof value.tripStatus !== 'string'
    || !isSnapshotSource(value.nameSource)
  ) {
    throw new Error(INVALID_SUGGESTION_MESSAGE)
  }

  return {
    tripId: value.tripId,
    driverId: value.driverId,
    driverName: value.driverName,
    vehicleId: value.vehicleId,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    tripStatus: value.tripStatus,
    nameSource: value.nameSource,
  }
}

async function request(api: ApiRequest, path: string, options?: RequestInit): Promise<unknown> {
  const response = await api(path, options)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
      ? body.erro
      : 'Não foi possível concluir a operação de multas. Tente novamente.'
    throw new FineRequestError(response.status, message)
  }
  return body
}

function jsonInit(input: object, method: 'POST' | 'PUT' | 'PATCH', extraHeaders?: Record<string, string>): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(input),
  }
}

/** Serializa os filtros suportados por `GET /fines`. */
export function buildFinesQuery(filters: FineFilters = {}): string {
  const params = new URLSearchParams()
  for (const key of ['vehicleId', 'driverId', 'status', 'from', 'to'] as const) {
    const value = filters[key]
    if (value) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Lista multas combinando veículo, motorista, situação e período. */
export async function listFines(api: ApiRequest, filters: FineFilters = {}): Promise<Fine[]> {
  const body = await request(api, `/fines${buildFinesQuery(filters)}`)
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error(INVALID_FINE_MESSAGE)
  }
  return body.items.map(parseFine)
}

/** Consulta o detalhe completo da multa junto à trilha imutável de eventos. */
export async function getFine(api: ApiRequest, id: string): Promise<FineDetail> {
  const body = await request(api, `/fines/${encodeURIComponent(id)}`)
  return parseFineDetail(body)
}

/** Consulta viagens elegíveis no intervalo real da infração sem atribuir responsabilidade automaticamente. */
export async function suggestFineDrivers(
  api: ApiRequest,
  vehicleId: string,
  infractionAt: string,
  signal?: AbortSignal,
): Promise<FineDriverSuggestion[]> {
  const params = new URLSearchParams({ vehicleId, infractionAt })
  const body = await request(api, `/fines/driver-suggestions?${params.toString()}`, signal ? { signal } : undefined)
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error(INVALID_SUGGESTION_MESSAGE)
  }
  return body.items.map(parseDriverSuggestion)
}

/** Registra uma multa com chave UUID de idempotência preservada entre tentativas do mesmo pedido. */
export async function createFine(
  api: ApiRequest,
  input: CreateFineInput,
  idempotencyKey: string,
): Promise<Fine> {
  const body = await request(api, '/fines', jsonInit(input, 'POST', { 'Idempotency-Key': idempotencyKey }))
  return parseFine(body)
}

/** Retifica dados ou vínculos de uma multa aberta sob controle de revisão otimista. */
export async function updateFine(api: ApiRequest, id: string, input: UpdateFineInput): Promise<Fine> {
  const body = await request(api, `/fines/${encodeURIComponent(id)}`, jsonInit(input, 'PUT'))
  return parseFine(body)
}

/** Executa transição permitida de situação da multa com revisão otimista e justificativa. */
export async function changeFineStatus(
  api: ApiRequest,
  id: string,
  input: ChangeFineStatusInput,
): Promise<Fine> {
  const body = await request(api, `/fines/${encodeURIComponent(id)}/status`, jsonInit(input, 'PATCH'))
  return parseFine(body)
}
