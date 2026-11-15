import type { Request, Response } from 'express'
import type { SvoOrdersService } from '../services/svo-orders.service'

export function createSvoOrdersController(service: SvoOrdersService) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      res.status(201).json(await service.createOrder(req.body, req.usuario!.id))
    },
  }
}
