import type { ApiRequest } from '../api/client.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { SVO_OCCURRENCE_STATUSES, SVO_REQUESTER_TYPES, SvoOccurrenceRequestError } from '../svo/svoOccurrenceTypes.ts'
import type {
  CreateSvoOccurrenceInput,
  SvoOccurrenceConfirmationResult,
  SvoOccurrenceCreationResult,
  SvoOccurrenceDetail,
  SvoOccurrenceFilters,
  SvoOccurrenceStatus,
  SvoOccurrenceSummary,
} from '../svo/svoOccurrenceTypes.ts'

const INVALID_RESPONSE = 'A resposta do servidor não pôde ser confirmada. Consulte a solicitação antes de continuar.'
const ERROR_KINDS: Record<number, SvoOccurrenceRequestError['kind']> = {
  400: 'validation', 401: 'session', 403: 'forbidden', 404: 'notFound', 409: 'conflict',
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const id = (value: unknown): value is string => string(value) && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const iso = (value: unknown): value is string => string(value)
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const nullableString = (value: unknown): value is string | null => value === null || string(value)
const invalid = (): SvoOccurrenceRequestError => new SvoOccurrenceRequestError('invalidResponse', INVALID_RESPONSE)

function parseSummary(value: unknown): SvoOccurrenceSummary {
  if (!record(value) || !id(value.id) || !SVO_REQUESTER_TYPES.some((type) => type === value.requesterType)
    || !string(value.location) || !SVO_OCCURRENCE_STATUSES.some((status) => status === value.status)
    || !iso(value.receivedAt) || !iso(value.createdAt) || !revision(value.revision)
    || !(value.dispatchRequestedAt === undefined || value.dispatchRequestedAt === null || iso(value.dispatchRequestedAt))
    || !(value.dispatchRequestedBy === undefined || value.dispatchRequestedBy === null || id(value.dispatchRequestedBy))
    || !(value.dispatchWaitReason === undefined || value.dispatchWaitReason === null
      || value.dispatchWaitReason === 'NO_TEAM' || value.dispatchWaitReason === 'NO_VEHICLE')
    || !(value.executionOrderId === undefined || value.executionOrderId === null || id(value.executionOrderId))) throw invalid()
  return {
    id: value.id,
    requesterType: value.requesterType as SvoOccurrenceSummary['requesterType'],
    location: value.location,
    status: value.status as SvoOccurrenceStatus,
    receivedAt: value.receivedAt,
    createdAt: value.createdAt,
    revision: value.revision,
    dispatchRequestedAt: value.dispatchRequestedAt === undefined ? null : value.dispatchRequestedAt as string | null,
    dispatchRequestedBy: value.dispatchRequestedBy === undefined ? null : value.dispatchRequestedBy as string | null,
    dispatchWaitReason: value.dispatchWaitReason === undefined ? null : value.dispatchWaitReason as SvoOccurrenceSummary['dispatchWaitReason'],
    executionOrderId: value.executionOrderId === undefined ? null : value.executionOrderId as string | null,
  }
}

function parseDetail(value: unknown): SvoOccurrenceDetail {
  const summary = parseSummary(value)
  if (!record(value) || !string(value.requesterName) || !string(value.requesterPhone)
    || !string(value.description) || !nullableString(value.notes) || !id(value.attendantId)
    || !(value.triagedAt === null || iso(value.triagedAt)) || !(value.triagedBy === null || id(value.triagedBy))
    || !iso(value.updatedAt) || !nullableString(value.evidenceDescription)) throw invalid()
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

async function request(api: ApiRequest, path: string, init?: RequestInit): Promise<unknown> {
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
    throw new SvoOccurrenceRequestError('network', 'Não foi possível se comunicar com o servidor. Verifique a conexão.')
  }

  if (!response.ok) {
    const kind = ERROR_KINDS[response.status] ?? (response.status >= 500 ? 'server' : 'rejected')
    const body: unknown = await response.json().catch(() => null)
    const message = record(body) && string(body.erro)
      ? body.erro
      : `A API respondeu HTTP ${response.status} para ${path}.`
    throw new SvoOccurrenceRequestError(kind, message)
  }

  try {
    return await response.json()
  } catch {
    throw invalid()
  }
}

/** Consulta ocorrências usando somente os filtros aceitos pela API. */
export async function listSvoOccurrences(api: ApiRequest, filters: SvoOccurrenceFilters): Promise<SvoOccurrenceSummary[]> {
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.from) query.set('from', filters.from)
  if (filters.to) query.set('to', filters.to)
  const suffix = query.size ? `?${query.toString()}` : ''
  const value = await request(api, `/svo/occurrences${suffix}`)
  if (!Array.isArray(value)) throw invalid()
  return value.map(parseSummary)
}

