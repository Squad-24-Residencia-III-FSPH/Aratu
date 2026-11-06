import { Router } from 'express'
import { createRequestsController } from '../controllers/requests.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { RequestsService } from '../services/requests.service'

const READ_ROLES = ['SOLICITANTE', 'GESTOR', 'ADMINISTRADOR'] as const

/** Cria rotas REST de consulta de solicitações protegidas por autenticação JWT e RBAC. */
export function createRequestsRouter(service: RequestsService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createRequestsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeRead = authorizeRoles(READ_ROLES)

  router.get('/', authenticate, authorizeRead, controller.list)
  router.get('/:id', authenticate, authorizeRead, controller.getById)

  return router
}
