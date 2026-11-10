import type { AuditLogger } from '../types/audit.types'
import { AVAILABILITY_REASONS, AvailabilityError } from '../types/availability.types'
import type { AvailabilityReason, Period } from '../types/availability.types'
import { DEFAULT_SCHEDULING_REASON, SCHEDULING_STATUSES, TripServiceError } from '../types/trip.types'
import type { ScheduleTripInput, Trip } from '../types/trip.types'
import type { TripsRepositoryContract } from '../repositories/trips.repository'
import { parsePeriod } from './availability.service'
import type { AvailabilityService } from './availability.service'

const ID_PATTERN = /^[1-9]\d*$/

const REASON_LABELS: Readonly<Record<AvailabilityReason, string>> = {
  CONFLICT: 'já tem viagem no período',
  MAINTENANCE: 'está em manutenção',
  INCOMPATIBLE: 'não atende ao tipo de serviço da solicitação',
  INACTIVE: 'está inativo',
  AWAY: 'está afastado',
  CNH_EXPIRED: 'tem CNH vencida antes do fim da viagem',
}

function requireId(value: unknown, field: string): string {
  const candidate = typeof value === 'number' ? String(value) : value
  if (typeof candidate !== 'string' || !ID_PATTERN.test(candidate)) {
    throw new TripServiceError(400, `${field} é obrigatório e deve ser um identificador válido.`)
  }
  return candidate
}

function optionalReason(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_SCHEDULING_REASON
  if (typeof value !== 'string') throw new TripServiceError(400, 'reason deve ser um texto.')
  return value.trim() || DEFAULT_SCHEDULING_REASON
}

function describe(subject: string, reasons: AvailabilityReason[]): string {
  return `${subject} ${reasons.map((reason) => REASON_LABELS[reason]).join(' e ')}.`
}

/** Agendamento de viagens: transforma uma solicitação aprovada em viagem com veículo, motorista e período. */
export class TripsService {
  /**
   * @param now - Relógio usado para recusar agendamentos no passado; injetável para testes.
   */
  constructor(
    private readonly repository: TripsRepositoryContract,
    private readonly availability: AvailabilityService,
    private readonly auditService: AuditLogger,
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
    const reason = optionalReason(input.reason)

    try {
      return await this.repository.withTransaction(async (client) => {
        const request = await this.repository.findRequestForUpdate(requestId, client)
        if (!request) throw new TripServiceError(404, 'Solicitação não encontrada.')
        if (request.status !== SCHEDULING_STATUSES.approvedRequest) {
          throw new TripServiceError(409, 'Somente solicitações aprovadas podem ser agendadas.')
        }

        const vehicle = await this.availability.assessVehicle(vehicleId, request.serviceId, period, client)
        if (!vehicle) throw new TripServiceError(404, 'Veículo não encontrado.')
        const driver = await this.availability.assessDriver(driverId, period, client)
        if (!driver) throw new TripServiceError(404, 'Motorista não encontrado.')
        this.assertAvailable(vehicle.reasons, driver.reasons)

        const actor = await this.repository.findActorSnapshot(managerId, client)
        if (!actor) throw new TripServiceError(401, 'Usuário autenticado não está ativo ou não existe.')
        const trip = await this.repository.createTrip({
          requestId,
          vehicleId,
          driverId,
          scheduledStart: period.start,
          scheduledEnd: period.end,
          vehicleSnapshot: vehicle,
          driverSnapshot: driver,
        }, client)
        const scheduledRequest = await this.repository.markRequestScheduled(requestId, client)
        if (!scheduledRequest) throw new TripServiceError(409, 'Somente solicitações aprovadas podem ser agendadas.')

        const metadata = { reportedBy: actor.name, registeredBy: actor.id, actorSnapshot: actor, reason }
        await this.repository.createTripEvent(trip, metadata, client)
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
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new TripServiceError(409, 'Esta solicitação já possui viagem agendada.')
      }
      throw error
    }
  }

  private validatePeriod(start: unknown, end: unknown): Period {
    let period: Period
    try {
      period = parsePeriod(start, end)
    } catch (error) {
      if (error instanceof AvailabilityError) throw new TripServiceError(error.statusCode, error.message)
      throw error
    }
    if (period.start < this.now()) {
      throw new TripServiceError(422, 'O início da viagem não pode estar no passado.')
    }
    return period
  }

  private assertAvailable(vehicleReasons: AvailabilityReason[], driverReasons: AvailabilityReason[]): void {
    const isConflict = (reason: AvailabilityReason) => reason === AVAILABILITY_REASONS.conflict
    const vehicleBlocking = vehicleReasons.filter((reason) => !isConflict(reason))
    const driverBlocking = driverReasons.filter((reason) => !isConflict(reason))
    if (vehicleBlocking.length > 0 || driverBlocking.length > 0) {
      throw new TripServiceError(422, [
        vehicleBlocking.length > 0 ? describe('O veículo', vehicleBlocking) : '',
        driverBlocking.length > 0 ? describe('O motorista', driverBlocking) : '',
      ].filter(Boolean).join(' '))
    }
    const conflicts = [
      vehicleReasons.some(isConflict) ? 'O veículo já tem viagem no período.' : '',
      driverReasons.some(isConflict) ? 'O motorista já tem viagem no período.' : '',
    ].filter(Boolean)
    if (conflicts.length > 0) throw new TripServiceError(409, conflicts.join(' '))
  }
}
