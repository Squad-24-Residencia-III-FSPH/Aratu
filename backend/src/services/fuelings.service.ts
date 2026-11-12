import { isDeepStrictEqual } from 'node:util'
import type { PoolClient } from 'pg'
import type { FuelingsRepositoryContract, FuelingTimeline } from '../repositories/fuelings.repository'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { AuditLogger } from '../types/audit.types'
import { FUEL_TYPES, FUELING_AUDIT_OPERATIONS, FuelingServiceError } from '../types/fueling.types'
import type {
  CreateFuelingInput, RectifyFuelingInput, FuelingDetail, FuelingFilters, FuelingList,
  FuelingRequest, FuelingVersion, FuelingWrite, StoredFuelingRequest,
} from '../types/fueling.types'

const MAX_SQL_INTEGER = 2147483647
const MAX_SQL_BIGINT = 9223372036854775807n
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/
const MICROSECONDS_PER_MILLISECOND = 1000n
const SQL_FRACTION_DIGITS = 6
const DATE_FRACTION_DIGITS = 3
const EDITABLE_FIELDS = ['driverId', 'fueledAt', 'fuelType', 'liters', 'totalValue', 'odometerKm', 'station', 'notes'] as const
const METADATA_FIELDS = ['reportedBy', 'reason', 'evidenceDescription', 'attachmentUrl'] as const

function invalid(message: string): never { throw new FuelingServiceError('INVALID_INPUT', message) }
function historyConflict(): never {
  throw new FuelingServiceError('HISTORY_CONFLICT', 'O histórico do veículo está incompleto ou inconsistente. Solicite a revisão das leituras antes de continuar.')
}
function validateId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || value.length > 19 || BigInt(value) > MAX_SQL_BIGINT) {
    invalid('Informe um identificador como texto numérico positivo dentro do limite permitido.')
  }
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000')) invalid(`Informe um texto não vazio em ${field}.`)
  return value.trim()
}
/** Recupera a fração que Date descarta para não alterar a ordem dos fatos do PostgreSQL. */
function subMillisecondDigits(value: string): string {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? ''
  return fraction.padEnd(SQL_FRACTION_DIGITS, '0').slice(DATE_FRACTION_DIGITS, SQL_FRACTION_DIGITS)
}
function epochMicroseconds(value: string): bigint {
  return BigInt(Date.parse(value)) * MICROSECONDS_PER_MILLISECOND + BigInt(subMillisecondDigits(value))
}
function instant(value: unknown): string {
  const match = typeof value === 'string' ? INSTANT_PATTERN.exec(value) : null
  if (!match || typeof value !== 'string') invalid('Informe data e hora ISO com fuso, por exemplo 2026-11-04T10:00:00-03:00.')
  const civil = new Date(`${match[1]}T00:00:00Z`)
  const date = new Date(value)
  if (value.startsWith('0000') || !Number.isFinite(civil.getTime()) || civil.toISOString().slice(0, 10) !== match[1]
    || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59
    || Number(match[5] ?? 0) > 23 || Number(match[6] ?? 0) > 59 || !Number.isFinite(date.getTime())
    || date.getUTCFullYear() < 1) {
    invalid('Data e hora inválidas. Revise o instante e o fuso informados.')
  }
  const remainder = subMillisecondDigits(value)
  return remainder === '000' ? date.toISOString() : date.toISOString().replace('Z', `${remainder}Z`)
}
function decimal(value: unknown, field: string, digits: number, scale: number): string {
  if (typeof value !== 'string' || value.length > digits + scale + 1
    || !/^(0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    invalid(`Informe ${field} como texto decimal positivo, sem vírgula ou notação científica.`)
  }
  const [whole, fraction = ''] = value.split('.')
  if (whole!.length > digits || fraction.length > scale) invalid(`Informe ${field} com até ${digits} dígitos inteiros e ${scale} casas decimais.`)
  if (BigInt(whole! + fraction.padEnd(scale, '0')) <= 0n) invalid(`Informe ${field} maior que zero.`)
  return `${whole}.${fraction.padEnd(scale, '0')}`
}
function positiveInteger(value: unknown, label: string, max = MAX_SQL_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    invalid(`Informe ${label} como inteiro positivo até ${max}.`)
  }
  return value
}

