import type { ApiRequest } from '../api/client'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { FUEL_TYPES } from '../fuelings/fuelingTypes.ts'
import type { CreateFuelingInput, FuelingDetail, FuelingFilters, FuelingHistoryEvent, FuelingList, FuelingVersion, FuelType, RectifyFuelingInput } from '../fuelings/fuelingTypes.ts'

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

/** Erro de gravação de abastecimento que sinaliza se o desfecho no servidor permanece incerto. */
export class FuelingWriteError extends Error {
  readonly outcomeUncertain: boolean
  readonly status?: number

  constructor(message: string, outcomeUncertain: boolean, status?: number) {
    super(message)
    this.name = 'FuelingWriteError'
    this.outcomeUncertain = outcomeUncertain
    this.status = status
  }
}

export class FuelingCreateError extends FuelingWriteError {
  override name = 'FuelingCreateError'
}

export class FuelingRectifyError extends FuelingWriteError {
  override name = 'FuelingRectifyError'
}

/** Indica falha sem resposta conclusiva do servidor (rede, timeout, 5xx ou payload inválido). */
export function isUncertainFuelingOutcome(error: unknown): boolean {
  if (error instanceof FuelingWriteError) {
    return error.outcomeUncertain
  }
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
    ...(typeof value.reportedBy === 'string' ? { reportedBy: value.reportedBy } : {}),
    ...(typeof value.reason === 'string' || value.reason === null ? { reason: value.reason as string | null } : {}),
    ...(typeof value.evidenceDescription === 'string' || value.evidenceDescription === null ? { evidenceDescription: value.evidenceDescription as string | null } : {}),
    ...(typeof value.attachmentUrl === 'string' || value.attachmentUrl === null ? { attachmentUrl: value.attachmentUrl as string | null } : {}),
    ...(typeof value.createdBy === 'string' ? { createdBy: value.createdBy } : {}),
    ...(isRecord(value.actorSnapshot) || value.actorSnapshot === null ? { actorSnapshot: value.actorSnapshot } : {}),
    ...(typeof value.supersedesId === 'string' || value.supersedesId === null ? { supersedesId: value.supersedesId as string | null } : {}),
    ...(typeof value.annulmentReason === 'string' || value.annulmentReason === null ? { annulmentReason: value.annulmentReason as string | null } : {}),
    ...(typeof value.revision === 'number' && Number.isInteger(value.revision) ? { revision: value.revision } : {}),
    ...(typeof value.registeredAt === 'string' ? { registeredAt: value.registeredAt } : {}),
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  }
}

function parseHistoryEvent(value: unknown): FuelingHistoryEvent {
  if (!isRecord(value) || typeof value.id !== 'string'
    || !['RECORDED', 'UPDATED', 'RECTIFIED', 'ANNULLED'].includes(String(value.eventType))
    || typeof value.occurredAt !== 'string' || typeof value.registeredAt !== 'string'
    || typeof value.reportedBy !== 'string' || typeof value.registeredBy !== 'string' || !isRecord(value.actorSnapshot)
    || typeof value.reason !== 'string' || !(typeof value.evidenceDescription === 'string' || value.evidenceDescription === null)
    || !(typeof value.attachmentUrl === 'string' || value.attachmentUrl === null)
    || !(typeof value.supersedesId === 'string' || value.supersedesId === null) || typeof value.isAnnulled !== 'boolean'
    || !(value.beforeState === null || isRecord(value.beforeState)) || !isRecord(value.afterState)) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return { id: value.id, eventType: value.eventType as FuelingHistoryEvent['eventType'], occurredAt: value.occurredAt,
    registeredAt: value.registeredAt, reportedBy: value.reportedBy, registeredBy: value.registeredBy,
    actorSnapshot: value.actorSnapshot, reason: value.reason, evidenceDescription: value.evidenceDescription,
    attachmentUrl: value.attachmentUrl, supersedesId: value.supersedesId, isAnnulled: value.isAnnulled,
    beforeState: value.beforeState === null ? null : parseFueling(value.beforeState), afterState: parseFueling(value.afterState) }
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

/** Consulta as versões e a linha do tempo imutável de um abastecimento. */
export async function getFuelingDetail(api: ApiRequest, id: string): Promise<FuelingDetail> {
  const response = await api(`/fuelings/${encodeURIComponent(id)}`)
  if (!response.ok) await throwRequestError(response, 'Não foi possível consultar o histórico do abastecimento.')
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body) || !isRecord(body.fueling) || typeof body.currentId !== 'string'
    || !Array.isArray(body.versions) || !Array.isArray(body.events)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return {
    fueling: parseFueling(body.fueling),
    currentId: body.currentId,
    versions: body.versions.map(parseFueling),
    events: body.events.map(parseHistoryEvent),
  }
}

async function sendWrite<TError extends FuelingWriteError>(
  api: ApiRequest,
  path: string,
  method: 'POST' | 'PUT',
  input: object,
  key: string,
  fallback: string,
  makeError: (message: string, uncertain: boolean, status?: number) => TError,
): Promise<FuelingVersion> {
  let response: Response
  try {
    response = await api(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(input),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : fallback
    const uncertain = !(error instanceof Error && (error.message === SESSION_EXPIRED || error.name === 'AbortError'))
    throw makeError(message, uncertain)
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw makeError(readErrorMessage(body, fallback), response.status >= 500, response.status)
  }
  try {
    return parseFueling(await response.json().catch(() => null))
  } catch (error) {
    throw makeError(error instanceof Error ? error.message : INVALID_RESPONSE_MESSAGE, true, response.status)
  }
}

/** Reenvia a mesma intenção com a chave estável até o servidor confirmar o resultado. */
export async function createFueling(
  api: ApiRequest,
  input: CreateFuelingInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<FuelingVersion> {
  return sendWrite(
    api,
    '/fuelings',
    'POST',
    input,
    idempotencyKey,
    'Não foi possível registrar o abastecimento.',
    (message, uncertain, status) => new FuelingCreateError(message, uncertain, status),
  )
}

/** Retifica uma versão preservando a mesma chave e o mesmo payload durante retries. */
export async function rectifyFueling(
  api: ApiRequest,
  id: string,
  input: RectifyFuelingInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<FuelingVersion> {
  return sendWrite(
    api,
    `/fuelings/${encodeURIComponent(id)}`,
    'PUT',
    input,
    idempotencyKey,
    'Não foi possível retificar o abastecimento.',
    (message, uncertain, status) => new FuelingRectifyError(message, uncertain, status),
  )
}
