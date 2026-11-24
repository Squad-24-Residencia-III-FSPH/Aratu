import type { Request, Response } from 'express'
import type { SvoTeamsService } from '../services/svo-teams.service'

export function createSvoTeamsController(service: SvoTeamsService) {
  return {
    async list(req: Request, res: Response): Promise<void> { res.json(await service.listTeams(req.usuario!.id)) },
    async eligibleMembers(req: Request, res: Response): Promise<void> { res.json(await service.listEligibleMembers(req.usuario!.id)) },
    async create(req: Request, res: Response): Promise<void> { res.status(201).json(await service.createTeam(req.body, req.usuario!.id)) },
    async update(req: Request, res: Response): Promise<void> { res.json(await service.updateTeam(req.params.id, req.body, req.usuario!.id)) },
    async addMember(req: Request, res: Response): Promise<void> { res.json(await service.addMember(req.params.id, req.body, req.usuario!.id)) },
    async removeMember(req: Request, res: Response): Promise<void> { res.json(await service.removeMember(req.params.id, req.params.userId, req.body, req.usuario!.id)) },
    async createShift(req: Request, res: Response): Promise<void> { res.status(201).json(await service.createShift(req.params.id, req.body, req.usuario!.id)) },
    async updateShift(req: Request, res: Response): Promise<void> { res.json(await service.updateShift(req.params.id, req.params.shiftId, req.body, req.usuario!.id)) },
    async cancelShift(req: Request, res: Response): Promise<void> { res.json(await service.cancelShift(req.params.id, req.params.shiftId, req.body, req.usuario!.id)) },
  }
}
