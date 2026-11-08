import { isDeepStrictEqual } from 'node:util'
import type { PoolClient } from 'pg'
import type { FinesRepositoryContract } from '../repositories/fines.repository'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { DriversRepositoryContract } from '../repositories/drivers.repository'
import type { AuditLogger } from '../types/audit.types'
import type { Vehicle, VehicleActorSnapshot } from '../types/vehicle.types'
import { FINE_STATUSES, FINE_TRANSITIONS, FineServiceError } from '../types/fine.types'
import type {
  Fine, FineAttributes, FineContext, FineDetail, FineDriverSuggestion, FineEventInput,
  FineFilters, FineMetadata, FineRegistration, FineTrip,
  CreateFineInput, UpdateFineInput, ChangeFineStatusInput,
} from '../types/fine.types'

const MAX_SQL_BIGINT = 9223372036854775807n
const MAX_SQL_INTEGER = 2147483647
const MAX_AMOUNT_CENTS = 999999999999n
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const ATTRIBUTE_KEYS = ['vehicleId', 'driverId', 'tripId', 'infractionAt', 'infractionCode',
  'description', 'location', 'amount', 'dueAt', 'notes'] as const
const METADATA_KEYS = ['reportedBy', 'reason', 'evidenceDescription', 'attachmentUrl'] as const

function invalid(message: string): never { throw new FineServiceError('INVALID_INPUT', message) }
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`Informe ${label}.`)
  return value.trim()
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || value.length > 19 || BigInt(value) > MAX_SQL_BIGINT) {
    invalid('Informe um identificador como texto numérico positivo dentro do limite permitido.')
  }
}
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value) || !date(value.slice(0, 10))
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59
    || Number(value.slice(17, 19)) > 59) invalid('Informe data e hora ISO válidas com fuso, por exemplo 2026-11-01T14:00:00-03:00.')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() < 1 || parsed.getUTCFullYear() > 9999) invalid('Data, hora ou fuso inválidos. Revise o instante informado.')
  return parsed.toISOString()
}
function shape(value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('Informe um objeto JSON com os dados da multa.')
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid('Há campos não permitidos. Envie somente os campos previstos para esta operação.')
}
function metadata(input: FineMetadata): FineMetadata {
  let attachmentUrl: string | null = null
  if (input.attachmentUrl !== undefined && input.attachmentUrl !== null) {
    attachmentUrl = text(input.attachmentUrl, 'uma URL HTTP ou HTTPS para a evidência')
    let url: URL
    try { url = new URL(attachmentUrl) } catch { return invalid('Informe uma URL HTTP ou HTTPS válida para a evidência.') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('Informe uma URL HTTP ou HTTPS sem credenciais para a evidência.')
  }
  return { reportedBy: text(input.reportedBy, 'a origem da informação em reportedBy'),
    reason: text(input.reason, 'a justificativa em reason'),
    evidenceDescription: text(input.evidenceDescription, 'a descrição da evidência em evidenceDescription'), attachmentUrl }
}
function attributes(input: CreateFineInput | FineAttributes): FineAttributes {
  id(input.vehicleId)
  const driverId = input.driverId ?? null
  const tripId = input.tripId ?? null
  if (driverId !== null) id(driverId)
  if (tripId !== null) id(tripId)
  if (typeof input.amount !== 'string' || !/^(0|[1-9]\d{0,9})\.\d{2}$/.test(input.amount)
    || BigInt(input.amount.replace('.', '')) > MAX_AMOUNT_CENTS) {
    invalid('Informe o valor em reais como texto com duas casas decimais, maior ou igual a zero e até 9999999999.99.')
  }
  const dueAt = input.dueAt ?? null
  if (dueAt !== null && !date(dueAt)) invalid('Informe o vencimento como data válida no formato AAAA-MM-DD.')
  return { vehicleId: input.vehicleId, driverId, tripId, infractionAt: instant(input.infractionAt),
    infractionCode: text(input.infractionCode, 'o código da infração'), description: text(input.description, 'a descrição da infração'),
    amount: input.amount, dueAt, location: input.location == null ? null : text(input.location, 'um local válido'),
    notes: input.notes == null ? null : text(input.notes, 'observações válidas') }
}
function revision(value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SQL_INTEGER) invalid('Informe expectedRevision como inteiro positivo dentro do limite permitido.')
}
function notFound(label: string): never { throw new FineServiceError('NOT_FOUND', `${label} não encontrado. Confira o identificador.`) }
function conflict(): never { throw new FineServiceError('REVISION_CONFLICT', 'A multa foi alterada por outra operação. Atualize os dados e tente novamente.') }
function eligible(trip: FineTrip, values: FineAttributes, now: string): boolean {
  if (!trip.startedAt || trip.vehicleId !== values.vehicleId || trip.driverId !== values.driverId
    || !['IN_PROGRESS', 'FINISHED', 'CONFIRMED'].includes(trip.status) || trip.startedAt > values.infractionAt) return false
  return trip.finishedAt !== null ? values.infractionAt < trip.finishedAt
    : trip.status === 'IN_PROGRESS' && values.infractionAt <= now
}
function currentAttributes(value: Fine): FineAttributes {
  return Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, value[key]])) as unknown as FineAttributes
}

