import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { FuelingsService } from '../services/fuelings.service'
import { FuelingServiceError } from '../types/fueling.types'
import type { CreateFuelingInput, RectifyFuelingInput, FuelingFilters, FuelingErrorCode } from '../types/fueling.types'

const ERROR_STATUS: Record<FuelingErrorCode, number> = {
  INVALID_INPUT: 400, FUTURE_DATE: 422, ODOMETER_CONFLICT: 422, NOT_FOUND: 404,
  REVISION_CONFLICT: 409, HISTORY_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, INACTIVE_ACTOR: 401,
}
async function respond(res: Response, next: NextFunction, work: () => Promise<unknown>, status = 200): Promise<void> {
  try { res.status(status).json(await work()) }
  catch (error) {
    if (error instanceof FuelingServiceError) {
      res.status(ERROR_STATUS[error.code]).json({ erro: error.message })
      return
    }
    next(error)
  }
}
/** Limita a borda à tradução HTTP; validação de domínio permanece no service. */
export function createFuelingsController(service: FuelingsService): Record<'list' | 'getById' | 'create' | 'rectify', RequestHandler> {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => {
        for (const value of Object.values(req.query)) {
          if (typeof value !== 'string') throw new FuelingServiceError('INVALID_INPUT', 'Informe cada filtro uma única vez como texto.')
        }
        return service.list(req.query as FuelingFilters)
      })
    },
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.getById(String(req.params.id)))
    },
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.create(req.body as CreateFuelingInput,
        req.usuario?.id ?? '', req.get('Idempotency-Key') ?? ''), 201)
    },
    rectify(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.rectify(String(req.params.id), req.body as RectifyFuelingInput,
        req.usuario?.id ?? '', req.get('Idempotency-Key') ?? ''))
    },
  }
}
