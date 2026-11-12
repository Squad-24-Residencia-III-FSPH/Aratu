/** Mensagem padrão exibida ao Solicitante após `201 Created` em `POST /requests`. */
export const REQUEST_CREATED_NOTICE = 'Solicitação registrada'

/** Estados de solicitação definidos na tabela `trip.requests`. */
export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]

/** Opção de tipo de serviço ativo retornada por `GET /services`. */
export interface ActiveServiceOption {
  id: string
  name: string
  description: string | null
  active: boolean
}

/**
 * Payload enviado para `POST /requests` (contrato FROTA-79).
 *
 * // TODO(FROTA-82/FROTA-84): Caso o backend (`POST /requests` em `backend/src/services/requests.service.ts`)
 * // passe a aceitar o número de passageiros no corpo da requisição (a coluna `passengers` já existe
 * // em `trip.requests` com default `1`), estender esta interface com `passengers?: number` e adicionar
 * // o campo correspondente em `requestForm.ts` e `RequestTripPage.tsx`.
 */
export interface CreateTripRequestInput {
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  serviceId: string
}

/** Resposta de confirmação retornada com HTTP 201 por `POST /requests`. */
export interface CreatedTripRequestResponse {
  id: string
  status: 'PENDING'
}

/**
 * Registro mantido na sessão do front-end após `201 Created` de `POST /requests` para exibição
 * imediata em `SolicitacaoPage.tsx` com status `Pendente`.
 *
 * // TODO(FROTA-82/FROTA-84): Quando o endpoint `GET /requests` (`FROTA-82`) e a integração da
 * // tela de consulta (`FROTA-84`) forem implementados, substituir este modelo transitório pelo
 * // contrato de leitura retornado diretamente por `GET /requests`.
 */
export interface SubmittedTripRequest extends CreateTripRequestInput {
  id: string
  status: 'PENDING'
  serviceName: string
  createdAtIso: string
}

/** Categorias de erro nas chamadas de tipos de serviço e criação de solicitação. */
export type TripRequestApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'unavailable'
  | 'invalidResponse'

/** Erro tipado lançado por `requestsService.ts` ao consumir `GET /services` e `POST /requests`. */
export class TripRequestApiError extends Error {
  readonly kind: TripRequestApiErrorKind
  readonly statusCode: number | null

  constructor(kind: TripRequestApiErrorKind, message: string, statusCode: number | null = null) {
    super(message)
    this.name = 'TripRequestApiError'
    this.kind = kind
    this.statusCode = statusCode
  }
}
