import { Router } from 'express'
import { createUsersController } from '../controllers/users.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { UsersService } from '../services/users.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

const ADMIN_ROLES = ['ADMINISTRADOR'] as const

/** Cria rotas REST de gerenciamento de usuários protegidas por JWT e RBAC administrativo. */
export function createUsersRouter(
  service: UsersService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createUsersController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeAdmin = authorizeRoles(ADMIN_ROLES)

  router.use(authenticate, createCurrentUserMiddleware(users), authorizeAdmin)

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/deactivate', controller.deactivate)
  router.patch('/:id/activate', controller.activate)

  return router
}
