import type { ApiRequest } from '../api/client.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { SVO_ORDER_RESULTS, SVO_ORDER_STATUSES, SvoOrderRequestError } from '../svo/svoOrderTypes.ts'
import type {
  RecordSvoOrderResultInput, SvoOrderDetail, SvoOrderSummary, SvoOrderResult, SvoOrderStatus, SvoOrderTransition, SvoOrderErrorKind,
} from '../svo/svoOrderTypes.ts'

const INVALID_RESPONSE = 'A resposta do servidor não pôde ser confirmada. Consulte a situação da ordem.'
const ERROR_KINDS: Record<number, SvoOrderErrorKind> = { 400: 'validation', 401: 'session', 403: 'forbidden', 404: 'notFound', 409: 'conflict' }
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const id = (value: unknown): value is string => string(value) && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const iso = (value: unknown): value is string => string(value) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const isOrderResult = (value: unknown): value is SvoOrderResult => SVO_ORDER_RESULTS.some((result) => result === value)
const nullable = <T>(value: unknown, guard: (value: unknown) => value is T): value is T | null => value === null || guard(value)
const invalid = (): SvoOrderRequestError => new SvoOrderRequestError('invalidResponse', INVALID_RESPONSE)

function parseSummary(value: unknown): SvoOrderSummary {
  if (!record(value) || !id(value.id) || !id(value.occurrenceId) || !id(value.teamId) || !id(value.vehicleId)
    || !SVO_ORDER_STATUSES.some((status) => status === value.status) || !nullable(value.result, isOrderResult)
    || !integer(value.revision) || !iso(value.openedAt)
    || !nullable(value.departedAt, iso) || !nullable(value.arrivedAt, iso) || !nullable(value.collectedAt, iso) || !nullable(value.closedAt, iso)
    || !record(value.dispatch) || !record(value.current)
    || !['location', 'teamName', 'vehicleLicensePlate'].every((key) => nullable((value.dispatch as Record<string, unknown>)[key], string)
      && string((value.current as Record<string, unknown>)[key]))
    || !Array.isArray(value.allowedTransitions) || !value.allowedTransitions.every((action) => action === 'IN_TRANSIT' || action === 'IN_SERVICE')
    || !Array.isArray(value.allowedResults) || !value.allowedResults.every(isOrderResult)) {
    throw invalid()
  }
  return { id: value.id, occurrenceId: value.occurrenceId, teamId: value.teamId, vehicleId: value.vehicleId,
    status: value.status as SvoOrderStatus, result: value.result, revision: value.revision, openedAt: value.openedAt,
    departedAt: value.departedAt, arrivedAt: value.arrivedAt, collectedAt: value.collectedAt, closedAt: value.closedAt,
    dispatch: { location: value.dispatch.location as string | null, teamName: value.dispatch.teamName as string | null,
      vehicleLicensePlate: value.dispatch.vehicleLicensePlate as string | null },
    current: { location: value.current.location as string, teamName: value.current.teamName as string, vehicleLicensePlate: value.current.vehicleLicensePlate as string },
    allowedTransitions: [...value.allowedTransitions], allowedResults: [...value.allowedResults] }
}

function parseDetail(value: unknown): SvoOrderDetail {
  const summary = parseSummary(value)
  if (!record(value) || !nullable(value.failureReason, string) || !nullable(value.notes, string) || !nullable(value.closedBy, id)) throw invalid()
  const occurrence = value.occurrenceSnapshot
  const team = value.teamSnapshot
  const vehicle = value.vehicleSnapshot
  if (occurrence !== null && (!record(occurrence) || !id(occurrence.id) || !integer(occurrence.revision)
    || !['status', 'requesterName', 'requesterPhone', 'requesterType', 'location', 'description'].every((key) => string(occurrence[key]))
    || !nullable(occurrence.notes, string) || !iso(occurrence.receivedAt) || !nullable(occurrence.triagedAt, iso)
    || !nullable(occurrence.triagedBy, id) || !id(occurrence.attendantId) || !nullable(occurrence.evidenceDescription, string))) throw invalid()
  if (team !== null && (!record(team) || !id(team.id) || !string(team.name) || typeof team.active !== 'boolean' || !integer(team.revision))) throw invalid()
  if (vehicle !== null && (!record(vehicle) || !id(vehicle.id) || !string(vehicle.licensePlate)
    || !Array.isArray(vehicle.categories) || !vehicle.categories.every(string) || !string(vehicle.operationType)
    || !string(vehicle.status) || typeof vehicle.bodyLimit !== 'number' || !Number.isSafeInteger(vehicle.bodyLimit)
    || vehicle.bodyLimit < 0 || !integer(vehicle.revision))) throw invalid()
  // Os campos acima são validados antes do estreitamento; a UI nunca consome tabelas cruas.
  return { ...summary, failureReason: value.failureReason, notes: value.notes, closedBy: value.closedBy,
    occurrenceSnapshot: occurrence as SvoOrderDetail['occurrenceSnapshot'],
    teamSnapshot: team as SvoOrderDetail['teamSnapshot'], vehicleSnapshot: vehicle as SvoOrderDetail['vehicleSnapshot'] }
}

