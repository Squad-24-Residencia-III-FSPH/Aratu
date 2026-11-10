import type { Pool, PoolClient } from 'pg'
import type {
  DriverAvailabilityFacts,
  Period,
  VehicleAvailabilityFacts,
} from '../types/availability.types'

/** Contrato de leitura dos fatos de disponibilidade, usado pelo service e por testes isolados. */
export interface AvailabilityRepositoryContract {
  serviceExists(serviceId: string, client?: PoolClient): Promise<boolean>
  listVehicleFacts(serviceId: string, period: Period, vehicleId: string | null, client?: PoolClient): Promise<VehicleAvailabilityFacts[]>
  listDriverFacts(period: Period, driverId: string | null, client?: PoolClient): Promise<DriverAvailabilityFacts[]>
  lockVehicle(vehicleId: string, client: PoolClient): Promise<boolean>
  lockDriver(driverId: string, client: PoolClient): Promise<boolean>
}

/**
 * Lê situação, compatibilidade e conflitos de agenda de veículos e motoristas.
 *
 * O conflito usa sobreposição estrita (`início < fim` dos dois lados) só contra viagens
 * `SCHEDULED`/`IN_PROGRESS`, com a lista literal para aproveitar os índices parciais
 * `trip_trips_vehicle_period` e `trip_trips_driver_period`.
 */
export class AvailabilityRepository implements AvailabilityRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async serviceExists(serviceId: string, client?: PoolClient): Promise<boolean> {
    const executor = client ?? this.pool
    const result = await executor.query('SELECT 1 FROM fleet.services WHERE id = $1', [serviceId])
    return (result.rowCount ?? 0) > 0
  }

  /** Lista veículos não inativos; com `vehicleId`, devolve só ele, mesmo inativo. */
  async listVehicleFacts(
    serviceId: string,
    period: Period,
    vehicleId: string | null,
    client?: PoolClient,
  ): Promise<VehicleAvailabilityFacts[]> {
    const executor = client ?? this.pool
    const result = await executor.query<VehicleAvailabilityFacts>(
      `SELECT v.id::text AS id, v.license_plate AS "licensePlate", v.brand, v.model, v.categories,
              v.seats, v.body_limit AS "bodyLimit", v.status,
              EXISTS (
                SELECT 1 FROM fleet.vehicle_services vs
                 WHERE vs.vehicle_id = v.id AND vs.service_id = $1 AND vs.is_active
              ) AS compatible,
              EXISTS (
                SELECT 1 FROM trip.trips t
                 WHERE t.vehicle_id = v.id
                   AND t.status IN ('SCHEDULED', 'IN_PROGRESS')
                   AND t.scheduled_start < $3
                   AND $2 < t.scheduled_end
              ) AS "hasConflict"
         FROM fleet.vehicles v
        WHERE ($4::bigint IS NULL AND v.status <> 'INACTIVE') OR v.id = $4
        ORDER BY v.license_plate ASC, v.id ASC`,
      [serviceId, period.start, period.end, vehicleId],
    )
    return result.rows
  }

  /** Lista motoristas não desligados; com `driverId`, devolve só ele, mesmo inativo. */
  async listDriverFacts(period: Period, driverId: string | null, client?: PoolClient): Promise<DriverAvailabilityFacts[]> {
    const executor = client ?? this.pool
    const result = await executor.query<DriverAvailabilityFacts>(
      `SELECT d.id::text AS id, d.name, d.cnh_category AS "cnhCategory",
              to_char(d.cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt", d.status,
              EXISTS (
                SELECT 1 FROM trip.trips t
                 WHERE t.driver_id = d.id
                   AND t.status IN ('SCHEDULED', 'IN_PROGRESS')
                   AND t.scheduled_start < $2
                   AND $1 < t.scheduled_end
              ) AS "hasConflict"
         FROM fleet.drivers d
        WHERE ($3::bigint IS NULL AND d.status <> 'INACTIVE') OR d.id = $3
        ORDER BY d.name ASC, d.id ASC`,
      [period.start, period.end, driverId],
    )
    return result.rows
  }

  /**
   * Trava a linha do veículo até o fim da transação do agendamento.
   *
   * Deve ser chamada antes de `listVehicleFacts` na mesma transação: a leitura de conflitos precisa
   * ser uma instrução nova para enxergar a viagem gravada por quem segurava a trava.
   */
  async lockVehicle(vehicleId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query('SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', [vehicleId])
    return (result.rowCount ?? 0) > 0
  }

  /** Trava a linha do motorista até o fim da transação do agendamento (mesma regra de `lockVehicle`). */
  async lockDriver(driverId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query('SELECT id FROM fleet.drivers WHERE id = $1 FOR UPDATE', [driverId])
    return (result.rowCount ?? 0) > 0
  }
}
