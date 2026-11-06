import {
  REQUEST_STATUSES,
  RequestServiceError,
} from '../types/request.types'
import type {
  PaginatedRequests,
  RequestActor,
  RequestDetail,
  RequestListFilters,
  RequestStatus,
} from '../types/request.types'
import type { RequestsRepositoryContract } from '../repositories/requests.repository'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const REQUEST_ID_PATTERN = /^[1-9]\d*$/

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && REQUEST_STATUSES.some((status) => status === value)
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

/** Regras de consulta, validação e escopo de solicitações de transporte. */
export class RequestsService {
  constructor(private readonly repository: RequestsRepositoryContract) {}

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
    if (!REQUEST_ID_PATTERN.test(id)) {
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
