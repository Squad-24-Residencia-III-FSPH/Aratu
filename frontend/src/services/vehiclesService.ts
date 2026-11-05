import type { ApiRequest } from '../api/client'
import {
  DUPLICATE_LICENSE_PLATE_MESSAGE,
  VEHICLE_CATEGORIES,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_TYPES,
  VEHICLE_STATUSES,
} from '../vehicles/vehicleTypes.ts'
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  UpdateVehicleInput,
  Vehicle,
  VehicleCategory,
  VehicleFilters,
  VehicleOperationType,
  VehicleOwnership,
  VehicleStatus,
} from '../vehicles/vehicleTypes.ts'

const INVALID_RESPONSE_MESSAGE = 'A resposta de veículos da API está em um formato inválido.'
const UNAVAILABLE_MESSAGE = 'Não foi possível carregar os veículos.'

/** Classificação de falha que a tela precisa distinguir. */
export type VehicleRequestErrorKind =
  | 'validation'
  | 'forbidden'
  | 'not-found'
  | 'conflict-plate'
  | 'conflict-revision'
  | 'unavailable'

/** Erro de requisição de veículos com motivo legível para a interface. */
export class VehicleRequestError extends Error {
  readonly kind: VehicleRequestErrorKind

  constructor(kind: VehicleRequestErrorKind, message: string) {
    super(message)
    this.name = 'VehicleRequestError'
    this.kind = kind
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.erro === 'string' && body.erro.trim()) return body.erro
  return fallback
}

function parseNullableText(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function parseVehicle(value: unknown): Vehicle {
  if (!isRecord(value)) throw new Error(INVALID_RESPONSE_MESSAGE)
  const brand = parseNullableText(value.brand)
  const model = parseNullableText(value.model)
  const vehicleType = parseNullableText(value.vehicleType)
  const year = value.year === null ? null : value.year
  const weightLimit = value.weightLimit === null ? null : value.weightLimit
  const categories = value.categories

  if (
    typeof value.id !== 'string' || !value.id.trim()
    || typeof value.licensePlate !== 'string' || !value.licensePlate.trim()
    || brand === undefined || model === undefined || vehicleType === undefined
    || (year !== null && (typeof year !== 'number' || !Number.isInteger(year)))
    || !isOneOf(value.ownership, VEHICLE_OWNERSHIP_TYPES)
    || !Array.isArray(categories) || categories.length === 0
    || categories.some((category) => !isOneOf(category, VEHICLE_CATEGORIES))
    || typeof value.seats !== 'number' || !Number.isInteger(value.seats)
    || typeof value.bodyLimit !== 'number' || !Number.isInteger(value.bodyLimit)
    || (weightLimit !== null && (typeof weightLimit !== 'number' || !Number.isFinite(weightLimit)))
    || !isOneOf(value.operationType, VEHICLE_OPERATION_TYPES)
    || !isOneOf(value.status, VEHICLE_STATUSES)
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE)
  }

  return {
    id: value.id,
    licensePlate: value.licensePlate,
    brand,
    model,
    year,
    vehicleType,
    ownership: value.ownership as VehicleOwnership,
    categories: [...new Set(categories as VehicleCategory[])],
    seats: value.seats,
    bodyLimit: value.bodyLimit,
    weightLimit,
    operationType: value.operationType as VehicleOperationType,
    status: value.status as VehicleStatus,
    revision: value.revision,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

async function throwRequestError(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  const message = readErrorMessage(body, fallback)
  if (response.status === 401) throw new VehicleRequestError('unavailable', message)
  if (response.status === 403) throw new VehicleRequestError('forbidden', message)
  if (response.status === 404) throw new VehicleRequestError('not-found', message)
  if (response.status === 409) {
    throw new VehicleRequestError(
      message.trim().toLowerCase() === DUPLICATE_LICENSE_PLATE_MESSAGE.toLowerCase()
        ? 'conflict-plate'
        : 'conflict-revision',
      message,
    )
  }
  if (response.status === 400 || response.status === 422) {
    throw new VehicleRequestError('validation', message)
  }
  throw new VehicleRequestError('unavailable', message)
}

function jsonBody(payload: object): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

/** Serializa apenas os filtros suportados pelo endpoint de listagem. */
export function buildVehiclesQuery(filters: VehicleFilters): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.category) params.set('category', filters.category)
  if (filters.operationType) params.set('operationType', filters.operationType)
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Lista veículos aplicando os filtros suportados pelo backend. */
export async function listVehicles(api: ApiRequest, filters: VehicleFilters = {}): Promise<Vehicle[]> {
  const response = await api(`/vehicles${buildVehiclesQuery(filters)}`)
  if (!response.ok) await throwRequestError(response, UNAVAILABLE_MESSAGE)
  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) throw new Error(INVALID_RESPONSE_MESSAGE)
  return body.map(parseVehicle)
}

/** Cadastra um veículo e devolve o registro persistido. */
export async function createVehicle(api: ApiRequest, input: CreateVehicleInput): Promise<Vehicle> {
  const response = await api('/vehicles', { method: 'POST', ...jsonBody(input) })
  if (!response.ok) await throwRequestError(response, 'Não foi possível cadastrar o veículo.')
  return parseVehicle(await response.json().catch(() => null))
}

/** Edita um veículo sob controle de revisão otimista. */
export async function updateVehicle(
  api: ApiRequest,
  id: string,
  input: UpdateVehicleInput,
): Promise<Vehicle> {
  const response = await api(`/vehicles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    ...jsonBody(input),
  })
  if (!response.ok) await throwRequestError(response, 'Não foi possível atualizar o veículo.')
  return parseVehicle(await response.json().catch(() => null))
}

/** Altera a situação do veículo conforme a máquina de estados do domínio. */
export async function changeVehicleStatus(
  api: ApiRequest,
  id: string,
  input: ChangeVehicleStatusInput,
): Promise<Vehicle> {
  const response = await api(`/vehicles/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    ...jsonBody(input),
  })
  if (!response.ok) await throwRequestError(response, 'Não foi possível alterar a situação do veículo.')
  return parseVehicle(await response.json().catch(() => null))
}
