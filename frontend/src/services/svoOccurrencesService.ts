import type { ApiRequest } from '../api/client.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import {
  isCanonicalBigIntId,
  SVO_OCCURRENCE_STATUSES,
  SVO_REQUESTER_TYPES,
  SvoOccurrenceRequestError,
} from '../types/svoOccurrence.ts'
import type {
  CreateSvoOccurrenceInput,
  CreateSvoOrderDispatchInput,
  SvoDispatchAutoResult,
  SvoDispatchCandidateTeam,
  SvoDispatchCandidateVehicle,
  SvoDispatchCandidatesResult,
  SvoDispatchOrderRef,
  SvoOccurrenceConfirmationResult,
  SvoOccurrenceCreationResult,
  SvoOccurrenceDetail,
  SvoOccurrenceErrorKind,
  SvoOccurrenceListFilters,
  SvoOccurrenceStatus,
  SvoOccurrenceSummary,
  SvoOrderDispatchResult,
  SvoRequesterType,
} from '../types/svoOccurrence.ts'

const INVALID_RESPONSE = 'A resposta do servidor não pôde ser confirmada. Consulte as solicitações antes de continuar.'
const NETWORK_ERROR = 'Não foi possível se comunicar com o servidor. Verifique a conexão.'
const ERROR_KINDS: Record<number, SvoOccurrenceErrorKind> = {
  400: 'validation',
  401: 'session',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is string => isString(value) && isCanonicalBigIntId(value)
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isIso = (value: unknown): value is string =>
  isString(value) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const isNullable = <T>(value: unknown, guard: (item: unknown) => item is T): value is T | null =>
  value === null || guard(value)
const isRequesterType = (value: unknown): value is SvoRequesterType =>
  SVO_REQUESTER_TYPES.some((item) => item === value)
const isStatus = (value: unknown): value is SvoOccurrenceStatus =>
  SVO_OCCURRENCE_STATUSES.some((item) => item === value)
const isWaitReason = (value: unknown): value is 'NO_TEAM' | 'NO_VEHICLE' =>
  value === 'NO_TEAM' || value === 'NO_VEHICLE'

function invalidResponse(): SvoOccurrenceRequestError {
  return new SvoOccurrenceRequestError('invalidResponse', INVALID_RESPONSE)
}

function parseSummary(value: unknown): SvoOccurrenceSummary {
  if (
    !isRecord(value)
    || !isId(value.id)
    || !isRequesterType(value.requesterType)
    || !isString(value.location)
    || !isStatus(value.status)
    || !isIso(value.receivedAt)
    || !isIso(value.createdAt)
    || !isPositiveInt(value.revision)
    || !(value.dispatchRequestedAt === undefined || isNullable(value.dispatchRequestedAt, isIso))
    || !(value.dispatchRequestedBy === undefined || isNullable(value.dispatchRequestedBy, isId))
    || !(value.dispatchWaitReason === undefined || isNullable(value.dispatchWaitReason, isWaitReason))
    || !(value.executionOrderId === undefined || isNullable(value.executionOrderId, isId))
  ) {
    throw invalidResponse()
  }
  return {
    id: value.id,
    requesterType: value.requesterType,
    location: value.location,
    status: value.status,
    receivedAt: value.receivedAt,
    createdAt: value.createdAt,
    revision: value.revision,
    dispatchRequestedAt: value.dispatchRequestedAt === undefined ? null : value.dispatchRequestedAt,
    dispatchRequestedBy: value.dispatchRequestedBy === undefined ? null : value.dispatchRequestedBy,
    dispatchWaitReason: value.dispatchWaitReason === undefined ? null : value.dispatchWaitReason,
    executionOrderId: value.executionOrderId === undefined ? null : value.executionOrderId,
  }
}

function parseDetail(value: unknown): SvoOccurrenceDetail {
  const summary = parseSummary(value)
  if (
    !isRecord(value)
    || !isString(value.requesterName)
    || !isString(value.requesterPhone)
    || !isString(value.description)
    || !isNullable(value.notes, isString)
    || !isId(value.attendantId)
    || !isNullable(value.triagedAt, isIso)
    || !isNullable(value.triagedBy, isId)
    || !isIso(value.updatedAt)
    || !isNullable(value.evidenceDescription, isString)
  ) {
    throw invalidResponse()
  }
  return {
    ...summary,
    requesterName: value.requesterName,
    requesterPhone: value.requesterPhone,
    description: value.description,
    notes: value.notes,
    attendantId: value.attendantId,
    triagedAt: value.triagedAt,
    triagedBy: value.triagedBy,
    updatedAt: value.updatedAt,
    evidenceDescription: value.evidenceDescription,
  }
}

function parseDispatchOrderRef(value: unknown): SvoDispatchOrderRef {
  if (
    !isRecord(value)
    || !isId(value.id)
    || !isId(value.occurrenceId)
    || !isId(value.teamId)
    || !isId(value.vehicleId)
    || !isString(value.status)
    || !isRecord(value.current)
    || !isString(value.current.teamName)
    || !isString(value.current.vehicleLicensePlate)
  ) {
    throw invalidResponse()
  }
  return {
    id: value.id,
    occurrenceId: value.occurrenceId,
    teamId: value.teamId,
    vehicleId: value.vehicleId,
    status: value.status,
    teamName: value.current.teamName,
    vehicleLicensePlate: value.current.vehicleLicensePlate,
  }
}

function parseDispatchAutoResult(value: unknown, expectedRevision?: number): SvoDispatchAutoResult {
  if (!isRecord(value) || !isPositiveInt(value.revision)) {
    throw invalidResponse()
  }
  if (expectedRevision !== undefined && value.revision !== expectedRevision) {
    throw invalidResponse()
  }
  if (value.status === 'DISPATCHED' && isId(value.orderId) && isId(value.teamId) && isId(value.vehicleId)) {
    return {
      status: 'DISPATCHED',
      orderId: value.orderId,
      teamId: value.teamId,
      vehicleId: value.vehicleId,
      revision: value.revision,
    }
  }
  if (value.status === 'WAITING' && isWaitReason(value.reason)) {
    return {
      status: 'WAITING',
      reason: value.reason,
      revision: value.revision,
    }
  }
  throw invalidResponse()
}

async function requestJson(api: ApiRequest, path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await api(path, init)
  } catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) {
      throw new SvoOccurrenceRequestError('session', SESSION_EXPIRED)
    }
    if (error instanceof Error && error.message === SERVICE_UNAVAILABLE) {
      throw new SvoOccurrenceRequestError('network', SERVICE_UNAVAILABLE)
    }
    throw new SvoOccurrenceRequestError('network', NETWORK_ERROR)
  }

  if (!response.ok) {
    const kind = ERROR_KINDS[response.status] ?? (response.status >= 500 ? 'server' : 'rejected')
    const body: unknown = await response.json().catch(() => null)
    const apiMessage = isRecord(body) && isString(body.erro) && body.erro.trim() ? body.erro : null
    const message = apiMessage
      ? apiMessage
      : kind === 'session'
        ? SESSION_EXPIRED
        : `A API respondeu HTTP ${response.status} para ${path}.`
    throw new SvoOccurrenceRequestError(kind, message)
  }

  try {
    return await response.json()
  } catch {
    throw invalidResponse()
  }
}

