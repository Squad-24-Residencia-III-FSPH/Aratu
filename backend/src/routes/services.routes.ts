import { Router } from 'express'
import { createServicesController } from '../controllers/services.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { FleetServicesService } from '../services/fleet-services.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Cria rotas REST de tipos de serviço: leitura para quem solicita viagens, escrita para GESTOR e ADMINISTRADOR. */
export function createServicesRouter(
  service: FleetServicesService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createServicesController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('services:read'), controller.list)
  router.get('/:id', authenticate, currentUser, authorizePermissions('services:read'), controller.getById)
  router.get('/:id/vehicles', authenticate, currentUser, authorizePermissions(['services:vehicles:manage', 'vehicles:read']), controller.listVehicles)
  router.post('/', authenticate, currentUser, authorizePermissions('services:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('services:update'), controller.update)
  router.put('/:id/vehicles', authenticate, currentUser, authorizePermissions('services:vehicles:manage'), controller.replaceVehicles)
  router.patch('/:id/activate', authenticate, currentUser, authorizePermissions('services:archive'), controller.activate)
  router.patch('/:id/deactivate', authenticate, currentUser, authorizePermissions('services:archive'), controller.deactivate)

  return router
}
