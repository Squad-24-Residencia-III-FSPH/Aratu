import { Router } from 'express'
import { createRequestsController } from '../controllers/requests.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { RequestsService } from '../services/requests.service'
import type { JwtConfig } from '../types/auth'

const REQUEST_CREATION_ROLES = ['SOLICITANTE'] as const
const REQUEST_READ_ROLES = ['SOLICITANTE', 'GESTOR', 'ADMINISTRADOR'] as const

/** Monta a rota protegida e revalida o perfil atual antes de criar solicitações de viagem. */
export function createRequestsRouter(
  service: RequestsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createRequestsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizeRoles(REQUEST_READ_ROLES), controller.list)
  router.get('/:id', authenticate, currentUser, authorizeRoles(REQUEST_READ_ROLES), controller.getById)
  router.post(
    '/',
    authenticate,
    currentUser,
    authorizeRoles(REQUEST_CREATION_ROLES),
    controller.create,
  )
  return router
}