/** Monta a query string suportada por `GET /svo/occurrences`. */
export function buildSvoOccurrencesQuery(filters: SvoOccurrenceListFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Lista solicitações SVO autorizadas conforme os filtros de situação e período em Maceió. */
export async function listSvoOccurrences(
  api: ApiRequest,
  filters: SvoOccurrenceListFilters = {},
): Promise<SvoOccurrenceSummary[]> {
  const value = await requestJson(api, `/svo/occurrences${buildSvoOccurrencesQuery(filters)}`)
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseSummary)
}

/** Recupera o detalhe restrito de uma solicitação SVO sob demanda. */
export async function getSvoOccurrence(api: ApiRequest, occurrenceId: string): Promise<SvoOccurrenceDetail> {
  const detail = parseDetail(await requestJson(api, `/svo/occurrences/${encodeURIComponent(occurrenceId)}`))
  if (detail.id !== occurrenceId) throw invalidResponse()
  return detail
}

/**
 * Registra uma nova solicitação SVO (`POST /svo/occurrences`).
 *
 * @remarks Não possui chave de idempotência no contrato atual; falhas incertas exigem consulta antes de novo envio.
 */
export async function createSvoOccurrence(
  api: ApiRequest,
  input: CreateSvoOccurrenceInput,
): Promise<SvoOccurrenceCreationResult> {
  const payload: CreateSvoOccurrenceInput = {
    requesterName: input.requesterName.trim(),
    requesterPhone: input.requesterPhone.trim(),
    requesterType: input.requesterType,
    location: input.location.trim(),
    description: input.description.trim(),
    evidenceDescription: input.evidenceDescription.trim(),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
  }

  const value = await requestJson(api, '/svo/occurrences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (
    !isRecord(value)
    || !isId(value.id)
    || value.status !== 'PENDING'
    || !isIso(value.receivedAt)
    || !isIso(value.createdAt)
    || !isPositiveInt(value.revision)
  ) {
    throw invalidResponse()
  }

  return {
    id: value.id,
    status: 'PENDING',
    receivedAt: value.receivedAt,
    createdAt: value.createdAt,
    revision: value.revision,
  }
}

