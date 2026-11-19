import type { Pool, PoolClient } from 'pg'
import type {
  CreateSvoOccurrenceInput, CreateSvoEventInput, SvoActorSnapshot,
  SvoOccurrenceDetail, SvoOccurrenceSummary, SvoListFilters,
  SaveSvoOccurrenceTriageInput, SvoOccurrenceTriage,
} from '../types/svo-occurrence.types'

export interface SvoOccurrencesRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findActorSnapshot(id: string, client: PoolClient): Promise<SvoActorSnapshot | null>
  currentTime(client: PoolClient): Promise<Date>
  create(input: CreateSvoOccurrenceInput, receivedAt: Date, actor: SvoActorSnapshot, client: PoolClient): Promise<SvoOccurrenceDetail>
  list(filters: SvoListFilters): Promise<SvoOccurrenceSummary[]>
  findById(id: string, client?: PoolClient): Promise<SvoOccurrenceDetail | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOccurrenceDetail | null>
  confirm(id: string, actorId: string, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail>
  createEvent(input: CreateSvoEventInput, client: PoolClient): Promise<void>
  findLatestTriage(occurrenceId: string, client: PoolClient): Promise<SvoOccurrenceTriage | null>
  findTriage(occurrenceId: string): Promise<SvoOccurrenceTriage | null>
  saveTriage(occurrenceId: string, input: SaveSvoOccurrenceTriageInput, revision: number, supersedesId: string | null, actor: SvoActorSnapshot, time: Date, reason: string, client: PoolClient): Promise<SvoOccurrenceTriage>
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
      `SELECT id::text AS id, requester_type AS "requesterType", location, status,
              received_at AS "receivedAt", created_at AS "createdAt", revision
         FROM svo.occurrences
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::timestamptz IS NULL OR received_at >= $2)
          AND ($3::timestamptz IS NULL OR received_at < $3)
        ORDER BY received_at DESC, id DESC`, [filters.status, filters.from, filters.until],
    )
    return result.rows
  }

  async findById(id: string, client?: PoolClient): Promise<SvoOccurrenceDetail | null> {
    const result = await (client ?? this.pool).query<SvoOccurrenceDetail>(
      `SELECT o.id::text AS id, o.requester_type AS "requesterType", o.location, o.status,
              o.received_at AS "receivedAt", o.created_at AS "createdAt", o.revision,
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

  async confirm(id: string, actorId: string, time: Date, client: PoolClient): Promise<SvoOccurrenceDetail> {
    await client.query(
      `UPDATE svo.occurrences SET status = 'CONFIRMED', triaged_by = $2, triaged_at = $3,
              updated_at = $3, revision = revision + 1 WHERE id = $1`, [id, actorId, time],
    )
    const occurrence = await this.findById(id, client)
    if (!occurrence) throw new Error('Falha ao recuperar a ocorrência confirmada.')
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

  /** Retorna a versão atual sem expor os eventos brutos da ocorrência. */
  async findLatestTriage(occurrenceId: string, client: PoolClient): Promise<SvoOccurrenceTriage | null> {
    return this.readTriage(occurrenceId, client)
  }

  /** Consulta a triagem mais recente fora de uma transação de escrita. */
  async findTriage(occurrenceId: string): Promise<SvoOccurrenceTriage | null> {
    return this.readTriage(occurrenceId, this.pool)
  }

  private async readTriage(occurrenceId: string, executor: Pool | PoolClient): Promise<SvoOccurrenceTriage | null> {
    const result = await executor.query<SvoOccurrenceTriage>(
      `SELECT id::text AS id, occurrence_id::text AS "occurrenceId", revision,
              supersedes_id::text AS "supersedesId", deceased_name AS "deceasedName",
              estimated_age AS "estimatedAge", responsible_physician AS "responsiblePhysician",
              crm, preliminary_cause_of_death AS "preliminaryCauseOfDeath",
              available_documents AS "availableDocuments", referral, triage_notes AS "triageNotes",
              occurred_at AS "occurredAt", registered_at AS "registeredAt",
              registered_by::text AS "registeredBy", reason
         FROM svo.occurrence_triages WHERE occurrence_id = $1
        ORDER BY revision DESC LIMIT 1`, [occurrenceId],
    )
    return result.rows[0] ?? null
  }

  /** Insere snapshot clínico e autoria na mesma transação do evento e da auditoria. */
  async saveTriage(occurrenceId: string, input: SaveSvoOccurrenceTriageInput, revision: number, supersedesId: string | null, actor: SvoActorSnapshot, time: Date, reason: string, client: PoolClient): Promise<SvoOccurrenceTriage> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO svo.occurrence_triages
         (occurrence_id, revision, supersedes_id, deceased_name, estimated_age,
          responsible_physician, crm, preliminary_cause_of_death, available_documents,
          referral, triage_notes, occurred_at, registered_at, registered_by,
          actor_snapshot, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14::jsonb, $15)
       RETURNING id::text AS id`,
      [occurrenceId, revision, supersedesId, input.deceasedName ?? null, input.estimatedAge ?? null,
        input.responsiblePhysician ?? null, input.crm ?? null, input.preliminaryCauseOfDeath ?? null,
        input.availableDocuments ?? null, input.referral ?? null, input.triageNotes ?? null,
        time, actor.id, JSON.stringify(actor), reason],
    )
    const saved = await client.query<SvoOccurrenceTriage>(
      `SELECT id::text AS id, occurrence_id::text AS "occurrenceId", revision,
              supersedes_id::text AS "supersedesId", deceased_name AS "deceasedName",
              estimated_age AS "estimatedAge", responsible_physician AS "responsiblePhysician",
              crm, preliminary_cause_of_death AS "preliminaryCauseOfDeath",
              available_documents AS "availableDocuments", referral, triage_notes AS "triageNotes",
              occurred_at AS "occurredAt", registered_at AS "registeredAt",
              registered_by::text AS "registeredBy", reason
         FROM svo.occurrence_triages WHERE id = $1`, [result.rows[0]!.id],
    )
    if (!saved.rows[0]) throw new Error('Falha ao recuperar a versão de triagem criada.')
    return saved.rows[0]
  }
}
