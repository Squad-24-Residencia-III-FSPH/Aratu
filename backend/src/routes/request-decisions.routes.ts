import { Router } from 'express'
import { createRequestDecisionsController } from '../controllers/request-decisions.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { RequestDecisionsService } from '../services/request-decisions.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/**
 * Cria as rotas de análise de solicitações (exclusivas do GESTOR).
 *
 * Os middlewares ficam em cada rota, não em `router.use`, porque este router divide o prefixo
 * `/requests` com as rotas de consulta, que aceitam outros perfis.
 */
export function createRequestDecisionsRouter(
  service: RequestDecisionsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createRequestDecisionsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.post('/:id/approve', authenticate, currentUser, authorizePermissions('requests:approve-and-schedule'), controller.approve)
  router.post('/:id/reject', authenticate, currentUser, authorizePermissions('requests:reject'), controller.reject)
  router.post('/:id/return', authenticate, currentUser, authorizePermissions('requests:return'), controller.returnForCorrection)

  return router
}
