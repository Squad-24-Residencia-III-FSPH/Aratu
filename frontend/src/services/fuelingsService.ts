import type { ApiRequest } from '../api/client'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { FUEL_TYPES } from '../fuelings/fuelingTypes.ts'
import type { CreateFuelingInput, FuelingFilters, FuelingList, FuelingVersion, FuelType } from '../fuelings/fuelingTypes.ts'

const INVALID_RESPONSE_MESSAGE = 'A resposta de abastecimentos da API está em um formato inválido.'

/** Erro HTTP da API de abastecimentos preservando o código de status retornado. */
export class FuelingRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'FuelingRequestError'
    this.status = status
  }
}

/** Indica falha sem resposta conclusiva do servidor (rede, timeout, 5xx ou payload inválido). */
export function isUncertainFuelingOutcome(error: unknown): boolean {
  if (error instanceof FuelingRequestError) {
    return error.status >= 500
  }
  if (error instanceof Error) {
    if (error.message === SESSION_EXPIRED) return false
    return error.message === SERVICE_UNAVAILABLE || error.message === INVALID_RESPONSE_MESSAGE || error.name !== 'AbortError'
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readErrorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.erro === 'string' && body.erro.trim() ? body.erro : fallback
}

async function throwRequestError(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  throw new FuelingRequestError(response.status, readErrorMessage(body, fallback))
}

function parseFueling(value: unknown): FuelingVersion {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.vehicleId !== 'string'
    || !(typeof value.driverId === 'string' || value.driverId === null)
    || typeof value.fueledAt !== 'string'
    || typeof value.fuelType !== 'string'
    || !FUEL_TYPES.includes(value.fuelType as FuelType)
    || typeof value.liters !== 'string'
    || typeof value.totalValue !== 'string'
    || typeof value.odometerKm !== 'number'
    || !(typeof value.station === 'string' || value.station === null)
    || !(isRecord(value.vehicleSnapshot) || value.vehicleSnapshot === null)
    || !(isRecord(value.driverSnapshot) || value.driverSnapshot === null)
    || typeof value.isAnnulled !== 'boolean') {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  const driverSnapshot = value.driverSnapshot === null
    ? null
    : typeof value.driverSnapshot.id === 'string' && typeof value.driverSnapshot.name === 'string'
      ? { id: value.driverSnapshot.id, name: value.driverSnapshot.name }
      : null
  if (value.driverSnapshot !== null && driverSnapshot === null) throw new Error(INVALID_RESPONSE_MESSAGE)
  return {
    id: value.id,
    vehicleId: value.vehicleId,
    driverId: value.driverId,
    fueledAt: value.fueledAt,
    fuelType: value.fuelType as FuelType,
    liters: value.liters,
    totalValue: value.totalValue,
    odometerKm: value.odometerKm,
    station: value.station,
    vehicleSnapshot: value.vehicleSnapshot,
    driverSnapshot,
    isAnnulled: value.isAnnulled,
  }
}

/** Serializa apenas os filtros documentados no endpoint GET /fuelings. */
export function buildFuelingsQuery(filters: FuelingFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId)
  if (filters.driverId) params.set('driverId', filters.driverId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Consulta os abastecimentos e os totais calculados para os filtros aplicados. */
export async function listFuelings(
  api: ApiRequest,
  filters: FuelingFilters = {},
  signal?: AbortSignal,
): Promise<FuelingList> {
  const response = await api(`/fuelings${buildFuelingsQuery(filters)}`, signal ? { signal } : undefined)
  if (!response.ok) await throwRequestError(response, 'Não foi possível carregar os abastecimentos.')
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body) || !Array.isArray(body.items)
    || typeof body.total !== 'number' || typeof body.page !== 'number'
    || typeof body.pageSize !== 'number' || typeof body.totalPages !== 'number'
    || typeof body.totalLiters !== 'string' || typeof body.totalValue !== 'string') {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    items: body.items.map(parseFueling),
    total: body.total,
    page: body.page,
    pageSize: body.pageSize,
    totalPages: body.totalPages,
    totalLiters: body.totalLiters,
    totalValue: body.totalValue,
  }
}

/** Registra abastecimento preservando a chave de idempotência fornecida para a intenção de envio. */
export async function createFueling(
  api: ApiRequest,
  input: CreateFuelingInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<FuelingVersion> {
  const response = await api('/fuelings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
  if (!response.ok) await throwRequestError(response, 'Não foi possível registrar o abastecimento.')
  return parseFueling(await response.json().catch(() => null))
}
