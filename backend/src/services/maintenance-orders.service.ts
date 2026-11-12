import { isDeepStrictEqual } from 'node:util'
import type { PoolClient } from 'pg'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { MaintenanceRepositoryContract } from '../repositories/maintenance-orders.repository'
import type { AuditLogger } from '../types/audit.types'
import type { Vehicle, VehicleActorSnapshot } from '../types/vehicle.types'
import type { VehiclesService } from './vehicles.service'
import {
  ACTIVE_MAINTENANCE_STATUSES, MAINTENANCE_TYPES, MAINTENANCE_STATUSES, MaintenanceServiceError,
} from '../types/maintenance.types'
import type {
  MaintenanceItem, PricedMaintenanceItem, MaintenanceOrder, MaintenanceDetail, MaintenanceAttributes,
  MaintenanceMetadata, MaintenanceFilters, MaintenanceList, CreateMaintenanceInput,
  UpdateMaintenanceInput, CloseMaintenanceInput, MaintenanceEvent,
} from '../types/maintenance.types'

const MAX_COST_CENTS = 999999999999n
const QUANTITY_SCALE = 1000n
const CENTS_PER_REAL = 100n
const MAX_SQL_INTEGER = 2147483647
const MAX_SQL_BIGINT = 9223372036854775807n
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function invalid(message: string): never {
  throw new MaintenanceServiceError(400, message)
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`Informe ${label}.`)
  return value.trim()
}

function moneyCents(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
    invalid('Informe valores em reais como texto com duas casas decimais e sem sinal negativo.')
  }
  return BigInt(value.replace('.', ''))
}

function moneyText(cents: bigint): string {
  return `${cents / CENTS_PER_REAL}.${(cents % CENTS_PER_REAL).toString().padStart(2, '0')}`
}

/**
 * Calcula cada peça em milésimos de quantidade, arredonda metade para cima e soma centavos exatos.
 * @throws {MaintenanceServiceError} Se as linhas ou o total excederem o contrato monetário.
 */
export function priceMaintenanceItems(value: unknown): { items: PricedMaintenanceItem[]; total: string } {
  if (!Array.isArray(value)) invalid('Informe a relação de peças e serviços como uma lista.')
  let total = 0n
  const items = value.map((raw: unknown): PricedMaintenanceItem => {
    if (typeof raw !== 'object' || raw === null) invalid('Informe uma peça ou serviço válido.')
    const item = raw as Record<string, unknown>
    const description = requiredText(item.description, 'a descrição da peça ou serviço')
    let normalized: MaintenanceItem
    let subtotal: bigint
    if (item.kind === 'PART') {
      if (typeof item.quantity !== 'string' || !/^(0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.quantity)) {
        invalid('Informe uma quantidade positiva com até três casas decimais.')
      }
      const [whole, fraction = ''] = item.quantity.split('.')
      const quantity = BigInt(whole!) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, '0'))
      if (quantity <= 0n) invalid('A quantidade da peça deve ser maior que zero.')
      const unitPrice = moneyCents(item.unitPrice)
      subtotal = (quantity * unitPrice + QUANTITY_SCALE / 2n) / QUANTITY_SCALE
      const quantityText = item.quantity.includes('.') ? item.quantity.replace(/0+$/, '').replace(/\.$/, '') : item.quantity
      normalized = { kind: 'PART', description, quantity: quantityText, unitPrice: moneyText(unitPrice) }
    } else if (item.kind === 'LABOR') {
      subtotal = moneyCents(item.amount)
      normalized = { kind: 'LABOR', description, amount: moneyText(subtotal) }
    } else {
      invalid('Informe PART para peça ou LABOR para serviço.')
    }
    total += subtotal
    if (total > MAX_COST_CENTS) invalid('O custo total excede R$ 9.999.999.999,99. Revise os valores.')
    return { ...normalized, subtotal: moneyText(subtotal) }
  })
  return { items, total: moneyText(total) }
}

function normalizeItems(value: unknown): MaintenanceItem[] | null {
  if (value === undefined || value === null) return null
  return priceMaintenanceItems(value).items.map(({ subtotal: _subtotal, ...item }) => item)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function instant(value: unknown): Date {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value) || !validDate(value.slice(0, 10))) {
    invalid('Informe data e hora ISO com fuso, por exemplo 2026-11-03T09:00:00-03:00.')
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || Number(value.slice(11, 13)) > 23
    || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    invalid('Data e hora inválidas. Revise o instante informado.')
  }
  return date
}