/** Mantém o registro histórico de multas sem alterar a operação de veículos, motoristas ou viagens. */
export class FinesService {
  constructor(
    private readonly repository: FinesRepositoryContract,
    private readonly vehicles: Pick<VehiclesRepositoryContract, 'withTransaction' | 'findById' | 'findByIdForUpdate' | 'findActorSnapshot'>,
    private readonly drivers: Pick<DriversRepositoryContract, 'findById'>,
    private readonly audit: AuditLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Combina filtros pelo instante da infração, preservando limites semiabertos.
   * @throws {FineServiceError} Se identificadores, situação ou período forem inválidos.
   */
  async list(filters: FineFilters): Promise<{ items: Fine[] }> {
    shape(filters, ['vehicleId', 'driverId', 'status', 'from', 'to'])
    if (filters.vehicleId !== undefined) id(filters.vehicleId)
    if (filters.driverId !== undefined) id(filters.driverId)
    if (filters.status !== undefined && !FINE_STATUSES.includes(filters.status)) invalid('Informe uma situação de multa válida.')
    const from = filters.from === undefined ? undefined : instant(filters.from)
    const to = filters.to === undefined ? undefined : instant(filters.to)
    if (from && to && from >= to) invalid('O início do período deve anteceder o fim.')
    return { items: await this.repository.list({ ...filters, ...(from ? { from } : {}), ...(to ? { to } : {}) }) }
  }

  /** Lê estado e histórico na mesma fotografia do banco, inclusive registros legados.
   * @throws {FineServiceError} Se o identificador for inválido ou não existir.
   */
  async getById(value: string): Promise<FineDetail> {
    id(value)
    return await this.repository.findDetail(value) ?? notFound('Registro de multa')
  }

  /** Sugere viagens efetivamente iniciadas, sem atribuição automática de responsabilidade.
   * @throws {FineServiceError} Se veículo ou instante forem inválidos ou inexistentes.
   */
  async suggestDrivers(vehicleId: string, infractionAt: string): Promise<{ items: FineDriverSuggestion[] }> {
    id(vehicleId)
    const at = instant(infractionAt)
    if (!await this.vehicles.findById(vehicleId)) notFound('Veículo')
    return { items: await this.repository.findDriverSuggestions(vehicleId, at, this.clock().toISOString()) }
  }

  /** Compara reenvios com o pedido original imutável e grava cadastro, evento e auditoria atomicamente.
   * @throws {FineServiceError} Se entrada, vínculo ou chave de reenvio forem incompatíveis.
   */
  async create(input: CreateFineInput, actorId: string, key: string): Promise<Fine> {
    shape(input, [...ATTRIBUTE_KEYS, ...METADATA_KEYS])
    id(actorId)
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) invalid('Informe um UUID no cabeçalho Idempotency-Key.')
    key = key.toLowerCase()
    const values = attributes(input)
    const source = metadata(input)
    const request = { ...values, ...source }
    const previous = await this.repository.findRegistration(actorId, key)
    if (previous) return this.replay(previous, request)
    try {
      return await this.vehicles.withTransaction(async client => {
        const vehicle = await this.lockVehicle(values.vehicleId, client)
        const registration = await this.repository.findRegistration(actorId, key, client)
        if (registration) return this.replay(registration, request, client)
        const context = await this.context(values, vehicle, client)
        const actor = await this.actor(actorId, client)
        const after = await this.repository.create(values, context, actorId, key, client)
        await this.record({ fineId: after.id, eventType: 'REGISTERED', occurredAt: values.infractionAt,
          metadata: source, actor, before: null, after, supersedesId: null, registrationRequest: request }, client)
        return after
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        const registration = await this.repository.findRegistration(actorId, key)
        if (registration) return this.replay(registration, request)
      }
      throw error
    }
  }

  /** Retifica campos enviados, preservando os retratos congelados dos vínculos que não mudaram.
   * @throws {FineServiceError} Se revisão, estado fechado ou vínculo impedirem a correção.
   */
  async updateFine(idValue: string, input: UpdateFineInput, actorId: string): Promise<Fine> {
    shape(input, [...ATTRIBUTE_KEYS, ...METADATA_KEYS, 'expectedRevision', 'occurredAt'])
    if (!ATTRIBUTE_KEYS.some(key => Object.hasOwn(input, key))) invalid('Envie ao menos um campo editável da multa.')
    const source = metadata(input)
    const occurredAt = instant(input.occurredAt)
    if (input.vehicleId !== undefined) id(input.vehicleId)
    return this.mutate(idValue, input.expectedRevision, input.vehicleId, async (before, vehicle, client) => {
      if (before.status === 'PAID' || before.status === 'CANCELED') throw new FineServiceError('CLOSED_FINE', 'Reabra a multa antes de alterar os dados de uma multa paga ou cancelada.')
      const values = attributes({ ...currentAttributes(before), ...input })
      const context = await this.context(values, vehicle, client, before)
      if (isDeepStrictEqual(values, currentAttributes(before))) return before
      const actor = await this.actor(actorId, client)
      const after = await this.repository.saveAttributes(idValue, values, context, client)
      const events = await this.repository.listEvents(idValue, client)
      const eventType = before.driverId !== values.driverId
        ? before.driverId === null && values.driverId !== null ? 'DRIVER_IDENTIFIED' : 'DRIVER_CHANGED' : 'RECTIFIED'
      await this.record({ fineId: idValue, eventType, occurredAt, metadata: source, actor,
        before, after, supersedesId: events.at(-1)?.id ?? null }, client)
      return after
    })
  }

  /** Executa somente transições confirmadas, mantendo pagamentos e cancelamentos anteriores no histórico.
   * @throws {FineServiceError} Se revisão, datas ou transição forem inválidas.
   */
  async changeStatus(idValue: string, input: ChangeFineStatusInput, actorId: string): Promise<Fine> {
    shape(input, [...METADATA_KEYS, 'expectedRevision', 'status', 'paidAt', 'occurredAt'])
    const source = metadata(input)
    if (!FINE_STATUSES.includes(input.status)) invalid('Informe uma situação de multa válida.')
    const paidAt = input.status === 'PAID' ? instant(input.paidAt) : null
    if (input.status !== 'PAID' && Object.hasOwn(input, 'paidAt')) invalid('Informe paidAt somente para pagamento.')
    const occurredAt = paidAt ?? instant(input.occurredAt)
    if (paidAt && input.occurredAt !== undefined && instant(input.occurredAt) !== paidAt) invalid('occurredAt deve representar o mesmo instante de paidAt no pagamento.')
    return this.mutate(idValue, input.expectedRevision, undefined, async (before, _vehicle, client) => {
      if (before.status === input.status) return before
      if (!FINE_TRANSITIONS[before.status].includes(input.status)) throw new FineServiceError('INVALID_TRANSITION', 'Mudança de situação não permitida. Reabra a multa antes de escolher outra situação.')
      const actor = await this.actor(actorId, client)
      const after = await this.repository.saveStatus(idValue, input.status, paidAt, input.status === 'CANCELED' ? source.reason : null, client)
      await this.record({ fineId: idValue, eventType: input.status === 'PENDING' ? 'REOPENED' : input.status,
        occurredAt, metadata: source, actor, before, after, supersedesId: null }, client)
      return after
    })
  }

  private async mutate(value: string, expectedRevision: number, nextVehicleId: string | undefined,
    work: (before: Fine, vehicle: Vehicle, client: PoolClient) => Promise<Fine>): Promise<Fine> {
    id(value)
    revision(expectedRevision)
    const initial = await this.repository.findById(value) ?? notFound('Registro de multa')
    return this.vehicles.withTransaction(async client => {
      // Todos os caminhos travam veículos por id crescente antes da multa, evitando inversões.
      const ids = [...new Set([initial.vehicleId, nextVehicleId ?? initial.vehicleId])].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
      const vehicles = new Map<string, Vehicle>()
      for (const vehicleId of ids) vehicles.set(vehicleId, await this.lockVehicle(vehicleId, client))
      const before = await this.repository.lockById(value, client) ?? notFound('Registro de multa')
      if (before.revision !== expectedRevision || before.vehicleId !== initial.vehicleId) conflict()
      return work(before, vehicles.get(nextVehicleId ?? before.vehicleId)!, client)
    })
  }

  private async context(values: FineAttributes, vehicle: Vehicle, client: PoolClient, before?: Fine): Promise<FineContext> {
    const driver = values.driverId === null ? null : await this.drivers.findById(values.driverId, client) ?? notFound('Motorista')
    const trip = values.tripId === null ? null : await this.repository.findTripForShare(values.tripId, client) ?? notFound('Registro de viagem')
    const capturedAt = this.clock().toISOString()
    if (trip && !eligible(trip, values, capturedAt)) throw new FineServiceError('INVALID_LINK', 'A viagem selecionada não corresponde ao veículo, motorista ou horário informado. Revise a seleção.')
    const tripChanged = !before || before.tripId !== values.tripId
    return {
      vehicleSnapshot: before && before.vehicleId === values.vehicleId && !tripChanged ? before.vehicleSnapshot : {
        id: vehicle.id, licensePlate: trip?.vehicleSnapshot?.licensePlate ?? vehicle.licensePlate,
        model: trip?.vehicleSnapshot?.licensePlate ? trip.vehicleSnapshot.model ?? null : vehicle.model,
        source: trip?.vehicleSnapshot?.licensePlate ? 'TRIP_SNAPSHOT' : 'CURRENT_REGISTRY', capturedAt },
      driverSnapshot: before && before.driverId === values.driverId && !tripChanged ? before.driverSnapshot : driver ? {
        id: driver.id, name: trip?.driverSnapshot?.name ?? driver.name,
        source: trip?.driverSnapshot?.name ? 'TRIP_SNAPSHOT' : 'CURRENT_REGISTRY', capturedAt } : null,
      tripSnapshot: before && !tripChanged ? before.tripSnapshot : trip ? {
        id: trip.id, vehicleId: trip.vehicleId, driverId: trip.driverId, startedAt: trip.startedAt,
        finishedAt: trip.finishedAt, status: trip.status, capturedAt } : null,
    }
  }
  private async replay(previous: FineRegistration, request: Record<string, unknown>, client?: PoolClient): Promise<Fine> {
    if (!isDeepStrictEqual(previous.request, request)) throw new FineServiceError('IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados. Use uma nova chave para outro cadastro.')
    return await this.repository.findById(previous.fineId, client) ?? notFound('Registro de multa')
  }
  private async lockVehicle(value: string, client: PoolClient): Promise<Vehicle> {
    return await this.vehicles.findByIdForUpdate(value, client) ?? notFound('Veículo')
  }
  private async actor(value: string, client: PoolClient): Promise<VehicleActorSnapshot> {
    id(value)
    const actor = await this.vehicles.findActorSnapshot(value, client)
    if (!actor) throw new FineServiceError('INACTIVE_ACTOR', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    return actor
  }
  private async record(event: FineEventInput, client: PoolClient): Promise<void> {
    await this.repository.createEvent(event, client)
    await this.audit.recordAudit({ userId: event.actor.id, table: 'fleet.fines', recordId: event.fineId,
      operation: event.eventType, before: event.before ? { ...event.before } : null, after: { ...event.after },
      actorSnapshot: { ...event.actor }, reason: event.metadata.reason }, client)
  }
}
