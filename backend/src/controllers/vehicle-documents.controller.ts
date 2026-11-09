import type { NextFunction, Request, Response } from 'express'
import { VehicleDocumentServiceError } from '../types/vehicle-document.types'
import type {
  AnnulVehicleDocumentInput,
  CreateVehicleDocumentInput,
  UpdateVehicleDocumentInput,
  VehicleDocumentFilters,
} from '../types/vehicle-document.types'
import type { VehicleDocumentsService } from '../services/vehicle-documents.service'

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new VehicleDocumentServiceError(400, 'Informe um objeto JSON com os dados do documento.')
  }
  return body as Record<string, unknown>
}

async function respond(
  res: Response,
  next: NextFunction,
  operation: () => Promise<unknown>,
  status = 200,
): Promise<void> {
  try {
    res.status(status).json(await operation())
  } catch (error) {
    if (error instanceof VehicleDocumentServiceError) {
      res.status(error.statusCode).json({ erro: error.message })
      return
    }
    next(error)
  }
}

/** Traduz HTTP para casos de uso de documentos de veículos sem aceitar autoria enviada pelo cliente. */
export function createVehicleDocumentsController(service: VehicleDocumentsService) {
  return {
    list(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => {
        for (const value of Object.values(req.query)) {
          if (typeof value !== 'string') {
            throw new VehicleDocumentServiceError(400, 'Informe cada filtro uma única vez como texto.')
          }
        }
        return service.list(req.query as VehicleDocumentFilters)
      })
    },
    listExpiring(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => {
        const rawDays = req.query.days
        if (rawDays !== undefined && typeof rawDays !== 'string') {
          throw new VehicleDocumentServiceError(400, 'Informe days como inteiro entre 1 e 365.')
        }
        for (const value of Object.values(req.query)) {
          if (typeof value !== 'string') {
            throw new VehicleDocumentServiceError(400, 'Informe cada filtro uma única vez como texto.')
          }
        }
        return service.listExpiring(rawDays)
      })
    },
    getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () => service.getById(String(req.params.id)))
    },
    create(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(
        res,
        next,
        () =>
          service.create(
            bodyRecord(req.body) as unknown as CreateVehicleDocumentInput,
            req.usuario?.id ?? '',
          ),
        201,
      )
    },
    update(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () =>
        service.updateDocument(
          String(req.params.id),
          bodyRecord(req.body) as unknown as UpdateVehicleDocumentInput,
          req.usuario?.id ?? '',
        ),
      )
    },
    annul(req: Request, res: Response, next: NextFunction): Promise<void> {
      return respond(res, next, () =>
        service.annul(
          String(req.params.id),
          bodyRecord(req.body) as unknown as AnnulVehicleDocumentInput,
          req.usuario?.id ?? '',
        ),
      )
    },
  }
}
