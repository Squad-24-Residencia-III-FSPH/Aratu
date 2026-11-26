import type { ApiRequest } from '../api/client.ts'
import { TRIP_AGENDA_STATUSES } from '../trips/tripAgendaTypes.ts'
import type { TripAgendaItem } from '../trips/tripAgendaTypes.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function nullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value)
}

function parseTrip(value: unknown): TripAgendaItem {
  if (!isRecord(value) || typeof value.id !== 'string'
    || !(value.requestId === null || typeof value.requestId === 'string')
    || !TRIP_AGENDA_STATUSES.includes(value.status as TripAgendaItem['status'])
    || !isIsoDate(value.scheduledStart) || !isIsoDate(value.scheduledEnd)
    || !nullableIsoDate(value.startedAt) || !nullableIsoDate(value.finishedAt)
    || typeof value.vehicleLicensePlate !== 'string' || typeof value.driverName !== 'string'
    || typeof value.origin !== 'string' || typeof value.destination !== 'string') {
    throw new Error('A lista de viagens retornou dados inválidos.')
  }
  return {
    id: value.id,
    requestId: value.requestId,
    status: value.status as TripAgendaItem['status'],
    scheduledStart: value.scheduledStart,
    scheduledEnd: value.scheduledEnd,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    vehicleLicensePlate: value.vehicleLicensePlate,
    driverName: value.driverName,
    origin: value.origin,
    destination: value.destination,
  }
}

/** Consulta a agenda gerencial existente com filtro de data e situação opcional. */
export async function listTripAgenda(
  api: ApiRequest,
  filters: { from?: string; to?: string; status?: string } = {},
): Promise<TripAgendaItem[]> {
  const query = new URLSearchParams()
  if (filters.from) query.set('from', filters.from)
  if (filters.to) query.set('to', filters.to)
  if (filters.status) query.set('status', filters.status)
  const queryString = query.toString()
  let response: Response
  try {
    response = await api(`/trips${queryString ? `?${queryString}` : ''}`)
  } catch {
    throw new Error('Não foi possível se comunicar com o servidor. Verifique a conexão.')
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
      ? body.erro
      : 'Não foi possível carregar a agenda de viagens.'
    throw new Error(response.status >= 500 ? 'Não foi possível carregar a agenda de viagens.' : message)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error('A lista de viagens retornou dados inválidos.')
  return body.map(parseTrip)
}
