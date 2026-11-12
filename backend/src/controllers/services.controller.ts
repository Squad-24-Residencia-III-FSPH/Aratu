import type { NextFunction, Request, Response } from 'express'
import { FleetServiceError } from '../types/fleet-service.types'
import type {
  ChangeFleetServiceStatusInput,
  CreateFleetServiceInput,
  FleetServiceFilters,
  ReplaceCompatibleVehiclesInput,
  UpdateFleetServiceInput,
} from '../types/fleet-service.types'
import type { FleetServicesService } from '../services/fleet-services.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

function parseFilters(query: Request['query']): FleetServiceFilters {
  if (query.active === undefined) return {}
  if (query.active === 'true') return { active: true }
  if (query.active === 'false') return { active: false }
  throw new FleetServiceError(400, 'O filtro active deve ser true ou false.')
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
    if (error instanceof FleetServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta requisições HTTP de tipos de serviço para os casos de uso do service. */
export function createServicesController(service: FleetServicesService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, async () => service.listServices(parseFilters(req.query), req.usuario?.perfil))
    },

    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getService(String(req.params.id), req.usuario?.perfil))
    },

    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as CreateFleetServiceInput
      return respondWithDomainErrors(res, next, () => service.createService(input, req.usuario?.id ?? ''), 201)
    },

    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as UpdateFleetServiceInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.updateService(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },

    activate(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as ChangeFleetServiceStatusInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.setServiceActive(String(req.params.id), true, input, req.usuario?.id ?? ''),
      )
    },

    deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as ChangeFleetServiceStatusInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.setServiceActive(String(req.params.id), false, input, req.usuario?.id ?? ''),
      )
    },

    listVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.listCompatibleVehicles(String(req.params.id)))
    },

    replaceVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as ReplaceCompatibleVehiclesInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.replaceCompatibleVehicles(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },
  }
}
