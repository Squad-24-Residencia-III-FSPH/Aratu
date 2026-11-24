import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import { AVAILABILITY_REASONS, AvailabilityError } from '../types/availability.types'
import type { AvailabilityReason, Period } from '../types/availability.types'
import {
  DEFAULT_CONFIRMATION_REASON,
  DEFAULT_EXECUTION_REASONS,
  DEFAULT_SCHEDULING_REASON,
  DirectTripContext,
  SCHEDULING_STATUSES,
  TRIP_STATUSES,
  TripServiceError,
} from '../types/trip.types'
import type {
  ConfirmTripInput,
  CreateDirectTripInput,
  DriverTrip,
  TripConfirmation,
  TripListFilters,
  TripListQuery,
  TripStatus,
  TripSummary,
  FinishTripInput,
  ScheduleTripInput,
  SchedulingEventMetadata,
  StartTripInput,
  Trip,
  TripActor,
} from '../types/trip.types'
import type { FuelingsRepositoryContract } from '../repositories/fuelings.repository'
import type { TripsRepositoryContract } from '../repositories/trips.repository'
import { parsePeriod } from './availability.service'
import type { AvailabilityService } from './availability.service'

const ID_PATTERN = /^[1-9]\d*$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_ODOMETER_KM = 2_147_483_647
const MAX_PASSENGERS = 2_147_483_647
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MISSING_EVIDENCE_MESSAGE = 'Viagem sem evidências do odômetro não pode ser confirmada'
const IN_PROGRESS_CONFLICT_MESSAGE = 'Já existe viagem em andamento com este veículo ou motorista.'

/** Leitura da linha do tempo de hodômetro do veículo (mesma regra usada pelo abastecimento). */
export type OdometerTimelineReader = Pick<FuelingsRepositoryContract, 'timeline'>

const REASON_LABELS: Readonly<Record<AvailabilityReason, string>> = {
  CONFLICT: 'já tem viagem no período',
  MAINTENANCE: 'está em manutenção',
  INCOMPATIBLE: 'não atende ao tipo de serviço da solicitação',
  INACTIVE: 'está inativo',
  AWAY: 'está afastado',
  CNH_EXPIRED: 'tem CNH vencida antes do fim da viagem',
  INSUFFICIENT_CAPACITY: 'não comporta todos os passageiros solicitados',
  ACCOUNT_UNAVAILABLE: 'não possui conta ativa vinculada com perfil de Motorista',
}

function requireId(value: unknown, field: string): string {
  const candidate = typeof value === 'number' ? String(value) : value
  if (typeof candidate !== 'string' || !ID_PATTERN.test(candidate)) {
    throw new TripServiceError(400, `${field} é obrigatório e deve ser um identificador válido.`)
  }
  return candidate
}

function optionalReason(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new TripServiceError(400, 'reason deve ser um texto.')
  return value.trim() || fallback
}

function requireKm(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_ODOMETER_KM) {
    throw new TripServiceError(400, `${field} é obrigatório e deve ser uma quilometragem inteira não negativa.`)
  }
  return value
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new TripServiceError(400, `${field} deve estar no formato AAAA-MM-DD.`)
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new TripServiceError(400, `${field} não é uma data válida.`)
  return value
}

function describe(subject: string, reasons: AvailabilityReason[]): string {
  return `${subject} ${reasons.map((reason) => REASON_LABELS[reason]).join(' e ')}.`
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

function directText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TripServiceError(400, `${field} é obrigatório.`)
  }
  return value.trim()
}

function optionalDirectText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new TripServiceError(400, `${field} deve ser um texto.`)
  return value.trim() || null
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

