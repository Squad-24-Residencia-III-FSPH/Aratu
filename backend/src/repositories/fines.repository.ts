import type { Pool, PoolClient } from 'pg'
import type {
  Fine, FineAttributes, FineContext, FineDetail, FineDriverSuggestion, FineEventInput,
  FineFilters, FineRegistration, FineStatus, FineTimelineEntry, FineTrip,
} from '../types/fine.types'

const FINE_COLUMNS = `f.id::text AS id, f.vehicle_id::text AS "vehicleId",
  f.driver_id::text AS "driverId", f.trip_id::text AS "tripId",
  f.infraction_at AS "infractionAt", f.infraction_code AS "infractionCode",
  f.description, f.location, f.amount::text AS amount,
  to_char(f.due_at, 'YYYY-MM-DD') AS "dueAt", f.notes, f.status,
  f.paid_at AS "paidAt", f.cancellation_reason AS "cancellationReason",
  f.created_by::text AS "createdBy", f.revision, f.created_at AS "createdAt",
  f.updated_at AS "updatedAt", f.vehicle_snapshot AS "vehicleSnapshot",
  f.driver_snapshot AS "driverSnapshot", f.trip_snapshot AS "tripSnapshot",
  jsonb_build_object('id', v.id::text, 'licensePlate', v.license_plate, 'model', v.model) AS vehicle,
  CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id', d.id::text, 'name', d.name) END AS driver`
const FINE_FROM = `FROM fleet.fines f JOIN fleet.vehicles v ON v.id = f.vehicle_id
  LEFT JOIN fleet.drivers d ON d.id = f.driver_id`
// Fragmentos SQL privados e constantes: somente valores externos usam os parâmetros $1...$n.
type FineRow = Omit<Fine, 'infractionAt' | 'paidAt' | 'createdAt' | 'updatedAt'> & {
  infractionAt: Date; paidAt: Date | null; createdAt: Date; updatedAt: Date
}
const PUBLIC_STATE_KEYS = ['id', 'vehicleId', 'driverId', 'tripId', 'infractionAt', 'infractionCode',
  'description', 'location', 'amount', 'dueAt', 'notes', 'status', 'paidAt', 'cancellationReason',
  'createdBy', 'revision', 'createdAt', 'updatedAt'] as const
