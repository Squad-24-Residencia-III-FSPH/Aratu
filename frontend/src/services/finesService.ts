import type { ApiRequest } from '../api/client'
import { FINE_STATUSES } from '../fines/fineTypes.ts'
import type { CreateFineInput, Fine, FineDetail, FineDriverSuggestion, FineFilters, FineStatus, FineTimelineEntry } from '../fines/fineTypes'

const INVALID_RESPONSE = 'A resposta de multas da API está em um formato inválido.'
type RecordValue = Record<string, unknown>
function isRecord(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nullableString(value: unknown): value is string | null { return typeof value === 'string' || value === null }
function errorMessage(value: unknown, fallback: string): string { return isRecord(value) && typeof value.erro === 'string' && value.erro.trim() ? value.erro : fallback }

function parseFine(value: unknown): Fine {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.vehicleId !== 'string'
    || !nullableString(value.driverId) || !nullableString(value.tripId) || typeof value.infractionAt !== 'string'
    || typeof value.infractionCode !== 'string' || typeof value.description !== 'string' || !nullableString(value.location)
    || typeof value.amount !== 'string' || !nullableString(value.dueAt) || !nullableString(value.notes)
    || typeof value.status !== 'string' || !FINE_STATUSES.includes(value.status as FineStatus)
    || !nullableString(value.paidAt) || !nullableString(value.cancellationReason) || typeof value.createdBy !== 'string'
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision) || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string' || !isRecord(value.vehicle) || typeof value.vehicle.id !== 'string'
    || typeof value.vehicle.licensePlate !== 'string' || !nullableString(value.vehicle.model)
    || !(value.driver === null || (isRecord(value.driver) && typeof value.driver.id === 'string' && typeof value.driver.name === 'string'))
    || !(value.vehicleSnapshot === null || (isRecord(value.vehicleSnapshot) && typeof value.vehicleSnapshot.id === 'string'
      && typeof value.vehicleSnapshot.licensePlate === 'string' && nullableString(value.vehicleSnapshot.model)
      && typeof value.vehicleSnapshot.source === 'string' && typeof value.vehicleSnapshot.capturedAt === 'string'))
    || !(value.driverSnapshot === null || (isRecord(value.driverSnapshot) && typeof value.driverSnapshot.id === 'string'
      && typeof value.driverSnapshot.name === 'string' && typeof value.driverSnapshot.source === 'string'
      && typeof value.driverSnapshot.capturedAt === 'string'))
    || !(value.tripSnapshot === null || (isRecord(value.tripSnapshot) && typeof value.tripSnapshot.id === 'string'
      && typeof value.tripSnapshot.vehicleId === 'string' && typeof value.tripSnapshot.driverId === 'string'
      && typeof value.tripSnapshot.status === 'string' && nullableString(value.tripSnapshot.startedAt)
      && nullableString(value.tripSnapshot.finishedAt) && typeof value.tripSnapshot.capturedAt === 'string'))) {
    throw new Error(INVALID_RESPONSE)
  }
  return { id: value.id, vehicleId: value.vehicleId, driverId: value.driverId, tripId: value.tripId,
    infractionAt: value.infractionAt, infractionCode: value.infractionCode, description: value.description,
    location: value.location, amount: value.amount, dueAt: value.dueAt, notes: value.notes,
    status: value.status as FineStatus, paidAt: value.paidAt, cancellationReason: value.cancellationReason,
    createdBy: value.createdBy, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt,
    vehicle: { id: value.vehicle.id, licensePlate: value.vehicle.licensePlate, model: value.vehicle.model },
    driver: value.driver === null ? null : { id: (value.driver as RecordValue).id as string, name: (value.driver as RecordValue).name as string },
    vehicleSnapshot: value.vehicleSnapshot === null ? null : value.vehicleSnapshot as Fine['vehicleSnapshot'],
    driverSnapshot: value.driverSnapshot === null ? null : value.driverSnapshot as Fine['driverSnapshot'],
    tripSnapshot: value.tripSnapshot === null ? null : value.tripSnapshot as Fine['tripSnapshot'] }
}

