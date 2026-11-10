import type { NextFunction, Request, Response } from 'express'
import { RequestDecisionError } from '../types/request-decision.types'
import type { RequestDecisionInput } from '../types/request-decision.types'
import type { RequestDecisionsService } from '../services/request-decisions.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

async function respondWithDomainErrors<T>(
  response: Response,
  next: NextFunction,
  operation: () => Promise<T>,
): Promise<void> {
  try {
    response.status(200).json(await operation())
  } catch (error) {
    if (error instanceof RequestDecisionError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta as requisições HTTP de aprovação e rejeição para o service de decisão. */
export function createRequestDecisionsController(service: RequestDecisionsService) {
  return {
    approve(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as RequestDecisionInput
      return respondWithDomainErrors(res, next, () => service.approve(String(req.params.id), input, req.usuario?.id ?? ''))
    },

    reject(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as RequestDecisionInput
      return respondWithDomainErrors(res, next, () => service.reject(String(req.params.id), input, req.usuario?.id ?? ''))
    },
  }
}
