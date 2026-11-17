import type { Pool } from 'pg'

/** Consulta somente o estado de infraestrutura, sem acessar dados pessoais. */
export class HealthRepository {
  constructor(private readonly pool: Pool) {}

  /** Confirma que todas as migrações do pacote estão registradas no banco. */
  async hasMigrations(versions: string[]): Promise<boolean> {
    const query = {
      text: 'SELECT version FROM public.schema_migrations WHERE version = ANY($1::text[])',
      values: [versions],
      query_timeout: 5_000,
    }
    const { rows } = await this.pool.query<{ version: string }>(query)
    return rows.length === versions.length
  }
}