/** Normaliza apenas campos presentes no PUT para preservar a diferença entre omissão e null. */
function normalize(input: unknown, operation: FuelingRequest['operation']): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid('Informe um objeto JSON com os dados do abastecimento.')
  const raw = input as Record<string, unknown>
  const allowed: readonly string[] = [...EDITABLE_FIELDS, ...METADATA_FIELDS, operation === 'CREATE' ? 'vehicleId' : 'expectedRevision']
  if (Object.keys(raw).some(field => !allowed.includes(field))) {
    invalid('Envie apenas campos editáveis do abastecimento. Veículo e campos de autoria, controle ou histórico não podem ser alterados.')
  }
  const result: Record<string, unknown> = {
    reportedBy: text(raw.reportedBy, 'reportedBy (origem da informação)'),
    reason: text(raw.reason, 'reason (justificativa)'),
    evidenceDescription: raw.evidenceDescription == null ? null : text(raw.evidenceDescription, 'evidenceDescription'),
    attachmentUrl: raw.attachmentUrl == null ? null : text(raw.attachmentUrl, 'attachmentUrl'),
  }
  if (!result.evidenceDescription && !result.attachmentUrl) invalid('Informe uma descrição da evidência ou um endereço HTTP(S) do comprovante.')
  if (result.attachmentUrl) {
    let url: URL
    try { url = new URL(result.attachmentUrl as string) } catch { invalid('Informe um endereço HTTP(S) válido em attachmentUrl.') }
    if (!['http:', 'https:'].includes(url.protocol)) invalid('Informe um endereço HTTP(S) válido em attachmentUrl.')
  }
  if (operation === 'CREATE') { validateId(raw.vehicleId); result.vehicleId = raw.vehicleId }
  else result.expectedRevision = positiveInteger(raw.expectedRevision, 'expectedRevision')
  for (const field of EDITABLE_FIELDS) {
    if (!(field in raw) && operation === 'RECTIFY') continue
    const value = raw[field]
    switch (field) {
      case 'driverId':
        if (value != null) validateId(value)
        result[field] = value ?? null
        break
      case 'station': case 'notes':
        result[field] = value == null ? null : text(value, field)
        break
      case 'fueledAt': result[field] = instant(value); break
      case 'fuelType':
        if (!FUEL_TYPES.includes(value as typeof FUEL_TYPES[number])) invalid('Informe um tipo de combustível válido em fuelType.')
        result[field] = value
        break
      case 'liters': result[field] = decimal(value, 'litros (liters)', 7, 3); break
      case 'totalValue': result[field] = decimal(value, 'valor total (totalValue)', 10, 2); break
      case 'odometerKm':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_SQL_INTEGER) {
          invalid('Informe uma quilometragem inteira entre zero e 2.147.483.647 em odometerKm.')
        }
        result[field] = value
    }
  }
  return result
}

function validateChronology(timeline: FuelingTimeline, input: CreateFuelingInput): void {
  if (!timeline.valid) historyConflict()
  const time = epochMicroseconds(input.fueledAt)
  let previous: { km: number; at: string } | undefined
  let next: { km: number; at: string } | undefined
  for (const fact of timeline.facts) {
    if (!fact.occurredAt || !Number.isFinite(Date.parse(fact.occurredAt))) historyConflict()
    const factTime = epochMicroseconds(fact.occurredAt)
    if (factTime <= time && (!previous || fact.odometerKm > previous.km)) previous = { km: fact.odometerKm, at: fact.occurredAt }
    if (factTime >= time && (!next || fact.odometerKm < next.km)) next = { km: fact.odometerKm, at: fact.occurredAt }
  }
  if (previous && next && previous.km > next.km) historyConflict()
  const boundary = previous && input.odometerKm < previous.km ? previous : next && input.odometerKm > next.km ? next : null
  if (boundary) throw new FuelingServiceError('ODOMETER_CONFLICT',
    `A quilometragem informada conflita com a leitura de ${boundary.km} km em ${boundary.at}. Revise a data ou a quilometragem do abastecimento.`)
}

