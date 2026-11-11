import { Router } from 'express'
import { createRequestsController } from '../controllers/requests.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { RequestsService } from '../services/requests.service'
import type { JwtConfig } from '../types/auth'

const REQUEST_CREATION_ROLES = ['SOLICITANTE'] as const

/** Monta a rota protegida e revalida o perfil atual antes de criar solicitações de viagem. */
export function createRequestsRouter(
  service: RequestsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createRequestsController(service)
  router.post(
    '/',
    createAuthMiddleware(jwtConfig.secret),
    createCurrentUserMiddleware(users),
    authorizeRoles(REQUEST_CREATION_ROLES),
    controller.create,
  )
  return router
}