function validateId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_SQL_BIGINT) {
    invalid('Informe um identificador válido como texto numérico positivo.')
  }
}

function metadata(input: MaintenanceMetadata): MaintenanceMetadata {
  return { reportedBy: requiredText(input.reportedBy, 'a origem da informação em reportedBy'),
    reason: requiredText(input.reason, 'a justificativa em reason') }
}

function attributes(input: MaintenanceAttributes | CreateMaintenanceInput, openedAt: Date): MaintenanceAttributes {
  if (!MAINTENANCE_TYPES.includes(input.type)) invalid('Informe o tipo PREVENTIVE ou CORRECTIVE.')
  if (typeof input.blocksVehicle !== 'boolean') invalid('Informe se a manutenção impede o uso do veículo em blocksVehicle.')
  const odometerKm = input.odometerKm ?? null
  if (odometerKm !== null && (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > MAX_SQL_INTEGER)) {
    invalid('Informe uma quilometragem inteira entre zero e 2.147.483.647.')
  }
  const expectedCompletionDate = input.expectedCompletionDate ?? null
  if (expectedCompletionDate !== null) {
    if (!validDate(expectedCompletionDate)) invalid('Informe uma previsão válida no formato AAAA-MM-DD.')
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(openedAt)
    const part = (type: string) => parts.find(p => p.type === type)!.value
    const localOpeningDate = `${part('year')}-${part('month')}-${part('day')}`
    if (expectedCompletionDate < localOpeningDate) invalid('A previsão não pode anteceder a data local de entrada do veículo.')
  }
  return { type: input.type, description: requiredText(input.description, 'a descrição da manutenção'),
    blocksVehicle: input.blocksVehicle, odometerKm, expectedCompletionDate,
    workshop: input.workshop == null ? null : requiredText(input.workshop, 'uma oficina válida'),
    estimateItems: normalizeItems(input.estimateItems) }
}

function detail(order: MaintenanceOrder): MaintenanceDetail {
  const estimate = order.estimateItems === null ? null : priceMaintenanceItems(order.estimateItems)
  const actual = order.actualItems === null ? null : priceMaintenanceItems(order.actualItems)
  return { ...order, estimateItems: estimate?.items ?? null, estimatedTotal: estimate?.total ?? null,
    actualItems: actual?.items ?? null, finalCost: order.cost }
}

