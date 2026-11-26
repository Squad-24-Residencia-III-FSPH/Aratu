import type { NextFunction, Request, Response } from 'express'
import { DriverServiceError } from '../types/driver.types'
import type {
  ChangeDriverStatusInput,
  CreateDriverInput,
  DriverFilters,
  UpdateDriverInput,
} from '../types/driver.types'
import type { DriversService } from '../services/drivers.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

function queryInteger(value: unknown): number {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
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
    if (error instanceof DriverServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta requisições HTTP de motoristas para os casos de uso do service. */
export function createDriversController(service: DriversService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      const filters: DriverFilters = {
        ...(typeof req.query.name === 'string' ? { name: req.query.name } : {}),
        ...(typeof req.query.status === 'string'
          ? { status: req.query.status as NonNullable<DriverFilters['status']> }
          : {}),
        ...(typeof req.query.cnhCategory === 'string'
          ? { cnhCategory: req.query.cnhCategory as NonNullable<DriverFilters['cnhCategory']> }
          : {}),
        ...(typeof req.query.search === 'string' ? { search: req.query.search } : {}),
        ...(typeof req.query.view === 'string' ? { view: req.query.view as NonNullable<DriverFilters['view']> } : {}),
        ...(req.query.page !== undefined ? { page: queryInteger(req.query.page) } : {}),
        ...(req.query.pageSize !== undefined ? { pageSize: queryInteger(req.query.pageSize) } : {}),
      }
      return respondWithDomainErrors(res, next, () => service.listDrivers(filters))
    },

    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getDriver(String(req.params.id)))
    },

    /** Retorna uma página da história imutável do motorista. */
    history(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getDriverHistory(String(req.params.id), {
        page: req.query.page,
        pageSize: req.query.pageSize,
        eventType: req.query.eventType,
        from: req.query.from,
        to: req.query.to,
      }))
    },

    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as CreateDriverInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.createDriver(input, req.usuario?.id ?? ''),
        201,
      )
    },

    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as UpdateDriverInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.updateDriver(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },

    changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as ChangeDriverStatusInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.changeDriverStatus(String(req.params.id), input, req.usuario?.id ?? '', req.usuario?.permissions ?? []),
      )
    },
  }
}
