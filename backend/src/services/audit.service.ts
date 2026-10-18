import type { PoolClient } from 'pg'
import type {
  AuditActorSnapshot,
  AuditEntry,
  AuditLogger,
  AuditRepositoryContract,
  CreateAuditInput,
  NormalizedCreateAuditInput,
} from '../types/audit.types'

function normalizeUserId(value: string | number | null | undefined): string | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? String(value) : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return /^[1-9]\d*$/.test(trimmed) ? trimmed : null
  }
  return null
}

function normalizeOptionalText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function sanitizeSnapshot(
  snapshot: Record<string, unknown> | AuditActorSnapshot | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const clone: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(snapshot)) {
    if (key === 'password' || key === 'senha' || key === 'password_hash' || key === 'usr_password_hash') {
      continue
    }
    if (val !== undefined) {
      clone[key] = val
    }
  }
  return Object.keys(clone).length > 0 ? clone : null
}

/**
 * Serviço de domínio responsável pela validação, higienização (LGPD) e gravação da trilha de auditoria.
 *
 * Centraliza as regras de auditoria para todos os módulos do Sistema Aratu (FSPH e SVO),
 * garantindo que nenhum dado sigiloso de credenciais seja persistido e assegurando a consistência
 * de identificadores de entidade e operações registradas.
 */
export class AuditService implements AuditLogger {
  private readonly repository: AuditRepositoryContract

  /**
   * Inicializa o serviço de auditoria com o repositório de persistência.
   *
   * @param repository - Repositório que implementa o contrato de persistência de auditoria.
   */
  constructor(repository: AuditRepositoryContract) {
    this.repository = repository
  }

  /**
   * Valida e registra um evento de auditoria associado a uma operação do sistema.
   *
   * Higieniza snapshots para impedir o armazenamento acidental de senhas ou hashes
   * e suporta `PoolClient` opcional para garantir atomicidade na mesma transação da operação.
   *
   * @param input - Metadados da operação (autor, tabela, registro, operação e snapshots).
   * @param client - Cliente transacional opcional do PostgreSQL (`BEGIN ... COMMIT`).
   * @returns Registro de auditoria persistido.
   * @throws {Error} Se a tabela/entidade ou a operação informada estiver vazia após normalização.
   * @remarks Remove proativamente campos sensíveis (`password`, `senha`, `password_hash`) dos snapshots para estrita conformidade com a LGPD.
   */
  async recordAudit(input: CreateAuditInput, client?: PoolClient): Promise<AuditEntry> {
    const table = typeof input.table === 'string' ? input.table.trim() : ''
    if (!table) {
      throw new Error('A tabela/entidade auditada é obrigatória.')
    }

    const operation = typeof input.operation === 'string' ? input.operation.trim() : ''
    if (!operation) {
      throw new Error('A operação auditada é obrigatória.')
    }

    const normalized: NormalizedCreateAuditInput = {
      userId: normalizeUserId(input.userId),
      table,
      recordId: normalizeOptionalText(input.recordId),
      operation,
      before: sanitizeSnapshot(input.before),
      after: sanitizeSnapshot(input.after),
      actorSnapshot: sanitizeSnapshot(input.actorSnapshot) as AuditActorSnapshot | null,
      reason: normalizeOptionalText(input.reason),
    }

    return this.repository.create(normalized, client)
  }
}

/**
 * Cria uma função utilitária `recordAudit` vinculada ao repositório informado.
 *
 * @param repository - Implementação do contrato de persistência de auditoria.
 * @returns Função pronta para registrar eventos de auditoria com suporte a `PoolClient` opcional.
 */
export function createRecordAudit(
  repository: AuditRepositoryContract,
): (input: CreateAuditInput, client?: PoolClient) => Promise<AuditEntry> {
  const service = new AuditService(repository)
  return (input: CreateAuditInput, client?: PoolClient) => service.recordAudit(input, client)
}
