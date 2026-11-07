import type { Pool, PoolClient } from 'pg'
import type {
  MaintenanceOrder, MaintenanceAttributes, MaintenanceFilters, MaintenanceEvent,
} from '../types/maintenance.types'
import type { Vehicle } from '../types/vehicle.types'

export interface MaintenanceRepositoryContract {
  findById(id: string, client?: PoolClient): Promise<MaintenanceOrder | null>
  lockOrder(id: string, client: PoolClient): Promise<MaintenanceOrder | null>
  findOpening(actorId: string, key: string): Promise<{ orderId: string; request: Record<string, unknown> } | null>
  findOpeningInTransaction(actorId: string, key: string, client: PoolClient): Promise<{ orderId: string; request: Record<string, unknown> } | null>
  hasActiveBlock(vehicleId: string, client: PoolClient, excludingId?: string): Promise<boolean>
  hasActiveTrip(vehicleId: string, client: PoolClient): Promise<boolean>
  create(attributes: MaintenanceAttributes, vehicle: Vehicle, openedAt: Date, actorId: string, key: string, client: PoolClient): Promise<MaintenanceOrder>
  saveAttributes(id: string, attributes: MaintenanceAttributes, client: PoolClient): Promise<MaintenanceOrder>
  close(id: string, items: MaintenanceOrder['actualItems'], cost: string, closedAt: Date, actorId: string, client: PoolClient): Promise<MaintenanceOrder>
  createEvent(event: MaintenanceEvent, client: PoolClient): Promise<void>
  list(filters: MaintenanceFilters): Promise<{ items: MaintenanceOrder[]; totalSpent: string }>
}

