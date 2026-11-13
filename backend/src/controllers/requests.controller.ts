import type { NextFunction, Request, Response } from 'express'
import type {
  CreateRequestBody,
  RequestActor,
  RequestListFilters,
  RequestStatus,
} from '../types/request.types'
import { RequestServiceError } from '../types/request.types'
import type { RequestsService } from '../services/requests.service'

function bodyRecord(body: unknown): CreateRequestBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  const value = body as Record<string, unknown>
  return {
    requestedDate: value.requestedDate,
    requestedTime: value.requestedTime,
    origin: value.origin,
    destination: value.destination,
    purpose: value.purpose,
    serviceId: value.serviceId,
  }
}

function queryText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new RequestServiceError(400, 'Parâmetro de consulta inválido.')
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function queryNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return Number.NaN
  return value.trim().length > 0 ? Number(value) : Number.NaN
}

function requireActor(request: Request): RequestActor {
  const usuario = request.usuario
  if (!usuario) {
    throw new RequestServiceError(401, 'Autenticação necessária.')
  }
  return { id: usuario.id, role: usuario.perfil }
}

async function respondWithDomainErrors<T>(
  response: Response,
  next: NextFunction,
  operation: () => Promise<T>,
  successStatus = 200,
): Promise<void> {
  try {
    response.status(successStatus).json(await operation())
  } catch (error) {
    if (error instanceof RequestServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta a criação e a consulta HTTP de solicitações para o serviço de domínio. */
export function createRequestsController(service: RequestsService) {
  return {
    /** Registra uma solicitação para o Solicitante autenticado. */
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(
        res,
        next,
        () => service.createRequest(bodyRecord(req.body), req.usuario?.id ?? ''),
        201,
      )
    },

    /** Retorna a listagem paginada com os filtros opcionais. */
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => {
        const status = queryText(req.query.status)
        const from = queryText(req.query.from)
        const to = queryText(req.query.to)
        const page = queryNumber(req.query.page)
        const pageSize = queryNumber(req.query.pageSize)
        const filters: RequestListFilters = {
          ...(status !== undefined ? { status: status as RequestStatus } : {}),
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
        }
        return service.listRequests(filters, requireActor(req))
      })
    },

    /** Retorna o detalhe de uma solicitação identificada pelo parâmetro da rota. */
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(
        res,
        next,
        () => service.getRequest(String(req.params.id), requireActor(req)),
      )
    },
  }
}
