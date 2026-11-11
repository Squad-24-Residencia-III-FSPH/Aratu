import type { Pool, PoolClient } from 'pg'
import { REQUEST_STATUSES } from '../types/request.types'
import type {
  CreateRequestEventInput,
  CreateRequestInput,
  RequestActorSnapshot,
  RequestServiceSnapshot,
  TripRequest,
} from '../types/request.types'

/** Contrato de persistência transacional da abertura de solicitações de viagem. */
export interface RequestsRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findActorSnapshot(id: string, client: PoolClient): Promise<RequestActorSnapshot | null>
  findActiveServiceForUpdate(id: string, client: PoolClient): Promise<RequestServiceSnapshot | null>
  create(input: CreateRequestInput, actor: RequestActorSnapshot, service: RequestServiceSnapshot, client: PoolClient): Promise<TripRequest>
  createEvent(input: CreateRequestEventInput, client: PoolClient): Promise<void>
}

/** Acesso parametrizado à criação de solicitações e ao histórico append-only. */
export class RequestsRepository implements RequestsRepositoryContract {
  constructor(private readonly pool: Pool) {}

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
