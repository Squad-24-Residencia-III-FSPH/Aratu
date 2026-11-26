import { Router } from 'express'
import { createVehiclesController } from '../controllers/vehicles.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { VehiclesService } from '../services/vehicles.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Cria rotas REST de veículos protegidas por autenticação JWT e RBAC. */
export function createVehiclesRouter(
  service: VehiclesService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createVehiclesController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  const authorizeRead = authorizePermissions('vehicles:read')
  const authorizeHistoryRead = authorizePermissions(['audit:history:read', 'vehicles:history:read', 'vehicles:read'])
  const authorizeStatus = authorizePermissions(['vehicles:status:change', 'vehicles:archive'], 'any')

  router.get('/', authenticate, currentUser, authorizeRead, controller.list)
  router.get('/:id', authenticate, currentUser, authorizeRead, controller.getById)
  router.get('/:id/history', authenticate, currentUser, authorizeHistoryRead, controller.history)
  router.post('/', authenticate, currentUser, authorizePermissions('vehicles:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('vehicles:update'), controller.update)
  router.patch('/:id/status', authenticate, currentUser, authorizeStatus, controller.changeStatus)

  return router
}
