import type { NextFunction, Request, Response } from 'express'
import type { CreateRequestBody } from '../types/request.types'
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

/** Adapta a criação HTTP de solicitações para o serviço de domínio. */
export function createRequestsController(service: RequestsService) {
  return {
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
