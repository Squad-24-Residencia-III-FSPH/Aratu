import type { Request, Response } from 'express'
import type { SvoTeamsService } from '../services/svo-teams.service'

function queryInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
}

function currentPermissions(req: Request): readonly string[] {
  return req.usuario?.permissions ?? []
}

export function createSvoTeamsController(service: SvoTeamsService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      res.json(await service.listTeams(req.usuario!.id, currentPermissions(req), {
        view: req.query.view,
        search: req.query.search,
        page: queryInteger(req.query.page),
        pageSize: queryInteger(req.query.pageSize),
      }))
    },
    async eligibleMembers(req: Request, res: Response): Promise<void> {
      res.json(await service.listEligibleMembers(req.usuario!.id, currentPermissions(req)))
    },
    async create(req: Request, res: Response): Promise<void> {
      res.status(201).json(await service.createTeam(req.body, req.usuario!.id, currentPermissions(req)))
    },
    async update(req: Request, res: Response): Promise<void> {
      res.json(await service.updateTeam(req.params.id, req.body, req.usuario!.id, currentPermissions(req)))
    },
    async addMember(req: Request, res: Response): Promise<void> {
      res.json(await service.addMember(req.params.id, req.body, req.usuario!.id, currentPermissions(req)))
    },
    async removeMember(req: Request, res: Response): Promise<void> {
      res.json(await service.removeMember(req.params.id, req.params.userId, req.body, req.usuario!.id, currentPermissions(req)))
    },
    async createShift(req: Request, res: Response): Promise<void> {
      res.status(201).json(await service.createShift(req.params.id, req.body, req.usuario!.id, currentPermissions(req)))
    },
    async updateShift(req: Request, res: Response): Promise<void> {
      res.json(await service.updateShift(req.params.id, req.params.shiftId, req.body, req.usuario!.id, currentPermissions(req)))
    },
    async cancelShift(req: Request, res: Response): Promise<void> {
      res.json(await service.cancelShift(req.params.id, req.params.shiftId, req.body, req.usuario!.id, currentPermissions(req)))
    },
  }
}
