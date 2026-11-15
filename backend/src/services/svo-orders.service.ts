import type { SvoOccurrencesRepositoryContract } from '../repositories/svo-occurrences.repository'
import type { SvoOrdersRepositoryContract } from '../repositories/svo-orders.repository'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { AuditLogger } from '../types/audit.types'
import { SVO_WRITE_ROLES } from '../types/svo-occurrence.types'
import { SVO_ORDER_INITIAL_STATUS, SvoOrderServiceError } from '../types/svo-order.types'
import type { CreateSvoOrderInput, SvoOrderCreationResult } from '../types/svo-order.types'

const CREATE_FIELDS = ['occurrenceId', 'teamId', 'vehicleId'] as const
const MAX_BIGINT = 9223372036854775807n
const OPENED_REASON = 'Ordem gerada a partir de solicitação SVO confirmada.'
const OPENED_EVIDENCE = 'Alocação de equipe e veículo registrada pelo operador na sessão autenticada.'
type Occurrences = Pick<SvoOccurrencesRepositoryContract,
  'withTransaction' | 'findActorSnapshot' | 'findByIdForUpdate' | 'currentTime'>

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
