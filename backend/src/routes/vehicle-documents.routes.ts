import { Router } from 'express'
import { createVehicleDocumentsController } from '../controllers/vehicle-documents.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { VehicleDocumentsService } from '../services/vehicle-documents.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Restringe as operações de documentos de veículos aos perfis GESTOR e ADMINISTRADOR. */
export function createVehicleDocumentsRouter(
  service: VehicleDocumentsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createVehicleDocumentsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  router.get('/', authenticate, currentUser, authorizePermissions('vehicle-documents:read'), controller.list)
  router.get('/expiring', authenticate, currentUser, authorizePermissions('vehicle-documents:read'), controller.listExpiring)
  router.get('/:id', authenticate, currentUser, authorizePermissions('vehicle-documents:read'), controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('vehicle-documents:create'), controller.create)
  router.put('/:id', authenticate, currentUser, authorizePermissions('vehicle-documents:update'), controller.update)
  router.patch('/:id/annul', authenticate, currentUser, authorizePermissions('vehicle-documents:annul'), controller.annul)
  return router
}