/** Viagens: agendamento pelo Gestor e execução (início e término) pelo Motorista alocado. */
export class TripsService {
  /**
   * @param odometer - Linha do tempo de hodômetro do veículo, compartilhada com o abastecimento.
   * @param now - Relógio usado para recusar agendamentos no passado; injetável para testes.
   */
  constructor(
    private readonly repository: TripsRepositoryContract,
    private readonly availability: AvailabilityService,
    private readonly auditService: AuditLogger,
    private readonly odometer: OdometerTimelineReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Agenda uma solicitação aprovada numa única transação.
   *
   * Trava a solicitação, o veículo e o motorista (nessa ordem, sempre) e reavalia a disponibilidade
   * com a mesma regra das consultas (FROTA-96); assim, de dois agendamentos simultâneos sobrepostos,
   * só um é gravado. Impedimentos do cadastro (manutenção, incompatibilidade, CNH, afastamento)
   * prevalecem sobre o conflito de horário na resposta.
   *
   * @throws {TripServiceError} 400 dados inválidos, 404 solicitação/veículo/motorista inexistente,
   *   409 solicitação não aprovada ou conflito de agenda, 422 início no passado ou recurso indisponível.
   */
  async scheduleTrip(input: ScheduleTripInput, managerId: string): Promise<Trip> {
    const requestId = requireId(input.requestId, 'requestId')
    const vehicleId = requireId(input.vehicleId, 'vehicleId')
    const driverId = requireId(input.driverId, 'driverId')
    const period = this.validatePeriod(input.scheduledStart, input.scheduledEnd)
    const reason = optionalReason(input.reason, DEFAULT_SCHEDULING_REASON)
    if (input.specialRequirementsAcknowledged !== undefined
      && typeof input.specialRequirementsAcknowledged !== 'boolean') {
      throw new TripServiceError(400, 'specialRequirementsAcknowledged deve ser um valor booleano.')
    }
    if (input.evidenceDescription !== undefined && input.evidenceDescription !== null
      && typeof input.evidenceDescription !== 'string') {
      throw new TripServiceError(400, 'evidenceDescription deve ser um texto.')
    }
    const specialRequirementsAcknowledged = input.specialRequirementsAcknowledged === true
    const evidenceDescription = typeof input.evidenceDescription === 'string'
      ? input.evidenceDescription.trim() || null
      : null

    try {
      return await this.repository.withTransaction(async (client) => {
        const request = await this.repository.findRequestForUpdate(requestId, client)
        if (!request) throw new TripServiceError(404, 'Solicitação não encontrada.')
        if (request.status !== SCHEDULING_STATUSES.approvedRequest) {
          throw new TripServiceError(409, 'Somente solicitações aprovadas podem ser agendadas.')
        }
        const hasSpecialRequirements = Boolean(request.specialRequirements?.trim())
        if (hasSpecialRequirements && !specialRequirementsAcknowledged) {
          throw new TripServiceError(422, 'Confirme a conferência das necessidades especiais antes de agendar a viagem.')
        }
        if (hasSpecialRequirements && !evidenceDescription) {
          throw new TripServiceError(422, 'Registre como as necessidades especiais serão atendidas antes de agendar a viagem.')
        }
        if (!hasSpecialRequirements && (specialRequirementsAcknowledged || evidenceDescription)) {
          throw new TripServiceError(400, 'A conferência especial só pode ser registrada quando a solicitação informar uma necessidade especial.')
        }

        const vehicle = await this.availability.assessVehicle(vehicleId, request.serviceId, period, client)
        if (!vehicle) throw new TripServiceError(404, 'Veículo não encontrado.')
        if (request.passengers > vehicle.seats) {
          throw new TripServiceError(422,
            `O veículo comporta ${vehicle.seats} passageiros, mas a solicitação informa ${request.passengers}.`,
            'INSUFFICIENT_CAPACITY')
        }
        const driver = await this.availability.assessDriver(driverId, period, client)
        if (!driver) throw new TripServiceError(404, 'Motorista não encontrado.')
        this.assertAvailable(vehicle.reasons, driver.reasons)

        const actor = await this.requireActor(managerId, client)
        const trip = await this.repository.createTrip({
          requestId,
          vehicleId,
          driverId,
          scheduledStart: period.start,
          scheduledEnd: period.end,
          vehicleSnapshot: vehicle,
          driverSnapshot: driver,
          requestSnapshot: request,
          specialRequirementsAcknowledged,
          evidenceDescription,
        }, client)
        const scheduledRequest = await this.repository.markRequestScheduled(requestId, client)
        if (!scheduledRequest) throw new TripServiceError(409, 'Somente solicitações aprovadas podem ser agendadas.')

        const metadata = { reportedBy: actor.name, registeredBy: actor.id, actorSnapshot: actor, reason }
        await this.repository.createTripEvent('SCHEDULED', null, trip, metadata, client)
        await this.repository.createRequestEvent(request, scheduledRequest, metadata, client)
        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'trip.trips',
          recordId: trip.id,
          operation: 'CREATE',
          before: null,
          after: { ...trip, vehicleLicensePlate: vehicle.licensePlate, driverName: driver.name },
          actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
          reason,
        }, client)
        return trip
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new TripServiceError(409, 'Esta solicitação já possui viagem agendada.')
      throw error
    }
  }

  /** Cria uma viagem por decisão do Gestor sem fabricar uma solicitação de outro usuário. */
  async createDirectTrip(input: CreateDirectTripInput, managerId: string, idempotencyKey: unknown): Promise<Trip> {
    if (Object.hasOwn(input, 'requestId')) {
      throw new TripServiceError(400, 'A criação direta não aceita requestId.')
    }
    if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
      throw new TripServiceError(400, 'Informe um UUID válido no cabeçalho Idempotency-Key.')
    }
    const creationKey = idempotencyKey.toLowerCase()
    const serviceId = requireId(input.serviceId, 'serviceId')
    const vehicleId = requireId(input.vehicleId, 'vehicleId')
    const driverId = requireId(input.driverId, 'driverId')
    const period = this.parseTripPeriod(input.scheduledStart, input.scheduledEnd)
    const origin = directText(input.origin, 'origin')
    const destination = directText(input.destination, 'destination')
    const purpose = directText(input.purpose, 'purpose')
    const passengers = input.passengers
    if (typeof passengers !== 'number' || !Number.isSafeInteger(passengers)
      || passengers < 1 || passengers > MAX_PASSENGERS) {
      throw new TripServiceError(400, 'Informe uma quantidade válida de passageiros.')
    }
    const specialRequirements = optionalDirectText(input.specialRequirements, 'specialRequirements')
    const notes = optionalDirectText(input.notes, 'notes')
    if (input.specialRequirementsAcknowledged !== undefined && typeof input.specialRequirementsAcknowledged !== 'boolean') {
      throw new TripServiceError(400, 'specialRequirementsAcknowledged deve ser um valor booleano.')
    }
    if (input.evidenceDescription !== undefined && input.evidenceDescription !== null
      && typeof input.evidenceDescription !== 'string') {
      throw new TripServiceError(400, 'evidenceDescription deve ser um texto.')
    }
    const specialRequirementsAcknowledged = input.specialRequirementsAcknowledged === true
    const evidenceDescription = optionalDirectText(input.evidenceDescription, 'evidenceDescription')
    if (specialRequirements && !specialRequirementsAcknowledged) {
      throw new TripServiceError(422, 'Confirme a conferência das necessidades especiais antes de agendar a viagem.')
    }
    if (specialRequirements && !evidenceDescription) {
      throw new TripServiceError(422, 'Registre como as necessidades especiais serão atendidas antes de agendar a viagem.')
    }
    if (!specialRequirements && (specialRequirementsAcknowledged || evidenceDescription)) {
      throw new TripServiceError(400, 'A conferência especial só pode ser registrada quando houver necessidade especial.')
    }
    const reason = optionalReason(input.reason, DEFAULT_SCHEDULING_REASON)
    const directContext: DirectTripContext = {
      serviceId,
      serviceName: '',
      origin,
      destination,
      purpose,
      passengers,
      specialRequirements,
      notes,
    }
    const creationPayload = {
      serviceId, vehicleId, driverId,
      scheduledStart: period.start.toISOString(), scheduledEnd: period.end.toISOString(),
      origin, destination, purpose, passengers, specialRequirements, notes,
      specialRequirementsAcknowledged, evidenceDescription, reason,
    }
    const findRegistration = this.repository.findDirectTripRegistration
    const createDirectTrip = this.repository.createDirectTrip
    const findService = this.repository.findActiveServiceForDirect
    if (!findRegistration || !createDirectTrip || !findService) {
      throw new TripServiceError(500, 'A criação direta ainda não está disponível no serviço de viagens.')
    }

    const previous = await findRegistration.call(this.repository, managerId, creationKey)
    if (previous) return this.replayDirectTrip(previous.creationPayload, creationPayload, previous.trip)
    if (period.start < this.now()) {
      throw new TripServiceError(422, 'O início da viagem não pode estar no passado.')
    }

    try {
      return await this.repository.withTransaction(async (client) => {
        const actor = await this.requireActor(managerId, client)
        const service = await findService.call(this.repository, serviceId, client)
        if (!service) throw new TripServiceError(404, 'Tipo de serviço não encontrado ou inativo.')
        directContext.serviceName = service.name

        const vehicle = await this.availability.assessVehicle(vehicleId, serviceId, period, client)
        if (!vehicle) throw new TripServiceError(404, 'Veículo não encontrado.')
        if (passengers > vehicle.seats) {
          throw new TripServiceError(422,
            `O veículo comporta ${vehicle.seats} passageiros, mas a viagem informa ${passengers}.`,
            'INSUFFICIENT_CAPACITY')
        }
        const driver = await this.availability.assessDriver(driverId, period, client)
        if (!driver) throw new TripServiceError(404, 'Motorista não encontrado.')
        this.assertAvailable(vehicle.reasons, driver.reasons)

        const trip = await createDirectTrip.call(this.repository, {
          requestId: null,
          serviceId,
          vehicleId,
          driverId,
          scheduledStart: period.start,
          scheduledEnd: period.end,
          vehicleSnapshot: vehicle,
          driverSnapshot: driver,
          directContext,
          creationKey,
          creationPayload,
          specialRequirementsAcknowledged,
          evidenceDescription,
          createdBy: actor.id,
        }, client)
        const metadata: SchedulingEventMetadata = {
          reportedBy: actor.name, registeredBy: actor.id, actorSnapshot: actor, reason,
        }
        await this.repository.createTripEvent('SCHEDULED', null, trip, metadata, client)
        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'trip.trips',
          recordId: trip.id,
          operation: 'CREATE',
          before: null,
          after: {
            id: trip.id, requestId: null, serviceId, vehicleId, driverId,
            scheduledStart: trip.scheduledStart, scheduledEnd: trip.scheduledEnd,
            status: trip.status, context: directContext,
            vehicleLicensePlate: vehicle.licensePlate, driverName: driver.name,
          },
          actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
          reason,
        }, client)
        return trip
      })
    } catch (error) {
      const registration = await findRegistration.call(this.repository, managerId, creationKey)
      if (registration) return this.replayDirectTrip(registration.creationPayload, creationPayload, registration.trip)
      if (isUniqueViolation(error)) throw new TripServiceError(409, 'O veículo, motorista ou chave de criação conflitou com outra viagem.')
      throw error
    }
  }

  private replayDirectTrip(
    storedPayload: Record<string, unknown>,
    requestedPayload: Record<string, unknown>,
    trip: Trip,
  ): Trip {
    if (stableJson(storedPayload) !== stableJson(requestedPayload)) {
      throw new TripServiceError(409, 'Esta chave de criação já foi usada com outros dados.')
    }
    return trip
  }

  /**
   * Registra o início da viagem pelo motorista alocado.
   *
   * A quilometragem inicial não pode ser menor que a última conhecida do veículo, calculada pela mesma
   * linha do tempo do abastecimento (leituras, abastecimentos e viagens). Grava a viagem, a leitura
   * `START`, o evento e a auditoria na mesma transação, com a hora do servidor.
   *
   * @throws {TripServiceError} 400 km inválido, 403 não é o motorista da viagem, 404 inexistente,
   *   409 viagem não agendada, histórico inconsistente ou outra viagem em andamento, 422 km abaixo do último.
   */
  async startTrip(tripId: string, input: StartTripInput, userId: string): Promise<Trip> {
    this.validateTripId(tripId)
    const startKm = requireKm(input.startKm, 'startKm')
    const reason = optionalReason(input.reason, DEFAULT_EXECUTION_REASONS.start)
    try {
      return await this.repository.withTransaction(async (client) => {
        const { trip, actor } = await this.lockOwnTrip(tripId, userId, client)
        if (trip.status !== SCHEDULING_STATUSES.scheduled) {
          throw new TripServiceError(409, 'Somente viagens agendadas podem ser iniciadas.')
        }
        await this.repository.lockVehicle(trip.vehicleId, client)
        const lastKm = await this.lastKnownKm(trip.vehicleId, client)
        if (lastKm !== null && startKm < lastKm) {
          throw new TripServiceError(422, `A quilometragem inicial (${startKm} km) é menor que a última registrada para o veículo (${lastKm} km).`)
        }
        const started = await this.repository.saveStart(tripId, startKm, client)
        if (!started) throw new TripServiceError(409, 'Somente viagens agendadas podem ser iniciadas.')
        await this.recordExecution('STARTED', 'START', startKm, trip, started, actor, reason, client)
        return started
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new TripServiceError(409, IN_PROGRESS_CONFLICT_MESSAGE)
      throw error
    }
  }

  /**
   * Registra o término da viagem pelo motorista alocado; a quilometragem final não pode ser menor que a inicial.
   *
   * @throws {TripServiceError} 400 km inválido, 403 não é o motorista da viagem, 404 inexistente,
   *   409 viagem não está em andamento, 422 km final menor que o inicial.
   */
  async finishTrip(tripId: string, input: FinishTripInput, userId: string): Promise<Trip> {
    this.validateTripId(tripId)
    const endKm = requireKm(input.endKm, 'endKm')
    const reason = optionalReason(input.reason, DEFAULT_EXECUTION_REASONS.finish)
    return this.repository.withTransaction(async (client) => {
      const { trip, actor } = await this.lockOwnTrip(tripId, userId, client)
      if (trip.status !== SCHEDULING_STATUSES.inProgress) {
        throw new TripServiceError(409, 'Somente viagens em andamento podem ser finalizadas.')
      }
      if (trip.startKm !== null && endKm < trip.startKm) {
        throw new TripServiceError(422, `A quilometragem final (${endKm} km) não pode ser menor que a inicial (${trip.startKm} km).`)
      }
      const finished = await this.repository.saveFinish(tripId, endKm, client)
      if (!finished) throw new TripServiceError(409, 'Somente viagens em andamento podem ser finalizadas.')
      await this.recordExecution('FINISHED', 'END', endKm, trip, finished, actor, reason, client)
      return finished
    })
  }

  /**
   * Confirma uma viagem finalizada, encerrando o processo após a conferência do Gestor.
   *
   * Exige as evidências do odômetro (km inicial e final); o responsável é o usuário do token e a data
   * vem do servidor. Viagem, evento `CONFIRMED` e auditoria são gravados na mesma transação.
   *
   * @throws {TripServiceError} 400 id inválido, 404 inexistente, 409 viagem não finalizada ou já confirmada,
   *   422 sem evidências do odômetro.
   */
  async confirmTrip(tripId: string, input: ConfirmTripInput, managerId: string): Promise<TripConfirmation> {
    this.validateTripId(tripId)
    const reason = optionalReason(input.reason, DEFAULT_CONFIRMATION_REASON)
    return this.repository.withTransaction(async (client) => {
      const trip = await this.repository.findTripForUpdate(tripId, client)
      if (!trip) throw new TripServiceError(404, 'Viagem não encontrada.')
      if (trip.status !== SCHEDULING_STATUSES.finished) {
        throw new TripServiceError(409, trip.status === SCHEDULING_STATUSES.confirmed
          ? 'Esta viagem já foi confirmada.'
          : 'Somente viagens finalizadas podem ser confirmadas.')
      }
      if (trip.startKm === null || trip.endKm === null) throw new TripServiceError(422, MISSING_EVIDENCE_MESSAGE)
      const actor = await this.requireActor(managerId, client)
      const confirmation = await this.repository.saveConfirmation(tripId, actor.id, client)
      if (!confirmation) throw new TripServiceError(409, 'Esta viagem já foi confirmada.')
      const metadata: SchedulingEventMetadata = { reportedBy: actor.name, registeredBy: actor.id, actorSnapshot: actor, reason }
      await this.repository.createTripEvent('CONFIRMED', trip, { ...trip, status: confirmation.status, revision: confirmation.revision }, metadata, client)
      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'trip.trips',
        recordId: tripId,
        operation: 'STATUS_CHANGE',
        before: { status: trip.status, revision: trip.revision },
        after: { status: confirmation.status, confirmedBy: confirmation.confirmedBy, confirmedAt: confirmation.confirmedAt, revision: confirmation.revision },
        actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
        reason,
      }, client)
      return confirmation
    })
  }

  /**
   * Lista viagens para a conferência do Gestor, filtrando por situação e período agendado (datas de Aracaju).
   *
   * @throws {TripServiceError} 400 situação ou datas inválidas, ou `from` posterior a `to`.
   */
  async listTrips(query: TripListQuery): Promise<TripSummary[]> {
    const filters: TripListFilters = {
      status: this.validateStatusFilter(query.status),
      from: optionalDate(query.from, 'from'),
      to: optionalDate(query.to, 'to'),
    }
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new TripServiceError(400, 'from não pode ser posterior a to.')
    }
    return this.repository.listTrips(filters)
  }

  /** Lista as viagens agendadas e em andamento do motorista logado; sem cadastro de motorista, lista vazia. */
  async listMyTrips(userId: string): Promise<DriverTrip[]> {
    const driver = await this.repository.findDriverByUserId(userId)
    return driver ? this.repository.listDriverTrips(driver.id) : []
  }

  private async lockOwnTrip(tripId: string, userId: string, client: PoolClient): Promise<{ trip: Trip; actor: TripActor }> {
    const trip = await this.repository.findTripForUpdate(tripId, client)
    if (!trip) throw new TripServiceError(404, 'Viagem não encontrada.')
    const driver = await this.repository.findDriverByUserId(userId, client)
    if (!driver || driver.id !== trip.driverId) {
      throw new TripServiceError(403, 'Somente o motorista alocado pode registrar a execução desta viagem.')
    }
    const actor = await this.requireActor(userId, client)
    return { trip, actor }
  }

  /** Maior quilometragem vigente do veículo; `null` quando ainda não há nenhuma leitura. */
  private async lastKnownKm(vehicleId: string, client: PoolClient): Promise<number | null> {
    const timeline = await this.odometer.timeline(vehicleId, [], client)
    if (!timeline.valid) {
      throw new TripServiceError(409, 'O histórico de quilometragem do veículo está inconsistente. Solicite a revisão das leituras antes de continuar.')
    }
    return timeline.facts.reduce<number | null>((max, fact) => (max === null || fact.odometerKm > max ? fact.odometerKm : max), null)
  }

  private async recordExecution(
    eventType: 'STARTED' | 'FINISHED',
    readingType: 'START' | 'END',
    km: number,
    before: Trip,
    after: Trip,
    actor: TripActor,
    reason: string,
    client: PoolClient,
  ): Promise<void> {
    const metadata: SchedulingEventMetadata = { reportedBy: actor.name, registeredBy: actor.id, actorSnapshot: actor, reason }
    await this.repository.createOdometerReading({ vehicleId: after.vehicleId, tripId: after.id, readingType, odometerKm: km }, metadata, client)
    await this.repository.createTripEvent(eventType, before, after, metadata, client)
    await this.auditService.recordAudit({
      userId: actor.id,
      table: 'trip.trips',
      recordId: after.id,
      operation: 'STATUS_CHANGE',
      before: { status: before.status, startKm: before.startKm, endKm: before.endKm, revision: before.revision },
      after: { status: after.status, startKm: after.startKm, endKm: after.endKm, startedAt: after.startedAt, finishedAt: after.finishedAt, revision: after.revision },
      actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
      reason,
    }, client)
  }

  private async requireActor(userId: string, client: PoolClient): Promise<TripActor> {
    const actor = await this.repository.findActorSnapshot(userId, client)
    if (!actor) throw new TripServiceError(401, 'Usuário autenticado não está ativo ou não existe.')
    return actor
  }

  private validateStatusFilter(value: unknown): TripStatus | null {
    if (value === undefined) return null
    const status = TRIP_STATUSES.find((candidate) => candidate === value)
    if (!status) throw new TripServiceError(400, `status inválido. Use: ${TRIP_STATUSES.join(', ')}.`)
    return status
  }

  private validateTripId(tripId: string): void {
    if (!ID_PATTERN.test(tripId)) throw new TripServiceError(400, 'Identificador de viagem inválido.')
  }

  private validatePeriod(start: unknown, end: unknown): Period {
    const period = this.parseTripPeriod(start, end)
    if (period.start < this.now()) {
      throw new TripServiceError(422, 'O início da viagem não pode estar no passado.')
    }
    return period
  }

  private parseTripPeriod(start: unknown, end: unknown): Period {
    let period: Period
    try {
      period = parsePeriod(start, end)
    } catch (error) {
      if (error instanceof AvailabilityError) throw new TripServiceError(error.statusCode, error.message)
      throw error
    }
    return period
  }

  private assertAvailable(vehicleReasons: AvailabilityReason[], driverReasons: AvailabilityReason[]): void {
    const isConflict = (reason: AvailabilityReason) => reason === AVAILABILITY_REASONS.conflict
    const vehicleBlocking = vehicleReasons.filter((reason) => !isConflict(reason))
    const driverBlocking = driverReasons.filter((reason) => !isConflict(reason))
    if (vehicleBlocking.length > 0 || driverBlocking.length > 0) {
      const code = driverBlocking.includes(AVAILABILITY_REASONS.accountUnavailable) ? 'ACCOUNT_UNAVAILABLE' : undefined
      throw new TripServiceError(422, [
        vehicleBlocking.length > 0 ? describe('O veículo', vehicleBlocking) : '',
        driverBlocking.length > 0 ? describe('O motorista', driverBlocking) : '',
      ].filter(Boolean).join(' '), code)
    }
    const conflicts = [
      vehicleReasons.some(isConflict) ? 'O veículo já tem viagem no período.' : '',
      driverReasons.some(isConflict) ? 'O motorista já tem viagem no período.' : '',
    ].filter(Boolean)
    if (conflicts.length > 0) throw new TripServiceError(409, conflicts.join(' '))
  }
}
