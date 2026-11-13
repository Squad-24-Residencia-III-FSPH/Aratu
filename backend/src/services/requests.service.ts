import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import type { RequestsRepositoryContract } from '../repositories/requests.repository'
import { INITIAL_REQUEST_STATUS, REQUEST_STATUSES, RequestServiceError } from '../types/request.types'
import type {
  CreateRequestBody,
  CreateRequestInput,
  PaginatedRequests,
  RequestActor,
  RequestDetail,
  RequestListFilters,
  RequestStatus,
  TripRequest,
} from '../types/request.types'

const OPERATIONAL_TIME_ZONE = 'America/Maceio'
const REQUEST_EVENT_REASON = 'Solicitação criada pelo Solicitante.'
const AUDIT_OPERATION = 'CREATE'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const ID_PATTERN = /^[1-9]\d*$/

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && REQUEST_STATUSES.some((status) => status === value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestServiceError(400, `${field} é obrigatório.`)
  }
  return value.trim()
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
      return { id: request.id, status: INITIAL_REQUEST_STATUS }
    })
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
}
