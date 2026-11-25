import type { ApiRequest } from '../api/client'
import { CNH_CATEGORIES, DRIVER_STATUSES } from '../drivers/driverTypes.ts'
import { DriverRequestError } from '../drivers/driverTypes.ts'
import type {
  ChangeDriverStatusInput,
  CreateDriverInput,
  Driver,
  DriverFilters,
  DriverStatus,
  UpdateDriverInput,
} from '../drivers/driverTypes.ts'

const INVALID_RESPONSE_MESSAGE = 'A resposta de motoristas da API está em um formato inválido.'
const MASKED_CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g
const RAW_CPF_PATTERN = /(?<!\d)\d{11}(?!\d)/g

/** Tipos de evento persistidos na trilha histórica de motoristas (`fleet.driver_events`). */
export type DriverHistoryEventType = 'CREATED' | 'UPDATED' | 'STATUS_CHANGED'

/** Evento operacional sanitizado retornado no detalhe ou histórico do motorista. */
export interface DriverHistoryEvent {
  id: string
  eventType: DriverHistoryEventType
  occurredAt: string
  reportedBy: string
  reason: string
  actorName?: string
  actorRole?: string
}

/** Detalhe do motorista com trilha opcional de eventos autorizados pela API. */
export interface DriverDetails extends Driver {
  events?: readonly DriverHistoryEvent[]
}

/** Projeção mínima de conta `MOTORISTA` elegível para vínculo operacional. */
export interface EligibleDriverAccount {
  id: string
  name: string
  email: string
}

/** Opções de controle de requisição para cancelar consultas obsoletas. */
export interface DriverRequestOptions {
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function sanitizeSensitiveDigits(message: string): string {
  return message
    .replace(MASKED_CPF_PATTERN, '[CPF omitido]')
    .replace(RAW_CPF_PATTERN, '[CPF omitido]')
}

function readErrorMessage(body: unknown, fallback: string): string {
  const raw = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
    ? body.erro
    : fallback
  return sanitizeSensitiveDigits(raw)
}

function parseHistoryEvent(value: unknown, index: number): DriverHistoryEvent | null {
  if (!isRecord(value)) return null
  if (
    !isOneOf(value.eventType, ['CREATED', 'UPDATED', 'STATUS_CHANGED'] as const)
    || typeof value.occurredAt !== 'string'
    || typeof value.reportedBy !== 'string'
    || typeof value.reason !== 'string'
  ) {
    return null
  }
  const actor = isRecord(value.actorSnapshot) ? value.actorSnapshot : null
  const actorName = typeof value.actorName === 'string'
    ? value.actorName
    : actor && typeof actor.name === 'string' ? actor.name : undefined
  const actorRole = typeof value.actorRole === 'string'
    ? value.actorRole
    : actor && typeof actor.role === 'string' ? actor.role : undefined

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `event-${index + 1}`,
    eventType: value.eventType,
    occurredAt: value.occurredAt,
    reportedBy: value.reportedBy,
    reason: sanitizeSensitiveDigits(value.reason),
    ...(actorName ? { actorName } : {}),
    ...(actorRole ? { actorRole } : {}),
  }
}

function parseEligibleAccount(value: unknown): EligibleDriverAccount {
  if (
    !isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.name !== 'string'
    || !(typeof value.email === 'string' || value.email === undefined)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }
  return {
    id: value.id,
    name: value.name,
    email: typeof value.email === 'string' ? value.email : '',
  }
}

