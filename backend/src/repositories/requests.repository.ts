import type { Pool, PoolClient } from 'pg'
import { REQUEST_STATUSES } from '../types/request.types'
import type {
  CreateRequestEventInput,
  CreateRequestInput,
  RequestActorSnapshot,
  RequestServiceSnapshot,
  PaginatedRequests,
  RequestDetail,
  RequestListFilters,
  RequestSummary,
  RequestTrip,
  TripRequest,
} from '../types/request.types'

type RequestListQuery = RequestListFilters & { requesterId?: string }

interface RequestDetailRow extends RequestSummary {
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionReason: string | null
  tripId: string | null
  tripStatus: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  vehicleId: string | null
  vehicleLicensePlate: string | null
  vehicleBrand: string | null
  vehicleModel: string | null
  driverId: string | null
  driverName: string | null
}

/** Contrato de persistência transacional da abertura de solicitações de viagem. */
export interface RequestsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  list(filters: RequestListQuery): Promise<PaginatedRequests>
  findById(id: string, requesterId?: string): Promise<RequestDetail | null>
  findActorSnapshot(id: string, client: PoolClient): Promise<RequestActorSnapshot | null>
  findActiveServiceForUpdate(id: string, client: PoolClient): Promise<RequestServiceSnapshot | null>
  create(input: CreateRequestInput, actor: RequestActorSnapshot, service: RequestServiceSnapshot, client: PoolClient): Promise<TripRequest>
  createEvent(input: CreateRequestEventInput, client: PoolClient): Promise<void>
}

const LIST_FILTERS = `
 WHERE ($1::text IS NULL OR r.status = $1)
   AND ($2::date IS NULL OR r.requested_date >= $2::date)
   AND ($3::date IS NULL OR r.requested_date <= $3::date)
   AND ($4::text IS NULL OR u.name ILIKE '%' || $4 || '%')
   AND ($5::text IS NULL OR s.name ILIKE '%' || $5 || '%')
   AND ($6::bigint IS NULL OR r.requester_id = $6::bigint)`

const LIST_SELECT = `
SELECT r.id::text AS id, r.requester_id::text AS "requesterId", u.name AS "requesterName",
       r.service_id::text AS "serviceId", s.name AS "serviceName",
       to_char(r.requested_date, 'YYYY-MM-DD') AS "requestedDate",
       to_char(r.requested_time, 'HH24:MI') AS "requestedTime",
       r.origin, r.destination, r.purpose, r.passengers, r.status,
       r.created_at AS "createdAt", r.updated_at AS "updatedAt"
  FROM trip.requests r
  JOIN auth.users u ON u.id = r.requester_id
  JOIN fleet.services s ON s.id = r.service_id`

const DETAIL_SELECT = `
SELECT r.id::text AS id, r.requester_id::text AS "requesterId", u.name AS "requesterName",
       r.service_id::text AS "serviceId", s.name AS "serviceName",
       to_char(r.requested_date, 'YYYY-MM-DD') AS "requestedDate",
       to_char(r.requested_time, 'HH24:MI') AS "requestedTime",
       r.origin, r.destination, r.purpose, r.passengers, r.status,
       r.decided_by::text AS "decidedBy", du.name AS "decidedByName", r.decided_at AS "decidedAt",
       r.decision_reason AS "decisionReason", r.created_at AS "createdAt", r.updated_at AS "updatedAt",
       t.id::text AS "tripId", t.status AS "tripStatus", t.scheduled_start AS "scheduledStart",
       t.scheduled_end AS "scheduledEnd", v.id::text AS "vehicleId", v.license_plate AS "vehicleLicensePlate",
       v.brand AS "vehicleBrand", v.model AS "vehicleModel", d.id::text AS "driverId", d.name AS "driverName"
  FROM trip.requests r
  JOIN auth.users u ON u.id = r.requester_id
  JOIN fleet.services s ON s.id = r.service_id
  LEFT JOIN auth.users du ON du.id = r.decided_by
  LEFT JOIN trip.trips t ON t.request_id = r.id
  LEFT JOIN fleet.vehicles v ON v.id = t.vehicle_id
  LEFT JOIN fleet.drivers d ON d.id = t.driver_id`

function toRequestTrip(row: RequestDetailRow): RequestTrip | null {
  if (!row.tripId || !row.tripStatus || !row.scheduledStart || !row.scheduledEnd
    || !row.vehicleId || !row.vehicleLicensePlate || !row.driverId || !row.driverName) return null
  return {
    id: row.tripId,
    status: row.tripStatus,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    vehicle: { id: row.vehicleId, licensePlate: row.vehicleLicensePlate, brand: row.vehicleBrand, model: row.vehicleModel },
    driver: { id: row.driverId, name: row.driverName },
  }
}

