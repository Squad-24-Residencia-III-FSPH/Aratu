import type { PoolClient } from 'pg'
import { SVO_ORDER_OCCUPYING_STATUSES } from '../types/svo-order.types'
import type {
  NewSvoOrder, OpenSvoOrderEvent, SvoDispatchCandidateTeam, SvoDispatchCandidateVehicleRow,
  SvoOrderRecord, SvoTeamSnapshot, SvoDispatchTeamCandidate,
} from '../types/svo-order.types'
import type {
  SvoOrderState, SvoOrderReadRow, SvoOrderDetailRow, SvoOrderMembership,
  SvoOrderStatus, SvoOrderTransition, SvoOrderStatusEvent,
} from '../types/svo-order.types'

export interface SvoOrdersRepositoryContract {
  findByOccurrenceId(id: string, client: PoolClient): Promise<{ id: string; teamId: string; vehicleId: string } | null>
  findTeamForShare(id: string, client: PoolClient): Promise<SvoTeamSnapshot | null>
  countOccupyingOrders(vehicleId: string, client: PoolClient): Promise<number>
  create(order: NewSvoOrder, client: PoolClient): Promise<SvoOrderRecord>
  createOpenedEvent(event: OpenSvoOrderEvent, client: PoolClient): Promise<void>
  listForActor(userId: string | null, status: SvoOrderStatus | null, time: Date, client: PoolClient): Promise<SvoOrderReadRow[]>
  findById(id: string, client: PoolClient): Promise<SvoOrderDetailRow | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<SvoOrderState | null>
  findMembershipForShare(teamId: string, userId: string, client: PoolClient): Promise<SvoOrderMembership | null>
  updateStatus(order: SvoOrderState, status: SvoOrderTransition, time: Date, client: PoolClient): Promise<boolean>
  updateResult(after: SvoOrderState, expectedRevision: number, time: Date, client: PoolClient): Promise<boolean>
  createStatusEvent(event: SvoOrderStatusEvent, client: PoolClient): Promise<void>
  listActiveTeams(client: PoolClient): Promise<SvoDispatchCandidateTeam[]>
  listEligibleVehiclesForDispatch(client: PoolClient): Promise<SvoDispatchCandidateVehicleRow[]>
  lockEligibleDispatchTeams(time: Date, client: PoolClient): Promise<void>
  rankDispatchTeams(time: Date, client: PoolClient): Promise<SvoDispatchTeamCandidate[]>
  listDispatchVehicleIds(time: Date, client: PoolClient): Promise<string[]>
  hasInstitutionalTripConflict(vehicleId: string, time: Date, client: PoolClient): Promise<boolean>
}

