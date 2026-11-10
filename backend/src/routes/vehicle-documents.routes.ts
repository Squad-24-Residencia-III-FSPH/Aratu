import { Router } from 'express'
import { createVehicleDocumentsController } from '../controllers/vehicle-documents.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { VehicleDocumentsService } from '../services/vehicle-documents.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import { VEHICLE_DOCUMENT_MANAGER_ROLES } from '../types/vehicle-document.types'

/** Restringe as operações de documentos de veículos aos perfis GESTOR e ADMINISTRADOR. */
export function createVehicleDocumentsRouter(
  service: VehicleDocumentsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createVehicleDocumentsController(service)
  router.use(
    createAuthMiddleware(jwtConfig.secret),
    createCurrentUserMiddleware(users),
    authorizeRoles(VEHICLE_DOCUMENT_MANAGER_ROLES),
  )
  router.get('/', controller.list)
  router.get('/expiring', controller.listExpiring)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/annul', controller.annul)
  return router
}
