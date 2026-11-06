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
      }
      return respondWithDomainErrors(res, next, () => service.listDrivers(filters))
    },

    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getDriver(String(req.params.id)))
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
        () => service.changeDriverStatus(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },
  }
}
