import { Router } from 'express'
import { createMaintenanceOrdersController } from '../controllers/maintenance-orders.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { MaintenanceOrdersService } from '../services/maintenance-orders.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Exige concessões explícitas de leitura, registro, edição e encerramento. */
export function createMaintenanceOrdersRouter(
  service: MaintenanceOrdersService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createMaintenanceOrdersController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('maintenance:read'), controller.list)
  router.get('/:id', authenticate, currentUser, authorizePermissions('maintenance:read'), controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('maintenance:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('maintenance:update'), controller.update)
  router.patch('/:id/close', authenticate, currentUser, authorizePermissions('maintenance:close'), controller.close)
  return router
}
