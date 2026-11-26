import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { createSvoTeamsController } from '../controllers/svo-teams.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { SvoTeamsService } from '../services/svo-teams.service'
import type { JwtConfig } from '../types/auth'
import { SvoTeamServiceError } from '../types/svo-team.types'

const STATUS = { INVALID_INPUT: 400, ACCOUNT_UNAVAILABLE: 401, ACCESS_DENIED: 403, NOT_FOUND: 404, CONFLICT: 409 } as const
export function createSvoTeamsRouter(service: SvoTeamsService, jwt: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const authenticate = createAuthMiddleware(jwt.secret)
  const currentUser = createCurrentUserMiddleware(users)
  const controller = createSvoTeamsController(service)
  router.get('/eligible-members', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.eligibleMembers)
  router.get('/', authenticate, currentUser, authorizePermissions('svo:teams:read'), controller.list)
  router.post('/', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.update)
  router.post('/:id/members', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.addMember)
  router.delete('/:id/members/:userId', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.removeMember)
  router.post('/:id/shifts', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.createShift)
  router.put('/:id/shifts/:shiftId', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.updateShift)
  router.patch('/:id/shifts/:shiftId/cancel', authenticate, currentUser, authorizePermissions('svo:teams:manage'), controller.cancelShift)
  return router
}

export function svoTeamsErrorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) { res.end(); return }
  if (error instanceof SvoTeamServiceError) {
    res.status(STATUS[error.code]).json({ erro: error.message })
    return
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ erro: 'O corpo da requisição deve conter JSON válido.' })
    return
  }
  console.error({ code: 'SVO_TEAMS_OPERATION_FAILED', time: new Date().toISOString() })
  res.status(500).json({ erro: 'Não foi possível concluir a alteração de equipes SVO. Atualize os dados antes de tentar novamente.' })
}
