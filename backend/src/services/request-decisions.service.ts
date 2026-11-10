import type { AuditLogger } from '../types/audit.types'
import {
  DEFAULT_APPROVAL_REASON,
  REQUEST_DECISION_STATUSES,
  RequestDecisionError,
} from '../types/request-decision.types'
import type {
  DecidableRequest,
  RequestDecision,
  RequestDecisionInput,
  RequestDecisionResult,
} from '../types/request-decision.types'
import type { RequestDecisionsRepositoryContract } from '../repositories/request-decisions.repository'

const ID_PATTERN = /^[1-9]\d*$/
const AUDIT_OPERATION = 'STATUS_CHANGE'

function optionalReason(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new RequestDecisionError(400, 'reason deve ser um texto.')
  return value.trim() || null
}

function toResult(request: DecidableRequest, decision: RequestDecision): RequestDecisionResult {
  if (!request.decidedBy || !request.decidedAt) {
    throw new Error('A decisão gravada não retornou responsável e data.')
  }
  return {
    id: request.id,
    status: decision,
    decidedBy: request.decidedBy,
    decidedAt: request.decidedAt,
    decisionReason: request.decisionReason,
    revision: request.revision,
  }
}

/** Análise de solicitações de transporte pelo Gestor: aprovação, rejeição e rastreabilidade da decisão. */
export class RequestDecisionsService {
  constructor(
    private readonly repository: RequestDecisionsRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /**
   * Aprova uma solicitação pendente; a justificativa é opcional e, se ausente, o histórico registra um motivo padrão.
   *
   * @throws {RequestDecisionError} 400 id inválido, 404 inexistente e 409 quando já foi analisada.
   */
  async approve(id: string, input: RequestDecisionInput, deciderId: string): Promise<RequestDecisionResult> {
    const reason = optionalReason(input.reason)
    return this.decide(id, REQUEST_DECISION_STATUSES.approved, reason, reason ?? DEFAULT_APPROVAL_REASON, deciderId)
  }

  /**
   * Rejeita uma solicitação pendente; a justificativa é obrigatória e fica visível para o Solicitante.
   *
   * @throws {RequestDecisionError} 400 sem justificativa ou id inválido, 404 inexistente e 409 quando já foi analisada.
   */
  async reject(id: string, input: RequestDecisionInput, deciderId: string): Promise<RequestDecisionResult> {
    const reason = optionalReason(input.reason)
    if (!reason) throw new RequestDecisionError(400, 'Informe a justificativa da rejeição.')
    return this.decide(id, REQUEST_DECISION_STATUSES.rejected, reason, reason, deciderId)
  }

  /**
   * Bloqueia a solicitação (`FOR UPDATE`) e só decide se ela ainda estiver pendente; o responsável é sempre
   * o usuário autenticado e a data vem do relógio do PostgreSQL. Decisão, evento e auditoria são atômicos.
   */
  private async decide(
    id: string,
    decision: RequestDecision,
    storedReason: string | null,
    historyReason: string,
    deciderId: string,
  ): Promise<RequestDecisionResult> {
    if (!ID_PATTERN.test(id)) throw new RequestDecisionError(400, 'Identificador de solicitação inválido.')
    return this.repository.withTransaction(async (client) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before) throw new RequestDecisionError(404, 'Solicitação não encontrada.')
      if (before.status !== REQUEST_DECISION_STATUSES.pending) throw this.alreadyDecidedError()
      const actor = await this.repository.findActorSnapshot(deciderId, client)
      if (!actor) throw new RequestDecisionError(401, 'Usuário autenticado não está ativo ou não existe.')
      const after = await this.repository.saveDecision(id, decision, actor.id, storedReason, client)
      if (!after) throw this.alreadyDecidedError()
      await this.repository.createEvent({
        requestId: id,
        eventType: decision,
        reportedBy: actor.name,
        registeredBy: actor.id,
        actorSnapshot: actor,
        reason: historyReason,
        beforeState: before,
        afterState: after,
      }, client)
      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'trip.requests',
        recordId: id,
        operation: AUDIT_OPERATION,
        before: { status: before.status, revision: before.revision },
        after: {
          status: after.status,
          decidedBy: after.decidedBy,
          decidedAt: after.decidedAt,
          decisionReason: after.decisionReason,
          revision: after.revision,
        },
        actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
        reason: historyReason,
      }, client)
      return toResult(after, decision)
    })
  }

  private alreadyDecidedError(): RequestDecisionError {
    return new RequestDecisionError(409, 'Esta solicitação já foi analisada.')
  }
}
