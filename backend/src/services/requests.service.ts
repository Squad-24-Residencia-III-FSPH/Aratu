import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import type { RequestsRepositoryContract } from '../repositories/requests.repository'
import { INITIAL_REQUEST_STATUS, REQUEST_STATUSES, RequestServiceError } from '../types/request.types'
import type {
  CreateRequestBody,
  CreateRequestInput,
  PaginatedRequestHistory,
  PaginatedRequests,
  RequestActor,
  RequestActorSnapshot,
  RequestDetail,
  RequestListFilters,
  RequestStatus,
  ResubmitRequestBody,
  TripRequest,
} from '../types/request.types'

const OPERATIONAL_TIME_ZONE = 'America/Maceio'
const REQUEST_EVENT_REASON = 'Solicitação criada pelo Solicitante.'
const AUDIT_CREATE_OPERATION = 'CREATE'
const AUDIT_RESUBMIT_OPERATION = 'STATUS_CHANGE'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const MAX_NOTES_LENGTH = 1000
const MAX_RESUBMIT_REASON_LENGTH = 500
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const ID_PATTERN = /^[1-9]\d*$/
const RESUBMISSION_EVENT_REASON = 'Solicitação reenviada após correção pelo Solicitante.'

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && REQUEST_STATUSES.some((status) => status === value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestServiceError(400, `${field} é obrigatório.`)
  }
  return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new RequestServiceError(400, `${field} deve ser um texto.`)
  return value.trim() || null
}

/**
 * Valida uma data de calendário no formato `YYYY-MM-DD`.
 *
 * O round-trip pelo `toISOString` rejeita datas normalizadas pelo JavaScript,
 * como `2026-02-30`, que de outra forma passariam apenas pela expressão regular.
 */
function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function operationalNow(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function assertDateIsNotPast(requestedDate: string, requestedTime: string): void {
  if (`${requestedDate}T${requestedTime}` < operationalNow()) {
    throw new RequestServiceError(422, 'A data e o horário da viagem não podem estar no passado.')
  }
}

function parsePassengers(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1) return value
    throw new RequestServiceError(400, 'passengers deve ser um número inteiro maior ou igual a 1.')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return 1
    if (ID_PATTERN.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed
    }
  }
  throw new RequestServiceError(400, 'passengers deve ser um número inteiro maior ou igual a 1.')
}

function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new RequestServiceError(400, 'notes deve ser um texto.')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_NOTES_LENGTH) {
    throw new RequestServiceError(400, `notes deve ter no máximo ${MAX_NOTES_LENGTH} caracteres.`)
  }
  return trimmed
}

function parseExpectedRevision(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value
  if (typeof value === 'string' && ID_PATTERN.test(value.trim())) {
    const parsed = Number(value.trim())
    if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed
  }
  throw new RequestServiceError(400, 'expectedRevision deve ser um número inteiro positivo.')
}

function parseResubmitReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestServiceError(400, 'Informe a justificativa do reenvio.')
  }
  const trimmed = value.trim()
  if (trimmed.length > MAX_RESUBMIT_REASON_LENGTH) {
    throw new RequestServiceError(
      400,
      `A justificativa do reenvio deve ter no máximo ${MAX_RESUBMIT_REASON_LENGTH} caracteres.`,
    )
  }
  return trimmed
}

function validateInput(body: CreateRequestBody): CreateRequestInput {
  const requestedDate = requiredText(body.requestedDate, 'requestedDate')
  const requestedTime = requiredText(body.requestedTime, 'requestedTime')
  const serviceId = requiredText(body.serviceId, 'serviceId')
  if (!isValidCalendarDate(requestedDate)) throw new RequestServiceError(400, 'requestedDate deve usar uma data válida no formato YYYY-MM-DD.')
  if (!TIME_PATTERN.test(requestedTime)) throw new RequestServiceError(400, 'requestedTime deve usar o formato HH:mm.')
  if (!ID_PATTERN.test(serviceId)) throw new RequestServiceError(400, 'serviceId deve ser um identificador positivo.')
  return {
    requestedDate,
    requestedTime,
    serviceId,
    origin: requiredText(body.origin, 'origin'),
    destination: requiredText(body.destination, 'destination'),
    purpose: requiredText(body.purpose, 'purpose'),
    passengers: parsePassengers(body.passengers),
    specialRequirements: optionalText(body.specialRequirements, 'specialRequirements'),
    notes: parseNotes(body.notes),
  }
}

function toActorSnapshot(actor: RequestActorSnapshot): RequestActorSnapshot {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    sector: actor.sector ?? null,
  }
}

