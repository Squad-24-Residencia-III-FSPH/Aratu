import type { ApiRequest } from '../api/client'
import type { VehicleCategory } from '../vehicles/vehicleTypes'

export interface FleetService {
  id: string
  name: string
  description: string | null
  categories: VehicleCategory[]
  requiresTriage: boolean
  requiresWeight: boolean
  requiresIdentification: boolean
  active: boolean
  revision: number
}

export interface FleetServicePage {
  items: FleetService[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CompatibleVehiclesView {
  serviceId: string
  revision: number
  vehicles: { id: string; licensePlate: string }[]
}

/** Snapshot de compatibilidade usado para editar serviços direto no cadastro do veículo. */
export interface FleetServiceAssignmentSnapshot {
  service: FleetService
  revision: number
  vehicleIds: string[]
}

export interface FleetServiceAssignmentSaveResult {
  snapshot: FleetServiceAssignmentSnapshot[]
  failedServices: string[]
}

export type FleetServiceErrorKind = 'validation' | 'forbidden' | 'not-found' | 'conflict' | 'unavailable'

export class FleetServiceRequestError extends Error {
  readonly kind: FleetServiceErrorKind

  constructor(kind: FleetServiceErrorKind, message: string) {
    super(message)
    this.name = 'FleetServiceRequestError'
    this.kind = kind
  }
}

const CATEGORIES: readonly VehicleCategory[] = ['PASSENGER', 'BODY', 'OTHER']
const INVALID_RESPONSE = 'A resposta de tipos de serviço da API está em um formato inválido.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCategory(value: unknown): value is VehicleCategory {
  return typeof value === 'string' && CATEGORIES.includes(value as VehicleCategory)
}

function parseFleetService(value: unknown): FleetService {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
    || (value.description !== null && typeof value.description !== 'string')
    || !Array.isArray(value.categories) || value.categories.length === 0
    || !value.categories.every(isCategory) || typeof value.requiresTriage !== 'boolean'
    || typeof value.requiresWeight !== 'boolean' || typeof value.requiresIdentification !== 'boolean'
    || typeof value.active !== 'boolean'
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)) {
    throw new Error(INVALID_RESPONSE)
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    categories: [...new Set(value.categories as VehicleCategory[])],
    requiresTriage: value.requiresTriage,
    requiresWeight: value.requiresWeight,
    requiresIdentification: value.requiresIdentification,
    active: value.active,
    revision: value.revision,
  }
}

function parseCompatibleView(value: unknown): CompatibleVehiclesView {
  if (!isRecord(value) || typeof value.serviceId !== 'string'
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
    || !Array.isArray(value.vehicles)
    || value.vehicles.some((vehicle) => !isRecord(vehicle)
      || typeof vehicle.id !== 'string' || typeof vehicle.licensePlate !== 'string')) {
    throw new Error(INVALID_RESPONSE)
  }
  return {
    serviceId: value.serviceId,
    revision: value.revision,
    vehicles: value.vehicles.map(parseCompatibleVehicle),
  }
}

function parseCompatibleVehicle(value: unknown): { id: string; licensePlate: string } {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.licensePlate !== 'string') {
    throw new Error(INVALID_RESPONSE)
  }
  return { id: value.id, licensePlate: value.licensePlate }
}

async function fail(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  const message = isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
    ? body.erro
    : fallback
  if (response.status === 400 || response.status === 422) throw new FleetServiceRequestError('validation', message)
  if (response.status === 403) throw new FleetServiceRequestError('forbidden', message)
  if (response.status === 404) throw new FleetServiceRequestError('not-found', message)
  if (response.status === 409) throw new FleetServiceRequestError('conflict', message)
  throw new FleetServiceRequestError('unavailable', message)
}

async function requestJson<T>(api: ApiRequest, path: string, options: RequestInit, fallback: string,
  parse: (value: unknown) => T): Promise<T> {
  const response = await api(path, options)
  if (!response.ok) await fail(response, fallback)
  return parse(await response.json().catch(() => null))
}

function jsonBody(body: object): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/** Lista todos os tipos para os perfis que mantêm o catálogo. */
export async function listFleetServices(api: ApiRequest): Promise<FleetService[]> {
  return requestJson(api, '/services', {}, 'Não foi possível carregar os tipos de serviço.', (value) => {
    if (!Array.isArray(value)) throw new Error(INVALID_RESPONSE)
    return value.map(parseFleetService)
  })
}

/** Carrega uma página de serviços filtrada no servidor para a consulta administrativa. */
export async function listFleetServicePage(api: ApiRequest, filters: {
  active?: boolean
  search?: string
  page: number
  pageSize: number
}): Promise<FleetServicePage> {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) })
  if (filters.active !== undefined) params.set('active', String(filters.active))
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  const response = await api(`/services?${params}`)
  if (!response.ok) await fail(response, 'Não foi possível carregar os tipos de serviço.')
  const body: unknown = await response.json().catch(() => null)
  if (!isRecord(body) || !Array.isArray(body.items)
    || !Number.isSafeInteger(body.total) || Number(body.total) < 0
    || body.page !== filters.page || body.pageSize !== filters.pageSize
    || !Number.isSafeInteger(body.totalPages) || Number(body.totalPages) < 0) {
    throw new Error(INVALID_RESPONSE)
  }
  return {
    items: body.items.map(parseFleetService),
    total: Number(body.total),
    page: Number(body.page),
    pageSize: Number(body.pageSize),
    totalPages: Number(body.totalPages),
  }
}