/** Consulta o detalhe restrito e valida a correspondência do identificador solicitado. */
export async function getSvoOccurrence(api: ApiRequest, occurrenceId: string): Promise<SvoOccurrenceDetail> {
  const detail = parseDetail(await request(api, `/svo/occurrences/${encodeURIComponent(occurrenceId)}`))
  if (detail.id !== occurrenceId) throw invalid()
  return detail
}

/** Registra somente os campos definidos pelo contrato da FROTA-112. */
export async function createSvoOccurrence(
  api: ApiRequest,
  input: CreateSvoOccurrenceInput,
): Promise<SvoOccurrenceCreationResult> {
  const body = {
    requesterName: input.requesterName.trim(),
    requesterPhone: input.requesterPhone.trim(),
    requesterType: input.requesterType,
    location: input.location.trim(),
    description: input.description.trim(),
    evidenceDescription: input.evidenceDescription.trim(),
    notes: input.notes?.trim() || null,
    ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
  }
  const value = await request(api, '/svo/occurrences', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!record(value) || !id(value.id) || value.status !== 'PENDING' || !iso(value.receivedAt)
    || !iso(value.createdAt) || !revision(value.revision)) throw invalid()
  return { id: value.id, status: 'PENDING', receivedAt: value.receivedAt, createdAt: value.createdAt, revision: value.revision }
}

/** Confirma a conferência dos dados recebidos usando o contrato existente. */
export async function confirmSvoOccurrence(
  api: ApiRequest,
  occurrence: SvoOccurrenceDetail,
): Promise<SvoOccurrenceConfirmationResult> {
  const value = await request(api, `/svo/occurrences/${encodeURIComponent(occurrence.id)}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: occurrence.revision }),
  })
  if (!record(value) || value.id !== occurrence.id || value.status !== 'CONFIRMED'
    || !iso(value.triagedAt) || !id(value.triagedBy) || !revision(value.revision) || value.revision <= occurrence.revision
    || (value.dispatch !== undefined && (!record(value.dispatch)
      || (value.dispatch.status === 'DISPATCHED'
        ? (!id(value.dispatch.orderId) || !id(value.dispatch.teamId) || !id(value.dispatch.vehicleId) || value.dispatch.revision !== value.revision)
        : value.dispatch.status !== 'WAITING' || (value.dispatch.reason !== 'NO_TEAM' && value.dispatch.reason !== 'NO_VEHICLE')
          || value.dispatch.revision !== value.revision)))) throw invalid()
  return {
    id: value.id,
    status: 'CONFIRMED',
    triagedAt: value.triagedAt,
    triagedBy: value.triagedBy,
    revision: value.revision,
    ...(record(value.dispatch) ? { dispatch: value.dispatch as SvoOccurrenceConfirmationResult['dispatch'] } : {}),
  }
}

/** Reavalia automaticamente a seleção de recursos para uma ocorrência em espera. */
export async function retrySvoDispatch(api: ApiRequest, occurrence: SvoOccurrenceSummary): Promise<SvoOccurrenceConfirmationResult['dispatch']> {
  const value = await request(api, `/svo/orders/dispatch/${encodeURIComponent(occurrence.id)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: occurrence.revision, reason: 'Gestor solicitou nova seleção automática após revisar a disponibilidade operacional.' }),
  })
  if (!record(value)) throw invalid()
  if (value.status === 'DISPATCHED' && id(value.orderId) && id(value.teamId) && id(value.vehicleId) && revision(value.revision)) {
    return { status: 'DISPATCHED', orderId: value.orderId, teamId: value.teamId, vehicleId: value.vehicleId, revision: value.revision }
  }
  if (value.status === 'WAITING' && (value.reason === 'NO_TEAM' || value.reason === 'NO_VEHICLE') && revision(value.revision)) {
    return { status: 'WAITING', reason: value.reason, revision: value.revision }
  }
  throw invalid()
}
