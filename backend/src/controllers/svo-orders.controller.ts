import type { Request, Response } from 'express'
import type { SvoOrdersService } from '../services/svo-orders.service'

export function createSvoOrdersController(service: SvoOrdersService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      res.json(await service.listOrders(req.query, req.usuario!.id))
    },
    async detail(req: Request, res: Response): Promise<void> {
      res.json(await service.getOrder(req.params.id, req.usuario!.id))
    },
    async updateStatus(req: Request, res: Response): Promise<void> {
      res.json(await service.updateStatus(req.params.id, req.body, req.usuario!.id))
    },
    async recordResult(req: Request, res: Response): Promise<void> {
      res.json(await service.recordResult(req.params.id, req.body, req.usuario!.id))
    },
    async create(req: Request, res: Response): Promise<void> {
      res.status(201).json(await service.createOrder(req.body, req.usuario!.id))
    },
    async retryDispatch(req: Request, res: Response): Promise<void> {
      res.json(await service.retryDispatch(req.params.occurrenceId, req.body, req.usuario!.id))
    },
  }
}
