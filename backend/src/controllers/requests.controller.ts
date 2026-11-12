import type { NextFunction, Request, Response } from 'express'
import type { CreateRequestBody, RequestActor, RequestListFilters, RequestStatus } from '../types/request.types'
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
  if (typeof value !== 'string') throw new RequestServiceError(400, 'Parâmetro de consulta inválido.')
  return value.trim() || undefined
}

function queryNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) return Number.NaN
  return Number(value)
}

function requireActor(req: Request): RequestActor {
  if (!req.usuario) throw new RequestServiceError(401, 'Autenticação necessária.')
  return { id: req.usuario.id, role: req.usuario.perfil }
}

function listFilters(req: Request): RequestListFilters {
  const status = queryText(req.query.status)
  const from = queryText(req.query.from)
  const to = queryText(req.query.to)
  const requester = queryText(req.query.requester)
  const service = queryText(req.query.service)
  const page = queryNumber(req.query.page)
  const pageSize = queryNumber(req.query.pageSize)
  return {
    ...(status ? { status: status as RequestStatus } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(requester ? { requester } : {}),
    ...(service ? { service } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  }
}

async function respond<T>(res: Response, next: NextFunction, operation: () => Promise<T>): Promise<void> {
  try {
    res.status(200).json(await operation())
  } catch (error) {
    if (error instanceof RequestServiceError) {
      res.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta a criação HTTP de solicitações para o serviço de domínio. */
export function createRequestsController(service: RequestsService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.listRequests(listFilters(req), requireActor(req)))
    },

    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.getRequest(String(req.params.id), requireActor(req)))
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const request = await service.createRequest(bodyRecord(req.body), req.usuario?.id ?? '')
        res.status(201).json(request)
      } catch (error) {
        if (error instanceof RequestServiceError) {
          res.status(error.statusCode).json({ erro: error.message })
          return
        }
        next(error)
      }
    },
  }
}
