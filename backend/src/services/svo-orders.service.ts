import type { SvoOccurrencesRepositoryContract } from '../repositories/svo-occurrences.repository'
import type { SvoOrdersRepositoryContract } from '../repositories/svo-orders.repository'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { AuditLogger } from '../types/audit.types'
import type { PoolClient } from 'pg'
import type { SvoActorSnapshot, SvoDispatchResult } from '../types/svo-occurrence.types'
import { SVO_MAINTAIN_ROLES, SVO_WRITE_ROLES } from '../types/svo-occurrence.types'
import {
  SVO_ORDER_ALLOWED_RESULTS, SVO_ORDER_INITIAL_STATUS, SVO_ORDER_READ_ROLES, SVO_ORDER_RESULTS,
  SVO_ORDER_STATUSES, SVO_ORDER_TRANSITIONS, SVO_ORDER_STATUS_AUDIT_OPERATION, SvoOrderServiceError,
} from '../types/svo-order.types'
import type {
  CreateSvoOrderInput, RecordSvoOrderResultInput, SvoOrderCreationResult, SvoOrderSummary, SvoOrderDetail,
  SvoOrderDetailRow, SvoOrderReadRow, SvoOrderResult, SvoOrderState, SvoOrderStatus, SvoOrderTransition, UpdateSvoOrderStatusInput,
  SvoDispatchTeamCandidate, SvoAllocationSnapshot,
} from '../types/svo-order.types'

const CREATE_FIELDS = ['occurrenceId', 'teamId', 'vehicleId', 'expectedRevision', 'reason'] as const
const RESOURCE_FIELDS = ['occurrenceId', 'teamId', 'vehicleId'] as const
const RESULT_FIELDS = ['result', 'revision', 'failureReason', 'notes'] as const
const MAX_BIGINT = 9223372036854775807n
const OPENED_REASON = 'Ordem gerada a partir de solicitação SVO confirmada.'
const OPENED_EVIDENCE = 'Alocação de equipe e veículo registrada pelo operador na sessão autenticada.'
const STATUS_CONFLICT = 'A situação da ordem mudou ou não permite esta ação. Atualize a consulta antes de continuar.'
const RESULT_CONFLICT = 'A situação da ordem mudou ou não permite encerramento. Atualize a consulta antes de continuar.'
const UPDATE_DENIED = 'Você não tem permissão para atualizar esta ordem. Atualize a consulta ou procure a central.'
const COMPLETED_REASON = 'Atendimento concluído pela equipe SVO.'
const STATUS_REASON: Record<SvoOrderTransition, string> = {
  IN_TRANSIT: 'Saída confirmada pela equipe SVO.', IN_SERVICE: 'Chegada ao local confirmada pela equipe SVO.',
}
const STATUS_EVIDENCE = 'Confirmação registrada pelo integrante da equipe na sessão autenticada.'
const DISPATCH_EVIDENCE = 'Recursos selecionados automaticamente a partir da composição vigente e disponibilidade registrada.'
type Occurrences = Pick<SvoOccurrencesRepositoryContract,
  'withTransaction' | 'findActorSnapshot' | 'findByIdForUpdate' | 'currentTime' | 'setDispatchIntent' | 'setDispatchWaitReason' | 'createEvent' | 'findById'>

function parseOrderId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Informe um identificador válido para a ordem.')
  }
  return value
}

function isStatus(value: unknown): value is SvoOrderStatus {
  return SVO_ORDER_STATUSES.some((status) => status === value)
}

function isResult(value: unknown): value is SvoOrderResult {
  return SVO_ORDER_RESULTS.some((result) => result === value)
}

function parseOptionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new SvoOrderServiceError('INVALID_INPUT', `Informe um texto válido para ${label}.`)
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseStatusInput(body: unknown): UpdateSvoOrderStatusInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie um objeto JSON com situação e revisão da ordem.')
  }
  const input = body as Record<string, unknown>
  if (Object.keys(input).length !== 2 || Object.keys(input).some((key) => key !== 'status' && key !== 'revision')
    || !isStatus(input.status) || !Number.isSafeInteger(input.revision) || (input.revision as number) < 1) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie somente uma situação válida e a revisão inteira positiva da ordem.')
  }
  return { status: input.status, revision: input.revision as number }
}