function stateOf(request: TripRequest): Record<string, unknown> {
  return {
    id: request.id,
    requesterId: request.requesterId,
    serviceId: request.serviceId,
    requestedDate: request.requestedDate,
    requestedTime: request.requestedTime,
    origin: request.origin,
    destination: request.destination,
    purpose: request.purpose,
    passengers: request.passengers,
    specialRequirements: request.specialRequirements,
    notes: request.notes,
    status: request.status,
    revision: request.revision,
    requesterSector: request.requesterSector,
    requesterSnapshot: request.requesterSnapshot,
    serviceSnapshot: request.serviceSnapshot,
  }
}

/** Cria e consulta solicitações de viagem com autoria autenticada e escopo por perfil. */
export class RequestsService {
  constructor(
    private readonly repository: RequestsRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /**
   * Registra uma solicitação futura para um serviço ativo e grava estado, evento e auditoria juntos.
   * O estado e a autoria sempre vêm do domínio e da sessão validada, nunca de campos forjados no corpo.
   *
   * @throws {RequestServiceError} 400 para entrada ou serviço inválidos, 401 para conta indisponível e 422 para data passada.
   */
  async createRequest(body: CreateRequestBody, requesterId: string): Promise<Pick<TripRequest, 'id' | 'status'>> {
    const input = validateInput(body)
    if (!ID_PATTERN.test(requesterId)) throw new RequestServiceError(401, 'Usuário autenticado inválido.')

    return this.repository.withTransaction(async (client: PoolClient) => {
      const actor = await this.repository.findActorSnapshot(requesterId, client)
      if (!actor) throw new RequestServiceError(401, 'Sua conta não está ativa. Entre novamente ou procure a administração.')
      const service = await this.repository.findActiveServiceForUpdate(input.serviceId, client)
      if (!service) throw new RequestServiceError(400, 'Tipo de serviço inexistente ou inativo.')
      assertDateIsNotPast(input.requestedDate, input.requestedTime)

      const actorSnapshot = toActorSnapshot(actor)
      const request = await this.repository.create(input, actorSnapshot, service, client)
      await this.repository.createEvent({
        requestId: request.id,
        reportedBy: actor.name,
        registeredBy: actor.id,
        actorSnapshot,
        reason: REQUEST_EVENT_REASON,
        afterState: request,
      }, client)
      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'trip.requests',
        recordId: request.id,
        operation: AUDIT_CREATE_OPERATION,
        before: null,
        after: stateOf(request),
        actorSnapshot: { ...actorSnapshot },
        reason: REQUEST_EVENT_REASON,
      }, client)
      return { id: request.id, status: INITIAL_REQUEST_STATUS }
    })
  }

  /**
   * Reenvia uma solicitação devolvida ou rejeitada (`RETURNED` / `REJECTED` → `PENDING`) pelo próprio titular com controle otimista.
   *
   * Preserva integralmente os eventos anteriores na trilha append-only
   * e registra um novo evento `RESUBMITTED` com justificativa e auditoria na mesma transação.
   *
   * @throws {RequestServiceError} 400 entrada/serviço inválidos, 401 conta inativa, 404 não encontrada no escopo, 409 revisão obsoleta ou status não elegível, 422 data passada.
   */
  async resubmitRequest(
    id: string,
    body: ResubmitRequestBody,
    requesterId: string,
  ): Promise<RequestDetail> {
    if (!ID_PATTERN.test(id)) throw new RequestServiceError(400, 'Identificador de solicitação inválido.')
    if (!ID_PATTERN.test(requesterId)) throw new RequestServiceError(401, 'Usuário autenticado inválido.')

    const expectedRevision = parseExpectedRevision(body.expectedRevision)
    const reason = body.reason !== undefined ? parseResubmitReason(body.reason) : RESUBMISSION_EVENT_REASON
    const input = validateInput(body)

    await this.repository.withTransaction(async (client: PoolClient) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before || before.requesterId !== requesterId) {
        throw new RequestServiceError(404, 'Solicitação não encontrada.')
      }
      if (before.status !== 'RETURNED' && before.status !== 'REJECTED') {
        throw new RequestServiceError(409, 'Somente solicitações devolvidas ou rejeitadas podem ser reenviadas.')
      }
      if (before.revision !== expectedRevision) {
        throw new RequestServiceError(
          409,
          'A solicitação foi atualizada em outra ação. Recarregue os detalhes antes de reenviar.',
        )
      }

      const actor = await this.repository.findActorSnapshot(requesterId, client)
      if (!actor) throw new RequestServiceError(401, 'Sua conta não está ativa. Entre novamente ou procure a administração.')
      const service = await this.repository.findActiveServiceForUpdate(input.serviceId, client)
      if (!service) throw new RequestServiceError(400, 'Tipo de serviço inexistente ou inativo.')
      assertDateIsNotPast(input.requestedDate, input.requestedTime)

      const actorSnapshot = toActorSnapshot(actor)
      const after = await this.repository.resubmit(
        id,
        expectedRevision,
        input,
        actorSnapshot,
        service,
        client,
      )
      if (!after) {
        throw new RequestServiceError(
          409,
          'A solicitação foi atualizada em outra ação. Recarregue os detalhes antes de reenviar.',
        )
      }

      await this.repository.createEvent({
        requestId: after.id,
        eventType: 'RESUBMITTED',
        reportedBy: actor.name,
        registeredBy: actor.id,
        actorSnapshot,
        reason,
        beforeState: before,
        afterState: after,
      }, client)

      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'trip.requests',
        recordId: after.id,
        operation: AUDIT_RESUBMIT_OPERATION,
        before: stateOf(before),
        after: stateOf(after),
        actorSnapshot: { ...actorSnapshot },
        reason,
      }, client)
    })

    const detail = await this.repository.findById(id, requesterId)
    if (!detail) throw new RequestServiceError(404, 'Solicitação não encontrada.')
    return detail
  }

  /**
   * Lista solicitações aplicando o escopo do perfil autenticado.
   *
   * O `SOLICITANTE` recebe apenas as solicitações em que é o requerente;
   * `GESTOR` e `ADMINISTRADOR` recebem todas. O identificador do solicitante
   * vem sempre do token, nunca de um parâmetro enviado pelo cliente.
   *
   * @param filters - Filtros opcionais de situação, período e paginação.
   * @param actor - Identificador e perfil do usuário autenticado.
   * @returns Página de solicitações com os metadados de total.
   * @throws {RequestServiceError} Se situação, datas ou paginação forem inválidas.
   */
  async listRequests(
    filters: RequestListFilters,
    actor: RequestActor,
  ): Promise<PaginatedRequests> {
    if (filters.status !== undefined && !isRequestStatus(filters.status)) {
      throw new RequestServiceError(400, 'Situação da solicitação inválida.')
    }

    if (filters.from !== undefined && !isValidCalendarDate(filters.from)) {
      throw new RequestServiceError(400, 'Data inicial inválida.')
    }

    if (filters.to !== undefined && !isValidCalendarDate(filters.to)) {
      throw new RequestServiceError(400, 'Data final inválida.')
    }
    if (filters.requester !== undefined && filters.requester.length > 120) {
      throw new RequestServiceError(400, 'O filtro de solicitante deve ter até 120 caracteres.')
    }
    if (filters.service !== undefined && filters.service.length > 120) {
      throw new RequestServiceError(400, 'O filtro de tipo de serviço deve ter até 120 caracteres.')
    }

    if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to) {
      throw new RequestServiceError(400, 'A data inicial não pode ser posterior à data final.')
    }

    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE

    if (!Number.isInteger(page) || page < 1) {
      throw new RequestServiceError(400, 'Página inválida.')
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new RequestServiceError(400, `O tamanho da página deve estar entre 1 e ${MAX_PAGE_SIZE}.`)
    }

    const requesterId = actor.role === 'SOLICITANTE' ? actor.id : undefined

    return this.repository.list({
      ...filters,
      ...(filters.requester?.trim() ? { requester: filters.requester.trim() } : {}),
      ...(filters.service?.trim() ? { service: filters.service.trim() } : {}),
      page,
      pageSize,
      ...(requesterId !== undefined ? { requesterId } : {}),
    })
  }

  /**
   * Retorna o detalhe de uma solicitação respeitando o escopo do perfil.
   *
   * Para o `SOLICITANTE`, a consulta é restrita ao próprio identificador.
   * Uma solicitação de terceiros e uma solicitação inexistente produzem o
   * mesmo 404, impedindo a descoberta de registros por tentativa.
   *
   * @param id - Identificador da solicitação na rota.
   * @param actor - Identificador e perfil do usuário autenticado.
   * @returns Detalhe da solicitação com a viagem, quando existir.
   * @throws {RequestServiceError} Se o identificador for inválido ou a solicitação não existir no escopo.
   */
  async getRequest(id: string, actor: RequestActor): Promise<RequestDetail> {
    if (!ID_PATTERN.test(id)) {
      throw new RequestServiceError(400, 'Identificador de solicitação inválido.')
    }

    const requesterId = actor.role === 'SOLICITANTE' ? actor.id : undefined
    const request = await this.repository.findById(id, requesterId)

    if (!request) {
      throw new RequestServiceError(404, 'Solicitação não encontrada.')
    }

    return request
  }

  /** Retorna o histórico paginado apenas depois de aplicar o mesmo escopo do detalhe. */
  async getRequestHistory(
    id: string,
    actor: RequestActor,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PaginatedRequestHistory> {
    if (!Number.isInteger(page) || page < 1) throw new RequestServiceError(400, 'Página inválida.')
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new RequestServiceError(400, `O tamanho da página deve estar entre 1 e ${MAX_PAGE_SIZE}.`)
    }
    await this.getRequest(id, actor)
    return this.repository.listHistory(id, page, pageSize)
  }
}
