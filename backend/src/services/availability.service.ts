import type { PoolClient } from 'pg'
import { AVAILABILITY_REASONS, AvailabilityError } from '../types/availability.types'
import type {
  AvailabilityQuery,
  AvailabilityReason,
  DriverAvailability,
  DriverAvailabilityFacts,
  Period,
  VehicleAvailability,
  VehicleAvailabilityFacts,
} from '../types/availability.types'
import type { AvailabilityRepositoryContract } from '../repositories/availability.repository'
import { currentFsphDate, fsphDateOf } from './drivers.service'

const ISO_DATE_TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const ID_PATTERN = /^[1-9]\d*$/

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !ISO_DATE_TIME_WITH_OFFSET.test(value)) {
    throw new AvailabilityError(400, `${field} deve estar no formato ISO 8601 com fuso, ex.: 2026-11-10T08:00:00-03:00.`)
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number) as [number, number, number]
  const calendarDay = new Date(Date.UTC(year, month - 1, day))
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime()) || calendarDay.getUTCMonth() !== month - 1 || calendarDay.getUTCDate() !== day) {
    throw new AvailabilityError(400, `${field} não é uma data válida.`)
  }
  return instant
}

/**
 * Valida o período de uma consulta ou agendamento.
 *
 * @throws {AvailabilityError} 400 quando falta fuso, a data é inválida ou o fim não é posterior ao início.
 */
export function parsePeriod(start: unknown, end: unknown): Period {
  const period = { start: parseInstant(start, 'start'), end: parseInstant(end, 'end') }
  if (period.end <= period.start) throw new AvailabilityError(400, 'O fim do período deve ser posterior ao início.')
  return period
}

function requireId(value: unknown, message: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new AvailabilityError(400, message)
  return value
}

/**
 * Regra única de disponibilidade de veículos e motoristas num período (FSPH/SVO).
 *
 * Usada pelas consultas da tela e, com trava, dentro da transação do agendamento,
 * para que a tela e o agendamento nunca discordem.
 */
export class AvailabilityService {
  /**
   * @param today - Fonte da data corrente (`YYYY-MM-DD`, fuso de Aracaju); injetável para testes.
   */
  constructor(
    private readonly repository: AvailabilityRepositoryContract,
    private readonly today: () => string = currentFsphDate,
  ) {}

  /**
   * Lista os veículos não inativos com disponibilidade e motivos para o tipo de serviço e o período.
   *
   * @throws {AvailabilityError} 400 parâmetros inválidos e 404 tipo de serviço inexistente.
   */
  async listVehicles(query: AvailabilityQuery): Promise<VehicleAvailability[]> {
    const period = parsePeriod(query.start, query.end)
    const serviceId = requireId(query.serviceId, 'serviceId é obrigatório e deve ser um identificador válido.')
    if (!(await this.repository.serviceExists(serviceId))) {
      throw new AvailabilityError(404, 'Tipo de serviço não encontrado.')
    }
    const facts = await this.repository.listVehicleFacts(serviceId, period, null)
    return facts.map((item) => this.toVehicleAvailability(item))
  }

  /**
   * Lista os motoristas não desligados com disponibilidade e motivos para o período.
   *
   * @throws {AvailabilityError} 400 período inválido.
   */
  async listDrivers(query: AvailabilityQuery): Promise<DriverAvailability[]> {
    const period = parsePeriod(query.start, query.end)
    const facts = await this.repository.listDriverFacts(period, null)
    return facts.map((item) => this.toDriverAvailability(item, period))
  }

  /**
   * Trava o veículo (`FOR UPDATE`) e avalia sua disponibilidade dentro da transação do chamador.
   *
   * @returns A avaliação, ou `null` quando o veículo não existe.
   */
  async assessVehicle(vehicleId: string, serviceId: string, period: Period, client: PoolClient): Promise<VehicleAvailability | null> {
    if (!(await this.repository.lockVehicle(vehicleId, client))) return null
    const [facts] = await this.repository.listVehicleFacts(serviceId, period, vehicleId, client)
    return facts ? this.toVehicleAvailability(facts) : null
  }

  /**
   * Trava o motorista (`FOR UPDATE`) e avalia sua disponibilidade dentro da transação do chamador.
   *
   * @returns A avaliação, ou `null` quando o motorista não existe.
   */
  async assessDriver(driverId: string, period: Period, client: PoolClient): Promise<DriverAvailability | null> {
    if (!(await this.repository.lockDriver(driverId, client))) return null
    const [facts] = await this.repository.listDriverFacts(period, driverId, client)
    return facts ? this.toDriverAvailability(facts, period) : null
  }

  private toVehicleAvailability({ compatible, hasConflict, ...vehicle }: VehicleAvailabilityFacts): VehicleAvailability {
    const reasons: AvailabilityReason[] = []
    if (vehicle.status === 'INACTIVE') reasons.push(AVAILABILITY_REASONS.inactive)
    if (vehicle.status === 'IN_MAINTENANCE') reasons.push(AVAILABILITY_REASONS.maintenance)
    if (!compatible) reasons.push(AVAILABILITY_REASONS.incompatible)
    if (hasConflict) reasons.push(AVAILABILITY_REASONS.conflict)
    return { ...vehicle, available: reasons.length === 0, reasons }
  }

  /** A CNH precisa valer hoje e no último dia da viagem (fuso de Aracaju). */
  private toDriverAvailability({ hasConflict, ...driver }: DriverAvailabilityFacts, period: Period): DriverAvailability {
    const reasons: AvailabilityReason[] = []
    if (driver.status === 'INACTIVE') reasons.push(AVAILABILITY_REASONS.inactive)
    if (driver.status === 'AWAY') reasons.push(AVAILABILITY_REASONS.away)
    if (driver.cnhExpiresAt < this.today() || driver.cnhExpiresAt < fsphDateOf(period.end)) {
      reasons.push(AVAILABILITY_REASONS.cnhExpired)
    }
    if (hasConflict) reasons.push(AVAILABILITY_REASONS.conflict)
    return { ...driver, available: reasons.length === 0, reasons }
  }
}
