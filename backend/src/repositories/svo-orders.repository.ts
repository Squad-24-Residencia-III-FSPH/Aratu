import type { PoolClient } from 'pg'
import { SVO_ORDER_OCCUPYING_STATUSES } from '../types/svo-order.types'
import type { NewSvoOrder, OpenSvoOrderEvent, SvoOrderRecord, SvoTeamSnapshot } from '../types/svo-order.types'
import type {
  SvoOrderState, SvoOrderReadRow, SvoOrderDetailRow, SvoOrderMembership,
  SvoOrderStatus, SvoOrderTransition, SvoOrderStatusEvent,
} from '../types/svo-order.types'

export interface SvoOrdersRepositoryContract {
  findByOccurrenceId(id: string, client: PoolClient): Promise<string | null>
  findTeamForShare(id: string, client: PoolClient): Promise<SvoTeamSnapshot | null>
  countOccupyingOrders(vehicleId: string, client: PoolClient): Promise<number>
  create(order: NewSvoOrder, client: PoolClient): Promise<SvoOrderRecord>
  createOpenedEvent(event: OpenSvoOrderEvent, client: PoolClient): Promise<void>
  listForActor(userId: string | null, status: SvoOrderStatus | null, time: Date, client: PoolClient): Promise<SvoOrderReadRow[]>
  findById(id: string, client: PoolClient): Promise<SvoOrderDetailRow | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOrderState | null>
  findMembershipForShare(teamId: string, userId: string, client: PoolClient): Promise<SvoOrderMembership | null>
  updateStatus(order: SvoOrderState, status: SvoOrderTransition, time: Date, client: PoolClient): Promise<boolean>
  createStatusEvent(event: SvoOrderStatusEvent, client: PoolClient): Promise<void>
}

/** Consultas parametrizadas usam o cliente transacional; cada operação obtém as travas do seu domínio. */
export class SvoOrdersRepository implements SvoOrdersRepositoryContract {
  async listForActor(userId: string | null, status: SvoOrderStatus | null, time: Date, client: PoolClient): Promise<SvoOrderReadRow[]> {
    const result = await client.query<SvoOrderReadRow>(
      `SELECT o.id::text AS id, o.occurrence_id::text AS "occurrenceId", o.team_id::text AS "teamId",
          o.vehicle_id::text AS "vehicleId", o.status, o.revision, o.opened_at AS "openedAt",
          o.departed_at AS "departedAt", o.arrived_at AS "arrivedAt", o.collected_at AS "collectedAt",
          o.closed_at AS "closedAt", t.active AS "teamActive",
          jsonb_build_object('location', o.occurrence_snapshot->>'location', 'teamName', o.team_snapshot->>'name',
            'vehicleLicensePlate', o.vehicle_snapshot->>'licensePlate') AS dispatch,
          jsonb_build_object('location', c.location, 'teamName', t.name, 'vehicleLicensePlate', v.license_plate) AS current
        FROM svo.execution_orders o JOIN svo.teams t ON t.id = o.team_id
          JOIN svo.occurrences c ON c.id = o.occurrence_id JOIN fleet.vehicles v ON v.id = o.vehicle_id
        WHERE ($1::text IS NULL OR o.status = $1)
          AND ($2::bigint IS NULL OR EXISTS (SELECT 1 FROM svo.team_members m
            WHERE m.team_id = o.team_id AND m.user_id = $2 AND m.active = true
              AND m.joined_at <= $3 AND (m.left_at IS NULL OR m.left_at > $3)))
        ORDER BY o.opened_at DESC, o.id DESC`, [status, userId, time],
    )
    return result.rows
  }

  /** Somente o serviço, após autorizar metadados sob trava, solicita os snapshots sigilosos. */
  async findById(id: string, client: PoolClient): Promise<SvoOrderDetailRow | null> {
    const result = await client.query<SvoOrderDetailRow>(
      `SELECT o.id::text AS id, o.occurrence_id::text AS "occurrenceId", o.team_id::text AS "teamId",
          o.vehicle_id::text AS "vehicleId", o.status, o.revision, o.opened_at AS "openedAt",
          o.departed_at AS "departedAt", o.arrived_at AS "arrivedAt", o.collected_at AS "collectedAt",
          o.closed_at AS "closedAt", t.active AS "teamActive",
          jsonb_build_object('location', o.occurrence_snapshot->>'location', 'teamName', o.team_snapshot->>'name',
            'vehicleLicensePlate', o.vehicle_snapshot->>'licensePlate') AS dispatch,
          jsonb_build_object('location', c.location, 'teamName', t.name, 'vehicleLicensePlate', v.license_plate) AS current,
          o.occurrence_snapshot AS "occurrenceSnapshot", o.team_snapshot AS "teamSnapshot",
          o.vehicle_snapshot AS "vehicleSnapshot"
        FROM svo.execution_orders o JOIN svo.teams t ON t.id = o.team_id
          JOIN svo.occurrences c ON c.id = o.occurrence_id JOIN fleet.vehicles v ON v.id = o.vehicle_id
        WHERE o.id = $1`, [id],
    )
    return result.rows[0] ?? null
  }

  /** Projeta apenas metadados antes de autorizar; serializa revisão e etapas da mesma ordem. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOrderState | null> {
    const result = await client.query<SvoOrderState>(
      `SELECT id::text AS id, occurrence_id::text AS "occurrenceId", team_id::text AS "teamId",
          vehicle_id::text AS "vehicleId", status, revision, opened_at AS "openedAt", departed_at AS "departedAt",
          arrived_at AS "arrivedAt", collected_at AS "collectedAt", closed_at AS "closedAt"
        FROM svo.execution_orders WHERE id = $1 FOR UPDATE`, [id],
    )
    return result.rows[0] ?? null
  }

  /** A vigência é decidida com o relógio obtido após esta trava, inclusive em revogação concorrente. */
  async findMembershipForShare(teamId: string, userId: string, client: PoolClient): Promise<SvoOrderMembership | null> {
    const result = await client.query<SvoOrderMembership>(
      `SELECT active, joined_at AS "joinedAt", left_at AS "leftAt" FROM svo.team_members
        WHERE team_id = $1 AND user_id = $2 FOR SHARE`, [teamId, userId],
    )
    return result.rows[0] ?? null
  }

  async updateStatus(order: SvoOrderState, status: SvoOrderTransition, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.execution_orders SET status = $2, revision = revision + 1, updated_at = $3,
        departed_at = CASE WHEN $2 = 'IN_TRANSIT' THEN $3 ELSE departed_at END,
        arrived_at = CASE WHEN $2 = 'IN_SERVICE' THEN $3 ELSE arrived_at END
        WHERE id = $1 AND revision = $4`, [order.id, status, time, order.revision],
    )
    return result.rowCount === 1
  }

  async createStatusEvent(event: SvoOrderStatusEvent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO svo.execution_order_events
        (execution_order_id, event_type, occurred_at, reported_by, registered_by,
          actor_snapshot, reason, evidence_description, before_state, after_state)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb)`,
      [event.after.id, event.eventType, event.occurredAt, event.actor.name, event.actor.id,
        JSON.stringify(event.actor), event.reason, event.evidenceDescription,
        JSON.stringify(event.before), JSON.stringify(event.after)],
    )
  }

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