function parseDriver(value: unknown): Driver {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.name !== 'string'
    || typeof value.cpf !== 'string'
    || typeof value.cnhNumber !== 'string'
    || !isOneOf(value.cnhCategory, CNH_CATEGORIES)
    || typeof value.cnhExpiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.cnhExpiresAt)
    || !(typeof value.phone === 'string' || value.phone === null)
    || !isOneOf(value.status, DRIVER_STATUSES)
    || !(typeof value.userId === 'string' || value.userId === null)
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string') {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }

  return {
    id: value.id,
    name: value.name,
    cpf: value.cpf,
    cnhNumber: value.cnhNumber,
    cnhCategory: value.cnhCategory,
    cnhExpiresAt: value.cnhExpiresAt,
    phone: value.phone,
    status: value.status as DriverStatus,
    userId: value.userId,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function parseDriverDetails(value: unknown): DriverDetails {
  const driver = parseDriver(value)
  if (isRecord(value) && Array.isArray(value.events)) {
    const events = value.events
      .map(parseHistoryEvent)
      .filter((item): item is DriverHistoryEvent => item !== null)
    return { ...driver, events }
  }
  return driver
}

async function throwRequestError(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  const message = readErrorMessage(body, fallback)
  if (response.status === 403) throw new DriverRequestError('forbidden', message)
  if (response.status === 404) throw new DriverRequestError('not-found', message)
  if (response.status === 409) throw new DriverRequestError('conflict', message)
  if (response.status === 400 || response.status === 422) {
    throw new DriverRequestError('validation', message)
  }
  throw new DriverRequestError('unavailable', message)
}

function jsonBody(payload: object): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

/** Serializa os filtros documentados pela API FROTA-49. */
export function buildDriversQuery(filters: DriverFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.name?.trim()) params.set('name', filters.name.trim())
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Lista todos os motoristas; a API FROTA-49 não pagina o resultado. */
export async function listDrivers(
  api: ApiRequest,
  filters: DriverFilters = {},
  options?: DriverRequestOptions,
): Promise<Driver[]> {
  const path = `/drivers${buildDriversQuery(filters)}`
  const response = options?.signal ? await api(path, { signal: options.signal }) : await api(path)
  if (!response.ok) await throwRequestError(response, 'Não foi possível carregar os motoristas.')
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return body.map(parseDriver)
}

/** Lista contas `MOTORISTA` ativas e elegíveis para vínculo sem depender de `/users`. */
export async function listEligibleDriverAccounts(
  api: ApiRequest,
  driverId?: string,
  options?: DriverRequestOptions,
): Promise<EligibleDriverAccount[]> {
  const query = driverId ? `?driverId=${encodeURIComponent(driverId)}` : ''
  const path = `/drivers/eligible-accounts${query}`
  const response = options?.signal ? await api(path, { signal: options.signal }) : await api(path)
  if (!response.ok) await throwRequestError(response, 'Não foi possível carregar as contas de motoristas.')
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return body.map(parseEligibleAccount)
}

/** Consulta os dados atuais de um motorista e eventuais eventos históricos autorizados. */
export async function getDriver(
  api: ApiRequest,
  id: string,
  options?: DriverRequestOptions,
): Promise<DriverDetails> {
  const path = `/drivers/${encodeURIComponent(id)}`
  const response = options?.signal ? await api(path, { signal: options.signal }) : await api(path)
  if (!response.ok) await throwRequestError(response, 'Não foi possível consultar o motorista.')
  return parseDriverDetails(await response.json().catch(() => null))
}

/** Consulta a trilha histórica sanitizada de eventos de um motorista. */
export async function listDriverEvents(
  api: ApiRequest,
  id: string,
  options?: DriverRequestOptions,
): Promise<DriverHistoryEvent[]> {
  const path = `/drivers/${encodeURIComponent(id)}/events`
  const response = options?.signal ? await api(path, { signal: options.signal }) : await api(path)
  if (!response.ok) await throwRequestError(response, 'Não foi possível consultar o histórico do motorista.')
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return body
    .map(parseHistoryEvent)
    .filter((item): item is DriverHistoryEvent => item !== null)
}

/** Cadastra motorista com os metadados exigidos para histórico e auditoria. */
export async function createDriver(api: ApiRequest, input: CreateDriverInput): Promise<Driver> {
  const response = await api('/drivers', { method: 'POST', ...jsonBody(input) })
  if (!response.ok) await throwRequestError(response, 'Não foi possível cadastrar o motorista.')
  return parseDriver(await response.json().catch(() => null))
}

/** Atualiza os dados do motorista sob controle de revisão otimista. */
export async function updateDriver(
  api: ApiRequest,
  id: string,
  input: UpdateDriverInput,
): Promise<Driver> {
  const response = await api(`/drivers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    ...jsonBody(input),
  })
  if (!response.ok) await throwRequestError(response, 'Não foi possível atualizar o motorista.')
  return parseDriver(await response.json().catch(() => null))
}

/** Altera a situação sob controle de revisão otimista. */
export async function changeDriverStatus(
  api: ApiRequest,
  id: string,
  input: ChangeDriverStatusInput,
): Promise<Driver> {
  const response = await api(`/drivers/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    ...jsonBody(input),
  })
  if (!response.ok) await throwRequestError(response, 'Não foi possível alterar a situação do motorista.')
  return parseDriver(await response.json().catch(() => null))
}
