import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import type { RequestsRepositoryContract } from '../repositories/requests.repository'
import { REQUEST_STATUSES, REQUEST_STATUS_VALUES, RequestServiceError } from '../types/request.types'
import type { CreateRequestBody, CreateRequestInput, PaginatedRequests, RequestActor, RequestDetail, RequestListFilters, RequestStatus, TripRequest } from '../types/request.types'

const OPERATIONAL_TIME_ZONE = 'America/Maceio'
const REQUEST_EVENT_REASON = 'Solicitação criada pelo Solicitante.'
const AUDIT_OPERATION = 'CREATE'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const ID_PATTERN = /^[1-9]\d*$/
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && REQUEST_STATUS_VALUES.some(status => status === value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestServiceError(400, `${field} é obrigatório.`)
  }
  return value.trim()
}

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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

function validateInput(body: CreateRequestBody): CreateRequestInput {
  const requestedDate = requiredText(body.requestedDate, 'requestedDate')
  const requestedTime = requiredText(body.requestedTime, 'requestedTime')
  const serviceId = requiredText(body.serviceId, 'serviceId')
  if (!validDate(requestedDate)) throw new RequestServiceError(400, 'requestedDate deve usar uma data válida no formato YYYY-MM-DD.')
  if (!TIME_PATTERN.test(requestedTime)) throw new RequestServiceError(400, 'requestedTime deve usar o formato HH:mm.')
  if (!ID_PATTERN.test(serviceId)) throw new RequestServiceError(400, 'serviceId deve ser um identificador positivo.')
  return {
    requestedDate,
    requestedTime,
    serviceId,
    origin: requiredText(body.origin, 'origin'),
    destination: requiredText(body.destination, 'destination'),
    purpose: requiredText(body.purpose, 'purpose'),
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
    status: request.status,
    requesterSnapshot: request.requesterSnapshot,
    serviceSnapshot: request.serviceSnapshot,
  }
}

/** Cria solicitações de viagem com autoria autenticada e histórico operacional. */
export class RequestsService {
  constructor(
    private readonly repository: RequestsRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /** Lista solicitações no escopo do perfil autenticado e valida filtros/paginação antes do SQL. */
  async listRequests(filters: RequestListFilters, actor: RequestActor): Promise<PaginatedRequests> {
    if (filters.status !== undefined && !isRequestStatus(filters.status)) {
      throw new RequestServiceError(400, 'Situação da solicitação inválida.')
    }
    if (filters.from !== undefined && !validDate(filters.from)) {
      throw new RequestServiceError(400, 'Data inicial inválida.')
    }
    if (filters.to !== undefined && !validDate(filters.to)) {
      throw new RequestServiceError(400, 'Data final inválida.')
    }
    if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to) {
      throw new RequestServiceError(400, 'A data inicial não pode ser posterior à data final.')
    }
    if (filters.requester !== undefined && (typeof filters.requester !== 'string' || filters.requester.length > 120)) {
      throw new RequestServiceError(400, 'O filtro de solicitante deve ter até 120 caracteres.')
    }
    if (filters.service !== undefined && (typeof filters.service !== 'string' || filters.service.length > 120)) {
      throw new RequestServiceError(400, 'O filtro de tipo de serviço deve ter até 120 caracteres.')
    }

    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
    if (!Number.isInteger(page) || page < 1) throw new RequestServiceError(400, 'Página inválida.')
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new RequestServiceError(400, `O tamanho da página deve estar entre 1 e ${MAX_PAGE_SIZE}.`)
    }

    const { requester, service, ...query } = filters
    return this.repository.list({
      ...query,
      ...(requester?.trim() ? { requester: requester.trim() } : {}),
      ...(service?.trim() ? { service: service.trim() } : {}),
      page,
      pageSize,
      ...(actor.role === 'SOLICITANTE' ? { requesterId: actor.id } : {}),
    })
  }

  /** Retorna detalhe e decisão; solicitantes não descobrem solicitações de terceiros. */
  async getRequest(id: string, actor: RequestActor): Promise<RequestDetail> {
    if (!ID_PATTERN.test(id)) throw new RequestServiceError(400, 'Identificador de solicitação inválido.')
    const request = await this.repository.findById(id, actor.role === 'SOLICITANTE' ? actor.id : undefined)
    if (!request) throw new RequestServiceError(404, 'Solicitação não encontrada.')
    return request
  }

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

      const request = await this.repository.create(input, actor, service, client)
      await this.repository.createEvent({
        requestId: request.id,
        reportedBy: actor.name,
        registeredBy: actor.id,
        actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
        reason: REQUEST_EVENT_REASON,
        afterState: request,
      }, client)
      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'trip.requests',
        recordId: request.id,
        operation: AUDIT_OPERATION,
        before: null,
        after: stateOf(request),
        actorSnapshot: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
        reason: REQUEST_EVENT_REASON,
      }, client)
      return { id: request.id, status: REQUEST_STATUSES.pending }
    })
  }
}