/** Persistência de ordens e eventos, sempre participante da transação do veículo. */
export class MaintenanceOrdersRepository implements MaintenanceRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async findById(id: string, client?: PoolClient): Promise<MaintenanceOrder | null> {
    const result = await (client ?? this.pool).query<MaintenanceOrder>(
      `SELECT id::text AS id, vehicle_id::text AS "vehicleId", type, description,
              blocks_vehicle AS "blocksVehicle", status, workshop, odometer_km AS "odometerKm",
              expected_completion_date::text AS "expectedCompletionDate", estimate_items AS "estimateItems",
              actual_items AS "actualItems", cost::text AS cost, opened_at AS "openedAt", closed_at AS "closedAt",
              vehicle_snapshot AS "vehicleSnapshot", created_by::text AS "createdBy", closed_by::text AS "closedBy",
              revision, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.maintenance_orders WHERE id = $1`, [id],
    )
    return result.rows[0] ?? null
  }

  /** A trava da viatura já deve estar adquirida para manter ordem global de bloqueio. */
  async lockOrder(id: string, client: PoolClient): Promise<MaintenanceOrder | null> {
    await client.query('SELECT id FROM fleet.maintenance_orders WHERE id = $1 FOR UPDATE', [id])
    return this.findById(id, client)
  }

  async findOpening(actorId: string, key: string) {
    return this.readOpening(actorId, key, this.pool)
  }

  async findOpeningInTransaction(actorId: string, key: string, client: PoolClient) {
    return this.readOpening(actorId, key, client)
  }

  private async readOpening(actorId: string, key: string, executor: Pool | PoolClient) {
    const result = await executor.query<{ orderId: string; request: Record<string, unknown> }>(
      `SELECT o.id::text AS "orderId", e.after_state->'openingRequest' AS request
         FROM fleet.maintenance_orders o
         JOIN fleet.maintenance_order_events e ON e.maintenance_order_id = o.id AND e.event_type = 'OPENED'
        WHERE o.created_by = $1 AND o.creation_key = $2::uuid`, [actorId, key],
    )
    return result.rows[0] ?? null
  }

  async hasActiveBlock(vehicleId: string, client: PoolClient, excludingId?: string): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT id FROM fleet.maintenance_orders
        WHERE vehicle_id = $1 AND blocks_vehicle AND status IN ('OPEN', 'IN_PROGRESS')
          AND ($2::bigint IS NULL OR id <> $2)) AS found`, [vehicleId, excludingId ?? null],
    )
    return result.rows[0]!.found
  }

  async hasActiveTrip(vehicleId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (SELECT id FROM trip.trips WHERE vehicle_id = $1 AND status = 'IN_PROGRESS') AS found`,
      [vehicleId],
    )
    return result.rows[0]!.found
  }

  async create(attributes: MaintenanceAttributes, vehicle: Vehicle, openedAt: Date, actorId: string, key: string, client: PoolClient): Promise<MaintenanceOrder> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO fleet.maintenance_orders
        (vehicle_id, type, description, blocks_vehicle, workshop, odometer_km,
         expected_completion_date, estimate_items, opened_at, created_by, creation_key, vehicle_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::uuid, $12::jsonb)
       RETURNING id::text AS id`,
      [vehicle.id, attributes.type, attributes.description, attributes.blocksVehicle, attributes.workshop,
        attributes.odometerKm, attributes.expectedCompletionDate, this.itemsJson(attributes.estimateItems),
        openedAt, actorId, key, JSON.stringify(vehicle)],
    )
    return (await this.findById(result.rows[0]!.id, client))!
  }

  async saveAttributes(id: string, attributes: MaintenanceAttributes, client: PoolClient): Promise<MaintenanceOrder> {
    await client.query(
      `UPDATE fleet.maintenance_orders SET type = $2, description = $3, blocks_vehicle = $4,
        workshop = $5, odometer_km = $6, expected_completion_date = $7, estimate_items = $8::jsonb,
        revision = revision + 1, updated_at = clock_timestamp() WHERE id = $1`,
      [id, attributes.type, attributes.description, attributes.blocksVehicle, attributes.workshop,
        attributes.odometerKm, attributes.expectedCompletionDate, this.itemsJson(attributes.estimateItems)],
    )
    return (await this.findById(id, client))!
  }

  async close(id: string, items: MaintenanceOrder['actualItems'], cost: string, closedAt: Date, actorId: string, client: PoolClient): Promise<MaintenanceOrder> {
    await client.query(
      `UPDATE fleet.maintenance_orders SET status = 'DONE', actual_items = $2::jsonb, cost = $3,
        closed_at = $4, closed_by = $5, revision = revision + 1, updated_at = clock_timestamp() WHERE id = $1`,
      [id, this.itemsJson(items), cost, closedAt, actorId],
    )
    return (await this.findById(id, client))!
  }

  async createEvent(event: MaintenanceEvent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO fleet.maintenance_order_events
        (maintenance_order_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, evidence_description, before_state, after_state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb)`,
      [event.orderId, event.eventType, event.occurredAt, event.metadata.reportedBy, event.actor.id,
        JSON.stringify(event.actor), event.metadata.reason, event.metadata.reportedBy,
        event.before ? JSON.stringify(event.before) : null,
        JSON.stringify({ ...event.after, ...(event.openingRequest ? { openingRequest: event.openingRequest } : {}) })],
    )
  }

  /** Uma instrução mantém lista e gasto na mesma fotografia, com períodos independentes. */
  async list(filters: MaintenanceFilters): Promise<{ items: MaintenanceOrder[]; totalSpent: string }> {
    const result = await this.pool.query<{ items: MaintenanceOrder[]; totalSpent: string }>(
      `WITH orders AS (
         SELECT id::text AS id, vehicle_id::text AS "vehicleId", type, description,
                blocks_vehicle AS "blocksVehicle", status, workshop, odometer_km AS "odometerKm",
                expected_completion_date::text AS "expectedCompletionDate", estimate_items AS "estimateItems",
                actual_items AS "actualItems", cost::text AS cost, opened_at AS "openedAt", closed_at AS "closedAt",
                vehicle_snapshot AS "vehicleSnapshot", created_by::text AS "createdBy", closed_by::text AS "closedBy",
                revision, created_at AS "createdAt", updated_at AS "updatedAt"
           FROM fleet.maintenance_orders
          WHERE ($1::bigint IS NULL OR vehicle_id = $1) AND ($2::text IS NULL OR type = $2)
            AND ($3::text IS NULL OR status = $3)
       ) SELECT
         COALESCE(jsonb_agg(orders ORDER BY "openedAt" DESC, id::bigint DESC)
           FILTER (WHERE ($4::timestamptz IS NULL OR "openedAt" >= $4)
                     AND ($5::timestamptz IS NULL OR "openedAt" < $5)), '[]'::jsonb) AS items,
         COALESCE(sum(cost::numeric) FILTER (WHERE status = 'DONE'
           AND ($4::timestamptz IS NULL OR "closedAt" >= $4)
           AND ($5::timestamptz IS NULL OR "closedAt" < $5)), 0.00)::text AS "totalSpent"
         FROM orders`,
      [filters.vehicleId ?? null, filters.type ?? null, filters.status ?? null, filters.from ?? null, filters.to ?? null],
    )
    const row = result.rows[0]!
    return { totalSpent: row.totalSpent, items: row.items.map(order => ({
      ...order, openedAt: new Date(order.openedAt), closedAt: order.closedAt ? new Date(order.closedAt) : null,
      createdAt: new Date(order.createdAt), updatedAt: new Date(order.updatedAt),
    })) }
  }

  private itemsJson(items: MaintenanceOrder['estimateItems']): string | null {
    return items === null ? null : JSON.stringify(items)
  }
}
