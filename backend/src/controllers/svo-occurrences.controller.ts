import type { Request, Response } from 'express'
import type { SvoOccurrencesService } from '../services/svo-occurrences.service'

/** Traduz a borda HTTP; falhas seguem ao handler sanitizado do módulo. */
export function createSvoOccurrencesController(service: SvoOccurrencesService) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      res.status(201).json(await service.createOccurrence(req.body, req.usuario!.id))
    },
    async list(req: Request, res: Response): Promise<void> {
      res.json(await service.listOccurrences(req.query))
    },
    async detail(req: Request, res: Response): Promise<void> {
      res.json(await service.getOccurrence(req.params.id))
    },
    async confirm(req: Request, res: Response): Promise<void> {
      res.json(await service.confirmOccurrence(req.params.id, req.body, req.usuario!.id))
    },
  }
}