/** Preserva versões, evidências e autoria na mesma transação das leituras e auditoria. */
export class FuelingsService {
  constructor(
    private readonly repository: FuelingsRepositoryContract,
    private readonly vehicles: Pick<VehiclesRepositoryContract, 'withTransaction' | 'findByIdForUpdate' | 'findActorSnapshot'>,
    private readonly audit: AuditLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Consulta apenas versões vigentes, com totais exatos do filtro inteiro.
   * @throws {FuelingServiceError} Se o período, a paginação ou os identificadores forem inválidos.
   */
  async list(filters: FuelingFilters): Promise<FuelingList> {
    const allowed = ['vehicleId', 'driverId', 'from', 'to', 'page', 'pageSize']
    if (Object.keys(filters).some(key => !allowed.includes(key)) || Object.values(filters).some(v => typeof v !== 'string')) invalid('Informe somente os filtros previstos, uma única vez como texto.')
    if (filters.vehicleId !== undefined) validateId(filters.vehicleId)
    if (filters.driverId !== undefined) validateId(filters.driverId)
    const normalized = { ...filters }
    if (filters.from !== undefined) normalized.from = instant(filters.from)
    if (filters.to !== undefined) normalized.to = instant(filters.to)
    if (normalized.from && normalized.to && epochMicroseconds(normalized.from) >= epochMicroseconds(normalized.to)) invalid('O início do período deve anteceder o fim.')
    const pageValue = (value: string | undefined, fallback: number, max: number): number => {
      if (value === undefined) return fallback
      if (!/^[1-9]\d*$/.test(value)) invalid('Informe page e pageSize como inteiros positivos.')
      return positiveInteger(Number(value), 'a paginação', max)
    }
    return this.repository.list(normalized, pageValue(filters.page, 1, MAX_SQL_INTEGER),
      pageValue(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
  }

  /**
   * Mantém o ID solicitado e disponibiliza todas as versões e eventos sem reconstruir snapshots.
   * @throws {FuelingServiceError} Se o ID não existir ou a cadeia legada estiver inconsistente.
   */
  async getById(id: string): Promise<FuelingDetail> {
    validateId(id)
    const chain = await this.repository.history(id)
    if (!chain) throw new FuelingServiceError('NOT_FOUND', 'Abastecimento não encontrado. Confira o identificador.')
    if (!chain.valid) historyConflict()
    const { valid: _valid, ...detail } = chain
    return detail
  }

  /**
   * Registra fato, leitura, evento e auditoria uma única vez por autor e chave.
   * @throws {FuelingServiceError} Se os dados, as referências ou a sequência de hodômetro forem inválidos.
   */
  async create(input: CreateFuelingInput, actorId: string, key: string): Promise<FuelingVersion> {
    const normalized = normalize(input, 'CREATE')
    return this.mutate({ operation: 'CREATE', targetId: null, input: normalized }, actorId, key)
  }

  /**
   * Retifica sem sobrescrever o passado e devolve um novo ID com revisão incrementada.
   * @throws {FuelingServiceError} Se a revisão não for vigente, a chave conflitar ou o histórico impedir a correção.
   */
  async rectify(id: string, input: RectifyFuelingInput, actorId: string, key: string): Promise<FuelingVersion> {
    validateId(id)
    return this.mutate({ operation: 'RECTIFY', targetId: id, input: normalize(input, 'RECTIFY') }, actorId, key)
  }

  private replay(stored: StoredFuelingRequest, request: FuelingRequest): FuelingVersion {
    if (!isDeepStrictEqual(stored.request, request)) throw new FuelingServiceError('IDEMPOTENCY_CONFLICT',
      'Esta chave já foi usada com outros dados, operação ou alvo. Use uma nova chave para uma nova operação.')
    return stored.fueling
  }

  private async mutate(request: FuelingRequest, actorId: string, key: string): Promise<FuelingVersion> {
    validateId(actorId)
    if (typeof key !== 'string' || !UUID_PATTERN.test(key)) invalid('Informe um UUID no cabeçalho Idempotency-Key.')
    key = key.toLowerCase()
    const replay = await this.repository.findRequest(actorId, key)
    if (replay) return this.replay(replay, request)
    const original = request.targetId ? await this.repository.findById(request.targetId) : null
    if (request.targetId && !original) throw new FuelingServiceError('NOT_FOUND', 'Abastecimento não encontrado. Confira o identificador.')
    const vehicleId = original?.vehicleId ?? request.input.vehicleId as string
    try {
      return await this.vehicles.withTransaction(async client => {
        const vehicle = await this.vehicles.findByIdForUpdate(vehicleId, client)
        if (!vehicle) throw new FuelingServiceError('NOT_FOUND', 'Veículo não encontrado. Confira o identificador.')
        const stored = await this.repository.findRequest(actorId, key, client)
        if (stored) return this.replay(stored, request)
        const before = request.targetId ? await this.repository.lockVersion(request.targetId, client) : null
        let ids: string[] = []
        let previousReadingId: string | null = null
        if (request.targetId) {
          if (!before) throw new FuelingServiceError('NOT_FOUND', 'Abastecimento não encontrado.')
          const chain = await this.repository.history(before.id, client)
          if (!chain?.valid) historyConflict()
          if (chain.currentId !== before.id || before.isAnnulled || before.revision !== request.input.expectedRevision) {
            throw new FuelingServiceError('REVISION_CONFLICT', 'Este abastecimento já foi corrigido, anulado ou alterado. Consulte a versão atual antes de continuar.')
          }
          if (before.revision === MAX_SQL_INTEGER) historyConflict()
          ids = chain.versions.map(v => v.id)
          const reading = await this.repository.correctionReading(vehicleId, ids, client)
          if (!reading.valid) historyConflict()
          previousReadingId = reading.id
        }
        const input = { ...before, ...request.input, vehicleId } as unknown as CreateFuelingInput
        if (epochMicroseconds(input.fueledAt) > BigInt(this.now().getTime()) * MICROSECONDS_PER_MILLISECOND) throw new FuelingServiceError('FUTURE_DATE',
          'A data do abastecimento não pode estar no futuro. Confira a data e o fuso informados.')
        const actor = await this.vehicles.findActorSnapshot(actorId, client)
        if (!actor) throw new FuelingServiceError('INACTIVE_ACTOR', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
        const driver = input.driverId ? await this.repository.findDriver(input.driverId, client) : null
        if (input.driverId && !driver) throw new FuelingServiceError('NOT_FOUND', 'Motorista não encontrado. Confira o identificador.')
        validateChronology(await this.repository.timeline(vehicleId, ids, client), input)
        const write: FuelingWrite = {
          input, actor, before, request, requestKey: key,
          vehicleSnapshot: before ? before.vehicleSnapshot : { ...vehicle },
          driverSnapshot: before && before.driverId === (input.driverId ?? null) ? before.driverSnapshot : driver,
        }
        return this.record(write, previousReadingId, client)
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        const stored = await this.repository.findRequest(actorId, key)
        if (stored) return this.replay(stored, request)
        throw new FuelingServiceError('REVISION_CONFLICT', 'Já existe uma correção deste abastecimento. Consulte a versão atual.')
      }
      throw error
    }
  }

  private async record(write: FuelingWrite, previousReadingId: string | null, client: PoolClient): Promise<FuelingVersion> {
    const after = await this.repository.insertVersion(write, client)
    await this.repository.insertReading(write, after, previousReadingId, client)
    await this.repository.insertEvent(write, after, client)
    await this.audit.recordAudit({
      userId: write.actor.id, table: 'fleet.fuelings', recordId: after.id,
      operation: write.before ? FUELING_AUDIT_OPERATIONS.rectify : FUELING_AUDIT_OPERATIONS.create,
      before: write.before ? { ...write.before } : null, after: { ...after },
      actorSnapshot: { ...write.actor }, reason: write.input.reason,
    }, client)
    return after
  }
}
