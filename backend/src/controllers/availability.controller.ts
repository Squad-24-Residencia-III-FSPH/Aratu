import type { NextFunction, Request, Response } from 'express'
import { AvailabilityError } from '../types/availability.types'
import type { AvailabilityService } from '../services/availability.service'

async function respondWithDomainErrors<T>(
  response: Response,
  next: NextFunction,
  operation: () => Promise<T>,
): Promise<void> {
  try {
    response.status(200).json(await operation())
  } catch (error) {
    if (error instanceof AvailabilityError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta as consultas HTTP de disponibilidade para o service. */
export function createAvailabilityController(service: AvailabilityService) {
  return {
    listVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
      const { start, end, serviceId } = req.query
      return respondWithDomainErrors(res, next, () => service.listVehicles({ start, end, serviceId }))
    },

    listDrivers(req: Request, res: Response, next: NextFunction): Promise<void> {
      const { start, end } = req.query
      return respondWithDomainErrors(res, next, () => service.listDrivers({ start, end }))
    },
  }
}