function parseResultInput(body: unknown): RecordSvoOrderResultInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie um objeto JSON com o resultado e a revisão da ordem.')
  }
  const input = body as Record<string, unknown>
  if (Object.keys(input).some((key) => !RESULT_FIELDS.some((field) => field === key))
    || !isResult(input.result) || !Number.isSafeInteger(input.revision) || (input.revision as number) < 1) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie somente um resultado válido e a revisão inteira positiva da ordem.')
  }
  const failureReason = parseOptionalText(input.failureReason, 'o motivo da não realização')
  const notes = parseOptionalText(input.notes, 'as observações')
  if (input.result === 'NOT_PERFORMED' && !failureReason) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Informe o motivo da não realização.')
  }
  if (input.result === 'COMPLETED' && failureReason !== null) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Não informe motivo de não realização quando o atendimento for concluído.')
  }
  return { result: input.result, revision: input.revision as number, failureReason, notes }
}

function hasPriorClosing(order: SvoOrderState): boolean {
  return order.result !== null || order.closedAt !== null || order.closedBy !== null
    || order.collectedAt !== null || order.failureReason !== null
}

function auditState(state: SvoOrderState): Omit<SvoOrderState, 'failureReason' | 'notes'> {
  const { failureReason: _failureReason, notes: _notes, ...rest } = state
  return rest
}

function summarize(row: SvoOrderReadRow, actor: SvoActorSnapshot): SvoOrderSummary {
  const canAct = actor.role === 'EQUIPE_SVO' && row.teamActive
    && row.result === null && row.closedAt === null && row.collectedAt === null
  return {
    id: row.id, occurrenceId: row.occurrenceId, teamId: row.teamId, vehicleId: row.vehicleId,
    status: row.status, result: row.result, revision: row.revision, openedAt: row.openedAt,
    departedAt: row.departedAt, arrivedAt: row.arrivedAt, collectedAt: row.collectedAt, closedAt: row.closedAt,
    dispatch: row.dispatch, current: row.current,
    allowedTransitions: canAct ? SVO_ORDER_TRANSITIONS[row.status] : [],
    allowedResults: canAct ? SVO_ORDER_ALLOWED_RESULTS[row.status] : [],
  }
}

function detail(row: SvoOrderDetailRow, actor: SvoActorSnapshot): SvoOrderDetail {
  return {
    ...summarize(row, actor),
    failureReason: row.failureReason,
    notes: row.notes,
    closedBy: row.closedBy,
    occurrenceSnapshot: row.occurrenceSnapshot,
    teamSnapshot: row.teamSnapshot,
    vehicleSnapshot: row.vehicleSnapshot,
    allocationSnapshot: row.allocationSnapshot,
  }
}

function occurrenceAuditState(occurrence: NonNullable<Awaited<ReturnType<Occurrences['findById']>>>): Record<string, unknown> {
  return {
    id: occurrence.id, status: occurrence.status, revision: occurrence.revision,
    dispatchRequestedAt: occurrence.dispatchRequestedAt, dispatchRequestedBy: occurrence.dispatchRequestedBy,
    dispatchWaitReason: occurrence.dispatchWaitReason, executionOrderId: occurrence.executionOrderId,
  }
}

function parseInput(body: unknown): CreateSvoOrderInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie um objeto JSON com solicitação, equipe e veículo.')
  }
  const input = body as Record<string, unknown>
  if (Object.keys(input).some((key) => !CREATE_FIELDS.some((field) => field === key))) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Envie somente solicitação, equipe e veículo para gerar a ordem.')
  }
  const labels = { occurrenceId: 'a solicitação', teamId: 'a equipe', vehicleId: 'o veículo' }
  for (const field of RESOURCE_FIELDS) {
    const value = input[field]
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) {
      throw new SvoOrderServiceError('INVALID_INPUT', `Informe um identificador válido para ${labels[field]}.`)
    }
  }
  if ((input.expectedRevision === undefined) !== (input.reason === undefined)) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Informe a revisão e a justificativa ao encaminhar uma solicitação legada.')
  }
  if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1)) {
    throw new SvoOrderServiceError('INVALID_INPUT', 'Informe uma revisão inteira positiva para o encaminhamento legado.')
  }
  const reason = input.reason === undefined ? undefined : parseOptionalText(input.reason, 'a justificativa do encaminhamento')
  if (input.reason !== undefined && !reason) throw new SvoOrderServiceError('INVALID_INPUT', 'Informe uma justificativa para o encaminhamento legado.')
  return {
    occurrenceId: input.occurrenceId as string, teamId: input.teamId as string, vehicleId: input.vehicleId as string,
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: Number(input.expectedRevision) }),
    ...(typeof reason === 'string' ? { reason } : {}),
  }
}

