import type { Pool, PoolClient } from 'pg'
import type {
  FuelingDetail, FuelingFilters, FuelingList, FuelingVersion, FuelingWrite,
  OdometerFact, StoredFuelingRequest,
} from '../types/fueling.types'

// Preserva microssegundos do fato, mantendo três casas quando não há fração adicional.
// Fragmento estático: nenhuma entrada externa é interpolada nas projeções SQL.
const FUELING_COLUMNS = `
  f.id::text AS id, f.vehicle_id::text AS "vehicleId", f.driver_id::text AS "driverId",
  regexp_replace(to_char(f.fueled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '000Z$', 'Z') AS "fueledAt",
  f.fuel_type AS "fuelType", f.liters::text AS liters, f.total_value::text AS "totalValue",
  f.odometer_km AS "odometerKm", f.station, f.notes, f.reported_by AS "reportedBy",
  f.created_by::text AS "createdBy", f.actor_snapshot AS "actorSnapshot",
  f.reason, f.evidence_description AS "evidenceDescription", f.attachment_url AS "attachmentUrl",
  f.supersedes_id::text AS "supersedesId", f.is_annulled AS "isAnnulled",
  f.annulment_reason AS "annulmentReason", f.vehicle_snapshot AS "vehicleSnapshot",
  f.driver_snapshot AS "driverSnapshot", f.revision,
  to_char(f.registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "registeredAt",
  to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"`

export interface FuelingChain extends FuelingDetail { valid: boolean }
export interface FuelingTimeline { facts: OdometerFact[]; valid: boolean }
export interface FuelingReading { id: string | null; valid: boolean }
export interface FuelingsRepositoryContract {
  list(filters: FuelingFilters, page: number, pageSize: number): Promise<FuelingList>
  findById(id: string, client?: PoolClient): Promise<FuelingVersion | null>
  lockVersion(id: string, client: PoolClient): Promise<FuelingVersion | null>
  history(id: string, client?: PoolClient): Promise<FuelingChain | null>
  findRequest(actorId: string, key: string, client?: PoolClient): Promise<StoredFuelingRequest | null>
  findDriver(id: string, client: PoolClient): Promise<{ id: string; name: string } | null>
  timeline(vehicleId: string, excludedIds: string[], client: PoolClient): Promise<FuelingTimeline>
  correctionReading(vehicleId: string, ids: string[], client: PoolClient): Promise<FuelingReading>
  insertVersion(write: FuelingWrite, client: PoolClient): Promise<FuelingVersion>
  insertReading(write: FuelingWrite, after: FuelingVersion, previousReadingId: string | null, client: PoolClient): Promise<void>
  insertEvent(write: FuelingWrite, after: FuelingVersion, client: PoolClient): Promise<void>
}