/** Consultas parametrizadas usam o cliente transacional; cada operação obtém as travas do seu domínio. */
export class SvoOrdersRepository implements SvoOrdersRepositoryContract {
  async listForActor(userId: string | null, status: SvoOrderStatus | null, time: Date, client: PoolClient): Promise<SvoOrderReadRow[]> {
    const result = await client.query<SvoOrderReadRow>(
      `SELECT o.id::text AS id, o.occurrence_id::text AS "occurrenceId", o.team_id::text AS "teamId",
          o.vehicle_id::text AS "vehicleId", o.status, o.result, o.revision, o.opened_at AS "openedAt",
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
          o.vehicle_id::text AS "vehicleId", o.status, o.result, o.failure_reason AS "failureReason", o.notes,
          o.revision, o.opened_at AS "openedAt", o.departed_at AS "departedAt", o.arrived_at AS "arrivedAt",
          o.collected_at AS "collectedAt", o.closed_at AS "closedAt", o.closed_by::text AS "closedBy",
          t.active AS "teamActive",
          jsonb_build_object('location', o.occurrence_snapshot->>'location', 'teamName', o.team_snapshot->>'name',
            'vehicleLicensePlate', o.vehicle_snapshot->>'licensePlate') AS dispatch,
          jsonb_build_object('location', c.location, 'teamName', t.name, 'vehicleLicensePlate', v.license_plate) AS current,
          o.occurrence_snapshot AS "occurrenceSnapshot", o.team_snapshot AS "teamSnapshot",
          o.vehicle_snapshot AS "vehicleSnapshot", o.allocation_snapshot AS "allocationSnapshot"
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
          vehicle_id::text AS "vehicleId", status, result, failure_reason AS "failureReason", notes,
          revision, opened_at AS "openedAt", departed_at AS "departedAt", arrived_at AS "arrivedAt",
          collected_at AS "collectedAt", closed_at AS "closedAt", closed_by::text AS "closedBy"
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

  async updateResult(after: SvoOrderState, expectedRevision: number, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `UPDATE svo.execution_orders SET status = $2, result = $2, failure_reason = $3, notes = $4,
        collected_at = $5, closed_at = $6, closed_by = $7, revision = revision + 1, updated_at = $6
        WHERE id = $1 AND revision = $8`,
      [after.id, after.result, after.failureReason, after.notes, after.collectedAt, time, after.closedBy, expectedRevision],
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

  async findByOccurrenceId(id: string, client: PoolClient): Promise<{ id: string; teamId: string; vehicleId: string } | null> {
    const result = await client.query<{ id: string; teamId: string; vehicleId: string }>(
      'SELECT id::text AS id, team_id::text AS "teamId", vehicle_id::text AS "vehicleId" FROM svo.execution_orders WHERE occurrence_id = $1', [id],
    )
    return result.rows[0] ?? null
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
          occurrence_snapshot, team_snapshot, vehicle_snapshot, team_shift_id, allocation_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb)
       RETURNING id::text AS id`,
      [order.occurrenceId, order.teamId, order.vehicleId, order.status, order.openedAt, order.createdBy,
        order.revision, JSON.stringify(order.occurrenceSnapshot), JSON.stringify(order.teamSnapshot),
        JSON.stringify(order.vehicleSnapshot), order.teamShiftId, JSON.stringify(order.allocationSnapshot)],
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

  /** Lista equipes SVO ativas para seleção de despacho na Central SVO. */
  async listActiveTeams(client: PoolClient): Promise<SvoDispatchCandidateTeam[]> {
    const result = await client.query<SvoDispatchCandidateTeam>(
      `SELECT id::text AS id, name
         FROM svo.teams
        WHERE active = true
        ORDER BY name ASC, id ASC`,
    )
    return result.rows
  }

  /** Trava equipes elegíveis em ordem de ID antes de recalcular a carga. */
  async lockEligibleDispatchTeams(time: Date, client: PoolClient): Promise<void> {
    await client.query(
      `SELECT t.id FROM svo.teams t
        WHERE t.active = true
          AND EXISTS (SELECT 1 FROM svo.team_shifts s WHERE s.team_id = t.id AND s.canceled_at IS NULL
            AND s.starts_at <= $1 AND s.ends_at > $1)
          AND EXISTS (SELECT 1 FROM svo.team_members m JOIN auth.users u ON u.id = m.user_id
            JOIN auth.roles r ON r.id = u.role_id WHERE m.team_id = t.id AND m.active = true
              AND m.joined_at <= $1 AND (m.left_at IS NULL OR m.left_at > $1)
              AND u.active = true AND r.name = 'EQUIPE_SVO')
        ORDER BY t.id FOR UPDATE OF t`, [time],
    )
  }

  /** Recalcula carga e último despacho depois das travas das equipes elegíveis. */
  async rankDispatchTeams(time: Date, client: PoolClient): Promise<SvoDispatchTeamCandidate[]> {
    const result = await client.query<SvoDispatchTeamCandidate>(
      `SELECT t.id::text AS id, t.name, t.active, t.revision, s.id::text AS "shiftId",
          s.starts_at AS "shiftStartsAt", s.ends_at AS "shiftEndsAt",
          (SELECT count(*)::integer FROM svo.execution_orders active_order
            WHERE active_order.team_id = t.id AND active_order.status = ANY($2::text[])) AS "activeOrderCount",
          (SELECT max(all_order.opened_at) FROM svo.execution_orders all_order
            WHERE all_order.team_id = t.id) AS "lastDispatchAt"
        FROM svo.teams t
        JOIN LATERAL (SELECT id, starts_at, ends_at FROM svo.team_shifts
          WHERE team_id = t.id AND canceled_at IS NULL AND starts_at <= $1 AND ends_at > $1
          ORDER BY starts_at DESC, id DESC LIMIT 1) s ON true
        WHERE t.active = true AND EXISTS (SELECT 1 FROM svo.team_members m JOIN auth.users u ON u.id = m.user_id
          JOIN auth.roles r ON r.id = u.role_id WHERE m.team_id = t.id AND m.active = true
            AND m.joined_at <= $1 AND (m.left_at IS NULL OR m.left_at > $1)
            AND u.active = true AND r.name = 'EQUIPE_SVO')
        ORDER BY "activeOrderCount" ASC, "lastDispatchAt" ASC NULLS FIRST, t.id ASC`,
      [time, SVO_ORDER_OCCUPYING_STATUSES],
    )
    return result.rows
  }

  /**
   * Consulta viaturas disponíveis para operação SVO e transporte de corpos sem
   * manutenção impeditiva ativa, incluindo a contagem de ordens que ocupam vaga.
   */
  async listEligibleVehiclesForDispatch(client: PoolClient): Promise<SvoDispatchCandidateVehicleRow[]> {
    const result = await client.query<SvoDispatchCandidateVehicleRow>(
      `SELECT v.id::text AS id,
              v.license_plate AS plate,
              v.brand,
              v.model,
              v.body_limit AS "bodyLimit",
              (
                SELECT count(o.id)::integer
                  FROM svo.execution_orders o
                 WHERE o.vehicle_id = v.id
                   AND o.status = ANY($1::text[])
              ) AS "occupyingOrders"
         FROM fleet.vehicles v
        WHERE v.status = 'AVAILABLE'
          AND v.operation_type = 'SVO'
          AND 'BODY' = ANY(v.categories)
          AND v.body_limit > 0
          AND NOT EXISTS (
            SELECT 1
              FROM fleet.maintenance_orders m
             WHERE m.vehicle_id = v.id
               AND m.blocks_vehicle = true
               AND m.status IN ('OPEN', 'IN_PROGRESS')
          )
        ORDER BY v.license_plate ASC, v.id ASC`,
      [SVO_ORDER_OCCUPYING_STATUSES],
    )
    return result.rows
  }

  async listDispatchVehicleIds(time: Date, client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
      `SELECT v.id::text AS id FROM fleet.vehicles v
        WHERE v.status = 'AVAILABLE' AND v.operation_type = 'SVO' AND 'BODY' = ANY(v.categories)
          AND v.body_limit > 0
          AND NOT EXISTS (SELECT 1 FROM fleet.maintenance_orders m WHERE m.vehicle_id = v.id
            AND m.blocks_vehicle = true AND m.status IN ('OPEN', 'IN_PROGRESS'))
          AND NOT EXISTS (SELECT 1 FROM trip.trips t WHERE t.vehicle_id = v.id
            AND (t.status = 'IN_PROGRESS' OR (t.status = 'SCHEDULED'
              AND t.scheduled_start <= $1 AND t.scheduled_end > $1)))
        ORDER BY v.id`, [time],
    )
    return result.rows.map(({ id }) => id)
  }

  async hasInstitutionalTripConflict(vehicleId: string, time: Date, client: PoolClient): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM trip.trips t WHERE t.vehicle_id = $1
        AND (t.status = 'IN_PROGRESS' OR (t.status = 'SCHEDULED'
          AND t.scheduled_start <= $2 AND t.scheduled_end > $2))) AS found`, [vehicleId, time],
    )
    return result.rows[0]!.found
  }
}