async function request(api: ApiRequest, path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try { response = await api(path, init) }
  catch (error) {
    if (error instanceof Error && error.message === SESSION_EXPIRED) throw new SvoOrderRequestError('session', SESSION_EXPIRED)
    throw new SvoOrderRequestError('network', 'Não foi possível se comunicar com o servidor. Verifique a conexão.')
  }
  if (!response.ok) {
    const kind = ERROR_KINDS[response.status] ?? (response.status >= 500 ? 'server' : 'rejected')
    const body: unknown = await response.json().catch(() => null)
    const message = kind === 'session' ? SESSION_EXPIRED : response.status < 500 && record(body) && string(body.erro) ? body.erro
      : 'Não foi possível concluir a operação. Consulte a situação antes de continuar.'
    throw new SvoOrderRequestError(kind, message)
  }
  try { return await response.json() } catch { throw invalid() }
}

/** Consulta apenas o escopo autorizado pelo servidor, com filtro de situação. */
export async function listSvoOrders(api: ApiRequest, status: SvoOrderStatus | ''): Promise<SvoOrderSummary[]> {
  const value = await request(api, `/svo/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`)
  if (!Array.isArray(value)) throw invalid()
  return value.map(parseSummary)
}

/** Recupera o contexto histórico somente quando o operador solicita o detalhe. */
export async function getSvoOrder(api: ApiRequest, orderId: string): Promise<SvoOrderDetail> {
  const detail = parseDetail(await request(api, `/svo/orders/${encodeURIComponent(orderId)}`))
  if (detail.id !== orderId) throw invalid()
  return detail
}

/** Só confirma sucesso se o servidor devolver a ordem, destino e revisão esperados. */
export async function updateSvoOrderStatus(api: ApiRequest, order: SvoOrderSummary, status: SvoOrderTransition): Promise<SvoOrderSummary> {
  const result = parseSummary(await request(api, `/svo/orders/${encodeURIComponent(order.id)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, revision: order.revision }),
  }))
  if (result.id !== order.id || result.status !== status || result.revision !== order.revision + 1
    || result.occurrenceId !== order.occurrenceId || result.teamId !== order.teamId || result.vehicleId !== order.vehicleId
    || (status === 'IN_TRANSIT' ? !result.departedAt : !result.arrivedAt)) throw invalid()
  return result
}

/** Confirma encerramento apenas quando resultado, revisão, autoria e carimbos do servidor forem coerentes. */
export async function recordSvoOrderResult(
  api: ApiRequest, order: SvoOrderSummary, input: RecordSvoOrderResultInput,
): Promise<SvoOrderDetail> {
  const failureReason = input.failureReason?.trim() ? input.failureReason.trim() : null
  const notes = input.notes?.trim() ? input.notes.trim() : null
  const detail = parseDetail(await request(api, `/svo/orders/${encodeURIComponent(order.id)}/result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result: input.result, revision: order.revision, failureReason, notes }),
  }))
  const validTimestamps = input.result === 'COMPLETED'
    ? detail.collectedAt !== null && detail.collectedAt === detail.closedAt && detail.failureReason === null
    : detail.collectedAt === null && Boolean(detail.failureReason?.trim())
  if (detail.id !== order.id || detail.occurrenceId !== order.occurrenceId || detail.teamId !== order.teamId
    || detail.vehicleId !== order.vehicleId || detail.status !== input.result || detail.result !== input.result
    || detail.revision !== order.revision + 1 || !detail.closedAt || !detail.closedBy
    || detail.allowedTransitions.length > 0 || detail.allowedResults.length > 0 || !validTimestamps) {
    throw invalid()
  }
  return detail
}