/** Orquestra orçamento, execução, disponibilidade e autoria na transação da viatura. */
export class MaintenanceOrdersService {
  constructor(
    private readonly repository: MaintenanceRepositoryContract,
    private readonly vehiclesRepository: VehiclesRepositoryContract,
    private readonly vehiclesService: Pick<VehiclesService, 'changeVehicleStatusInTransaction'>,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Consulta ordens pela entrada e gasto pelo encerramento na mesma fotografia do banco.
   * @throws {MaintenanceServiceError} Se algum filtro ou período for inválido.
   */
  async list(filters: MaintenanceFilters): Promise<MaintenanceList> {
    if (filters.vehicleId !== undefined) validateId(filters.vehicleId)
    if (filters.type !== undefined && !MAINTENANCE_TYPES.includes(filters.type)) invalid('Tipo de manutenção inválido.')
    if (filters.status !== undefined && !MAINTENANCE_STATUSES.includes(filters.status)) invalid('Situação de manutenção inválida.')
    const from = filters.from === undefined ? null : instant(filters.from)
    const to = filters.to === undefined ? null : instant(filters.to)
    if (from && to && from >= to) invalid('O início do período deve anteceder o fim.')
    const result = await this.repository.list(filters)
    return { items: result.items.map(detail), totalSpent: result.totalSpent }
  }

  /**
   * Preserva consulta de ordens legadas com valores desconhecidos e snapshots históricos.
   * @throws {MaintenanceServiceError} Se o identificador for inválido ou a ordem não existir.
   */
  async getById(id: string): Promise<MaintenanceDetail> {
    validateId(id)
    const order = await this.repository.findById(id)
    if (!order) throw new MaintenanceServiceError(404, 'Manutenção não encontrada. Confira o identificador.')
    return detail(order)
  }

  /**
   * Registra uma única abertura por chave e autor, comparando sempre o pedido imutável original.
   * @throws {MaintenanceServiceError} Se o pedido conflitar com chave, disponibilidade ou contrato.
   */
  async create(input: CreateMaintenanceInput, actorId: string, key: string): Promise<MaintenanceDetail> {
    validateId(input.vehicleId)
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) invalid('Informe um UUID no cabeçalho Idempotency-Key.')
    key = key.toLowerCase()
    const previous = await this.repository.findOpening(actorId, key)
    const original = previous && input.openedAt === undefined
      ? await this.repository.findById(previous.orderId) : null
    const openedAt = input.openedAt === undefined ? (original?.openedAt ?? new Date()) : instant(input.openedAt)
    const values = attributes(input, openedAt)
    const source = metadata(input)
    const request = { ...values, ...source, vehicleId: input.vehicleId,
      openedAt: input.openedAt === undefined ? null : openedAt.toISOString(), creationKey: key }
    if (previous) return this.replay(previous, request)
    try {
      return await this.vehiclesRepository.withTransaction(async client => {
        const vehicle = await this.lockVehicle(input.vehicleId, client)
        const opening = await this.repository.findOpeningInTransaction(actorId, key, client)
        if (opening) return this.replay(opening, request, client)
        if (values.blocksVehicle) await this.requireAvailable(vehicle, client)
        const actor = await this.requireActor(actorId, client)
        const order = await this.repository.create(values, vehicle, openedAt, actorId, key, client)
        if (values.blocksVehicle) await this.setVehicleStatus(vehicle, 'IN_MAINTENANCE', source, actorId, client)
        await this.record({ orderId: order.id, eventType: 'OPENED', occurredAt: openedAt,
          actor, metadata: source, before: null, after: order, openingRequest: request }, client)
        return detail(order)
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        const opening = await this.repository.findOpening(actorId, key)
        if (opening) return this.replay(opening, request)
        throw new MaintenanceServiceError(409, 'Já existe uma manutenção impeditiva ativa para o veículo. Consulte a ordem existente.')
      }
      throw error
    }
  }

  /**
   * Revisa somente campos editáveis, mantendo veículo, abertura e autoria originais.
   * @throws {MaintenanceServiceError} Se a revisão estiver obsoleta ou a ordem estiver encerrada.
   */
  async updateOrder(id: string, input: UpdateMaintenanceInput, actorId: string): Promise<MaintenanceDetail> {
    const source = metadata(input)
    return this.mutate(id, input.expectedRevision, async (before, vehicle, client) => {
      const values = attributes({ ...before, ...input }, before.openedAt)
      if (values.blocksVehicle && !before.blocksVehicle) await this.requireAvailable(vehicle, client, id)
      const actor = await this.requireActor(actorId, client)
      const order = await this.repository.saveAttributes(id, values, client)
      if (values.blocksVehicle && !before.blocksVehicle) {
        await this.setVehicleStatus(vehicle, 'IN_MAINTENANCE', source, actorId, client)
      }
      if (!values.blocksVehicle && before.blocksVehicle) await this.releaseVehicle(vehicle, source, actorId, client)
      await this.record({ orderId: id, eventType: 'UPDATED', occurredAt: new Date(), actor,
        metadata: source, before, after: order }, client)
      return detail(order)
    })
  }

  /**
   * Encerra preservando orçamento e calculando execução, com liberação exclusiva do impedimento da OS.
   * @throws {MaintenanceServiceError} Se houver revisão obsoleta, custo divergente ou execução inconsistente.
   */
  async close(id: string, input: CloseMaintenanceInput, actorId: string): Promise<MaintenanceDetail> {
    const source = metadata(input)
    const closedAt = input.closedAt === undefined ? new Date() : instant(input.closedAt)
    if (input.confirmEstimate !== undefined && input.confirmEstimate !== true) invalid('Use confirmEstimate=true para confirmar o orçamento.')
    if ((input.confirmEstimate === true) === (input.actualItems !== undefined)) {
      invalid('Escolha apenas confirmar o orçamento ou informar a lista completa de itens executados.')
    }
    return this.mutate(id, input.expectedRevision, async (before, vehicle, client) => {
      if (closedAt < before.openedAt) invalid('O encerramento não pode anteceder a abertura.')
      const items = input.confirmEstimate ? before.estimateItems : normalizeItems(input.actualItems)
      if (items === null) invalid('Esta ordem não possui orçamento. Informe os itens executados, inclusive uma lista vazia se necessário.')
      const total = priceMaintenanceItems(items).total
      if (input.cost !== undefined && moneyCents(input.cost) !== moneyCents(total)) invalid('O custo informado difere dos itens executados. Confira os valores.')
      const actor = await this.requireActor(actorId, client)
      const order = await this.repository.close(id, items, total, closedAt, actorId, client)
      if (before.blocksVehicle) await this.releaseVehicle(vehicle, source, actorId, client)
      await this.record({ orderId: id, eventType: 'CLOSED', occurredAt: closedAt, actor,
        metadata: source, before, after: order }, client)
      return detail(order)
    })
  }

  private async mutate(id: string, revision: number,
    work: (order: MaintenanceOrder, vehicle: Vehicle, client: PoolClient) => Promise<MaintenanceDetail>,
  ): Promise<MaintenanceDetail> {
    validateId(id)
    if (!Number.isInteger(revision) || revision < 1 || revision > MAX_SQL_INTEGER) invalid('Informe expectedRevision como inteiro positivo.')
    const current = await this.repository.findById(id)
    if (!current) throw new MaintenanceServiceError(404, 'Manutenção não encontrada. Confira o identificador.')
    return this.vehiclesRepository.withTransaction(async client => {
      const vehicle = await this.lockVehicle(current.vehicleId, client)
      const before = await this.repository.lockOrder(id, client)
      if (!before) throw new MaintenanceServiceError(404, 'Manutenção não encontrada.')
      if (before.revision !== revision || !ACTIVE_MAINTENANCE_STATUSES.includes(before.status)) {
        throw new MaintenanceServiceError(409, 'A ordem foi alterada ou encerrada. Atualize os dados antes de tentar novamente.')
      }
      return work(before, vehicle, client)
    })
  }

  private async replay(opening: { orderId: string; request: Record<string, unknown> }, request: Record<string, unknown>, client?: PoolClient): Promise<MaintenanceDetail> {
    if (!isDeepStrictEqual(opening.request, request)) throw new MaintenanceServiceError(409, 'Esta chave já foi usada com outros dados. Use uma nova chave para outra manutenção.')
    const order = await this.repository.findById(opening.orderId, client)
    if (!order) throw new MaintenanceServiceError(404, 'Manutenção não encontrada.')
    return detail(order)
  }

  private async lockVehicle(id: string, client: PoolClient): Promise<Vehicle> {
    const vehicle = await this.vehiclesRepository.findByIdForUpdate(id, client)
    if (!vehicle) throw new MaintenanceServiceError(404, 'Veículo não encontrado. Confira o identificador.')
    return vehicle
  }

  private async requireActor(id: string, client: PoolClient): Promise<VehicleActorSnapshot> {
    const actor = await this.vehiclesRepository.findActorSnapshot(id, client)
    if (!actor) throw new MaintenanceServiceError(401, 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    return actor
  }

  private async requireAvailable(vehicle: Vehicle, client: PoolClient, excludingId?: string): Promise<void> {
    if (await this.repository.hasActiveBlock(vehicle.id, client, excludingId)) {
      throw new MaintenanceServiceError(409, 'Já existe uma manutenção impeditiva ativa. Consulte a ordem existente.')
    }
    if (vehicle.status !== 'AVAILABLE') throw new MaintenanceServiceError(422, 'O veículo está inativo ou impedido manualmente. Regularize a situação antes de bloquear por esta ordem.')
    if (await this.repository.hasActiveTrip(vehicle.id, client)) {
      throw new MaintenanceServiceError(422, 'O veículo está em viagem. Encerre a viagem antes de abrir uma manutenção impeditiva.')
    }
  }

  private async releaseVehicle(vehicle: Vehicle, source: MaintenanceMetadata, actorId: string, client: PoolClient): Promise<void> {
    if (vehicle.status === 'IN_MAINTENANCE' && !await this.repository.hasActiveBlock(vehicle.id, client)) {
      await this.setVehicleStatus(vehicle, 'AVAILABLE', source, actorId, client)
    }
  }

  private async setVehicleStatus(vehicle: Vehicle, status: Vehicle['status'], source: MaintenanceMetadata, actorId: string, client: PoolClient): Promise<void> {
    await this.vehiclesService.changeVehicleStatusInTransaction(vehicle.id,
      { ...source, status, expectedRevision: vehicle.revision }, actorId, client)
  }

  private async record(event: MaintenanceEvent, client: PoolClient): Promise<void> {
    await this.repository.createEvent(event, client)
    await this.audit.recordAudit({ userId: event.actor.id, table: 'fleet.maintenance_orders', recordId: event.orderId,
      operation: event.eventType, before: event.before ? { ...event.before } : null, after: { ...event.after },
      actorSnapshot: { ...event.actor }, reason: event.metadata.reason }, client)
  }
}
