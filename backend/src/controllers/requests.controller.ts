import type { NextFunction, Request, Response } from 'express'
import { RequestServiceError } from '../types/request.types'
import type {
  RequestActor,
  RequestListFilters,
  RequestStatus,
} from '../types/request.types'
import type { RequestsService } from '../services/requests.service'

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
): Promise<void> {
  try {
    response.status(200).json(await operation())
  } catch (error) {
    if (error instanceof RequestServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta requisições HTTP de consulta de solicitações para os casos de uso do service. */
export function createRequestsController(service: RequestsService) {
  return {
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
