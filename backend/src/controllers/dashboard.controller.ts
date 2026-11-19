import type { NextFunction, Request, Response } from 'express'
import { DashboardError } from '../types/dashboard.types'
import type { DashboardService } from '../services/dashboard.service'

async function respondWithDomainErrors<T>(response: Response, next: NextFunction, operation: () => Promise<T>): Promise<void> {
  try {
    response.status(200).json(await operation())
  } catch (error) {
    if (error instanceof DashboardError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta as consultas HTTP do dashboard para o service. */
export function createDashboardController(service: DashboardService) {
  return {
    summary(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getSummary(req.usuario?.perfil))
    },

    indicators(req: Request, res: Response, next: NextFunction): Promise<void> {
      const { from, to, vehicleId } = req.query
      return respondWithDomainErrors(res, next, () => service.getIndicators({ from, to, vehicleId }, req.usuario?.perfil))
    },
  }
}
