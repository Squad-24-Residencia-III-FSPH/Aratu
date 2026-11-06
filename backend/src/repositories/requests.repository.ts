import type { Pool } from 'pg'
import type {
  PaginatedRequests,
  RequestDetail,
  RequestListFilters,
  RequestSummary,
  RequestTrip,
} from '../types/request.types'

/** Filtros internos acrescidos do escopo de solicitante aplicado pelo service. */
type RequestListQuery = RequestListFilters & { requesterId?: string }

/** Linha da consulta de detalhe antes da montagem do objeto `trip`. */
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

/** Contrato de persistência usado pelos casos de uso e pelos testes isolados do service. */
export interface RequestsRepositoryContract {
  list(filters: RequestListQuery): Promise<PaginatedRequests>
  findById(id: string, requesterId?: string): Promise<RequestDetail | null>
}

const LIST_CONDITIONS = `
 WHERE ($1::text IS NULL OR r.status = $1)
   AND ($2::date IS NULL OR r.requested_date >= $2::date)
   AND ($3::date IS NULL OR r.requested_date <= $3::date)
   AND ($4::bigint IS NULL OR r.requester_id = $4::bigint)`

const LIST_DATA_SQL = `
SELECT r.id::text AS id,
       r.requester_id::text AS "requesterId",
       u.name AS "requesterName",
       r.service_id::text AS "serviceId",
       s.name AS "serviceName",
       to_char(r.requested_date, 'YYYY-MM-DD') AS "requestedDate",
       to_char(r.requested_time, 'HH24:MI') AS "requestedTime",
       r.origin,
       r.destination,
       r.purpose,
       r.passengers,
       r.status,
       r.created_at AS "createdAt",
       r.updated_at AS "updatedAt"
  FROM trip.requests r
  JOIN auth.users u ON u.id = r.requester_id
  JOIN fleet.services s ON s.id = r.service_id
${LIST_CONDITIONS}
 ORDER BY r.requested_date DESC, r.requested_time DESC, r.id DESC
 LIMIT $5 OFFSET $6`

const LIST_COUNT_SQL = `
SELECT COUNT(*)::text AS total
  FROM trip.requests r
${LIST_CONDITIONS}`

const DETAIL_SQL = `
SELECT r.id::text AS id,
       r.requester_id::text AS "requesterId",
       u.name AS "requesterName",
       r.service_id::text AS "serviceId",
       s.name AS "serviceName",
       to_char(r.requested_date, 'YYYY-MM-DD') AS "requestedDate",
       to_char(r.requested_time, 'HH24:MI') AS "requestedTime",
       r.origin,
       r.destination,
       r.purpose,
       r.passengers,
       r.status,
       r.decided_by::text AS "decidedBy",
       du.name AS "decidedByName",
       r.decided_at AS "decidedAt",
       r.decision_reason AS "decisionReason",
       r.created_at AS "createdAt",
       r.updated_at AS "updatedAt",
       t.id::text AS "tripId",
       t.status AS "tripStatus",
       t.scheduled_start AS "scheduledStart",
       t.scheduled_end AS "scheduledEnd",
       v.id::text AS "vehicleId",
       v.license_plate AS "vehicleLicensePlate",
       v.brand AS "vehicleBrand",
       v.model AS "vehicleModel",
       d.id::text AS "driverId",
       d.name AS "driverName"
  FROM trip.requests r
  JOIN auth.users u ON u.id = r.requester_id
  JOIN fleet.services s ON s.id = r.service_id
  LEFT JOIN auth.users du ON du.id = r.decided_by
  LEFT JOIN trip.trips t ON t.request_id = r.id
  LEFT JOIN fleet.vehicles v ON v.id = t.vehicle_id
  LEFT JOIN fleet.drivers d ON d.id = t.driver_id
 WHERE r.id = $1
   AND ($2::bigint IS NULL OR r.requester_id = $2::bigint)
 LIMIT 1`

/**
 * Monta o objeto aninhado de viagem somente quando a linha em `trip.trips`
 * existe. Solicitações agendadas sem viagem retornam `trip: null`, evitando
 * que uma inconsistência de dados derrube a consulta com erro 500.
 */
function toRequestTrip(row: RequestDetailRow): RequestTrip | null {
  if (
    row.tripId === null
    || row.tripStatus === null
    || row.scheduledStart === null
    || row.scheduledEnd === null
    || row.vehicleId === null
    || row.vehicleLicensePlate === null
    || row.driverId === null
    || row.driverName === null
  ) {
    return null
  }

  return {
    id: row.tripId,
    status: row.tripStatus,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    vehicle: {
      id: row.vehicleId,
      licensePlate: row.vehicleLicensePlate,
      brand: row.vehicleBrand,
      model: row.vehicleModel,
    },
    driver: {
      id: row.driverId,
      name: row.driverName,
    },
  }
}

/** Acesso parametrizado às solicitações de transporte e aos dados da viagem. */
export class RequestsRepository implements RequestsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /**
   * Lista solicitações com os filtros já validados pelo service.
   *
   * Executa a contagem e a página com os mesmos critérios para que `total`
   * e `totalPages` reflitam exatamente o escopo devolvido ao usuário.
   */
  async list(filters: RequestListQuery): Promise<PaginatedRequests> {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const offset = (page - 1) * pageSize
    const filterValues = [
      filters.status ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.requesterId ?? null,
    ]

    const countResult = await this.pool.query<{ total: string }>(LIST_COUNT_SQL, filterValues)
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10)

    const dataResult = await this.pool.query<RequestSummary>(
      LIST_DATA_SQL,
      [...filterValues, pageSize, offset],
    )

    return {
      requests: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /**
   * Busca o detalhe de uma solicitação.
   *
   * Quando `requesterId` é informado, a consulta restringe a linha ao
   * solicitante logado. Para o `SOLICITANTE`, solicitações de terceiros
   * resultam em `null` e o service responde 404 sem revelar a existência.
   */
  async findById(id: string, requesterId?: string): Promise<RequestDetail | null> {
    const result = await this.pool.query<RequestDetailRow>(DETAIL_SQL, [id, requesterId ?? null])
    const row = result.rows[0]
    if (!row) return null

    return {
      id: row.id,
      requesterId: row.requesterId,
      requesterName: row.requesterName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      requestedDate: row.requestedDate,
      requestedTime: row.requestedTime,
      origin: row.origin,
      destination: row.destination,
      purpose: row.purpose,
      passengers: row.passengers,
      status: row.status,
      decidedBy: row.decidedBy,
      decidedByName: row.decidedByName,
      decidedAt: row.decidedAt,
      decisionReason: row.decisionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      trip: toRequestTrip(row),
    }
  }
}