/** Persiste fatos e trilhas com SQL parametrizado e uma única fotografia por consulta. */
export class FuelingsRepository implements FuelingsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async list(filters: FuelingFilters, page: number, pageSize: number): Promise<FuelingList> {
    const result = await this.pool.query<Omit<FuelingList, 'page' | 'pageSize' | 'totalPages'>>(
      `WITH filtered AS (
         SELECT ` + FUELING_COLUMNS + `
         FROM fleet.fuelings f
         WHERE NOT f.is_annulled
           AND NOT EXISTS (SELECT n.id FROM fleet.fuelings n WHERE n.supersedes_id = f.id)
           AND ($1::bigint IS NULL OR f.vehicle_id = $1)
           AND ($2::bigint IS NULL OR f.driver_id = $2)
           AND ($3::timestamptz IS NULL OR f.fueled_at >= $3)
           AND ($4::timestamptz IS NULL OR f.fueled_at < $4)
       ), paged AS (
         SELECT filtered FROM filtered
         ORDER BY "fueledAt"::timestamptz DESC, id::bigint DESC LIMIT $5 OFFSET $6
       )
       SELECT COALESCE((SELECT jsonb_agg(to_jsonb(p.filtered)) FROM paged p), '[]'::jsonb) AS items,
              count(*)::int AS total,
              COALESCE(sum(liters::numeric), 0.000)::text AS "totalLiters",
              COALESCE(sum("totalValue"::numeric), 0.00)::text AS "totalValue"
       FROM filtered`,
      [filters.vehicleId ?? null, filters.driverId ?? null, filters.from ?? null, filters.to ?? null,
        pageSize, (page - 1) * pageSize],
    )
    const row = result.rows[0]!
    return { ...row, page, pageSize, totalPages: Math.ceil(row.total / pageSize) }
  }

  async findById(id: string, client?: PoolClient): Promise<FuelingVersion | null> {
    const result = await (client ?? this.pool).query<FuelingVersion>(
      `SELECT ` + FUELING_COLUMNS + ` FROM fleet.fuelings f WHERE f.id = $1`, [id])
    return result.rows[0] ?? null
  }

  /** Sempre chamada depois da trava do veículo para manter a mesma ordem entre escritores. */
  async lockVersion(id: string, client: PoolClient): Promise<FuelingVersion | null> {
    const result = await client.query<FuelingVersion>(
      `SELECT ` + FUELING_COLUMNS + ` FROM fleet.fuelings f WHERE f.id = $1 FOR UPDATE`, [id])
    return result.rows[0] ?? null
  }

  /** CYCLE limita histórico legado corrompido; o service impede mutação de cadeias inválidas. */
  async history(id: string, client?: PoolClient): Promise<FuelingChain | null> {
    const result = await (client ?? this.pool).query<FuelingChain>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, supersedes_id FROM fleet.fuelings WHERE id = $1
         UNION ALL
         SELECT f.id, f.supersedes_id FROM fleet.fuelings f JOIN ancestors a ON f.id = a.supersedes_id
       ) CYCLE id SET ancestor_cycle USING ancestor_path,
       descendants AS (
         SELECT id, supersedes_id FROM fleet.fuelings
         WHERE id = COALESCE((SELECT id FROM ancestors WHERE supersedes_id IS NULL LIMIT 1), $1::bigint)
         UNION ALL
         SELECT f.id, f.supersedes_id FROM fleet.fuelings f JOIN descendants d ON f.supersedes_id = d.id
       ) CYCLE id SET descendant_cycle USING descendant_path,
       versions AS (
         SELECT ` + FUELING_COLUMNS + ` FROM fleet.fuelings f
         WHERE f.id IN (SELECT id FROM descendants)
       ), tips AS (
         SELECT v.id FROM versions v
         WHERE NOT EXISTS (SELECT n.id FROM versions n WHERE n."supersedesId" = v.id)
       ), events AS (
         SELECT e.id::text AS id, e.fueling_id::text AS "fuelingId", e.event_type AS "eventType",
           e.occurred_at AS "occurredAt", e.registered_at AS "registeredAt",
           e.reported_by AS "reportedBy", e.registered_by::text AS "registeredBy",
           e.actor_snapshot AS "actorSnapshot", e.reason, e.evidence_description AS "evidenceDescription",
           e.attachment_url AS "attachmentUrl", e.supersedes_id::text AS "supersedesId",
           e.is_annulled AS "isAnnulled", e.before_state AS "beforeState", e.after_state AS "afterState"
         FROM fleet.fueling_events e WHERE e.fueling_id IN (SELECT id FROM descendants)
       )
       SELECT (SELECT to_jsonb(v) FROM versions v WHERE id = $1::text) AS fueling,
         (SELECT id FROM tips LIMIT 1) AS "currentId",
         (SELECT jsonb_agg(to_jsonb(v) ORDER BY "registeredAt", id::bigint) FROM versions v) AS versions,
         COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY "registeredAt", id::bigint) FROM events e), '[]') AS events,
         NOT EXISTS (SELECT id FROM ancestors WHERE ancestor_cycle)
         AND NOT EXISTS (SELECT id FROM descendants WHERE descendant_cycle)
         AND (SELECT count(DISTINCT "vehicleId") = 1 FROM versions)
         AND (SELECT count(*) = 1 FROM tips)
         AND NOT EXISTS (SELECT "supersedesId" FROM versions WHERE "supersedesId" IS NOT NULL
                         GROUP BY "supersedesId" HAVING count(*) > 1) AS valid
       WHERE EXISTS (SELECT id FROM ancestors)`, [id],
    )
    return result.rows[0] ?? null
  }

  async findRequest(actorId: string, key: string, client?: PoolClient): Promise<StoredFuelingRequest | null> {
    const result = await (client ?? this.pool).query<StoredFuelingRequest>(
      `SELECT to_jsonb(v) AS fueling, f.request_payload AS request FROM fleet.fuelings f
       CROSS JOIN LATERAL (SELECT ` + FUELING_COLUMNS + `) v WHERE f.created_by = $1 AND f.request_key = $2`,
      [actorId, key],
    )
    return result.rows[0] ?? null
  }

  async findDriver(id: string, client: PoolClient): Promise<{ id: string; name: string } | null> {
    const result = await client.query<{ id: string; name: string }>(
      'SELECT id::text AS id, name FROM fleet.drivers WHERE id = $1', [id])
    return result.rows[0] ?? null
  }

  /** Reúne fontes vigentes sem ressuscitar predecessores de retificações anuladas. */
  async timeline(vehicleId: string, excludedIds: string[], client: PoolClient): Promise<FuelingTimeline> {
    const result = await client.query<FuelingTimeline>(
      `WITH RECURSIVE reachable AS (
         SELECT id FROM trip.odometer_readings WHERE vehicle_id = $1 AND supersedes_id IS NULL
         UNION
         SELECT r.id FROM trip.odometer_readings r JOIN reachable p ON r.supersedes_id = p.id WHERE r.vehicle_id = $1
       ), fueling_reachable AS (
         SELECT id FROM fleet.fuelings WHERE vehicle_id = $1 AND supersedes_id IS NULL
         UNION
         SELECT f.id FROM fleet.fuelings f JOIN fueling_reachable p ON f.supersedes_id = p.id WHERE f.vehicle_id = $1
       ), excluded AS (
         SELECT id FROM trip.odometer_readings WHERE fueling_id = ANY($2::bigint[])
         UNION
         SELECT r.id FROM trip.odometer_readings r JOIN excluded p ON r.supersedes_id = p.id
       ), facts AS (
         SELECT r.odometer_km, r.occurred_at FROM trip.odometer_readings r
         WHERE r.vehicle_id = $1 AND NOT r.is_annulled
           AND NOT EXISTS (SELECT n.id FROM trip.odometer_readings n WHERE n.supersedes_id = r.id)
           AND r.id NOT IN (SELECT id FROM excluded)
         UNION ALL
         SELECT f.odometer_km, f.fueled_at FROM fleet.fuelings f
         WHERE f.vehicle_id = $1 AND NOT f.is_annulled AND NOT (f.id = ANY($2::bigint[]))
           AND NOT EXISTS (SELECT n.id FROM fleet.fuelings n WHERE n.supersedes_id = f.id)
           AND NOT EXISTS (SELECT r.id FROM trip.odometer_readings r WHERE r.fueling_id = f.id)
         UNION ALL
         SELECT t.start_km, t.started_at FROM trip.trips t
         WHERE t.vehicle_id = $1 AND t.start_km IS NOT NULL
           AND NOT EXISTS (SELECT r.id FROM trip.odometer_readings r WHERE r.trip_id = t.id AND r.reading_type = 'START')
         UNION ALL
         SELECT t.end_km, t.finished_at FROM trip.trips t
         WHERE t.vehicle_id = $1 AND t.end_km IS NOT NULL
           AND NOT EXISTS (SELECT r.id FROM trip.odometer_readings r WHERE r.trip_id = t.id AND r.reading_type = 'END')
       )
       SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('odometerKm', odometer_km, 'occurredAt', occurred_at))
                       FROM facts), '[]') AS facts,
         NOT EXISTS (SELECT f.id FROM fleet.fuelings f WHERE f.vehicle_id = $1 AND f.id NOT IN (SELECT id FROM fueling_reachable))
         AND NOT EXISTS (SELECT f.id FROM fleet.fuelings f JOIN fleet.fuelings p ON p.id = f.supersedes_id
                         WHERE (f.vehicle_id = $1 OR p.vehicle_id = $1) AND f.vehicle_id <> p.vehicle_id)
         AND NOT EXISTS (SELECT r.id FROM trip.odometer_readings r WHERE r.vehicle_id = $1
                     AND r.id NOT IN (SELECT id FROM reachable))
         AND NOT EXISTS (SELECT r.supersedes_id FROM trip.odometer_readings r WHERE r.vehicle_id = $1
                         AND r.supersedes_id IS NOT NULL GROUP BY r.supersedes_id HAVING count(*) > 1)
         AND NOT EXISTS (
           SELECT r.id FROM trip.odometer_readings r
           LEFT JOIN trip.odometer_readings p ON p.id = r.supersedes_id
           LEFT JOIN fleet.fuelings f ON f.id = r.fueling_id
           LEFT JOIN trip.trips t ON t.id = r.trip_id
           WHERE (r.vehicle_id = $1 OR p.vehicle_id = $1 OR f.vehicle_id = $1 OR t.vehicle_id = $1)
             AND (r.vehicle_id <> p.vehicle_id OR r.vehicle_id <> f.vehicle_id OR r.vehicle_id <> t.vehicle_id)
         ) AS valid`, [vehicleId, excludedIds],
    )
    return result.rows[0]!
  }

  /** Encontra a ponta da leitura inclusive após correções operacionais externas ao abastecimento. */
  async correctionReading(vehicleId: string, ids: string[], client: PoolClient): Promise<FuelingReading> {
    const result = await client.query<FuelingReading>(
      `WITH RECURSIVE readings AS (
         SELECT id, vehicle_id, fueling_id, reading_type FROM trip.odometer_readings WHERE fueling_id = ANY($2::bigint[])
         UNION
         SELECT r.id, r.vehicle_id, r.fueling_id, r.reading_type FROM trip.odometer_readings r JOIN readings p ON r.supersedes_id = p.id
       ), tips AS (
         SELECT id FROM readings r WHERE NOT EXISTS (SELECT n.id FROM trip.odometer_readings n WHERE n.supersedes_id = r.id)
       )
       SELECT (SELECT id::text FROM tips LIMIT 1) AS id,
         (SELECT count(*) <= 1 FROM tips)
         AND (NOT EXISTS (SELECT id FROM readings) OR EXISTS (SELECT id FROM tips))
         AND NOT EXISTS (SELECT id FROM readings WHERE vehicle_id <> $1 OR reading_type <> 'FUELING'
                         OR (fueling_id IS NOT NULL AND NOT (fueling_id = ANY($2::bigint[])))) AS valid`,
      [vehicleId, ids],
    )
    return result.rows[0]!
  }

  async insertVersion(write: FuelingWrite, client: PoolClient): Promise<FuelingVersion> {
    const { input: i, before } = write
    const result = await client.query<FuelingVersion>(
      `INSERT INTO fleet.fuelings AS f (vehicle_id, driver_id, fueled_at, fuel_type, liters, total_value,
           odometer_km, station, notes, reported_by, created_by, actor_snapshot, reason, evidence_description,
           attachment_url, supersedes_id, vehicle_snapshot, driver_snapshot, revision, request_key, request_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21::jsonb)
       RETURNING ` + FUELING_COLUMNS + ``,
      [i.vehicleId, i.driverId ?? null, i.fueledAt, i.fuelType, i.liters, i.totalValue, i.odometerKm,
        i.station ?? null, i.notes ?? null, i.reportedBy, write.actor.id, JSON.stringify(write.actor), i.reason,
        i.evidenceDescription ?? null, i.attachmentUrl ?? null, before?.id ?? null,
        JSON.stringify(write.vehicleSnapshot), JSON.stringify(write.driverSnapshot), (before?.revision ?? 0) + 1,
        write.requestKey, JSON.stringify(write.request)],
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('A gravação do abastecimento não retornou identificador.')
    return result.rows[0]!
  }

  async insertReading(write: FuelingWrite, after: FuelingVersion, previousReadingId: string | null, client: PoolClient): Promise<void> {
    const i = write.input
    await client.query(
      `INSERT INTO trip.odometer_readings (vehicle_id, fueling_id, reading_type, odometer_km, occurred_at,
         reported_by, registered_by, actor_snapshot, reason, evidence_description, attachment_url, supersedes_id)
       VALUES ($1,$2,'FUELING',$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [after.vehicleId, after.id, after.odometerKm, after.fueledAt, i.reportedBy, write.actor.id,
        JSON.stringify(write.actor), i.reason, i.evidenceDescription ?? null, i.attachmentUrl ?? null, previousReadingId],
    )
  }

  async insertEvent(write: FuelingWrite, after: FuelingVersion, client: PoolClient): Promise<void> {
    const i = write.input
    await client.query(
      `INSERT INTO fleet.fueling_events (fueling_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, evidence_description, attachment_url, before_state, after_state)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb)`,
      [after.id, write.before ? 'RECTIFIED' : 'RECORDED', after.fueledAt, i.reportedBy, write.actor.id,
        JSON.stringify(write.actor), i.reason, i.evidenceDescription ?? null, i.attachmentUrl ?? null,
        write.before ? JSON.stringify(write.before) : null, JSON.stringify(after)],
    )
  }
}
