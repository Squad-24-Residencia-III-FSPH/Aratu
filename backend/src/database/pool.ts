import { Pool } from 'pg'

/** Cria o pool PostgreSQL e falha explicitamente quando a URL não foi configurada. */
export function createPool(connectionString: string): Pool {
  if (!connectionString.trim()) {
    throw new Error('DATABASE_URL é obrigatória para conectar ao PostgreSQL.')
  }
  return new Pool({ connectionString })
}
