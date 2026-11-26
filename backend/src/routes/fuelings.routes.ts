import { Router } from 'express'
import { createFuelingsController } from '../controllers/fuelings.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { FuelingsService } from '../services/fuelings.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Exige grants separados para consultar fatos e registrar suas retificações. */
export function createFuelingsRouter(
  service: FuelingsService,
  config: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createFuelingsController(service)
  const authenticate = createAuthMiddleware(config.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('fuelings:read'), controller.list)
  router.get('/:id', authenticate, currentUser, authorizePermissions('fuelings:read'), controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('fuelings:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('fuelings:rectify'), controller.rectify)
  return router
}
