import { Router } from 'express'
import { createUsersController } from '../controllers/users.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { UsersService } from '../services/users.service'

const ADMIN_ROLES = ['ADMINISTRADOR'] as const

/** Cria rotas REST de gerenciamento de usuários protegidas por JWT e RBAC administrativo. */
export function createUsersRouter(service: UsersService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createUsersController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeAdmin = authorizeRoles(ADMIN_ROLES)

  router.use(authenticate, authorizeAdmin)

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/deactivate', controller.deactivate)
  router.patch('/:id/activate', controller.activate)

  return router
}
