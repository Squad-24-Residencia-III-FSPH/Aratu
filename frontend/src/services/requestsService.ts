import type { ApiRequest } from '../api/client.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED } from '../auth/token.ts'
import { toCreateTripRequestInput } from '../requests/requestForm.ts'
import { TripRequestApiError } from '../requests/requestTypes.ts'
import type {
  ActiveServiceOption,
  CreatedTripRequestResponse,
  CreateTripRequestInput,
} from '../requests/requestTypes.ts'

const INVALID_SERVICES_RESPONSE_MESSAGE =
  'A resposta de tipos de serviço da API está em um formato inválido.'
const INVALID_REQUEST_RESPONSE_MESSAGE =
  'A resposta de criação da solicitação está em um formato inválido.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readErrorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.erro === 'string' && body.erro.trim()
    ? body.erro.trim()
    : fallback
}

async function sendRequest(
  api: ApiRequest,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await api(path, init)
  } catch (error) {
    if (error instanceof TripRequestApiError) throw error
    if (error instanceof Error && error.message === SESSION_EXPIRED) {
      throw new TripRequestApiError('unauthorized', SESSION_EXPIRED, 401)
    }
    throw new TripRequestApiError('unavailable', SERVICE_UNAVAILABLE, null)
  }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null)
  const message = readErrorMessage(body, fallback)

  if (response.status === 401) {
    throw new TripRequestApiError('unauthorized', message, 401)
  }
  if (response.status === 403) {
    throw new TripRequestApiError('forbidden', message, 403)
  }
  if (response.status === 400 || response.status === 422) {
    throw new TripRequestApiError('validation', message, response.status)
  }
  throw new TripRequestApiError('unavailable', message, response.status)
}

function parseServiceOption(value: unknown): ActiveServiceOption {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.name !== 'string'
    || !value.name.trim()
    || !(typeof value.description === 'string' || value.description === null || value.description === undefined)
    || typeof value.active !== 'boolean'
  ) {
    throw new TripRequestApiError('invalidResponse', INVALID_SERVICES_RESPONSE_MESSAGE)
  }

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    description: typeof value.description === 'string' ? value.description : null,
    active: value.active,
  }
}

function parseCreatedRequest(value: unknown): CreatedTripRequestResponse {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !value.id.trim()
    || value.status !== 'PENDING'
  ) {
    throw new TripRequestApiError('invalidResponse', INVALID_REQUEST_RESPONSE_MESSAGE)
  }

  return {
    id: value.id.trim(),
    status: 'PENDING',
  }
}

/**
 * Consulta o catálogo de tipos de serviço (`GET /services`) e retorna apenas os serviços ativos
 * disponíveis para seleção pelo Solicitante (US11 / FROTA-78).
 *
 * @param api - Cliente HTTP autenticado (`createApiClient`).
 * @returns Lista de tipos de serviço ativos.
 * @throws {TripRequestApiError} Em falhas de rede (`SERVICE_UNAVAILABLE`), sessão, permissão ou contrato.
 */
export async function listActiveServices(api: ApiRequest): Promise<ActiveServiceOption[]> {
  const response = await sendRequest(api, '/services')
  if (!response.ok) {
    await throwApiError(response, 'Não foi possível carregar os tipos de serviço.')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!Array.isArray(body)) {
    throw new TripRequestApiError('invalidResponse', INVALID_SERVICES_RESPONSE_MESSAGE, response.status)
  }

  return body.map(parseServiceOption).filter((service) => service.active)
}

/**
 * Envia uma nova solicitação de viagem institucional (`POST /requests`) em nome do Solicitante autenticado.
 *
 * @param api - Cliente HTTP autenticado (`createApiClient`).
 * @param input - Dados da solicitação validados no formulário (`requestedDate`, `requestedTime`, `origin`, `destination`, `purpose`, `serviceId`).
 * @returns Identificador gerado e status inicial `{ id, status: 'PENDING' }`.
 * @throws {TripRequestApiError} Quando a API rejeitar com 400/422 (`{ erro }`) ou estiver indisponível.
 */
export async function createTripRequest(
  api: ApiRequest,
  input: CreateTripRequestInput,
): Promise<CreatedTripRequestResponse> {
  const payload = toCreateTripRequestInput(input)
  const response = await sendRequest(api, '/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await throwApiError(response, 'Não foi possível registrar a solicitação de viagem.')
  }

  const body: unknown = await response.json().catch(() => null)
  return parseCreatedRequest(body)
}

// TODO(FROTA-82/FROTA-84): Quando o endpoint backend `GET /requests` (`FROTA-82` — US12 Consultar solicitação)
// for implementado, adicionar neste módulo a função `listMyRequests(api, filters)` consumindo `GET /requests`
// e conectá-la diretamente em `SolicitacaoPage.tsx` (`FROTA-84`), substituindo o uso transitório de
// `createdRequestsStore.ts`.
