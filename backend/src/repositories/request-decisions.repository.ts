import type { Pool, PoolClient } from 'pg'
import type {
  CreateRequestEventInput,
  DecidableRequest,
  RequestDecision,
  RequestDecisionActor,
} from '../types/request-decision.types'

/** Contrato de persistência usado pelo service de decisão e por testes isolados. */
export interface RequestDecisionsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findByIdForUpdate(id: string, client: PoolClient): Promise<DecidableRequest | null>
  saveDecision(id: string, decision: RequestDecision, deciderId: string, reason: string | null, client: PoolClient): Promise<DecidableRequest | null>
  findActorSnapshot(id: string, client: PoolClient): Promise<RequestDecisionActor | null>
  createEvent(input: CreateRequestEventInput, client: PoolClient): Promise<void>
}

/** Acesso parametrizado à decisão de solicitações (`trip.requests` e `trip.request_events`). */
export class RequestDecisionsRepository implements RequestDecisionsRepositoryContract {
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

  /** Bloqueia a solicitação para que dois gestores não a decidam ao mesmo tempo. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<DecidableRequest | null> {
    const result = await client.query<DecidableRequest>(
      `SELECT id::text AS id, requester_id::text AS "requesterId", service_id::text AS "serviceId",
              to_char(requested_date, 'YYYY-MM-DD') AS "requestedDate",
              to_char(requested_time, 'HH24:MI') AS "requestedTime",
              origin, destination, purpose, passengers, status,
              decided_by::text AS "decidedBy", decided_at AS "decidedAt",
              decision_reason AS "decisionReason", revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM trip.requests
        WHERE id = $1
          FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Grava a decisão somente se a solicitação ainda estiver pendente; retorna null caso contrário. */
  async saveDecision(
    id: string,
    decision: RequestDecision,
    deciderId: string,
    reason: string | null,
    client: PoolClient,
  ): Promise<DecidableRequest | null> {
    const result = await client.query<DecidableRequest>(
      `UPDATE trip.requests
          SET status = $1,
              decided_by = $2,
              decided_at = clock_timestamp(),
              decision_reason = $3,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $4 AND status = 'PENDING'
        RETURNING id::text AS id, requester_id::text AS "requesterId", service_id::text AS "serviceId",
                  to_char(requested_date, 'YYYY-MM-DD') AS "requestedDate",
                  to_char(requested_time, 'HH24:MI') AS "requestedTime",
                  origin, destination, purpose, passengers, status,
                  decided_by::text AS "decidedBy", decided_at AS "decidedAt",
                  decision_reason AS "decisionReason", revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [decision, deciderId, reason, id],
    )
    return result.rows[0] ?? null
  }

  /** Carrega o snapshot de autoria do Gestor autenticado na transação. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<RequestDecisionActor | null> {
    const result = await client.query<RequestDecisionActor>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Insere o evento imutável da decisão na linha histórica da solicitação. */
  async createEvent(input: CreateRequestEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trip.request_events (
         request_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, $2, clock_timestamp(), $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)`,
      [
        input.requestId,
        input.eventType,
        input.reportedBy,
        input.registeredBy,
        JSON.stringify(input.actorSnapshot),
        input.reason,
        JSON.stringify(input.beforeState),
        JSON.stringify(input.afterState),
      ],
    )
  }
}
