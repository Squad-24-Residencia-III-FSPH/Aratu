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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function readErrorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
    ? body.erro
    : fallback
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
export async function listDrivers(api: ApiRequest, filters: DriverFilters = {}): Promise<Driver[]> {
  const response = await api(`/drivers${buildDriversQuery(filters)}`)
  if (!response.ok) await throwRequestError(response, 'Não foi possível carregar os motoristas.')
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return body.map(parseDriver)
}

/** Consulta os dados atuais de um motorista. */
export async function getDriver(api: ApiRequest, id: string): Promise<Driver> {
  const response = await api(`/drivers/${encodeURIComponent(id)}`)
  if (!response.ok) await throwRequestError(response, 'Não foi possível consultar o motorista.')
  return parseDriver(await response.json().catch(() => null))
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