/** Acesso parametrizado à criação de solicitações e ao histórico append-only. */
export class RequestsRepository implements RequestsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Lista com filtros iguais na contagem e nos dados, mantendo paginação coerente. */
  async list(filters: RequestListQuery): Promise<PaginatedRequests> {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const values = [filters.status ?? null, filters.from ?? null, filters.to ?? null,
      filters.requester ?? null, filters.service ?? null, filters.requesterId ?? null]
    const [count, data] = await Promise.all([
      this.pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM trip.requests r JOIN auth.users u ON u.id = r.requester_id JOIN fleet.services s ON s.id = r.service_id${LIST_FILTERS}`, values),
      this.pool.query<RequestSummary>(`${LIST_SELECT}${LIST_FILTERS}
 ORDER BY r.requested_date ASC, r.requested_time ASC, r.id ASC
 LIMIT $7 OFFSET $8`, [...values, pageSize, (page - 1) * pageSize]),
    ])
    const total = Number(count.rows[0]?.total ?? 0)
    return { requests: data.rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /** Oculta solicitações de outros usuários do perfil SOLICITANTE com o mesmo 404 da inexistência. */
  async findById(id: string, requesterId?: string): Promise<RequestDetail | null> {
    const result = await this.pool.query<RequestDetailRow>(`${DETAIL_SELECT}
 WHERE r.id = $1 AND ($2::bigint IS NULL OR r.requester_id = $2::bigint)
 LIMIT 1`, [id, requesterId ?? null])
    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id, requesterId: row.requesterId, requesterName: row.requesterName,
      serviceId: row.serviceId, serviceName: row.serviceName, requestedDate: row.requestedDate,
      requestedTime: row.requestedTime, origin: row.origin, destination: row.destination,
      purpose: row.purpose, passengers: row.passengers, status: row.status,
      decidedBy: row.decidedBy, decidedByName: row.decidedByName, decidedAt: row.decidedAt,
      decisionReason: row.decisionReason, createdAt: row.createdAt, updatedAt: row.updatedAt,
      trip: toRequestTrip(row),
    }
  }

  /** Mantém solicitação, evento e auditoria na mesma unidade atômica. */
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

  /** Bloqueia a conta enquanto o snapshot é capturado, impedindo desativação concorrente. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<RequestActorSnapshot | null> {
    const result = await client.query<RequestActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        FOR SHARE OF u`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Serializa a validação de serviço ativo com alterações concorrentes ao catálogo. */
  async findActiveServiceForUpdate(id: string, client: PoolClient): Promise<RequestServiceSnapshot | null> {
    const result = await client.query<RequestServiceSnapshot>(
      `SELECT id::text AS id, name,
              requires_triage AS "requiresTriage",
              requires_weight AS "requiresWeight",
              requires_identification AS "requiresIdentification"
         FROM fleet.services
        WHERE id = $1 AND active = true
        FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Insere a solicitação com autoria, estado inicial e snapshots explícitos. */
  async create(
    input: CreateRequestInput,
    actor: RequestActorSnapshot,
    service: RequestServiceSnapshot,
    client: PoolClient,
  ): Promise<TripRequest> {
    const result = await client.query<TripRequest>(
      `INSERT INTO trip.requests (
         requester_id, service_id, requested_date, requested_time, origin, destination, purpose,
         status, requester_snapshot, service_snapshot
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
       RETURNING id::text AS id, requester_id::text AS "requesterId", service_id::text AS "serviceId",
                 to_char(requested_date, 'YYYY-MM-DD') AS "requestedDate",
                 to_char(requested_time, 'HH24:MI') AS "requestedTime",
                 origin, destination, purpose, passengers, status,
                 requester_snapshot AS "requesterSnapshot", service_snapshot AS "serviceSnapshot"`,
      [actor.id, input.serviceId, input.requestedDate, input.requestedTime,
        input.origin, input.destination, input.purpose, REQUEST_STATUSES.pending,
        JSON.stringify(actor), JSON.stringify(service)],
    )
    const request = result.rows[0]
    if (!request) throw new Error('A solicitação não foi retornada após a gravação.')
    return request
  }

  /** Registra a abertura com o estado inicial e autoria imutáveis. */
  async createEvent(input: CreateRequestEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trip.request_events (
         request_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot, reason, after_state
       ) VALUES ($1, 'CREATED', clock_timestamp(), $2, $3, $4::jsonb, $5, $6::jsonb)`,
      [input.requestId, input.reportedBy, input.registeredBy, JSON.stringify(input.actorSnapshot), input.reason,
        JSON.stringify(input.afterState)],
    )
  }
}
