import type { PoolClient } from 'pg'
import { SVO_ORDER_OCCUPYING_STATUSES } from '../types/svo-order.types'
import type { NewSvoOrder, OpenSvoOrderEvent, SvoOrderRecord, SvoTeamSnapshot } from '../types/svo-order.types'

export interface SvoOrdersRepositoryContract {
  findByOccurrenceId(id: string, client: PoolClient): Promise<string | null>
  findTeamForShare(id: string, client: PoolClient): Promise<SvoTeamSnapshot | null>
  countOccupyingOrders(vehicleId: string, client: PoolClient): Promise<number>
  create(order: NewSvoOrder, client: PoolClient): Promise<SvoOrderRecord>
  createOpenedEvent(event: OpenSvoOrderEvent, client: PoolClient): Promise<void>
}

/** Todas as consultas usam o cliente da transação que detém as travas de ocorrência e veículo. */
export class SvoOrdersRepository implements SvoOrdersRepositoryContract {
  async findByOccurrenceId(id: string, client: PoolClient): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      'SELECT id::text AS id FROM svo.execution_orders WHERE occurrence_id = $1', [id],
    )
    return result.rows[0]?.id ?? null
  }

  /** Impede inativação ou edição da equipe durante a decisão, sem exigir membros. */
  async findTeamForShare(id: string, client: PoolClient): Promise<SvoTeamSnapshot | null> {
    const result = await client.query<SvoTeamSnapshot>(
      'SELECT id::text AS id, name, active, revision FROM svo.teams WHERE id = $1 FOR SHARE', [id],
    )
    return result.rows[0] ?? null
  }

  /** Deve ser executado após travar o veículo, em uma nova instrução sob READ COMMITTED. */
  async countOccupyingOrders(vehicleId: string, client: PoolClient): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT count(id)::integer AS count FROM svo.execution_orders
        WHERE vehicle_id = $1 AND status = ANY($2::text[])`, [vehicleId, SVO_ORDER_OCCUPYING_STATUSES],
    )
    return result.rows[0]!.count
  }

  async create(order: NewSvoOrder, client: PoolClient): Promise<SvoOrderRecord> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO svo.execution_orders
         (occurrence_id, team_id, vehicle_id, status, opened_at, created_by, revision,
          occurrence_snapshot, team_snapshot, vehicle_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
       RETURNING id::text AS id`,
      [order.occurrenceId, order.teamId, order.vehicleId, order.status, order.openedAt, order.createdBy,
        order.revision, JSON.stringify(order.occurrenceSnapshot), JSON.stringify(order.teamSnapshot),
        JSON.stringify(order.vehicleSnapshot)],
    )
    return { ...order, id: result.rows[0]!.id }
  }

  async createOpenedEvent({ order, actor, reason, evidenceDescription }: OpenSvoOrderEvent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO svo.execution_order_events
         (execution_order_id, event_type, occurred_at, reported_by, registered_by,
          actor_snapshot, reason, evidence_description, before_state, after_state)
       VALUES ($1, 'OPENED', $2, $3, $4, $5::jsonb, $6, $7, NULL, $8::jsonb)`,
      [order.id, order.openedAt, actor.name, actor.id, JSON.stringify(actor), reason,
        evidenceDescription, JSON.stringify(order)],
    )
  }
}
