import type { NextFunction, Request, Response } from 'express'
import { TripServiceError } from '../types/trip.types'
import type { FinishTripInput, ScheduleTripInput, StartTripInput } from '../types/trip.types'
import type { TripsService } from '../services/trips.service'

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
    if (error instanceof TripServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta as requisições HTTP de viagens para o service. */
export function createTripsController(service: TripsService) {
  return {
    schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as ScheduleTripInput
      return respondWithDomainErrors(res, next, () => service.scheduleTrip(input, req.usuario?.id ?? ''), 201)
    },

    start(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as StartTripInput
      return respondWithDomainErrors(res, next, () => service.startTrip(String(req.params.id), input, req.usuario?.id ?? ''))
    },

    finish(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as FinishTripInput
      return respondWithDomainErrors(res, next, () => service.finishTrip(String(req.params.id), input, req.usuario?.id ?? ''))
    },

    listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.listMyTrips(req.usuario?.id ?? ''))
    },
  }
}
