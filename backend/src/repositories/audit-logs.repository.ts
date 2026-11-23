import type { Pool } from 'pg'
import type { AuditLogFilters, StoredAuditLog } from '../types/audit-log.types'

/** Contrato de leitura da trilha de auditoria, usado pelo service e por testes isolados. */
export interface AuditLogsRepositoryContract {
  list(filters: AuditLogFilters): Promise<StoredAuditLog[]>
  count(filters: AuditLogFilters): Promise<number>
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
        ORDER BY registered_at DESC, id DESC
        LIMIT $6 OFFSET $7`,
      [filters.from, filters.to, filters.userId, filters.operation, filters.table, filters.limit, filters.offset],
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
          AND ($5::text IS NULL OR table_name = $5)`,
      [filters.from, filters.to, filters.userId, filters.operation, filters.table],
    )
    return result.rows[0]?.total ?? 0
  }
}
