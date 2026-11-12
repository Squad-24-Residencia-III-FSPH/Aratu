import { Router } from 'express'
import { createRequestDecisionsController } from '../controllers/request-decisions.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { RequestDecisionsService } from '../services/request-decisions.service'

const DECISION_ROLES = ['GESTOR'] as const

/**
 * Cria as rotas de análise de solicitações (exclusivas do GESTOR).
 *
 * Os middlewares ficam em cada rota, não em `router.use`, porque este router divide o prefixo
 * `/requests` com as rotas de consulta, que aceitam outros perfis.
 */
export function createRequestDecisionsRouter(service: RequestDecisionsService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createRequestDecisionsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeDecision = authorizeRoles(DECISION_ROLES)

  router.post('/:id/approve', authenticate, authorizeDecision, controller.approve)
  router.post('/:id/reject', authenticate, authorizeDecision, controller.reject)

  return router
}
