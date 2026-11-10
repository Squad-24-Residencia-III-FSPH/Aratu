import type { NextFunction, Request, Response } from 'express'
import { TripServiceError } from '../types/trip.types'
import type { ScheduleTripInput } from '../types/trip.types'
import type { TripsService } from '../services/trips.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

/** Adapta a requisição HTTP de agendamento para o service de viagens. */
export function createTripsController(service: TripsService) {
  return {
    async schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const trip = await service.scheduleTrip(bodyRecord(req.body) as ScheduleTripInput, req.usuario?.id ?? '')
        res.status(201).json(trip)
      } catch (error) {
        if (error instanceof TripServiceError) {
          res.status(error.statusCode).json({ erro: error.message })
          return
        }
        next(error)
      }
    },
  }
}
