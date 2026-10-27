import type { NextFunction, Request, Response } from 'express'
import { VehicleServiceError } from '../types/vehicle.types'
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleFilters,
} from '../types/vehicle.types'
import type { VehiclesService } from '../services/vehicles.service'

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
    if (error instanceof VehicleServiceError) {
      response.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Adapta requisições HTTP de veículos para os casos de uso do service. */
export function createVehiclesController(service: VehiclesService) {
  return {
    /** Retorna a listagem com filtros opcionais. */
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      const filters: VehicleFilters = {
        ...(typeof req.query.status === 'string'
          ? { status: req.query.status as NonNullable<VehicleFilters['status']> }
          : {}),
        ...(typeof req.query.category === 'string'
          ? { category: req.query.category as NonNullable<VehicleFilters['category']> }
          : {}),
        ...(typeof req.query.operationType === 'string'
          ? { operationType: req.query.operationType as NonNullable<VehicleFilters['operationType']> }
          : {}),
      }
      return respondWithDomainErrors(res, next, () => service.listVehicles(filters))
    },

    /** Retorna o detalhe de um veículo identificado pelo parâmetro da rota. */
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respondWithDomainErrors(res, next, () => service.getVehicle(String(req.params.id)))
    },

    /** Cria veículo e retorna HTTP 201 após persistir histórico e auditoria. */
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as CreateVehicleInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.createVehicle(input, req.usuario?.id ?? ''),
        201,
      )
    },

    /** Substitui os atributos editáveis sob controle de revision. */
    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as UpdateVehicleInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.updateVehicle(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },

    /** Altera a situação conforme a máquina de estados do domínio. */
    changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
      const input = bodyRecord(req.body) as unknown as ChangeVehicleStatusInput
      return respondWithDomainErrors(
        res,
        next,
        () => service.changeVehicleStatus(String(req.params.id), input, req.usuario?.id ?? ''),
      )
    },
  }
}
