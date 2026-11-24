import type { Pool, PoolClient } from 'pg'
import type {
  CreateSvoOccurrenceInput, CreateSvoEventInput, SvoActorSnapshot,
  SvoOccurrenceDetail, SvoOccurrenceSummary, SvoListFilters,
} from '../types/svo-occurrence.types'

export interface SvoOccurrencesRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findActorSnapshot(id: string, client: PoolClient): Promise<SvoActorSnapshot | null>
  currentTime(client: PoolClient): Promise<Date>
  create(input: CreateSvoOccurrenceInput, receivedAt: Date, actor: SvoActorSnapshot, client: PoolClient): Promise<SvoOccurrenceDetail>
  list(filters: SvoListFilters): Promise<SvoOccurrenceSummary[]>
  findById(id: string, client?: PoolClient): Promise<SvoOccurrenceDetail | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOccurrenceDetail | null>
  confirm(id: string, actor: SvoActorSnapshot, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail>
  setDispatchIntent(id: string, actor: SvoActorSnapshot, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail>
  setDispatchWaitReason(id: string, reason: 'NO_TEAM' | 'NO_VEHICLE' | null, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail>
  createEvent(input: CreateSvoEventInput, client: PoolClient): Promise<void>
}

/** Persistência restrita do SVO, com projeções públicas explícitas e histórico append-only. */
export class SvoOccurrencesRepository implements SvoOccurrencesRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Ocorrência, evento e auditoria só se tornam visíveis após o mesmo commit. */
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

  /** Mantém conta e perfil estáveis até concluir a escrita e capturar a autoria. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<SvoActorSnapshot | null> {
    const result = await client.query<SvoActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true FOR SHARE OF u, r`, [id],
    )
    return result.rows[0] ?? null
  }

  async currentTime(client: PoolClient): Promise<Date> {
    const result = await client.query<{ time: Date }>('SELECT clock_timestamp() AS time')
    return result.rows[0]!.time
  }

  async create(input: CreateSvoOccurrenceInput, receivedAt: Date, actor: SvoActorSnapshot, client: PoolClient): Promise<SvoOccurrenceDetail> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO svo.occurrences
         (attendant_id, requester_name, requester_phone, requester_type, location,
          description, notes, received_at, attendant_snapshot, status, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'PENDING', 1)
       RETURNING id::text AS id`,
      [actor.id, input.requesterName, input.requesterPhone, input.requesterType, input.location,
        input.description, input.notes ?? null, receivedAt, JSON.stringify(actor)],
    )
    const occurrence = await this.findById(result.rows[0]!.id, client)
    if (!occurrence) throw new Error('Falha ao recuperar a ocorrência criada.')
    return occurrence
  }

  async list(filters: SvoListFilters): Promise<SvoOccurrenceSummary[]> {
    const result = await this.pool.query<SvoOccurrenceSummary>(
      `SELECT o.id::text AS id, o.requester_type AS "requesterType", o.location, o.status,
              o.received_at AS "receivedAt", o.created_at AS "createdAt", o.revision,
              o.dispatch_requested_at AS "dispatchRequestedAt", o.dispatch_requested_by::text AS "dispatchRequestedBy",
              o.dispatch_wait_reason AS "dispatchWaitReason",
              (SELECT x.id::text FROM svo.execution_orders x WHERE x.occurrence_id = o.id) AS "executionOrderId"
         FROM svo.occurrences o
        WHERE ($1::text IS NULL OR o.status = $1)
          AND ($2::timestamptz IS NULL OR o.received_at >= $2)
          AND ($3::timestamptz IS NULL OR o.received_at < $3)
        ORDER BY o.received_at DESC, o.id DESC`, [filters.status, filters.from, filters.until],
    )
    return result.rows
  }

  async findById(id: string, client?: PoolClient): Promise<SvoOccurrenceDetail | null> {
    const result = await (client ?? this.pool).query<SvoOccurrenceDetail>(
      `SELECT o.id::text AS id, o.requester_type AS "requesterType", o.location, o.status,
              o.received_at AS "receivedAt", o.created_at AS "createdAt", o.revision,
              o.dispatch_requested_at AS "dispatchRequestedAt", o.dispatch_requested_by::text AS "dispatchRequestedBy",
              o.dispatch_wait_reason AS "dispatchWaitReason",
              (SELECT x.id::text FROM svo.execution_orders x WHERE x.occurrence_id = o.id) AS "executionOrderId",
              o.requester_name AS "requesterName", o.requester_phone AS "requesterPhone",
              o.description, o.notes, o.attendant_id::text AS "attendantId",
              o.triaged_at AS "triagedAt", o.triaged_by::text AS "triagedBy", o.updated_at AS "updatedAt",
              (SELECT e.evidence_description FROM svo.occurrence_events e
                WHERE e.occurrence_id = o.id AND e.event_type = 'RECEIVED'
                ORDER BY e.registered_at, e.id LIMIT 1) AS "evidenceDescription"
         FROM svo.occurrences o WHERE o.id = $1`, [id],
    )
    return result.rows[0] ?? null
  }

  /** A leitura ocorre depois da trava para que a segunda confirmação veja o estado já confirmado. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOccurrenceDetail | null> {
    const result = await client.query<{ id: string }>(
      'SELECT id::text AS id FROM svo.occurrences WHERE id = $1 FOR UPDATE', [id],
    )
    return result.rows.length ? this.findById(id, client) : null
  }

  async confirm(id: string, actor: SvoActorSnapshot, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail> {
    await client.query(
      `UPDATE svo.occurrences SET status = 'CONFIRMED', triaged_by = $2, triaged_at = $3,
              dispatch_requested_at = $3, dispatch_requested_by = $2, dispatch_actor_snapshot = $4::jsonb,
              dispatch_wait_reason = NULL, updated_at = $3, revision = revision + 1 WHERE id = $1`,
      [id, actor.id, time, JSON.stringify(actor)],
    )
    const occurrence = await this.findById(id, client)
    if (!occurrence) throw new Error('Falha ao recuperar a ocorrência confirmada.')
    return occurrence
  }

  async setDispatchIntent(id: string, actor: SvoActorSnapshot, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail> {
    await client.query(
      `UPDATE svo.occurrences SET dispatch_requested_at = COALESCE(dispatch_requested_at, $2),
          dispatch_requested_by = COALESCE(dispatch_requested_by, $3),
          dispatch_actor_snapshot = COALESCE(dispatch_actor_snapshot, $4::jsonb),
          updated_at = $2, revision = revision + 1
        WHERE id = $1 AND status = 'CONFIRMED'`, [id, time, actor.id, JSON.stringify(actor)],
    )
    const occurrence = await this.findById(id, client)
    if (!occurrence) throw new Error('Falha ao recuperar a intenção de despacho.')
    return occurrence
  }

  async setDispatchWaitReason(id: string, reason: 'NO_TEAM' | 'NO_VEHICLE' | null, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail> {
    await client.query(
      `UPDATE svo.occurrences SET dispatch_wait_reason = $2, updated_at = $3, revision = revision + 1
        WHERE id = $1 AND status = 'CONFIRMED'`, [id, reason, time],
    )
    const occurrence = await this.findById(id, client)
    if (!occurrence) throw new Error('Falha ao recuperar a situação de despacho.')
    return occurrence
  }

  async createEvent(input: CreateSvoEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO svo.occurrence_events
         (occurrence_id, event_type, occurred_at, reported_by, registered_by,
          actor_snapshot, reason, evidence_description, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb)`,
      [input.occurrenceId, input.eventType, input.occurredAt, input.reportedBy, input.actorSnapshot.id,
        JSON.stringify(input.actorSnapshot), input.reason, input.evidenceDescription,
        JSON.stringify(input.beforeState), JSON.stringify(input.afterState)],
    )
  }
}
