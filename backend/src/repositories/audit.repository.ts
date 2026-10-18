import type { Pool, PoolClient } from 'pg'
import type {
  AuditActorSnapshot,
  AuditEntry,
  AuditRepositoryContract,
  NormalizedCreateAuditInput,
} from '../types/audit.types'

interface AuditRow {
  id: string
  userId: string | null
  table: string
  recordId: string | null
  operation: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  actorSnapshot: AuditActorSnapshot | null
  reason: string | null
  registeredAt: Date | string
}

const AUDIT_RETURNING_COLUMNS = `
  id::text AS id,
  user_id::text AS "userId",
  table_name AS "table",
  record_id AS "recordId",
  operation,
  before,
  after,
  actor_snapshot AS "actorSnapshot",
  reason,
  registered_at AS "registeredAt"
`

/**
 * Repositório responsável pela persistência imutável da trilha de auditoria (`audit.logs`) no PostgreSQL 18.
 *
 * Encapsula as inserções parametrizadas no schema `audit` e projeta os resultados para
 * objetos de domínio em `camelCase`, suportando transações isoladas através de clientes dedicados.
 */
export class AuditRepository implements AuditRepositoryContract {
  private readonly pool: Pool

  /**
   * Construtor do repositório de auditoria.
   *
   * @param pool - Instância do pool de conexões com o PostgreSQL 18.
   */
  constructor(pool: Pool) {
    this.pool = pool
  }

  /**
   * Insere um novo registro de auditoria no PostgreSQL 18 com projeção explícita em `camelCase`.
   *
   * Serializa os campos de snapshot e metadados para JSONB com parâmetros posicionais ($1..$8)
   * e projeta explicitamente as colunas retornadas sem utilizar asterisco (`SELECT *` / `RETURNING *`).
   *
   * @param input - Dados normalizados da operação auditada.
   * @param client - Cliente transacional opcional para compartilhar a mesma transação (`BEGIN ... COMMIT`) da operação de negócio.
   * @returns Registro de auditoria persistido com carimbo temporal do banco.
   * @throws {Error} Se a inserção no banco não retornar a linha gerada.
   * @remarks Garante que se o chamador estiver em transação atômica, uma falha na auditoria ou na operação faça rollback de ambos.
   */
  async create(input: NormalizedCreateAuditInput, client?: PoolClient): Promise<AuditEntry> {
    const executor = client ?? this.pool
    const result = await executor.query<AuditRow>(
      `INSERT INTO audit.logs (
         user_id,
         table_name,
         record_id,
         operation,
         before,
         after,
         actor_snapshot,
         reason
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       RETURNING ${AUDIT_RETURNING_COLUMNS}`,
      [
        input.userId,
        input.table,
        input.recordId,
        input.operation,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.actorSnapshot ? JSON.stringify(input.actorSnapshot) : null,
        input.reason,
      ],
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Falha ao persistir registro de auditoria.')
    }

    return {
      ...row,
      registeredAt:
        row.registeredAt instanceof Date ? row.registeredAt : new Date(row.registeredAt),
    }
  }
}
