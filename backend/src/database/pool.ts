import { Pool } from 'pg'

/**
 * Cria e configura a instância compartilhada do pool de conexões com o PostgreSQL 18.
 *
 * Utiliza a string de conexão configurada em `DATABASE_URL` para gerenciar conexões persistentes,
 * transações atômicas e travas concorrentes no banco de dados.
 *
 * @param connectionString - URI de conexão completa com o banco (ex: `postgres://user:pass@host:5432/db`).
 * @returns Instância do pool `pg.Pool` pronta para consultas e transações.
 * @throws {Error} Se a connection string fornecida estiver vazia.
 */
export function createPool(connectionString: string): Pool {
  if (!connectionString.trim()) {
    throw new Error('DATABASE_URL é obrigatória para conectar ao PostgreSQL.')
  }

  let normalized = connectionString
  try {
    const parsed = new URL(connectionString)
    if (parsed.hostname === 'localhost' && process.platform === 'win32') {
      parsed.hostname = '127.0.0.1'
      normalized = parsed.toString()
    }
  } catch {
    // Mantém a string original caso não seja uma URL padrão
  }

  return new Pool({ connectionString: normalized })
}