/** Geração atômica da ordem, com reserva derivada e contexto histórico restrito ao SVO. */
export class SvoOrdersService {
  constructor(
    private readonly occurrences: Occurrences,
    private readonly orders: SvoOrdersRepositoryContract,
    private readonly vehicles: Pick<VehiclesRepositoryContract, 'findByIdForUpdate' | 'hasActiveMaintenanceBlock'>,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Consulta a união das equipes com vínculo vigente, sem expor dados pessoais do chamado.
   * @throws {SvoOrderServiceError} Se filtro, conta ou perfil não permitirem a consulta.
   */
  async listOrders(query: Record<string, unknown>, userId: string): Promise<SvoOrderSummary[]> {
    if (Object.keys(query).some((key) => key !== 'status') || ('status' in query && !isStatus(query.status))) {
      throw new SvoOrderServiceError('INVALID_INPUT', 'Use somente um filtro de situação válido para consultar as ordens.')
    }
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.authorizeActor(userId, false, client)
      const time = await this.occurrences.currentTime(client)
      const rows = await this.orders.listForActor(actor.role === 'EQUIPE_SVO' ? actor.id : null,
        (query.status as SvoOrderStatus | undefined) ?? null, time, client)
      return rows.map((row) => summarize(row, actor))
    })
  }

  /**
   * Autoriza metadados antes de recuperar o contexto sigiloso do despacho.
   * @throws {SvoOrderServiceError} Se identificador, conta, existência ou vínculo impedirem a leitura.
   */
  async getOrder(id: unknown, userId: string): Promise<SvoOrderDetail> {
    const orderId = parseOrderId(id)
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.authorizeActor(userId, false, client)
      const { order } = await this.authorizeOrder(orderId, actor, false, client)
      const row = await this.orders.findById(order.id, client)
      if (!row) throw new SvoOrderServiceError('NOT_FOUND', 'Ordem SVO não encontrada.')
      return detail(row, actor)
    })
  }

  /**
   * Confirma saída ou chegada com relógio do servidor e revisão protegida por trava.
   * @throws {SvoOrderServiceError} Se contrato, acesso, revisão, etapa ou carimbos forem incompatíveis.
   * @remarks Estado, evento e auditoria compartilham a transação; não libera reserva nem recria snapshots.
   */
  async updateStatus(id: unknown, body: unknown, userId: string): Promise<SvoOrderSummary> {
    const orderId = parseOrderId(id)
    const input = parseStatusInput(body)
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.authorizeActor(userId, true, client)
      const { order: before, time } = await this.authorizeOrder(orderId, actor, true, client)
      const target = SVO_ORDER_TRANSITIONS[before.status].find((status) => status === input.status)
      const priorTime = input.status === 'IN_SERVICE' ? before.departedAt ?? before.openedAt : before.openedAt
      const destinationTime = input.status === 'IN_TRANSIT' ? before.departedAt : before.arrivedAt
      if (before.revision !== input.revision || !target || destinationTime !== null
        || hasPriorClosing(before) || time < before.openedAt || time < priorTime) {
        throw new SvoOrderServiceError('INVALID_TRANSITION', STATUS_CONFLICT)
      }
      if (!await this.orders.updateStatus(before, target, time, client)) {
        throw new SvoOrderServiceError('INVALID_TRANSITION', STATUS_CONFLICT)
      }
      const after: SvoOrderState = { ...before, status: target, revision: before.revision + 1,
        departedAt: target === 'IN_TRANSIT' ? time : before.departedAt,
        arrivedAt: target === 'IN_SERVICE' ? time : before.arrivedAt }
      const reason = STATUS_REASON[target]
      await this.orders.createStatusEvent({ before, after, actor, occurredAt: time,
        eventType: target === 'IN_TRANSIT' ? 'DEPARTED' : 'ARRIVED', reason, evidenceDescription: STATUS_EVIDENCE }, client)
      await this.audit.recordAudit({ userId: actor.id, table: 'svo.execution_orders', recordId: before.id,
        operation: SVO_ORDER_STATUS_AUDIT_OPERATION, before: auditState(before), after: auditState(after), actorSnapshot: { ...actor }, reason }, client)
      const row = await this.orders.findById(before.id, client)
      if (!row) throw new SvoOrderServiceError('NOT_FOUND', 'Ordem SVO não encontrada.')
      return summarize(row, actor)
    })
  }

  /**
   * Registra o resultado final do atendimento (concluída ou não realizada) e encerra a ordem.
   * @throws {SvoOrderServiceError} Se contrato, acesso, revisão, situação ou carimbos impedirem o encerramento.
   * @remarks Libera a reserva derivada ao sair dos estados ocupantes; grava evento imutável e auditoria na mesma transação.
   */
  async recordResult(id: unknown, body: unknown, userId: string): Promise<SvoOrderDetail> {
    const orderId = parseOrderId(id)
    const input = parseResultInput(body)
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.authorizeActor(userId, true, client)
      const { order: before, time } = await this.authorizeOrder(orderId, actor, true, client)
      const target = SVO_ORDER_ALLOWED_RESULTS[before.status].find((result) => result === input.result)
      if (before.revision !== input.revision || !target || hasPriorClosing(before)
        || time < before.openedAt
        || (before.departedAt !== null && time < before.departedAt)
        || (before.arrivedAt !== null && time < before.arrivedAt)) {
        throw new SvoOrderServiceError('INVALID_TRANSITION', RESULT_CONFLICT)
      }
      const after: SvoOrderState = {
        ...before,
        status: target,
        result: target,
        failureReason: input.failureReason,
        notes: input.notes,
        revision: before.revision + 1,
        collectedAt: target === 'COMPLETED' ? time : null,
        closedAt: time,
        closedBy: actor.id,
      }
      if (!await this.orders.updateResult(after, before.revision, time, client)) {
        throw new SvoOrderServiceError('INVALID_TRANSITION', RESULT_CONFLICT)
      }
      const reason = target === 'COMPLETED' ? COMPLETED_REASON : input.failureReason!
      await this.orders.createStatusEvent({
        before, after, actor, occurredAt: time, eventType: target, reason, evidenceDescription: STATUS_EVIDENCE,
      }, client)
      await this.audit.recordAudit({
        userId: actor.id, table: 'svo.execution_orders', recordId: before.id,
        operation: SVO_ORDER_STATUS_AUDIT_OPERATION, before: auditState(before), after: auditState(after),
        actorSnapshot: { ...actor }, reason,
      }, client)
      const row = await this.orders.findById(before.id, client)
      if (!row) throw new SvoOrderServiceError('NOT_FOUND', 'Ordem SVO não encontrada.')
      return detail(row, actor)
    })
  }

  private async authorizeActor(userId: string, updating: boolean, client: PoolClient): Promise<SvoActorSnapshot> {
    const actor = await this.occurrences.findActorSnapshot(userId, client)
    if (!actor) throw new SvoOrderServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    if (!SVO_ORDER_READ_ROLES.some((role) => role === actor.role) || (updating && actor.role !== 'EQUIPE_SVO')) {
      throw new SvoOrderServiceError('ACCESS_DENIED', updating ? UPDATE_DENIED : 'Seu perfil atual não permite consultar ordens SVO.')
    }
    return actor
  }

  private async authorizeOrder(id: string, actor: SvoActorSnapshot, updating: boolean, client: PoolClient): Promise<{ order: SvoOrderState; time: Date }> {
    const order = await this.orders.findByIdForUpdate(id, client)
    if (!order) throw new SvoOrderServiceError('NOT_FOUND', 'Ordem SVO não encontrada.')
    if (actor.role !== 'EQUIPE_SVO') return { order, time: await this.occurrences.currentTime(client) }
    const team = await this.orders.findTeamForShare(order.teamId, client)
    const membership = await this.orders.findMembershipForShare(order.teamId, actor.id, client)
    const time = await this.occurrences.currentTime(client)
    if (!membership?.active || membership.joinedAt > time || (membership.leftAt !== null && membership.leftAt <= time)
      || !team || (updating && !team.active)) {
      throw new SvoOrderServiceError('ACCESS_DENIED', updating ? UPDATE_DENIED : 'Você não tem permissão para consultar esta ordem. Atualize a consulta ou procure a central.')
    }
    return { order, time }
  }

  /**
   * Reserva uma vaga para uma ocorrência confirmada sem alterar a ocorrência ou o veículo.
   * A ordem das travas evita duplicidade histórica e disputa pela última vaga.
   * Verifica manutenção impeditiva sob a trava da viatura, inclusive no legado AVAILABLE.
   * @throws {SvoOrderServiceError} Se contrato, conta, referências ou elegibilidade impedirem a criação.
   * @remarks Ordem, OPENED e auditoria usam o mesmo cliente; qualquer falha desfaz as três escritas.
   */
  async createOrder(body: unknown, userId: string): Promise<SvoOrderCreationResult> {
    const input = parseInput(body)
    try {
      return await this.occurrences.withTransaction(async (client) => {
        const actor = await this.occurrences.findActorSnapshot(userId, client)
        if (!actor) throw new SvoOrderServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
        if (!SVO_MAINTAIN_ROLES.some((role) => role === actor.role)) {
          throw new SvoOrderServiceError('ACCESS_DENIED', 'Seu perfil atual não permite gerar ordens SVO.')
        }
        const lockedOccurrence = await this.occurrences.findByIdForUpdate(input.occurrenceId, client)
        if (!lockedOccurrence) throw new SvoOrderServiceError('NOT_FOUND', 'Solicitação SVO não encontrada.')
        if (await this.orders.findByOccurrenceId(input.occurrenceId, client)) {
          throw new SvoOrderServiceError('ORDER_ALREADY_EXISTS', 'Esta solicitação já possui uma ordem de execução.')
        }
        if (lockedOccurrence.status !== 'CONFIRMED') {
          throw new SvoOrderServiceError('OCCURRENCE_NOT_CONFIRMED', 'A solicitação precisa estar confirmada para gerar uma ordem.')
        }
        if (input.expectedRevision !== undefined && input.expectedRevision !== lockedOccurrence.revision) {
          throw new SvoOrderServiceError('CONFLICT', 'A solicitação foi alterada. Atualize os dados antes de encaminhar.')
        }
        let occurrence = lockedOccurrence
        if (!occurrence.dispatchRequestedAt) {
          if (input.expectedRevision === undefined || !input.reason) {
            throw new SvoOrderServiceError('DISPATCH_NOT_REQUESTED', 'Esta solicitação legada ainda não foi encaminhada. Informe revisão e justificativa para iniciar o despacho.')
          }
          const requestedAt = await this.occurrences.currentTime(client)
          occurrence = await this.occurrences.setDispatchIntent(occurrence.id, actor, requestedAt, client)
          await this.occurrences.createEvent({
            occurrenceId: occurrence.id, eventType: 'DISPATCH_REQUESTED', occurredAt: requestedAt,
            reportedBy: actor.name, actorSnapshot: actor, reason: input.reason,
            evidenceDescription: 'Gestor registrou explicitamente o encaminhamento de uma ocorrência legada.',
            beforeState: lockedOccurrence, afterState: occurrence,
          }, client)
        }
        const openedAt = await this.occurrences.currentTime(client)
        await this.orders.lockEligibleDispatchTeams(openedAt, client)
        const eligibleTeams = await this.orders.rankDispatchTeams(openedAt, client)
        const selectedTeam = eligibleTeams.find((candidate) => candidate.id === input.teamId)
        if (!selectedTeam) throw new SvoOrderServiceError('TEAM_UNAVAILABLE', 'A equipe precisa estar ativa em plantão, com integrante elegível, para receber uma ordem.')
        const team = await this.orders.findTeamForShare(input.teamId, client)
        if (!team) throw new SvoOrderServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
        if (!team.active) throw new SvoOrderServiceError('TEAM_UNAVAILABLE', 'Escolha uma equipe SVO ativa.')
        const vehicle = await this.vehicles.findByIdForUpdate(input.vehicleId, client)
        if (!vehicle) throw new SvoOrderServiceError('NOT_FOUND', 'Veículo não encontrado.')
        if (vehicle.status !== 'AVAILABLE' || vehicle.operationType !== 'SVO' || !vehicle.categories.includes('BODY')) {
          throw new SvoOrderServiceError('VEHICLE_UNAVAILABLE', 'Escolha um veículo disponível para operação SVO e transporte de corpos.')
        }
        if (await this.vehicles.hasActiveMaintenanceBlock(vehicle.id, client)) {
          throw new SvoOrderServiceError('VEHICLE_UNAVAILABLE', 'O veículo possui uma manutenção impeditiva ativa. Escolha outro veículo.')
        }
        if (await this.orders.hasInstitutionalTripConflict(vehicle.id, openedAt, client)) {
          throw new SvoOrderServiceError('VEHICLE_UNAVAILABLE', 'O veículo possui uma viagem institucional conflitante. Escolha outro veículo.')
        }
        if (await this.orders.countOccupyingOrders(vehicle.id, client) + 1 > vehicle.bodyLimit) {
          throw new SvoOrderServiceError('CAPACITY_EXCEEDED', 'O veículo não possui vaga disponível. Escolha outro veículo.')
        }
        const order = await this.orders.create({
          occurrenceId: input.occurrenceId, teamId: input.teamId, vehicleId: input.vehicleId,
          status: SVO_ORDER_INITIAL_STATUS, openedAt, createdBy: actor.id, revision: 1,
          occurrenceSnapshot: {
            id: occurrence.id, status: occurrence.status, revision: occurrence.revision,
            requesterName: occurrence.requesterName, requesterPhone: occurrence.requesterPhone,
            requesterType: occurrence.requesterType, location: occurrence.location,
            description: occurrence.description, notes: occurrence.notes, receivedAt: occurrence.receivedAt,
            triagedAt: occurrence.triagedAt, triagedBy: occurrence.triagedBy,
            attendantId: occurrence.attendantId, evidenceDescription: occurrence.evidenceDescription,
          },
          teamSnapshot: { id: team.id, name: team.name, active: team.active, revision: team.revision },
          vehicleSnapshot: {
            id: vehicle.id, licensePlate: vehicle.licensePlate, categories: vehicle.categories,
            operationType: vehicle.operationType, status: vehicle.status, bodyLimit: vehicle.bodyLimit, revision: vehicle.revision,
          },
          teamShiftId: selectedTeam.shiftId,
          allocationSnapshot: {
            teamShiftId: selectedTeam.shiftId, shiftStartsAt: selectedTeam.shiftStartsAt,
            shiftEndsAt: selectedTeam.shiftEndsAt, teamActiveOrderCount: selectedTeam.activeOrderCount,
            teamLastDispatchAt: selectedTeam.lastDispatchAt, selectionRule: 'MANUAL_MANAGER_OVERRIDE',
          },
        }, client)
        await this.orders.createOpenedEvent({ order, actor, reason: OPENED_REASON, evidenceDescription: OPENED_EVIDENCE }, client)
        await this.audit.recordAudit({
          userId: actor.id, table: 'svo.execution_orders', recordId: order.id, operation: 'CREATE', before: null,
          after: { id: order.id, occurrenceId: order.occurrenceId, teamId: order.teamId,
            vehicleId: order.vehicleId, status: order.status, openedAt: order.openedAt, revision: order.revision },
          actorSnapshot: { ...actor }, reason: OPENED_REASON,
        }, client)
        const afterOccurrence = await this.occurrences.setDispatchWaitReason(occurrence.id, null, openedAt, client)
        const dispatchReason = 'Gestor encaminhou a ocorrência para execução SVO.'
        await this.occurrences.createEvent({
          occurrenceId: occurrence.id, eventType: 'DISPATCHED', occurredAt: openedAt, reportedBy: actor.name,
          actorSnapshot: actor, reason: dispatchReason,
          evidenceDescription: 'Ordem criada pelo fluxo legado de despacho manual do gestor.',
          beforeState: occurrence, afterState: afterOccurrence,
        }, client)
        await this.audit.recordAudit({
          userId: actor.id, table: 'svo.occurrences', recordId: occurrence.id, operation: 'UPDATE',
          before: occurrenceAuditState(occurrence), after: occurrenceAuditState(afterOccurrence),
          actorSnapshot: { ...actor }, reason: dispatchReason,
        }, client)
        return { id: order.id, status: order.status }
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
        && 'constraint' in error && error.constraint === 'execution_orders_occurrence_id_key'
        && 'schema' in error && error.schema === 'svo' && 'table' in error && error.table === 'execution_orders') {
        throw new SvoOrderServiceError('ORDER_ALREADY_EXISTS', 'Esta solicitação já possui uma ordem de execução.')
      }
      throw error
    }
  }

  /** Encaminha a ocorrência recém-triada sem exigir seleção manual de equipe ou viatura. */
  async dispatchAfterTriage(occurrenceIdValue: unknown, userId: string): Promise<SvoDispatchResult> {
    const occurrenceId = parseOrderId(occurrenceIdValue)
    return this.dispatchOccurrence(occurrenceId, userId, null)
  }

  /** Reavalia automaticamente uma ocorrência em espera. A revisão evita tentativas sobre uma fila desatualizada. */
  async retryDispatch(occurrenceIdValue: unknown, body: unknown, userId: string): Promise<SvoDispatchResult> {
    const occurrenceId = parseOrderId(occurrenceIdValue)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SvoOrderServiceError('INVALID_INPUT', 'Envie a revisão e o motivo da nova tentativa de despacho.')
    const input = body as Record<string, unknown>
    if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'expectedRevision') || !Object.hasOwn(input, 'reason')
      || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
      throw new SvoOrderServiceError('INVALID_INPUT', 'Envie somente uma revisão inteira positiva e o motivo da nova tentativa.')
    }
    const reason = parseOptionalText(input.reason, 'a justificativa da nova tentativa')
    if (!reason) throw new SvoOrderServiceError('INVALID_INPUT', 'Informe o motivo da nova tentativa de despacho.')
    return this.dispatchOccurrence(occurrenceId, userId, { expectedRevision: Number(input.expectedRevision), reason })
  }

  private async dispatchOccurrence(
    occurrenceId: string,
    userId: string,
    retry: { expectedRevision: number; reason: string } | null,
  ): Promise<SvoDispatchResult> {
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.occurrences.findActorSnapshot(userId, client)
      if (!actor) throw new SvoOrderServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
      const actorAllowed = retry
        ? SVO_MAINTAIN_ROLES.some((role) => role === actor.role)
        : SVO_WRITE_ROLES.some((role) => role === actor.role)
      if (!actorAllowed) throw new SvoOrderServiceError('ACCESS_DENIED', retry
        ? 'Somente o gestor de frota pode tentar novamente o despacho SVO.'
        : 'Seu perfil atual não pode encaminhar esta solicitação SVO.')

      const lockedOccurrence = await this.occurrences.findByIdForUpdate(occurrenceId, client)
      if (!lockedOccurrence) throw new SvoOrderServiceError('NOT_FOUND', 'Solicitação SVO não encontrada.')
      if (lockedOccurrence.status !== 'CONFIRMED') throw new SvoOrderServiceError('OCCURRENCE_NOT_CONFIRMED', 'A solicitação precisa estar confirmada após a triagem.')
      const existing = await this.orders.findByOccurrenceId(occurrenceId, client)
      if (existing) return { status: 'DISPATCHED', orderId: existing.id, teamId: existing.teamId, vehicleId: existing.vehicleId, revision: lockedOccurrence.revision }
      if (retry && lockedOccurrence.revision !== retry.expectedRevision) {
        throw new SvoOrderServiceError('CONFLICT', 'A fila foi atualizada. Recarregue antes de tentar novamente.')
      }

      const now = await this.occurrences.currentTime(client)
      let before = lockedOccurrence
      const attemptReason = retry?.reason ?? 'Triagem informacional conferida pelo atendente SVO.'
      if (retry && !before.dispatchRequestedAt) {
        before = await this.occurrences.setDispatchIntent(occurrenceId, actor, now, client)
        await this.occurrences.createEvent({
          occurrenceId, eventType: 'DISPATCH_REQUESTED', occurredAt: now, reportedBy: actor.name,
          actorSnapshot: actor, reason: retry.reason, evidenceDescription: 'Gestor registrou explicitamente o encaminhamento de uma ocorrência legada.',
          beforeState: lockedOccurrence, afterState: before,
        }, client)
      }
      await this.occurrences.createEvent({
        occurrenceId, eventType: 'DISPATCH_ATTEMPTED', occurredAt: now, reportedBy: actor.name,
        actorSnapshot: actor, reason: attemptReason, evidenceDescription: 'Seleção automática solicitada para uma ocorrência confirmada.',
        beforeState: before, afterState: before,
      }, client)

      await this.orders.lockEligibleDispatchTeams(now, client)
      const teams = await this.orders.rankDispatchTeams(now, client)
      if (teams.length === 0) return this.saveDispatchWait(occurrenceId, before, actor, now, 'NO_TEAM', attemptReason, client)

      const selectedTeam = teams[0]!
      const vehicleIds = await this.orders.listDispatchVehicleIds(now, client)
      let selectedVehicle: Awaited<ReturnType<VehiclesRepositoryContract['findByIdForUpdate']>> = null
      for (const vehicleId of vehicleIds) {
        const vehicle = await this.vehicles.findByIdForUpdate(vehicleId, client)
        if (!vehicle || vehicle.status !== 'AVAILABLE' || vehicle.operationType !== 'SVO'
          || !vehicle.categories.includes('BODY') || vehicle.bodyLimit < 1) continue
        if (await this.vehicles.hasActiveMaintenanceBlock(vehicle.id, client)) continue
        if (await this.orders.hasInstitutionalTripConflict(vehicle.id, now, client)) continue
        const activeOrders = await this.orders.countOccupyingOrders(vehicle.id, client)
        if (activeOrders + 1 > vehicle.bodyLimit) continue
        selectedVehicle = vehicle
        break
      }
      if (!selectedVehicle) return this.saveDispatchWait(occurrenceId, before, actor, now, 'NO_VEHICLE', attemptReason, client)

      const afterOccurrence = await this.occurrences.setDispatchWaitReason(occurrenceId, null, now, client)
      const allocationSnapshot: SvoAllocationSnapshot = {
        teamShiftId: selectedTeam.shiftId, shiftStartsAt: selectedTeam.shiftStartsAt,
        shiftEndsAt: selectedTeam.shiftEndsAt, teamActiveOrderCount: selectedTeam.activeOrderCount,
        teamLastDispatchAt: selectedTeam.lastDispatchAt,
        selectionRule: 'LOWEST_ACTIVE_ORDERS_THEN_LONGEST_WITHOUT_DISPATCH',
      }
      const occurrenceSnapshot = {
        id: afterOccurrence.id, status: afterOccurrence.status, revision: afterOccurrence.revision,
        requesterName: afterOccurrence.requesterName, requesterPhone: afterOccurrence.requesterPhone,
        requesterType: afterOccurrence.requesterType, location: afterOccurrence.location,
        description: afterOccurrence.description, notes: afterOccurrence.notes, receivedAt: afterOccurrence.receivedAt,
        triagedAt: afterOccurrence.triagedAt, triagedBy: afterOccurrence.triagedBy,
        attendantId: afterOccurrence.attendantId, evidenceDescription: afterOccurrence.evidenceDescription,
      }
      const order = await this.orders.create({
        occurrenceId, teamId: selectedTeam.id, vehicleId: selectedVehicle.id, status: SVO_ORDER_INITIAL_STATUS,
        openedAt: now, createdBy: actor.id, revision: 1, occurrenceSnapshot,
        teamSnapshot: { id: selectedTeam.id, name: selectedTeam.name, active: selectedTeam.active, revision: selectedTeam.revision },
        vehicleSnapshot: {
          id: selectedVehicle.id, licensePlate: selectedVehicle.licensePlate, categories: selectedVehicle.categories,
          operationType: selectedVehicle.operationType, status: selectedVehicle.status,
          bodyLimit: selectedVehicle.bodyLimit, revision: selectedVehicle.revision,
        },
        teamShiftId: selectedTeam.shiftId, allocationSnapshot,
      }, client)
      const reason = 'Ordem SVO despachada automaticamente conforme plantão, carga e disponibilidade de viatura.'
      await this.orders.createOpenedEvent({ order, actor, reason, evidenceDescription: DISPATCH_EVIDENCE }, client)
      const after = await this.occurrences.findById(occurrenceId, client)
      if (!after) throw new SvoOrderServiceError('NOT_FOUND', 'Solicitação SVO não encontrada após o despacho.')
      await this.occurrences.createEvent({
        occurrenceId, eventType: 'DISPATCHED', occurredAt: now, reportedBy: actor.name,
        actorSnapshot: actor, reason, evidenceDescription: DISPATCH_EVIDENCE,
        beforeState: before, afterState: after,
      }, client)
      await this.audit.recordAudit({
        userId: actor.id, table: 'svo.occurrences', recordId: occurrenceId, operation: 'UPDATE',
        before: occurrenceAuditState(before), after: occurrenceAuditState(after), actorSnapshot: { ...actor }, reason,
      }, client)
      await this.audit.recordAudit({
        userId: actor.id, table: 'svo.execution_orders', recordId: order.id, operation: 'CREATE', before: null,
        after: { id: order.id, occurrenceId, teamId: selectedTeam.id, vehicleId: selectedVehicle.id,
          teamShiftId: selectedTeam.shiftId, status: order.status, openedAt: order.openedAt, revision: order.revision },
        actorSnapshot: { ...actor }, reason,
      }, client)
      return { status: 'DISPATCHED', orderId: order.id, teamId: selectedTeam.id, vehicleId: selectedVehicle.id, revision: after.revision }
    })
  }

  private async saveDispatchWait(
    occurrenceId: string,
    before: NonNullable<Awaited<ReturnType<Occurrences['findById']>>>,
    actor: SvoActorSnapshot,
    now: Date,
    waitReason: 'NO_TEAM' | 'NO_VEHICLE',
    reason: string,
    client: PoolClient,
  ): Promise<SvoDispatchResult> {
    const after = await this.occurrences.setDispatchWaitReason(occurrenceId, waitReason, now, client)
    const message = waitReason === 'NO_TEAM'
      ? 'Nenhuma equipe SVO está ativa em plantão com integrante elegível.'
      : 'Nenhuma viatura SVO elegível possui vaga disponível.'
    await this.occurrences.createEvent({
      occurrenceId, eventType: 'DISPATCH_WAITING', occurredAt: now, reportedBy: actor.name,
      actorSnapshot: actor, reason: message, evidenceDescription: `Motivo controlado da espera: ${waitReason}.`,
      beforeState: before, afterState: after,
    }, client)
    await this.audit.recordAudit({
      userId: actor.id, table: 'svo.occurrences', recordId: occurrenceId, operation: 'UPDATE',
      before: occurrenceAuditState(before), after: occurrenceAuditState(after), actorSnapshot: { ...actor }, reason,
    }, client)
    return { status: 'WAITING', reason: waitReason, revision: after.revision }
  }
}