function project(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]))
}
/** Whitelist também em dados legados: JSON histórico nunca é publicado como payload irrestrito. */
function publicState(value: unknown): Partial<Fine> | null {
  const result = project(value, PUBLIC_STATE_KEYS)
  if (!result) return null
  const state = value as Record<string, unknown>
  const nested: Record<string, readonly string[]> = {
    vehicle: ['id', 'licensePlate', 'model'], driver: ['id', 'name'],
    vehicleSnapshot: ['id', 'licensePlate', 'model', 'source', 'capturedAt'],
    driverSnapshot: ['id', 'name', 'source', 'capturedAt'],
    tripSnapshot: ['id', 'vehicleId', 'driverId', 'startedAt', 'finishedAt', 'status', 'capturedAt'],
  }
  for (const [key, keys] of Object.entries(nested)) {
    if (Object.hasOwn(state, key)) result[key] = project(state[key], keys)
  }
  return result as Partial<Fine>
}
function publicEvent(event: FineTimelineEntry): FineTimelineEntry {
  return { ...event, occurredAt: new Date(event.occurredAt).toISOString(),
    registeredAt: new Date(event.registeredAt).toISOString(),
    before: publicState(event.before), after: publicState(event.after) ?? {} }
}
function fine(row: FineRow): Fine {
  const context = publicState(row) as FineContext
  return { ...row, vehicleSnapshot: context.vehicleSnapshot, driverSnapshot: context.driverSnapshot,
    tripSnapshot: context.tripSnapshot, infractionAt: row.infractionAt.toISOString(), paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}
const EVENT_JSON = `jsonb_build_object(
  'id', e.id::text, 'eventType', e.event_type, 'occurredAt', e.occurred_at,
  'registeredAt', e.registered_at, 'reportedBy', e.reported_by, 'reason', e.reason,
  'evidenceDescription', e.evidence_description, 'attachmentUrl', e.attachment_url,
  'supersedesId', e.supersedes_id::text,
  'actor', jsonb_build_object('id', e.actor_snapshot->>'id', 'name', e.actor_snapshot->>'name', 'role', e.actor_snapshot->>'role'),
  'before', e.before_state, 'after', e.after_state)`

export interface FinesRepositoryContract {
  list(filters: FineFilters): Promise<Fine[]>
  findById(id: string, client?: PoolClient): Promise<Fine | null>
  findDetail(id: string): Promise<FineDetail | null>
  listEvents(id: string, client: PoolClient): Promise<FineTimelineEntry[]>
  findRegistration(actorId: string, key: string, client?: PoolClient): Promise<FineRegistration | null>
  findDriverSuggestions(vehicleId: string, at: string, referenceNow: string): Promise<FineDriverSuggestion[]>
  findTripForShare(id: string, client: PoolClient): Promise<FineTrip | null>
  lockById(id: string, client: PoolClient): Promise<Fine | null>
  create(attributes: FineAttributes, context: FineContext, actorId: string, key: string, client: PoolClient): Promise<Fine>
  saveAttributes(id: string, attributes: FineAttributes, context: FineContext, client: PoolClient): Promise<Fine>
  saveStatus(id: string, status: FineStatus, paidAt: string | null, reason: string | null, client: PoolClient): Promise<Fine>
  createEvent(event: FineEventInput, client: PoolClient): Promise<void>
}

/** Persiste multas e eventos sem alterar viagens nem disponibilidade dos cadastros. */
export class FinesRepository implements FinesRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async list(filters: FineFilters): Promise<Fine[]> {
    const result = await this.pool.query<FineRow>(
      `SELECT
         ${FINE_COLUMNS}
       ${FINE_FROM}
       WHERE ($1::bigint IS NULL OR f.vehicle_id = $1)
         AND ($2::bigint IS NULL OR f.driver_id = $2)
         AND ($3::text IS NULL OR f.status = $3)
         AND ($4::timestamptz IS NULL OR f.infraction_at >= $4)
         AND ($5::timestamptz IS NULL OR f.infraction_at < $5)
       ORDER BY f.infraction_at DESC, f.id DESC`,
      [filters.vehicleId ?? null, filters.driverId ?? null, filters.status ?? null, filters.from ?? null, filters.to ?? null],
    )
    return result.rows.map(fine)
  }

  async findById(id: string, client?: PoolClient): Promise<Fine | null> {
    const result = await (client ?? this.pool).query<FineRow>(
      `SELECT
         ${FINE_COLUMNS}
       ${FINE_FROM} WHERE f.id = $1`, [id],
    )
    return result.rows[0] ? fine(result.rows[0]) : null
  }

  /** Estado e timeline compartilham o snapshot MVCC de uma única instrução SQL. */
  async findDetail(id: string): Promise<FineDetail | null> {
    const result = await this.pool.query<FineRow & { events: FineTimelineEntry[] }>(
      `SELECT
         ${FINE_COLUMNS}, COALESCE((
         SELECT
           jsonb_agg(${EVENT_JSON} ORDER BY e.registered_at ASC, e.id ASC)
         FROM fleet.fine_events e WHERE e.fine_id = f.id
       ), '[]'::jsonb) AS events ${FINE_FROM} WHERE f.id = $1`, [id],
    )
    const row = result.rows[0]
    return row ? { ...fine(row), events: row.events.map(publicEvent) } : null
  }

  async listEvents(id: string, client: PoolClient): Promise<FineTimelineEntry[]> {
    const result = await client.query<{ entry: FineTimelineEntry }>(
      `SELECT
         ${EVENT_JSON} AS entry FROM fleet.fine_events e
       WHERE e.fine_id = $1 ORDER BY e.registered_at ASC, e.id ASC`, [id],
    )
    return result.rows.map(row => publicEvent(row.entry))
  }

  async findRegistration(actorId: string, key: string, client?: PoolClient): Promise<FineRegistration | null> {
    const result = await (client ?? this.pool).query<FineRegistration>(
      `SELECT f.id::text AS "fineId", e.after_state->'registrationRequest' AS request
       FROM fleet.fines f JOIN fleet.fine_events e ON e.fine_id = f.id AND e.event_type = 'REGISTERED'
       WHERE f.created_by = $1 AND f.creation_key = $2 LIMIT 1`, [actorId, key],
    )
    return result.rows[0] ?? null
  }

  async findDriverSuggestions(vehicleId: string, at: string, referenceNow: string): Promise<FineDriverSuggestion[]> {
    const result = await this.pool.query<Omit<FineDriverSuggestion, 'startedAt' | 'finishedAt'> & {
      startedAt: Date; finishedAt: Date | null
    }>(
      `SELECT t.id::text AS "tripId", t.driver_id::text AS "driverId", t.vehicle_id::text AS "vehicleId",
         COALESCE(NULLIF(t.driver_snapshot->>'name', ''), d.name) AS "driverName",
         CASE WHEN NULLIF(t.driver_snapshot->>'name', '') IS NOT NULL
           THEN 'TRIP_SNAPSHOT' ELSE 'CURRENT_REGISTRY' END AS "nameSource",
         t.started_at AS "startedAt", t.finished_at AS "finishedAt", t.status AS "tripStatus"
       FROM trip.trips t JOIN fleet.drivers d ON d.id = t.driver_id
       WHERE t.vehicle_id = $1 AND t.started_at IS NOT NULL AND t.started_at <= $2::timestamptz
         AND t.status IN ('IN_PROGRESS', 'FINISHED', 'CONFIRMED')
         AND ((t.finished_at IS NOT NULL AND $2::timestamptz < t.finished_at)
           OR (t.status = 'IN_PROGRESS' AND t.finished_at IS NULL AND $2::timestamptz <= $3::timestamptz))
       ORDER BY t.started_at DESC, t.id DESC`, [vehicleId, at, referenceNow],
    )
    return result.rows.map(row => ({ ...row, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null }))
  }

  /** A trava compartilhada impede mudar os fatos da viagem durante a confirmação. */
  async findTripForShare(id: string, client: PoolClient): Promise<FineTrip | null> {
    const result = await client.query<Omit<FineTrip, 'startedAt' | 'finishedAt'> & {
      startedAt: Date | null; finishedAt: Date | null
    }>(
      `SELECT id::text AS id, vehicle_id::text AS "vehicleId", driver_id::text AS "driverId",
         started_at AS "startedAt", finished_at AS "finishedAt", status,
         vehicle_snapshot AS "vehicleSnapshot", driver_snapshot AS "driverSnapshot"
       FROM trip.trips WHERE id = $1 FOR SHARE`, [id],
    )
    const row = result.rows[0]
    return row ? { ...row, startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null } : null
  }

  /** Os veículos são travados antes desta linha para manter ordem única entre mutações. */
  async lockById(id: string, client: PoolClient): Promise<Fine | null> {
    const result = await client.query<FineRow>(
      `SELECT
         ${FINE_COLUMNS}
       ${FINE_FROM} WHERE f.id = $1 FOR UPDATE OF f`, [id],
    )
    return result.rows[0] ? fine(result.rows[0]) : null
  }

  async create(attributes: FineAttributes, context: FineContext, actorId: string, key: string, client: PoolClient): Promise<Fine> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO fleet.fines (vehicle_id, driver_id, trip_id, infraction_at, infraction_code,
         description, location, amount, due_at, notes, created_by, creation_key,
         vehicle_snapshot, driver_snapshot, trip_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb)
       RETURNING id::text AS id`,
      [...this.attributeValues(attributes), actorId, key, ...this.contextValues(context)],
    )
    return this.requireFine(result.rows[0]!.id, client)
  }

  async saveAttributes(id: string, attributes: FineAttributes, context: FineContext, client: PoolClient): Promise<Fine> {
    await client.query(
      `UPDATE fleet.fines SET vehicle_id = $1, driver_id = $2, trip_id = $3, infraction_at = $4,
         infraction_code = $5, description = $6, location = $7, amount = $8, due_at = $9, notes = $10,
         vehicle_snapshot = $11::jsonb, driver_snapshot = $12::jsonb, trip_snapshot = $13::jsonb,
         revision = revision + 1, updated_at = clock_timestamp() WHERE id = $14`,
      [...this.attributeValues(attributes), ...this.contextValues(context), id],
    )
    return this.requireFine(id, client)
  }

  async saveStatus(id: string, status: FineStatus, paidAt: string | null, reason: string | null, client: PoolClient): Promise<Fine> {
    await client.query(
      `UPDATE fleet.fines SET status = $2, paid_at = $3, cancellation_reason = $4,
         revision = revision + 1, updated_at = clock_timestamp() WHERE id = $1`, [id, status, paidAt, reason],
    )
    return this.requireFine(id, client)
  }

  async createEvent(event: FineEventInput, client: PoolClient): Promise<void> {
    const after = { ...event.after, ...(event.registrationRequest ? { registrationRequest: event.registrationRequest } : {}) }
    await client.query(
      `INSERT INTO fleet.fine_events (fine_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, evidence_description, attachment_url, supersedes_id, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12::jsonb)`,
      [event.fineId, event.eventType, event.occurredAt, event.metadata.reportedBy, event.actor.id,
        JSON.stringify(event.actor), event.metadata.reason, event.metadata.evidenceDescription,
        event.metadata.attachmentUrl ?? null, event.supersedesId,
        event.before ? JSON.stringify(event.before) : null, JSON.stringify(after)],
    )
  }

  private attributeValues(value: FineAttributes): (string | null)[] {
    return [value.vehicleId, value.driverId, value.tripId, value.infractionAt, value.infractionCode,
      value.description, value.location, value.amount, value.dueAt, value.notes]
  }
  private contextValues(context: FineContext): (string | null)[] {
    return [context.vehicleSnapshot, context.driverSnapshot, context.tripSnapshot].map(value => value === null ? null : JSON.stringify(value))
  }
  private async requireFine(id: string, client: PoolClient): Promise<Fine> {
    const result = await this.findById(id, client)
    if (!result) throw new Error('A persistência da multa não retornou o registro esperado.')
    return result
  }
}
