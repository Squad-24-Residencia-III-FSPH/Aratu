import type { Pool, PoolClient } from 'pg'
import type { ReportCatalogEntry, ReportDefinition, ReportRow, ValidatedReportQueryInput } from '../types/report.types'
import type { UserRole } from '../types/auth'

export interface ReportsReaderContract {
  executeCountAndTotals(sql: string, values: readonly unknown[]): Promise<{ totalCount: number; rawTotals: Record<string, string> }>
  executeRows(sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]>
}
export interface ReportsRepositoryContract extends ReportsReaderContract {
  withSnapshot<T>(work: (reader: ReportsReaderContract) => Promise<T>): Promise<T>
}

/** Executa somente consultas construídas pelo catálogo interno, com valores posicionais. */
export class ReportsRepository implements ReportsRepositoryContract {
  constructor(private readonly pool: Pool) {}
  async executeCountAndTotals(sql: string, values: readonly unknown[]): Promise<{ totalCount: number; rawTotals: Record<string, string> }> {
    return countAndTotals(this.pool, sql, values)
  }
  async executeRows(sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]> {
    return (await this.pool.query(sql, [...values])).rows as Record<string, unknown>[]
  }
  /** Contagem, somas e linhas observam a mesma versão dos dados mesmo durante lançamentos concorrentes. */
  async withSnapshot<T>(work: (reader: ReportsReaderContract) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const result = await work({
        executeCountAndTotals: (sql, values) => countAndTotals(client, sql, values),
        executeRows: async (sql, values) => (await client.query(sql, [...values])).rows as Record<string, unknown>[],
      })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
}

async function countAndTotals(executor: Pool | PoolClient, sql: string, values: readonly unknown[]): Promise<{ totalCount: number; rawTotals: Record<string, string> }> {
  const { rows } = await executor.query(sql, [...values])
  const { totalCount, ...rawTotals } = rows[0] as { totalCount: number } & Record<string, string>
  return { totalCount: Number(totalCount), rawTotals }
}

interface ReportSqlSpec extends ReportCatalogEntry {
  readonly allowedRoles: readonly UserRole[]
  readonly source: string
  readonly expressions: Readonly<Record<string, string>>
  readonly dateExpression: string
  readonly dateOnly?: boolean
  readonly orderBy: string
  readonly where?: string
  readonly filterExpressions: Readonly<Record<string, string>>
  readonly extraValues?: readonly unknown[]
  readonly format?: (raw: Record<string, unknown>) => ReportRow
}
export type ReportQuerySpec = Pick<ReportSqlSpec, 'source' | 'expressions' | 'dateExpression' | 'dateOnly' | 'orderBy' | 'where' | 'filterExpressions' | 'extraValues'>

/**
 * Compila apenas identificadores e expressões versionadas. Nenhum nome enviado pelo usuário
 * participa do SQL: a seleção é projetada pelo service após leitura da consulta fixa.
 */
export function createReportDefinition(spec: ReportSqlSpec): ReportDefinition {
  return Object.freeze({
    key: spec.key, module: spec.module, title: spec.title, description: spec.description,
    period: spec.period, columns: spec.columns, filters: spec.filters, allowedRoles: spec.allowedRoles,
    buildQuery(input: ValidatedReportQueryInput) {
      const values: unknown[] = [...(spec.extraValues ?? [])]
      const bind = (value: unknown): string => { values.push(value); return `$${values.length}` }
      const conditions: string[] = [spec.where ?? 'TRUE']
      if (input.from && input.to) {
        const from = bind(input.from)
        const to = bind(input.to)
        conditions.push(spec.dateOnly
          ? `${spec.dateExpression} >= ${from}::date AND ${spec.dateExpression} < (${to}::date + 1)`
          : `${spec.dateExpression} >= (${from}::date::timestamp AT TIME ZONE 'America/Maceio') AND ${spec.dateExpression} < ((${to}::date + 1)::timestamp AT TIME ZONE 'America/Maceio')`)
      }
      for (const filter of spec.filters) {
        const value = input.filters[filter.key]
        if (!value) continue
        const expression = spec.filterExpressions[filter.key]!
        conditions.push(filter.key === 'licensePlatePrefix'
          ? `${expression} LIKE ${bind(value)} || '%'`
          : `${expression} = ${bind(value)}${filter.type === 'boolean' ? '::boolean' : ''}`)
      }
      const source = `FROM ${spec.source} WHERE ${conditions.join(' AND ')}`
      const projection = spec.columns.map(column => `${spec.expressions[column.key]} AS "${column.key}"`).join(', ')
      const sums = spec.columns.filter(column => column.totalizable)
        .map(column => `COALESCE(SUM(${spec.expressions[column.key]}), 0)::text AS "${column.key}"`)
      const countAndTotalsSql = ['SELECT', ['COUNT(*)::int AS "totalCount"', ...sums].join(', '), source].join(' ')
      const limit = bind(input.limit)
      const offset = bind(input.offset)
      const dataSql = ['SELECT', projection, source, 'ORDER BY', spec.orderBy, 'LIMIT', limit, 'OFFSET', offset].join(' ')
      return { dataSql, countAndTotalsSql, values }
    },
    formatRow: spec.format ?? ((raw: Record<string, unknown>): ReportRow => Object.fromEntries(
      spec.columns.map(column => {
        const value = raw[column.key]
        return [column.key, value instanceof Date ? value.toISOString()
          : Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? null
          : typeof value === 'number' || typeof value === 'boolean' ? value : String(value)]
      }),
    )),
  })
}
