import type { Pool } from 'pg'
import type { AuditEntityType, AuditHistoryEntry, AuditHistoryScope, AuditLogFilters, StoredAuditLog } from '../types/audit-log.types'
import type { EntityHistoryFilters } from '../types/entity-history.types'

/** Contrato de leitura da trilha de auditoria, usado pelo service e por testes isolados. */
export interface AuditLogsRepositoryContract {
  list(filters: AuditLogFilters): Promise<StoredAuditLog[]>
  count(filters: AuditLogFilters): Promise<number>
  listHistory?(entityType: AuditEntityType, recordId: string, filters: EntityHistoryFilters, scope?: AuditHistoryScope): Promise<{ items: AuditHistoryEntry[]; total: number; found?: boolean }>
}

/**
 * Leitura paginada de `audit.logs`, somente consulta.
 *
 * O período chega como datas civis de Aracaju e vira o intervalo semiaberto sobre `registered_at`,
 * aproveitando o índice `audit_logs_by_registered_at`.
 */
export class AuditLogsRepository implements AuditLogsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  async list(filters: AuditLogFilters): Promise<StoredAuditLog[]> {
    const result = await this.pool.query<StoredAuditLog>(
      `SELECT id::text AS id, registered_at AS "registeredAt", user_id::text AS "userId",
              actor_snapshot->>'name' AS "actorName", operation, table_name AS "table",
              record_id AS "recordId", reason, before, after, actor_snapshot AS "actorSnapshot"
         FROM audit.logs
        WHERE ($1::date IS NULL OR registered_at >= ($1::date::timestamp AT TIME ZONE 'America/Maceio'))
          AND ($2::date IS NULL OR registered_at < ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
          AND ($3::bigint IS NULL OR user_id = $3)
          AND ($4::text IS NULL OR operation = $4)
          AND ($5::text IS NULL OR table_name = $5)
          AND ($6::text IS NULL OR record_id = $6)
        ORDER BY registered_at DESC, id DESC
        LIMIT $7 OFFSET $8`,
      [filters.from, filters.to, filters.userId, filters.operation, filters.table, filters.recordId, filters.limit, filters.offset],
    )
    return result.rows
  }

  async count(filters: AuditLogFilters): Promise<number> {
    const result = await this.pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM audit.logs
        WHERE ($1::date IS NULL OR registered_at >= ($1::date::timestamp AT TIME ZONE 'America/Maceio'))
          AND ($2::date IS NULL OR registered_at < ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
          AND ($3::bigint IS NULL OR user_id = $3)
          AND ($4::text IS NULL OR operation = $4)
          AND ($5::text IS NULL OR table_name = $5)
          AND ($6::text IS NULL OR record_id = $6)`,
      [filters.from, filters.to, filters.userId, filters.operation, filters.table, filters.recordId],
    )
    return result.rows[0]?.total ?? 0
  }

  /** Selects domain readers from a fixed allowlist; the entity type never becomes SQL syntax. */
  async listHistory(
    entityType: AuditEntityType,
    recordId: string,
    filters: EntityHistoryFilters,
    scope?: AuditHistoryScope,
  ): Promise<{ items: AuditHistoryEntry[]; total: number; found: boolean }> {
    if (entityType === 'vehicle' || entityType === 'driver') {
      const table = entityType === 'vehicle' ? 'fleet.vehicle_events' : 'fleet.driver_events'
      const entityTable = entityType === 'vehicle' ? 'fleet.vehicles' : 'fleet.drivers'
      const foreignKey = entityType === 'vehicle' ? 'vehicle_id' : 'driver_id'
      const [count, events] = await Promise.all([
        this.pool.query<{ total: string; found: boolean }>(
          `SELECT count(*)::text AS total,
                  EXISTS (SELECT 1 FROM ${entityTable} entity WHERE entity.id = $1) AS found
             FROM ${table}
            WHERE ${foreignKey} = $1
              AND ($2::text IS NULL OR event_type = $2)
              AND ($3::date IS NULL OR occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))`,
          [recordId, filters.eventType ?? null, filters.from ?? null, filters.to ?? null],
        ),
        this.pool.query<{
          id: string; eventType: string; occurredAt: Date; registeredAt: Date; reportedBy: string
          reason: string; actorId: string | null; actorName: string | null; actorRole: string | null
          before: unknown; after: unknown
        }>(
          `SELECT id::text AS id, event_type AS "eventType", occurred_at AS "occurredAt",
                  registered_at AS "registeredAt", reported_by AS "reportedBy", reason,
                  actor_snapshot->>'id' AS "actorId", actor_snapshot->>'name' AS "actorName",
                  actor_snapshot->>'role' AS "actorRole", before_state AS before, after_state AS after
             FROM ${table}
            WHERE ${foreignKey} = $1
              AND ($2::text IS NULL OR event_type = $2)
              AND ($3::date IS NULL OR occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
            ORDER BY occurred_at DESC, id DESC LIMIT $5 OFFSET $6`,
          [recordId, filters.eventType ?? null, filters.from ?? null, filters.to ?? null, filters.pageSize, (filters.page - 1) * filters.pageSize],
        ),
      ])
      return {
        total: Number(count.rows[0]?.total ?? 0),
        found: count.rows[0]?.found ?? false,
        items: events.rows.map((event) => ({
          id: event.id,
          source: 'DOMAIN_EVENT',
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          registeredAt: event.registeredAt,
          reportedBy: event.reportedBy,
          actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
          reason: event.reason,
          before: event.before,
          after: event.after,
          sensitiveDataHidden: false,
        })),
      }
    }

    if (entityType === 'trip-request') {
      const requesterId = scope?.kind === 'own' ? scope.actorId : null
      const values = [recordId, filters.from ?? null, filters.to ?? null, requesterId]
      const [count, events] = await Promise.all([
        this.pool.query<{ total: string; found: boolean }>(
          `SELECT count(*)::text AS total,
                  EXISTS (SELECT 1 FROM trip.requests visible_request
                           WHERE visible_request.id = $1
                             AND ($4::bigint IS NULL OR visible_request.requester_id = $4)) AS found
             FROM trip.request_events e
             JOIN trip.requests r ON r.id = e.request_id
            WHERE e.request_id = $1
              AND ($2::date IS NULL OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($3::date IS NULL OR e.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::bigint IS NULL OR r.requester_id = $4)`, values,
        ),
        this.pool.query<{
          id: string; eventType: string; occurredAt: Date; registeredAt: Date; reportedBy: string
          reason: string; actorId: string | null; actorName: string | null; actorRole: string | null
          before: unknown; after: unknown
        }>(
          `SELECT e.id::text AS id, e.event_type AS "eventType", e.occurred_at AS "occurredAt",
                  e.registered_at AS "registeredAt", e.reported_by AS "reportedBy", e.reason,
                  e.actor_snapshot->>'id' AS "actorId", e.actor_snapshot->>'name' AS "actorName",
                  e.actor_snapshot->>'role' AS "actorRole", e.before_state AS before, e.after_state AS after
             FROM trip.request_events e
             JOIN trip.requests r ON r.id = e.request_id
            WHERE e.request_id = $1
              AND ($2::date IS NULL OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($3::date IS NULL OR e.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::bigint IS NULL OR r.requester_id = $4)
            ORDER BY e.occurred_at ASC, e.id ASC LIMIT $5 OFFSET $6`,
          [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
        ),
      ])
      return {
        total: Number(count.rows[0]?.total ?? 0),
        found: count.rows[0]?.found ?? false,
        items: events.rows.map((event) => ({
          id: event.id, source: 'DOMAIN_EVENT', eventType: event.eventType,
          occurredAt: event.occurredAt, registeredAt: event.registeredAt,
          reportedBy: event.reportedBy,
          actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
          reason: event.reason, before: event.before, after: event.after, sensitiveDataHidden: false,
        })),
      }
    }

    if (entityType === 'trip') {
      const actorId = scope?.kind === 'assigned' ? scope.actorId : null
      const values = [recordId, filters.from ?? null, filters.to ?? null, actorId]
      const [count, events] = await Promise.all([
        this.pool.query<{ total: string; found: boolean }>(
          `SELECT count(*)::text AS total,
                  EXISTS (SELECT 1 FROM trip.trips visible_trip
                          LEFT JOIN fleet.drivers visible_driver ON visible_driver.id = visible_trip.driver_id
                           WHERE visible_trip.id = $1
                             AND ($4::bigint IS NULL OR visible_driver.user_id = $4)) AS found
             FROM trip.trip_events e
             JOIN trip.trips t ON t.id = e.trip_id
             LEFT JOIN fleet.drivers d ON d.id = t.driver_id
            WHERE e.trip_id = $1
              AND ($2::date IS NULL OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($3::date IS NULL OR e.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::bigint IS NULL OR d.user_id = $4)`, values,
        ),
        this.pool.query<{
          id: string; eventType: string; occurredAt: Date; registeredAt: Date; reportedBy: string
          reason: string; actorId: string | null; actorName: string | null; actorRole: string | null
          before: unknown; after: unknown
        }>(
          `SELECT e.id::text AS id, e.event_type AS "eventType", e.occurred_at AS "occurredAt",
                  e.registered_at AS "registeredAt", e.reported_by AS "reportedBy", e.reason,
                  e.actor_snapshot->>'id' AS "actorId", e.actor_snapshot->>'name' AS "actorName",
                  e.actor_snapshot->>'role' AS "actorRole", e.before_state AS before, e.after_state AS after
             FROM trip.trip_events e
             JOIN trip.trips t ON t.id = e.trip_id
             LEFT JOIN fleet.drivers d ON d.id = t.driver_id
            WHERE e.trip_id = $1
              AND ($2::date IS NULL OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($3::date IS NULL OR e.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::bigint IS NULL OR d.user_id = $4)
            ORDER BY e.occurred_at ASC, e.id ASC LIMIT $5 OFFSET $6`,
          [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
        ),
      ])
      return {
        total: Number(count.rows[0]?.total ?? 0),
        found: count.rows[0]?.found ?? false,
        items: events.rows.map((event) => ({
          id: event.id, source: 'DOMAIN_EVENT', eventType: event.eventType,
          occurredAt: event.occurredAt, registeredAt: event.registeredAt,
          reportedBy: event.reportedBy,
          actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
          reason: event.reason, before: event.before, after: event.after, sensitiveDataHidden: false,
        })),
      }
    }

    if (entityType === 'svo-occurrence' || entityType === 'svo-order' || entityType === 'svo-team') {
      const reader = {
        'svo-occurrence': { events: 'svo.occurrence_events', entity: 'svo.occurrences', foreignKey: 'occurrence_id' },
        'svo-order': { events: 'svo.execution_order_events', entity: 'svo.execution_orders', foreignKey: 'execution_order_id' },
        'svo-team': { events: 'svo.team_events', entity: 'svo.teams', foreignKey: 'team_id' },
      }[entityType]
      const assignedOrder = entityType === 'svo-order' && scope?.kind === 'assigned'
      const actorId = assignedOrder ? scope.actorId : null
      const assignmentPredicate = entityType === 'svo-order'
        ? `AND ($5::bigint IS NULL OR EXISTS (
            SELECT 1 FROM svo.execution_orders assigned_order
            JOIN svo.team_members member ON member.team_id = assigned_order.team_id
            WHERE assigned_order.id = $1 AND member.user_id = $5 AND member.active
              AND member.joined_at <= clock_timestamp()
              AND (member.left_at IS NULL OR member.left_at > clock_timestamp())
          ))`
        : 'AND $5::bigint IS NULL'
      const values = [recordId, filters.eventType ?? null, filters.from ?? null, filters.to ?? null, actorId]
      const [count, events] = await Promise.all([
        this.pool.query<{ total: string; found: boolean }>(
          `SELECT count(*)::text AS total,
                  EXISTS (SELECT 1 FROM ${reader.entity} entity
                           WHERE entity.id = $1 ${assignmentPredicate}) AS found
             FROM ${reader.events} e
            WHERE e.${reader.foreignKey} = $1
              AND ($2::text IS NULL OR e.event_type = $2)
              AND ($3::date IS NULL OR e.occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR e.occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              ${assignmentPredicate}`,
          values,
        ),
        this.pool.query<{
          id: string; eventType: string; occurredAt: Date; registeredAt: Date
          actorId: string | null; actorName: string | null; actorRole: string | null
        }>(
          `SELECT e.id::text AS id, e.event_type AS "eventType", e.occurred_at AS "occurredAt",
                  e.registered_at AS "registeredAt", e.actor_snapshot->>'id' AS "actorId",
                  e.actor_snapshot->>'name' AS "actorName", e.actor_snapshot->>'role' AS "actorRole"
             FROM ${reader.events} e
            WHERE e.${reader.foreignKey} = $1
              AND ($2::text IS NULL OR e.event_type = $2)
              AND ($3::date IS NULL OR e.occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR e.occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
              ${assignmentPredicate}
            ORDER BY e.occurred_at ASC, e.id ASC LIMIT $6 OFFSET $7`,
          [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
        ),
      ])
      return {
        total: Number(count.rows[0]?.total ?? 0),
        found: count.rows[0]?.found ?? false,
        items: events.rows.map((event) => ({
          id: event.id,
          source: 'DOMAIN_EVENT',
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          registeredAt: event.registeredAt,
          reportedBy: null,
          actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
          reason: null,
          before: null,
          after: null,
          sensitiveDataHidden: true,
        })),
      }
    }

    const fleetReaders: Readonly<Partial<Record<AuditEntityType, { events: string; entity: string; foreignKey: string }>>> = {
      'maintenance-order': { events: 'fleet.maintenance_order_events', entity: 'fleet.maintenance_orders', foreignKey: 'maintenance_order_id' },
      fueling: { events: 'fleet.fueling_events', entity: 'fleet.fuelings', foreignKey: 'fueling_id' },
      fine: { events: 'fleet.fine_events', entity: 'fleet.fines', foreignKey: 'fine_id' },
      'vehicle-document': { events: 'fleet.vehicle_document_events', entity: 'fleet.vehicle_documents', foreignKey: 'vehicle_document_id' },
    }
    const fleetReader = fleetReaders[entityType]
    if (fleetReader) {
      const values = [recordId, filters.eventType ?? null, filters.from ?? null, filters.to ?? null]
      const [count, events] = await Promise.all([
        this.pool.query<{ total: string; found: boolean }>(
          `SELECT count(*)::text AS total,
                  EXISTS (SELECT 1 FROM ${fleetReader.entity} entity WHERE entity.id = $1) AS found
             FROM ${fleetReader.events} e
            WHERE e.${fleetReader.foreignKey} = $1
              AND ($2::text IS NULL OR e.event_type = $2)
              AND ($3::date IS NULL OR e.occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR e.occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))`,
          values,
        ),
        this.pool.query<{
          id: string; eventType: string; occurredAt: Date; registeredAt: Date; reportedBy: string
          reason: string; actorId: string | null; actorName: string | null; actorRole: string | null
          before: unknown; after: unknown
        }>(
          `SELECT e.id::text AS id, e.event_type AS "eventType", e.occurred_at AS "occurredAt",
                  e.registered_at AS "registeredAt", e.reported_by AS "reportedBy", e.reason,
                  e.actor_snapshot->>'id' AS "actorId", e.actor_snapshot->>'name' AS "actorName",
                  e.actor_snapshot->>'role' AS "actorRole", e.before_state AS before, e.after_state AS after
             FROM ${fleetReader.events} e
            WHERE e.${fleetReader.foreignKey} = $1
              AND ($2::text IS NULL OR e.event_type = $2)
              AND ($3::date IS NULL OR e.occurred_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
              AND ($4::date IS NULL OR e.occurred_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
            ORDER BY e.occurred_at ASC, e.id ASC LIMIT $5 OFFSET $6`,
          [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
        ),
      ])
      return {
        total: Number(count.rows[0]?.total ?? 0),
        found: count.rows[0]?.found ?? false,
        items: events.rows.map((event) => ({
          id: event.id,
          source: 'DOMAIN_EVENT',
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          registeredAt: event.registeredAt,
          reportedBy: event.reportedBy,
          actor: { id: event.actorId, name: event.actorName, role: event.actorRole },
          reason: event.reason,
          before: event.before,
          after: event.after,
          sensitiveDataHidden: false,
        })),
      }
    }

    const auditTables: Readonly<Record<AuditEntityType, string>> = {
      vehicle: 'fleet.vehicles', driver: 'fleet.drivers',
      service: 'fleet.services',
      'trip-request': 'trip.requests', trip: 'trip.trips',
      'maintenance-order': 'fleet.maintenance_orders', fueling: 'fleet.fuelings', fine: 'fleet.fines',
      'vehicle-document': 'fleet.vehicle_documents',
      'svo-occurrence': 'svo.occurrences', 'svo-order': 'svo.execution_orders', 'svo-team': 'svo.teams',
      user: 'auth.users', profile: 'auth.roles',
    }
    const table = auditTables[entityType]
    const values = [table, recordId, filters.from ?? null, filters.to ?? null, filters.eventType ?? null]
    const [count, events] = await Promise.all([
      this.pool.query<{ total: string; found: boolean }>(
        `SELECT count(*)::text AS total,
                EXISTS (SELECT 1 FROM ${table} entity
                         WHERE entity.id = $2::bigint) AS found
           FROM audit.logs
          WHERE table_name = $1 AND record_id = $2
            AND ($3::date IS NULL OR registered_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
            AND ($4::date IS NULL OR registered_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
            AND ($5::text IS NULL OR operation = $5)`, values,
      ),
      this.pool.query<{
        id: string; eventType: string; occurredAt: Date; registeredAt: Date; actorId: string | null
        actorName: string | null; reason: string | null; before: unknown; after: unknown
      }>(
        `SELECT id::text AS id, operation AS "eventType", registered_at AS "occurredAt",
                registered_at AS "registeredAt", user_id::text AS "actorId",
                actor_snapshot->>'name' AS "actorName", reason, before, after
           FROM audit.logs
          WHERE table_name = $1 AND record_id = $2
            AND ($3::date IS NULL OR registered_at >= ($3::date::timestamp AT TIME ZONE 'America/Maceio'))
            AND ($4::date IS NULL OR registered_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Maceio'))
            AND ($5::text IS NULL OR operation = $5)
          ORDER BY registered_at DESC, id DESC LIMIT $6 OFFSET $7`,
        [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
      ),
    ])
    return {
      total: Number(count.rows[0]?.total ?? 0),
      found: count.rows[0]?.found ?? false,
      items: events.rows.map((event) => ({
        id: event.id,
        source: 'AUDIT_LOG',
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        registeredAt: event.registeredAt,
        reportedBy: null,
        actor: { id: event.actorId, name: event.actorName, role: null },
        reason: event.reason,
        before: event.before,
        after: event.after,
        sensitiveDataHidden: false,
      })),
    }
  }
}
