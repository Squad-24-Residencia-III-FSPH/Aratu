import type { PoolClient } from 'pg'

/**
 * Operações auditáveis padronizadas no Sistema Aratu.
 */
export type AuditOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGIN_INACTIVE'
  | 'LOGOUT'
  | (string & {})

/**
 * Snapshot dos dados do ator que disparou a ação auditada.
 */
export interface AuditActorSnapshot {
  /** Identificador do usuário que executou a ação. */
  id?: string | undefined
  /** Endereço de e-mail do ator. */
  email?: string | undefined
  /** Perfil RBAC ativo no momento da ação. */
  role?: string | undefined
  [key: string]: unknown
}

/**
 * Dados brutos de entrada fornecidos pelos serviços para registro de auditoria.
 */
export interface CreateAuditInput {
  /** Identificador numérico do usuário (ou string numérica) no banco. */
  userId?: string | number | null | undefined
  /** Nome da tabela ou entidade alvo da ação (ex: `usr_user`, `veh_vehicle`, `trp_trip`). */
  table: string
  /** Identificador do registro afetado na tabela auditada. */
  recordId?: string | number | null | undefined
  /** Tipo da operação executada. */
  operation: AuditOperation
  /** Estado anterior da entidade antes da mutação. */
  before?: Record<string, unknown> | null | undefined
  /** Estado posterior da entidade após a mutação. */
  after?: Record<string, unknown> | null | undefined
  /** Metadados do usuário ou contexto da sessão. */
  actorSnapshot?: AuditActorSnapshot | null | undefined
  /** Justificativa operacional fornecida pelo usuário. */
  reason?: string | null | undefined
}

/**
 * Dados de auditoria após validação, normalização e higienização para envio ao repositório.
 */
export interface NormalizedCreateAuditInput {
  /** Identificador do usuário normalizado como string de bigint ou null. */
  userId: string | null
  /** Nome da tabela ou entidade alvo sem espaços extras. */
  table: string
  /** Identificador do registro afetado ou null se não aplicável. */
  recordId: string | null
  /** Operação padronizada sem espaços extras. */
  operation: string
  /** Snapshot anterior higienizado (sem senhas ou segredos). */
  before: Record<string, unknown> | null
  /** Snapshot posterior higienizado (sem senhas ou segredos). */
  after: Record<string, unknown> | null
  /** Snapshot do ator higienizado. */
  actorSnapshot: AuditActorSnapshot | null
  /** Justificativa normalizada sem espaços extras. */
  reason: string | null
}

/**
 * Registro de auditoria persistido retornado pelo repositório.
 */
export interface AuditEntry {
  /** Identificador único do registro de auditoria (`aud_id`). */
  id: string
  /** Identificador do usuário associado à ação ou null quando anônimo. */
  userId: string | null
  /** Nome da tabela ou entidade auditada. */
  table: string
  /** Identificador do registro afetado. */
  recordId: string | null
  /** Operação registrada. */
  operation: string
  /** Estado anterior à operação. */
  before: Record<string, unknown> | null
  /** Estado posterior à operação. */
  after: Record<string, unknown> | null
  /** Snapshot do ator no momento da operação. */
  actorSnapshot: AuditActorSnapshot | null
  /** Motivo ou justificativa operacional. */
  reason: string | null
  /** Carimbo temporal do registro gerado pelo PostgreSQL (`aud_registered_at`). */
  registeredAt: Date
}

/**
 * Contrato de persistência para gravação da trilha de auditoria (`aud_audit`).
 */
export interface AuditRepositoryContract {
  /**
   * Persiste uma entrada de auditoria normalizada no PostgreSQL 18.
   *
   * @param input - Dados normalizados prontos para inserção.
   * @param client - Cliente transacional opcional para execução atômica (`BEGIN ... COMMIT`).
   * @returns Entrada de auditoria persistida com carimbo temporal.
   */
  create(input: NormalizedCreateAuditInput, client?: PoolClient): Promise<AuditEntry>
}

/**
 * Contrato de alto nível para serviços que registram eventos de auditoria.
 */
export interface AuditLogger {
  /**
   * Valida, higieniza e persiste um evento de auditoria.
   *
   * @param input - Dados brutos da operação auditada.
   * @param client - Cliente transacional opcional para execução atômica.
   * @returns Entrada de auditoria persistida.
   */
  recordAudit(input: CreateAuditInput, client?: PoolClient): Promise<AuditEntry>
}
