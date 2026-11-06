import type { ApiRequest } from '../api/client'
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from '../maintenance/maintenanceTypes.ts'
import type {
  MaintenanceOrder, MaintenanceList, MaintenanceFilters, CreateMaintenanceInput,
  UpdateMaintenanceInput, CloseMaintenanceInput,
} from '../maintenance/maintenanceTypes.ts'

export class MaintenanceRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status; this.name = 'MaintenanceRequestError' }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function money(value: unknown): boolean { return typeof value === 'string' && /^\d+\.\d{2}$/.test(value) }
function nullableText(value: unknown): boolean { return value === null || typeof value === 'string' }
function items(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every(item => record(item)
    && typeof item.description === 'string' && money(item.subtotal)
    && ((item.kind === 'PART' && typeof item.quantity === 'string' && money(item.unitPrice))
      || (item.kind === 'LABOR' && money(item.amount)))))
}
function parseOrder(value: unknown): MaintenanceOrder {
  if (!record(value) || typeof value.id !== 'string' || !/^\d+$/.test(value.id)
    || typeof value.vehicleId !== 'string' || typeof value.description !== 'string'
    || !MAINTENANCE_TYPES.some(type => type === value.type)
    || !MAINTENANCE_STATUSES.some(status => status === value.status)
    || !Number.isInteger(value.revision) || typeof value.blocksVehicle !== 'boolean'
    || typeof value.openedAt !== 'string' || !Number.isFinite(Date.parse(value.openedAt))
    || !nullableText(value.closedAt) || !nullableText(value.workshop) || !nullableText(value.expectedCompletionDate)
    || !(value.odometerKm === null || Number.isInteger(value.odometerKm))
    || !items(value.estimateItems) || !items(value.actualItems)
    || ![value.cost, value.finalCost, value.estimatedTotal].every(cost => cost === null || money(cost))
    || !(value.vehicleSnapshot === null || (record(value.vehicleSnapshot) && typeof value.vehicleSnapshot.licensePlate === 'string'))) {
    throw new Error('Não foi possível interpretar a manutenção recebida. Tente novamente.')
  }
  return value as unknown as MaintenanceOrder
}
async function request(api: ApiRequest, path: string, options?: RequestInit): Promise<unknown> {
  const response = await api(path, options)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new MaintenanceRequestError(response.status,
    record(body) && typeof body.erro === 'string' ? body.erro : 'Não foi possível concluir a operação. Tente novamente.')
  return body
}
export function buildMaintenanceQuery(filters: MaintenanceFilters): string {
  const query = new URLSearchParams()
  for (const name of ['vehicleId', 'type', 'status', 'from', 'to'] as const) {
    if (filters[name]) query.set(name, filters[name])
  }
  return query.size ? `?${query}` : ''
}
/** Mantém a soma calculada pelo servidor, inclusive quando a lista do período está vazia. */
export async function listMaintenance(api: ApiRequest, filters: MaintenanceFilters): Promise<MaintenanceList> {
  const body = await request(api, `/maintenance-orders${buildMaintenanceQuery(filters)}`)
  if (!record(body) || !Array.isArray(body.items) || !money(body.totalSpent)) throw new Error('Resposta de manutenções inválida. Tente novamente.')
  return { items: body.items.map(parseOrder), totalSpent: body.totalSpent as string }
}
export async function getMaintenance(api: ApiRequest, id: string): Promise<MaintenanceOrder> {
  return parseOrder(await request(api, `/maintenance-orders/${encodeURIComponent(id)}`))
}
function json(input: object): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
}
/** A chave é mantida pelo formulário em tentativas do mesmo pedido após falha de conexão. */
export async function createMaintenance(api: ApiRequest, input: CreateMaintenanceInput, key: string): Promise<MaintenanceOrder> {
  return parseOrder(await request(api, '/maintenance-orders', { ...json(input), method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key } }))
}
export async function updateMaintenance(api: ApiRequest, id: string, input: UpdateMaintenanceInput): Promise<MaintenanceOrder> {
  return parseOrder(await request(api, `/maintenance-orders/${encodeURIComponent(id)}`, { ...json(input), method: 'PUT' }))
}
export async function closeMaintenance(api: ApiRequest, id: string, input: CloseMaintenanceInput): Promise<MaintenanceOrder> {
  return parseOrder(await request(api, `/maintenance-orders/${encodeURIComponent(id)}/close`, { ...json(input), method: 'PATCH' }))
}
