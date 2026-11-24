import type { SvoOccurrencesRepositoryContract } from '../repositories/svo-occurrences.repository'
import type { SvoOrdersRepositoryContract } from '../repositories/svo-orders.repository'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { AuditLogger } from '../types/audit.types'
import type { PoolClient } from 'pg'
import type { SvoActorSnapshot } from '../types/svo-occurrence.types'
import { SVO_WRITE_ROLES } from '../types/svo-occurrence.types'
import {
  SVO_ORDER_ALLOWED_RESULTS, SVO_ORDER_INITIAL_STATUS, SVO_ORDER_READ_ROLES, SVO_ORDER_RESULTS,
  SVO_ORDER_STATUSES, SVO_ORDER_TRANSITIONS, SVO_ORDER_STATUS_AUDIT_OPERATION, SvoOrderServiceError,
} from '../types/svo-order.types'
import type {
  CreateSvoOrderInput, RecordSvoOrderResultInput, SvoDispatchCandidatesResult, SvoOrderCreationResult,
  SvoOrderSummary, SvoOrderDetail, SvoOrderDetailRow, SvoOrderReadRow, SvoOrderResult, SvoOrderState,
  SvoOrderStatus, SvoOrderTransition, UpdateSvoOrderStatusInput,
} from '../types/svo-order.types'

const CREATE_FIELDS = ['occurrenceId', 'teamId', 'vehicleId'] as const
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
type Occurrences = Pick<SvoOccurrencesRepositoryContract,
  'withTransaction' | 'findActorSnapshot' | 'findByIdForUpdate' | 'currentTime'>

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
  for (const field of CREATE_FIELDS) {
    const value = input[field]
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) {
      throw new SvoOrderServiceError('INVALID_INPUT', `Informe um identificador válido para ${labels[field]}.`)
    }
  }
  return { occurrenceId: input.occurrenceId as string, teamId: input.teamId as string, vehicleId: input.vehicleId as string }
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
   * Lista equipes ativas e viaturas SVO elegíveis com vagas livres para o diálogo de despacho.
   *
   * Reaproveita os mesmos critérios de elegibilidade aplicados em `createOrder`, sem conceder
   * acesso administrativo ao módulo de manutenção para o perfil da Central SVO.
   *
   * @param userId - Identificador do operador autenticado.
   * @returns Equipes ativas e viaturas elegíveis com cálculo de `availableSlots`.
   * @throws {SvoOrderServiceError} Se a conta estiver inativa ou sem perfil de escrita SVO.
   */
  async listDispatchCandidates(userId: string): Promise<SvoDispatchCandidatesResult> {
    return this.occurrences.withTransaction(async (client) => {
      const actor = await this.occurrences.findActorSnapshot(userId, client)
      if (!actor) {
        throw new SvoOrderServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
      }
      if (!SVO_WRITE_ROLES.some((role) => role === actor.role)) {
        throw new SvoOrderServiceError('ACCESS_DENIED', 'Seu perfil atual não permite consultar candidatos para despacho SVO.')
      }
      const teams = await this.orders.listActiveTeams(client)
      const vehicleRows = await this.orders.listEligibleVehiclesForDispatch(client)
      const vehicles = vehicleRows
        .map((vehicle) => ({
          ...vehicle,
          availableSlots: vehicle.bodyLimit - vehicle.occupyingOrders,
        }))
        .filter((vehicle) => vehicle.availableSlots > 0)
      return { teams, vehicles }
    })
  }

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
        if (!SVO_WRITE_ROLES.some((role) => role === actor.role)) {
          throw new SvoOrderServiceError('ACCESS_DENIED', 'Seu perfil atual não permite gerar ordens SVO.')
        }
        const occurrence = await this.occurrences.findByIdForUpdate(input.occurrenceId, client)
        if (!occurrence) throw new SvoOrderServiceError('NOT_FOUND', 'Solicitação SVO não encontrada.')
        if (await this.orders.findByOccurrenceId(input.occurrenceId, client)) {
          throw new SvoOrderServiceError('ORDER_ALREADY_EXISTS', 'Esta solicitação já possui uma ordem de execução.')
        }
        if (occurrence.status !== 'CONFIRMED') {
          throw new SvoOrderServiceError('OCCURRENCE_NOT_CONFIRMED', 'A solicitação precisa estar confirmada para gerar uma ordem.')
        }
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
        if (await this.orders.countOccupyingOrders(vehicle.id, client) + 1 > vehicle.bodyLimit) {
          throw new SvoOrderServiceError('CAPACITY_EXCEEDED', 'O veículo não possui vaga disponível. Escolha outro veículo.')
        }
        const openedAt = await this.occurrences.currentTime(client)
        const order = await this.orders.create({
          ...input, status: SVO_ORDER_INITIAL_STATUS, openedAt, createdBy: actor.id, revision: 1,
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
        }, client)
        await this.orders.createOpenedEvent({ order, actor, reason: OPENED_REASON, evidenceDescription: OPENED_EVIDENCE }, client)
        await this.audit.recordAudit({
          userId: actor.id, table: 'svo.execution_orders', recordId: order.id, operation: 'CREATE', before: null,
          after: { id: order.id, occurrenceId: order.occurrenceId, teamId: order.teamId,
            vehicleId: order.vehicleId, status: order.status, openedAt: order.openedAt, revision: order.revision },
          actorSnapshot: { ...actor }, reason: OPENED_REASON,
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
}