/** Confirma os campos obrigatórios de triagem de uma solicitação pendente (`PENDING -> CONFIRMED`). */
export async function confirmSvoOccurrence(
  api: ApiRequest,
  occurrenceOrId: string | SvoOccurrenceDetail,
): Promise<SvoOccurrenceConfirmationResult> {
  const occurrenceId = typeof occurrenceOrId === 'string' ? occurrenceOrId : occurrenceOrId.id
  const expectedRevision = typeof occurrenceOrId === 'string' ? null : occurrenceOrId.revision

  const value = await requestJson(api, `/svo/occurrences/${encodeURIComponent(occurrenceId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expectedRevision !== null ? { expectedRevision } : {}),
  })

  const triagedAt = isRecord(value) ? value.triagedAt : undefined
  const triagedBy = isRecord(value) ? value.triagedBy : undefined
  if (
    !isRecord(value)
    || !isId(value.id)
    || value.id !== occurrenceId
    || value.status !== 'CONFIRMED'
    || !isPositiveInt(value.revision)
    || !isNullable(triagedAt, isIso)
    || !isNullable(triagedBy, isId)
    || (expectedRevision !== null && (triagedAt === null || triagedBy === null || value.revision <= expectedRevision))
  ) {
    throw invalidResponse()
  }

  const dispatch = value.dispatch !== undefined
    ? parseDispatchAutoResult(value.dispatch, value.revision)
    : undefined

  return {
    id: value.id,
    status: 'CONFIRMED',
    triagedAt,
    triagedBy,
    revision: value.revision,
    ...(dispatch ? { dispatch } : {}),
  }
}

/** Reavalia automaticamente a seleção de recursos para uma ocorrência em espera (`POST /svo/orders/dispatch/:occurrenceId`). */
export async function retrySvoDispatch(
  api: ApiRequest,
  occurrence: SvoOccurrenceSummary,
): Promise<SvoDispatchAutoResult> {
  const value = await requestJson(api, `/svo/orders/dispatch/${encodeURIComponent(occurrence.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: occurrence.revision,
      reason: 'Gestor solicitou nova seleção automática após revisar a disponibilidade operacional.',
    }),
  })
  return parseDispatchAutoResult(value)
}

/** Consulta ordens SVO existentes para identificar solicitações já despachadas e calcular vagas ocupadas. */
export async function listSvoDispatchOrders(api: ApiRequest): Promise<SvoDispatchOrderRef[]> {
  const value = await requestJson(api, '/svo/orders')
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map(parseDispatchOrderRef)
}

function parseDispatchCandidateTeam(value: unknown): SvoDispatchCandidateTeam {
  if (!isRecord(value) || !isId(value.id) || !isString(value.name) || !value.name.trim()) {
    throw invalidResponse()
  }
  return { id: value.id, name: value.name }
}

function parseDispatchCandidateVehicle(value: unknown): SvoDispatchCandidateVehicle {
  if (
    !isRecord(value)
    || !isId(value.id)
    || !isString(value.plate)
    || !value.plate.trim()
    || !isNullable(value.brand, isString)
    || !isNullable(value.model, isString)
    || !isPositiveInt(value.bodyLimit)
    || !isNonNegativeInt(value.occupyingOrders)
    || !isPositiveInt(value.availableSlots)
  ) {
    throw invalidResponse()
  }
  return {
    id: value.id,
    plate: value.plate,
    brand: value.brand,
    model: value.model,
    bodyLimit: value.bodyLimit,
    occupyingOrders: value.occupyingOrders,
    availableSlots: value.availableSlots,
  }
}

/** Consulta equipes ativas e viaturas elegíveis com vagas livres (`GET /svo/dispatch-candidates`). */
export async function listSvoDispatchCandidates(api: ApiRequest): Promise<SvoDispatchCandidatesResult> {
  const value = await requestJson(api, '/svo/dispatch-candidates')
  if (!isRecord(value) || !Array.isArray(value.teams) || !Array.isArray(value.vehicles)) {
    throw invalidResponse()
  }
  return {
    teams: value.teams.map(parseDispatchCandidateTeam),
    vehicles: value.vehicles.map(parseDispatchCandidateVehicle),
  }
}

/** Gera uma ordem de execução SVO (`POST /svo/orders`) para ocorrência confirmada. */
export async function createSvoOrderDispatch(
  api: ApiRequest,
  input: CreateSvoOrderDispatchInput,
): Promise<SvoOrderDispatchResult> {
  const value = await requestJson(api, '/svo/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      occurrenceId: input.occurrenceId.trim(),
      teamId: input.teamId.trim(),
      vehicleId: input.vehicleId.trim(),
    }),
  })

  if (!isRecord(value) || !isId(value.id) || value.status !== 'OPEN') {
    throw invalidResponse()
  }

  return {
    id: value.id,
    status: 'OPEN',
  }
}
