import type { NextFunction, Request, Response } from 'express'
import { FineServiceError } from '../types/fine.types'
import type { FineErrorCode, FineFilters, CreateFineInput, UpdateFineInput, ChangeFineStatusInput } from '../types/fine.types'
import type { FinesService } from '../services/fines.service'

const ERROR_STATUS: Record<FineErrorCode, number> = {
  INVALID_INPUT: 400, NOT_FOUND: 404, REVISION_CONFLICT: 409, CLOSED_FINE: 409,
  IDEMPOTENCY_CONFLICT: 409, INVALID_TRANSITION: 422, INVALID_LINK: 422, INACTIVE_ACTOR: 401,
}
function query(req: Request, allowed: readonly string[]): Record<string, string> {
  if (Object.entries(req.query).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string')) {
    throw new FineServiceError('INVALID_INPUT', 'Informe somente os filtros permitidos, cada um uma única vez como texto.')
  }
  return req.query as Record<string, string>
}
async function respond(res: Response, next: NextFunction, operation: () => Promise<unknown>, status = 200): Promise<void> {
  try { res.status(status).json(await operation()) }
  catch (error) {
    if (error instanceof FineServiceError) { res.status(ERROR_STATUS[error.code]).json({ erro: error.message }); return }
    next(error)
  }
}

/** Traduz erros de domínio e extrai autoria exclusivamente da sessão revalidada. */
export function createFinesController(service: FinesService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.list(query(req, ['vehicleId', 'driverId', 'status', 'from', 'to']) as FineFilters))
    },
    suggestDrivers(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => {
        const filters = query(req, ['vehicleId', 'infractionAt'])
        return service.suggestDrivers(filters.vehicleId ?? '', filters.infractionAt ?? '')
      })
    },
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.getById(String(req.params.id)))
    },
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.create(req.body as CreateFineInput, req.usuario?.id ?? '', req.get('Idempotency-Key') ?? ''), 201)
    },
    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.updateFine(String(req.params.id), req.body as UpdateFineInput, req.usuario?.id ?? ''))
    },
    changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.changeStatus(String(req.params.id), req.body as ChangeFineStatusInput, req.usuario?.id ?? ''))
    },
  }
}
