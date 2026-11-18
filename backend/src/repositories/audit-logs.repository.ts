import type { Pool } from 'pg'

export interface AuditLogQuery {
  inicio: string | null
  fim: string | null
  usuario_id: string | null
  acao: string | null
  entidade: string | null
  offset: number
}

interface AuditLogRow {
  id: string
  created_at: Date
  usuario: string
  acao: string
  entidade: string
}

const PAGE_SIZE = 25

/** Consulta somente metadados. Snapshots, motivos livres e identificadores do alvo ficam no banco. */
export class AuditLogsRepository {
  constructor(private readonly pool: Pool) {}

  async list(filters: AuditLogQuery) {
    const values: (string | number)[] = []
    const parameter = (value: string | number) => '$' + values.push(value)
    const conditions: string[] = []
    if (filters.inicio) conditions.push(`l.registered_at >= (${parameter(filters.inicio)}::date::timestamp AT TIME ZONE 'America/Maceio')`)
    if (filters.fim) conditions.push(`l.registered_at < ((${parameter(filters.fim)}::date + 1)::timestamp AT TIME ZONE 'America/Maceio')`)
    if (filters.usuario_id) conditions.push(`l.user_id = ${parameter(filters.usuario_id)}::bigint`)
    if (filters.acao) conditions.push(`l.operation = ${parameter(filters.acao)}`)
    if (filters.entidade) conditions.push(`l.table_name = ${parameter(filters.entidade)}`)
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const limit = parameter(PAGE_SIZE)
    const offset = parameter(filters.offset * PAGE_SIZE)
    // Uma instrução mantém a página e o total no mesmo snapshot, inclusive em página vazia.
    const { rows } = await this.pool.query<(AuditLogRow | { id: null }) & { total: string }>(`
      SELECT page.*, totals.total
      FROM (SELECT count(*)::text AS total FROM audit.logs l ${where}) totals
      LEFT JOIN LATERAL (
        SELECT l.id::text AS id, l.registered_at AS created_at,
          coalesce(u.name, 'Usuário não identificado') AS usuario,
          l.operation AS acao, l.table_name AS entidade
        FROM audit.logs l
        LEFT JOIN auth.users u ON u.id = l.user_id
        ${where}
        ORDER BY l.registered_at DESC, l.id DESC
        LIMIT ${limit} OFFSET ${offset}
      ) page ON true
      ORDER BY page.created_at DESC, page.id::bigint DESC
    `, values)
    return { total: Number(rows[0]?.total ?? 0), rows: rows.flatMap(row => {
      if (row.id === null) return []
      const { total: _, ...entry } = row
      return [entry]
    }) }
  }
}