function parseEvent(value: unknown): FineTimelineEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.eventType !== 'string'
    || typeof value.occurredAt !== 'string' || typeof value.registeredAt !== 'string'
    || typeof value.reportedBy !== 'string' || typeof value.reason !== 'string'
    || !nullableString(value.evidenceDescription) || !nullableString(value.attachmentUrl) || !isRecord(value.actor)
    || typeof value.actor.id !== 'string' || typeof value.actor.name !== 'string' || typeof value.actor.role !== 'string') throw new Error(INVALID_RESPONSE)
  return { id: value.id, eventType: value.eventType, occurredAt: value.occurredAt, registeredAt: value.registeredAt,
    reportedBy: value.reportedBy, reason: value.reason, evidenceDescription: value.evidenceDescription,
    attachmentUrl: value.attachmentUrl, actor: { id: value.actor.id, name: value.actor.name, role: value.actor.role } }
}

async function read<T>(response: Response, fallback: string, parse: (body: unknown) => T): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(body, fallback))
  return parse(body)
}
function json(input: object): RequestInit { return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } }

export function buildFinesQuery(filters: FineFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId)
  if (filters.driverId) params.set('driverId', filters.driverId)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function listFines(api: ApiRequest, filters: FineFilters = {}): Promise<Fine[]> {
  return read(await api(`/fines${buildFinesQuery(filters)}`), 'Não foi possível carregar as multas.', (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) throw new Error(INVALID_RESPONSE)
    return value.items.map(parseFine)
  })
}
export async function getFine(api: ApiRequest, id: string): Promise<FineDetail> {
  return read(await api(`/fines/${encodeURIComponent(id)}`), 'Não foi possível consultar a multa.', (value) => {
    if (!isRecord(value) || !Array.isArray(value.events)) throw new Error(INVALID_RESPONSE)
    return { ...parseFine(value), events: value.events.map(parseEvent) }
  })
}
export async function suggestFineDrivers(api: ApiRequest, vehicleId: string, infractionAt: string): Promise<FineDriverSuggestion[]> {
  const query = new URLSearchParams({ vehicleId, infractionAt })
  return read(await api(`/fines/driver-suggestions?${query}`), 'Não foi possível consultar viagens e motoristas compatíveis.', (value) => {
    if (!isRecord(value) || !Array.isArray(value.items)) throw new Error(INVALID_RESPONSE)
    return value.items.map((item): FineDriverSuggestion => {
      if (!isRecord(item) || typeof item.tripId !== 'string' || typeof item.driverId !== 'string'
        || typeof item.driverName !== 'string' || typeof item.vehicleId !== 'string' || typeof item.startedAt !== 'string'
        || !nullableString(item.finishedAt) || typeof item.tripStatus !== 'string'
        || !['TRIP_SNAPSHOT', 'CURRENT_REGISTRY'].includes(String(item.nameSource))) throw new Error(INVALID_RESPONSE)
      return { tripId: item.tripId, driverId: item.driverId, driverName: item.driverName, vehicleId: item.vehicleId,
        startedAt: item.startedAt, finishedAt: item.finishedAt, tripStatus: item.tripStatus,
        nameSource: item.nameSource as FineDriverSuggestion['nameSource'] }
    })
  })
}
export async function createFine(api: ApiRequest, input: CreateFineInput, key: string): Promise<Fine> {
  const request = json(input)
  return read(await api('/fines', { method: 'POST', ...request, headers: { ...request.headers, 'Idempotency-Key': key } }), 'Não foi possível registrar a multa.', parseFine)
}
export async function updateFine(api: ApiRequest, id: string, input: Record<string, unknown>): Promise<Fine> {
  return read(await api(`/fines/${encodeURIComponent(id)}`, { method: 'PUT', ...json(input) }), 'Não foi possível corrigir a multa.', parseFine)
}
export async function changeFineStatus(api: ApiRequest, id: string, input: Record<string, unknown>): Promise<Fine> {
  return read(await api(`/fines/${encodeURIComponent(id)}/status`, { method: 'PATCH', ...json(input) }), 'Não foi possível alterar a situação da multa.', parseFine)
}
