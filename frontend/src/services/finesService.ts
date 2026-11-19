import type { ApiRequest } from '../api/client'
import type { CreateFineInput, Fine, FineDriverSuggestion, FineFilters, FineStatusInput } from '../fines/fineTypes'

/** Mantém o código HTTP e a mensagem de domínio devolvida pela API. */
export class FineRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function checkResponse(response: Response, fallback: string): Promise<void> {
  if (response.ok) return
  const body = await response.json().catch(() => null) as { erro?: unknown } | null
  throw new FineRequestError(response.status, typeof body?.erro === 'string' && body.erro.trim() ? body.erro : fallback)
}

async function listItems<T>(api: ApiRequest, path: string, fallback: string, signal: AbortSignal): Promise<T[]> {
  const response = await api(path, { signal })
  await checkResponse(response, fallback)
  const body = await response.json().catch(() => null) as { items?: T[] } | null
  if (!Array.isArray(body?.items)) throw new Error(fallback)
  return body.items
}

function dateBoundary(value: string, nextDay = false): string {
  const date = new Date(`${value}T00:00:00`)
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

/** Consulta o histórico com o último dia do período incluído na busca. */
export async function listFines(api: ApiRequest, filters: FineFilters, signal: AbortSignal): Promise<Fine[]> {
  const params = new URLSearchParams()
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId)
  if (filters.driverId) params.set('driverId', filters.driverId)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', dateBoundary(filters.from))
  if (filters.to) params.set('to', dateBoundary(filters.to, true))
  const query = params.toString()
  return listItems(api, query ? `/fines?${query}` : '/fines', 'Não foi possível carregar as multas.', signal)
}

/** Consulta viagens candidatas para o veículo no instante da infração. */
export function suggestFineDrivers(api: ApiRequest, vehicleId: string, infractionAt: string, signal: AbortSignal) {
  const params = new URLSearchParams({ vehicleId, infractionAt })
  return listItems<FineDriverSuggestion>(api, `/fines/driver-suggestions?${params}`, 'Não foi possível consultar a sugestão de motorista.', signal)
}

/** Registra a multa usando a chave preservada pelo formulário durante reenvios. */
export async function createFine(api: ApiRequest, input: CreateFineInput, key: string): Promise<void> {
  const response = await api('/fines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(input),
  })
  await checkResponse(response, 'Não foi possível registrar a multa.')
}

/** Registra a transição sob controle da revisão exibida na listagem. */
export async function changeFineStatus(api: ApiRequest, id: string, input: FineStatusInput): Promise<void> {
  const response = await api(`/fines/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await checkResponse(response, 'Não foi possível alterar a situação da multa.')
}
