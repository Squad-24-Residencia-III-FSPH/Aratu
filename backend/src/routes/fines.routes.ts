import { Router } from 'express'
import { createFinesController } from '../controllers/fines.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { FinesService } from '../services/fines.service'
import type { JwtConfig } from '../types/auth'

/** Exige grants distintos para consulta e mutação do registro de multas. */
export function createFinesRouter(service: FinesService, jwt: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createFinesController(service)
  const authenticate = createAuthMiddleware(jwt.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('fines:read'), controller.list)
  router.get('/driver-suggestions', authenticate, currentUser, authorizePermissions('fines:read'), controller.suggestDrivers)
  router.get('/:id', authenticate, currentUser, authorizePermissions('fines:read'), controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('fines:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('fines:update'), controller.update)
  router.patch('/:id/status', authenticate, currentUser, authorizePermissions('fines:status:change'), controller.changeStatus)
  return router
}