/** Cadastra um tipo de serviço independente de qualquer veículo. */
export async function createFleetService(api: ApiRequest, input: {
  name: string
  description: string
  reason: string
}): Promise<FleetService> {
  return requestJson(api, '/services', { method: 'POST', ...jsonBody(input) },
    'Não foi possível cadastrar o tipo de serviço.', parseFleetService)
}

/** Atualiza os dados do tipo com controle de revisão otimista. */
export async function updateFleetService(api: ApiRequest, service: FleetService, input: {
  name: string
  description: string
  reason: string
}): Promise<FleetService> {
  return requestJson(api, `/services/${encodeURIComponent(service.id)}`, {
    method: 'PUT',
    ...jsonBody({
      ...input,
      categories: service.categories,
      requiresTriage: service.requiresTriage,
      requiresWeight: service.requiresWeight,
      requiresIdentification: service.requiresIdentification,
      expectedRevision: service.revision,
    }),
  }, 'Não foi possível atualizar o tipo de serviço.', parseFleetService)
}

/** Altera a situação do tipo mantendo as associações e registrando auditoria. */
export async function setFleetServiceActive(api: ApiRequest, service: FleetService, active: boolean,
  reason: string): Promise<FleetService> {
  const action = active ? 'activate' : 'deactivate'
  return requestJson(api, `/services/${encodeURIComponent(service.id)}/${action}`, {
    method: 'PATCH',
    ...jsonBody({ reason, expectedRevision: service.revision }),
  }, 'Não foi possível alterar a situação do tipo de serviço.', parseFleetService)
}

/** Carrega o catálogo e os vínculos vigentes para edição do formulário de veículo. */
export async function listFleetServiceAssignments(api: ApiRequest): Promise<FleetServiceAssignmentSnapshot[]> {
  const services = await listFleetServices(api)
  return Promise.all(services.map(async (service) => {
    const compatibility = await listCompatibleVehicles(api, service.id)
    return {
      service,
      revision: compatibility.revision,
      vehicleIds: compatibility.vehicles.map((vehicle) => vehicle.id),
    }
  }))
}

/** Lista veículos atualmente associados ao tipo de serviço. */
export async function listCompatibleVehicles(api: ApiRequest, serviceId: string): Promise<CompatibleVehiclesView> {
  return requestJson(api, `/services/${encodeURIComponent(serviceId)}/vehicles`, {},
    'Não foi possível carregar os veículos compatíveis.', parseCompatibleView)
}

/** Substitui integralmente os veículos compatíveis e registra a justificativa. */
export async function replaceCompatibleVehicles(api: ApiRequest, serviceId: string, input: {
  vehicleIds: string[]
  expectedRevision: number
  reason: string
}): Promise<CompatibleVehiclesView> {
  return requestJson(api, `/services/${encodeURIComponent(serviceId)}/vehicles`, {
    method: 'PUT', ...jsonBody(input),
  }, 'Não foi possível atualizar os veículos compatíveis.', parseCompatibleView)
}

/** Atualiza os vínculos alterados e devolve os tipos que falharam para permitir uma nova tentativa. */
export async function saveFleetServiceAssignments(api: ApiRequest, vehicleId: string,
  serviceIds: readonly string[], snapshot: readonly FleetServiceAssignmentSnapshot[], reason: string): Promise<FleetServiceAssignmentSaveResult> {
  const desired = new Set(serviceIds)
  const changes = snapshot.filter(({ service, vehicleIds }) => vehicleIds.includes(vehicleId) !== desired.has(service.id))
  const results = await Promise.allSettled(changes.map(({ service, revision, vehicleIds }) => replaceCompatibleVehicles(
    api,
    service.id,
    {
      vehicleIds: desired.has(service.id)
        ? [...vehicleIds, vehicleId]
        : vehicleIds.filter((id) => id !== vehicleId),
      expectedRevision: revision,
      reason,
    },
  )))
  const nextSnapshot = snapshot.map((entry) => ({ ...entry, vehicleIds: [...entry.vehicleIds] }))
  const failedServices: string[] = []
  results.forEach((result, index) => {
    const change = changes[index]
    if (!change) return
    if (result.status === 'rejected') {
      failedServices.push(change.service.name)
      return
    }
    const snapshotIndex = nextSnapshot.findIndex(({ service }) => service.id === change.service.id)
    if (snapshotIndex >= 0) {
      const current = nextSnapshot[snapshotIndex]
      if (current) {
        nextSnapshot[snapshotIndex] = {
          ...current,
          revision: result.value.revision,
          vehicleIds: result.value.vehicles.map((vehicle) => vehicle.id),
        }
      }
    }
  })
  return { snapshot: nextSnapshot, failedServices }
}
