import type { Pool, PoolClient } from 'pg'
import type {
  CreateTripData,
  SchedulableRequest,
  SchedulingEventMetadata,
  Trip,
  TripActor,
} from '../types/trip.types'

/** Contrato de persistência do agendamento, usado pelo service e por testes isolados. */
export interface TripsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findRequestForUpdate(requestId: string, client: PoolClient): Promise<SchedulableRequest | null>
  createTrip(data: CreateTripData, client: PoolClient): Promise<Trip>
  markRequestScheduled(requestId: string, client: PoolClient): Promise<SchedulableRequest | null>
  createTripEvent(trip: Trip, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void>
  createRequestEvent(before: SchedulableRequest, after: SchedulableRequest, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void>
  findActorSnapshot(id: string, client: PoolClient): Promise<TripActor | null>
}

/** Acesso parametrizado a `trip.trips`, `trip.requests` e seus históricos durante o agendamento. */
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
                 scheduled_end AS "scheduledEnd", status, revision, created_at AS "createdAt"`,
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

  /** Insere o evento `SCHEDULED` na linha histórica imutável da viagem. */
  async createTripEvent(trip: Trip, metadata: SchedulingEventMetadata, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trip.trip_events (
         trip_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, 'SCHEDULED', clock_timestamp(), $2, $3, $4::jsonb, $5, NULL, $6::jsonb)`,
      [trip.id, metadata.reportedBy, metadata.registeredBy, JSON.stringify(metadata.actorSnapshot), metadata.reason, JSON.stringify(trip)],
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

  /** Carrega o snapshot de autoria do Gestor autenticado na transação. */
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
}
