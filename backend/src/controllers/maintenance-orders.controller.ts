import type { NextFunction, Request, Response } from 'express'
import { MaintenanceServiceError } from '../types/maintenance.types'
import { VehicleServiceError } from '../types/vehicle.types'
import type { CreateMaintenanceInput, UpdateMaintenanceInput, CloseMaintenanceInput, MaintenanceFilters } from '../types/maintenance.types'
import type { MaintenanceOrdersService } from '../services/maintenance-orders.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new MaintenanceServiceError(400, 'Informe um objeto JSON com os dados da manutenção.')
  }
  return body as Record<string, unknown>
}

async function respond(res: Response, next: NextFunction, operation: () => Promise<unknown>, status = 200): Promise<void> {
  try {
    res.status(status).json(await operation())
  } catch (error) {
    if (error instanceof MaintenanceServiceError || error instanceof VehicleServiceError) {
      res.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Traduz HTTP para casos de uso sem aceitar autoria ou estado enviados pelo cliente. */
export function createMaintenanceOrdersController(service: MaintenanceOrdersService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => {
        for (const value of Object.values(req.query)) {
          if (typeof value !== 'string') throw new MaintenanceServiceError(400, 'Informe cada filtro uma única vez como texto.')
        }
        return service.list(req.query as MaintenanceFilters)
      })
    },
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.getById(String(req.params.id)))
    },
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.create(bodyRecord(req.body) as unknown as CreateMaintenanceInput,
        req.usuario?.id ?? '', req.get('Idempotency-Key') ?? ''), 201)
    },
    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.updateOrder(String(req.params.id),
        bodyRecord(req.body) as unknown as UpdateMaintenanceInput, req.usuario?.id ?? ''))
    },
    close(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.close(String(req.params.id),
        bodyRecord(req.body) as unknown as CloseMaintenanceInput, req.usuario?.id ?? ''))
    },
  }
}
