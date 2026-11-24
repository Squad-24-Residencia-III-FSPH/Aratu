import type { ApiRequest } from '../api/client.ts'

export interface EntityHistoryEntry {
  id: string
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED'
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  evidenceDescription: string | null
  actor: { id: string; name: string; role: string }
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown>
}

export interface EntityHistoryPage {
  items: EntityHistoryEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function parseEntry(value: unknown): EntityHistoryEntry {
  if (!isRecord(value) || typeof value.id !== 'string'
    || !['CREATED', 'UPDATED', 'STATUS_CHANGED'].includes(String(value.eventType))
    || !isDateTime(value.occurredAt) || !isDateTime(value.registeredAt)
    || typeof value.reportedBy !== 'string' || typeof value.reason !== 'string'
    || !(value.evidenceDescription === null || typeof value.evidenceDescription === 'string')
    || !isRecord(value.actor) || typeof value.actor.id !== 'string'
    || typeof value.actor.name !== 'string' || typeof value.actor.role !== 'string'
    || !(value.beforeState === null || isRecord(value.beforeState)) || !isRecord(value.afterState)) {
    throw new Error('O histórico retornou dados inválidos.')
  }
  return {
    id: value.id,
    eventType: value.eventType as EntityHistoryEntry['eventType'],
    occurredAt: value.occurredAt,
    registeredAt: value.registeredAt,
    reportedBy: value.reportedBy,
    reason: value.reason,
    evidenceDescription: value.evidenceDescription,
    actor: { id: value.actor.id, name: value.actor.name, role: value.actor.role },
    beforeState: value.beforeState,
    afterState: value.afterState,
  }
}

async function listHistory(api: ApiRequest, path: string, page: number): Promise<EntityHistoryPage> {
  let response: Response
  try { response = await api(`${path}?${new URLSearchParams({ page: String(page), pageSize: '20' })}`) }
  catch { throw new Error('Não foi possível se comunicar com o servidor. Verifique a conexão.') }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
      ? body.erro
      : 'Não foi possível carregar o histórico.'
    throw new Error(response.status >= 500 ? 'Não foi possível carregar o histórico.' : message)
  }
  if (!isRecord(body) || !Array.isArray(body.items)
    || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || body.page !== page || body.pageSize !== 20
    || !Number.isSafeInteger(body.totalPages) || Number(body.totalPages) < 0) {
    throw new Error('O histórico retornou dados inválidos.')
  }
  return {
    items: body.items.map(parseEntry),
    total: Number(body.total),
    page,
    pageSize: 20,
    totalPages: Number(body.totalPages),
  }
}

export function listVehicleHistory(api: ApiRequest, vehicleId: string, page: number): Promise<EntityHistoryPage> {
  return listHistory(api, `/vehicles/${encodeURIComponent(vehicleId)}/history`, page)
}

export function listDriverHistory(api: ApiRequest, driverId: string, page: number): Promise<EntityHistoryPage> {
  return listHistory(api, `/drivers/${encodeURIComponent(driverId)}/history`, page)
}
