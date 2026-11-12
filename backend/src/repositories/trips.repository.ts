import type { Pool, PoolClient } from 'pg'
import type {
  CreateTripData,
  DriverTrip,
  SchedulableRequest,
  SchedulingEventMetadata,
  Trip,
  TripActor,
  TripDriverAccount,
  TripConfirmation,
  TripEventType,
  TripListFilters,
  TripOdometerReading,
  TripSummary,
} from '../types/trip.types'

/** Contrato de persistência do agendamento e da execução, usado pelo service e por testes isolados. */
export interface TripsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findRequestForUpdate(requestId: string, client: PoolClient): Promise<SchedulableRequest | null>
  createTrip(data: CreateTripData, client: PoolClient): Promise<Trip>
  markRequestScheduled(requestId: string, client: PoolClient): Promise<SchedulableRequest | null>
  createTripEvent(eventType: TripEventType, before: Trip | null, after: Trip, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void>
  createRequestEvent(before: SchedulableRequest, after: SchedulableRequest, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void>
  findActorSnapshot(id: string, client: PoolClient): Promise<TripActor | null>
  findTripForUpdate(tripId: string, client: PoolClient): Promise<Trip | null>
  findDriverByUserId(userId: string, client?: PoolClient): Promise<TripDriverAccount | null>
  lockVehicle(vehicleId: string, client: PoolClient): Promise<void>
  saveStart(tripId: string, startKm: number, client: PoolClient): Promise<Trip | null>
  saveFinish(tripId: string, endKm: number, client: PoolClient): Promise<Trip | null>
  createOdometerReading(reading: TripOdometerReading, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void>
  listDriverTrips(driverId: string): Promise<DriverTrip[]>
  saveConfirmation(tripId: string, confirmerId: string, client: PoolClient): Promise<TripConfirmation | null>
  listTrips(filters: TripListFilters): Promise<TripSummary[]>
}

/** Acesso parametrizado a `trip.trips`, `trip.requests`, leituras de hodômetro e seus históricos. */
export class TripsRepository implements TripsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Executa uma unidade de trabalho com commit/rollback e libera o cliente. */
  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /** Trava a solicitação para que dois agendamentos não a consumam ao mesmo tempo. */
  async findRequestForUpdate(requestId: string, client: PoolClient): Promise<SchedulableRequest | null> {
    const result = await client.query<SchedulableRequest>(
      `SELECT id::text AS id, requester_id::text AS "requesterId", service_id::text AS "serviceId", status, revision
         FROM trip.requests
        WHERE id = $1
          FOR UPDATE`,
      [requestId],
    )
    return result.rows[0] ?? null
  }

  /** Grava a viagem agendada com o contexto de veículo e motorista vigente no momento da decisão. */
  async createTrip(data: CreateTripData, client: PoolClient): Promise<Trip> {
    const result = await client.query<Trip>(
      `INSERT INTO trip.trips (
         request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status, vehicle_snapshot, driver_snapshot
       ) VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6::jsonb, $7::jsonb)
       RETURNING id::text AS id, request_id::text AS "requestId", vehicle_id::text AS "vehicleId",
                 driver_id::text AS "driverId", scheduled_start AS "scheduledStart",
                 scheduled_end AS "scheduledEnd", status, start_km AS "startKm", end_km AS "endKm",
                 started_at AS "startedAt", finished_at AS "finishedAt", revision, created_at AS "createdAt"`,
      [
        data.requestId,
        data.vehicleId,
        data.driverId,
        data.scheduledStart,
        data.scheduledEnd,
        JSON.stringify(data.vehicleSnapshot),
        JSON.stringify(data.driverSnapshot),
      ],
    )
    const trip = result.rows[0]
    if (!trip) throw new Error('A criação da viagem não retornou os dados esperados.')
    return trip
  }

  /** Marca a solicitação como agendada somente se ainda estiver aprovada. */
  async markRequestScheduled(requestId: string, client: PoolClient): Promise<SchedulableRequest | null> {
    const result = await client.query<SchedulableRequest>(
      `UPDATE trip.requests
          SET status = 'SCHEDULED',
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1 AND status = 'APPROVED'
        RETURNING id::text AS id, requester_id::text AS "requesterId", service_id::text AS "serviceId", status, revision`,
      [requestId],
    )
    return result.rows[0] ?? null
  }

  /** Insere um evento na linha histórica imutável da viagem. */
  async createTripEvent(
    eventType: TripEventType,
    before: Trip | null,
    after: Trip,
    metadata: SchedulingEventMetadata,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO trip.trip_events (
         trip_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, $2, clock_timestamp(), $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)`,
      [
        after.id,
        eventType,
        metadata.reportedBy,
        metadata.registeredBy,
        JSON.stringify(metadata.actorSnapshot),
        metadata.reason,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
      ],
    )
  }

  /** Insere o evento `SCHEDULED` na linha histórica imutável da solicitação. */
  async createRequestEvent(
    before: SchedulableRequest,
    after: SchedulableRequest,
    metadata: SchedulingEventMetadata,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO trip.request_events (
         request_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, 'SCHEDULED', clock_timestamp(), $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb)`,
      [
        after.id,
        metadata.reportedBy,
        metadata.registeredBy,
        JSON.stringify(metadata.actorSnapshot),
        metadata.reason,
        JSON.stringify(before),
        JSON.stringify(after),
      ],
    )
  }

  /** Carrega o snapshot de autoria do usuário autenticado na transação. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<TripActor | null> {
    const result = await client.query<TripActor>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Trava a viagem para serializar início, término e confirmação. */
  async findTripForUpdate(tripId: string, client: PoolClient): Promise<Trip | null> {
    const result = await client.query<Trip>(
      `SELECT id::text AS id, request_id::text AS "requestId", vehicle_id::text AS "vehicleId",
              driver_id::text AS "driverId", scheduled_start AS "scheduledStart",
              scheduled_end AS "scheduledEnd", status, start_km AS "startKm", end_km AS "endKm",
              started_at AS "startedAt", finished_at AS "finishedAt", revision, created_at AS "createdAt"
         FROM trip.trips
        WHERE id = $1
          FOR UPDATE`,
      [tripId],
    )
    return result.rows[0] ?? null
  }

  /** Busca o cadastro de motorista vinculado à conta (`fleet.drivers.user_id`). */
  async findDriverByUserId(userId: string, client?: PoolClient): Promise<TripDriverAccount | null> {
    const executor = client ?? this.pool
    const result = await executor.query<TripDriverAccount>(
      'SELECT id::text AS id, name FROM fleet.drivers WHERE user_id = $1 LIMIT 1',
      [userId],
    )
    return result.rows[0] ?? null
  }

  /** Trava o veículo para serializar a leitura e a gravação da quilometragem. */
  async lockVehicle(vehicleId: string, client: PoolClient): Promise<void> {
    await client.query('SELECT id FROM fleet.vehicles WHERE id = $1 FOR UPDATE', [vehicleId])
  }

  /** Registra o início somente se a viagem ainda estiver agendada; a hora vem do servidor. */
  async saveStart(tripId: string, startKm: number, client: PoolClient): Promise<Trip | null> {
    const result = await client.query<Trip>(
      `UPDATE trip.trips
          SET status = 'IN_PROGRESS',
              start_km = $2,
              started_at = clock_timestamp(),
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1 AND status = 'SCHEDULED'
        RETURNING id::text AS id, request_id::text AS "requestId", vehicle_id::text AS "vehicleId",
                  driver_id::text AS "driverId", scheduled_start AS "scheduledStart",
                  scheduled_end AS "scheduledEnd", status, start_km AS "startKm", end_km AS "endKm",
                  started_at AS "startedAt", finished_at AS "finishedAt", revision, created_at AS "createdAt"`,
      [tripId, startKm],
    )
    return result.rows[0] ?? null
  }

  /** Registra o término somente se a viagem estiver em andamento; a hora vem do servidor. */
  async saveFinish(tripId: string, endKm: number, client: PoolClient): Promise<Trip | null> {
    const result = await client.query<Trip>(
      `UPDATE trip.trips
          SET status = 'FINISHED',
              end_km = $2,
              finished_at = clock_timestamp(),
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1 AND status = 'IN_PROGRESS'
        RETURNING id::text AS id, request_id::text AS "requestId", vehicle_id::text AS "vehicleId",
                  driver_id::text AS "driverId", scheduled_start AS "scheduledStart",
                  scheduled_end AS "scheduledEnd", status, start_km AS "startKm", end_km AS "endKm",
                  started_at AS "startedAt", finished_at AS "finishedAt", revision, created_at AS "createdAt"`,
      [tripId, endKm],
    )
    return result.rows[0] ?? null
  }

  /** Grava a leitura de hodômetro append-only ligada à viagem, para a linha do tempo do veículo. */
  async createOdometerReading(reading: TripOdometerReading, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trip.odometer_readings (
         vehicle_id, trip_id, reading_type, odometer_km, occurred_at, reported_by, registered_by, actor_snapshot, reason
       ) VALUES ($1, $2, $3, $4, clock_timestamp(), $5, $6, $7::jsonb, $8)`,
      [
        reading.vehicleId,
        reading.tripId,
        reading.readingType,
        reading.odometerKm,
        metadata.reportedBy,
        metadata.registeredBy,
        JSON.stringify(metadata.actorSnapshot),
        metadata.reason,
      ],
    )
  }

  /** Lista as viagens agendadas e em andamento do motorista, com os dados necessários para executá-las. */
  async listDriverTrips(driverId: string): Promise<DriverTrip[]> {
    const result = await this.pool.query<DriverTrip>(
      `SELECT t.id::text AS id, t.status, t.scheduled_start AS "scheduledStart", t.scheduled_end AS "scheduledEnd",
              t.start_km AS "startKm", t.started_at AS "startedAt",
              r.origin, r.destination, r.purpose, v.license_plate AS "vehicleLicensePlate"
         FROM trip.trips t
         JOIN trip.requests r ON r.id = t.request_id
         JOIN fleet.vehicles v ON v.id = t.vehicle_id
        WHERE t.driver_id = $1
          AND t.status IN ('SCHEDULED', 'IN_PROGRESS')
        ORDER BY t.scheduled_start ASC, t.id ASC`,
      [driverId],
    )
    return result.rows
  }

  /** Confirma somente se a viagem ainda estiver finalizada; responsável e hora vêm do token e do servidor. */
  async saveConfirmation(tripId: string, confirmerId: string, client: PoolClient): Promise<TripConfirmation | null> {
    const result = await client.query<TripConfirmation>(
      `UPDATE trip.trips
          SET status = 'CONFIRMED',
              confirmed_by = $2,
              confirmed_at = clock_timestamp(),
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1 AND status = 'FINISHED'
        RETURNING id::text AS id, status, confirmed_by::text AS "confirmedBy", confirmed_at AS "confirmedAt", revision`,
      [tripId, confirmerId],
    )
    return result.rows[0] ?? null
  }

  /** Lista viagens para conferência; `from`/`to` são datas de Aracaju sobre o início agendado (`to` inclusivo). */
  async listTrips(filters: TripListFilters): Promise<TripSummary[]> {
    const result = await this.pool.query<TripSummary>(
      `SELECT t.id::text AS id, t.request_id::text AS "requestId", t.status,
              t.scheduled_start AS "scheduledStart", t.scheduled_end AS "scheduledEnd",
              t.started_at AS "startedAt", t.finished_at AS "finishedAt",
              t.start_km AS "startKm", t.end_km AS "endKm",
              v.license_plate AS "vehicleLicensePlate", d.name AS "driverName",
              r.origin, r.destination,
              t.confirmed_by::text AS "confirmedBy", t.confirmed_at AS "confirmedAt"
         FROM trip.trips t
         JOIN trip.requests r ON r.id = t.request_id
         JOIN fleet.vehicles v ON v.id = t.vehicle_id
         JOIN fleet.drivers d ON d.id = t.driver_id
        WHERE ($1::text IS NULL OR t.status = $1)
          AND ($2::date IS NULL OR t.scheduled_start >= ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
          AND ($3::date IS NULL OR t.scheduled_start < (($3::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
        ORDER BY t.scheduled_start DESC, t.id DESC`,
      [filters.status, filters.from, filters.to],
    )
    return result.rows
  }
}
