import { Router } from 'express'
import { createUsersController } from '../controllers/users.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { UsersService } from '../services/users.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Cria rotas REST de usuários protegidas pelas concessões atuais do perfil. */
export function createUsersRouter(
  service: UsersService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createUsersController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('users:read'), controller.list)
  router.get('/:id', authenticate, currentUser, authorizePermissions('users:read'), controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('users:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('users:update'), controller.update)
  router.patch('/:id/deactivate', authenticate, currentUser, authorizePermissions('users:archive'), controller.deactivate)
  router.patch('/:id/activate', authenticate, currentUser, authorizePermissions('users:archive'), controller.activate)

  return router
}
