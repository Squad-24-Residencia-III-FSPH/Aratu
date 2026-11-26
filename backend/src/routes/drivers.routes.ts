import { Router } from 'express'
import { createDriversController } from '../controllers/drivers.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { DriversService } from '../services/drivers.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Cria rotas de motoristas sob grants explícitos de consulta e manutenção. */
export function createDriversRouter(
  service: DriversService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createDriversController(service)

  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('drivers:read'), controller.list)
  router.get('/:id', authenticate, currentUser, authorizePermissions('drivers:read'), controller.getById)
  router.get('/:id/history', authenticate, currentUser,
    authorizePermissions(['audit:history:read', 'drivers:history:read', 'drivers:read']), controller.history)
  router.post('/', authenticate, currentUser, authorizePermissions('drivers:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('drivers:update'), controller.update)
  router.patch('/:id/status', authenticate, currentUser,
    authorizePermissions(['drivers:status:change', 'drivers:archive'], 'any'), controller.changeStatus)

  return router
}
