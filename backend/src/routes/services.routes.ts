import { Router } from 'express'
import { createServicesController } from '../controllers/services.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import { SERVICE_MANAGER_ROLES, SERVICE_READER_ROLES } from '../types/fleet-service.types'
import type { FleetServicesService } from '../services/fleet-services.service'

/** Cria rotas REST de tipos de serviço: leitura para quem solicita viagens, escrita para GESTOR e ADMINISTRADOR. */
export function createServicesRouter(service: FleetServicesService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createServicesController(service)
  const authorizeWrite = authorizeRoles(SERVICE_MANAGER_ROLES)

  router.use(createAuthMiddleware(jwtConfig.secret), authorizeRoles(SERVICE_READER_ROLES))

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', authorizeWrite, controller.create)
  router.put('/:id', authorizeWrite, controller.update)
  router.patch('/:id/activate', authorizeWrite, controller.activate)
  router.patch('/:id/deactivate', authorizeWrite, controller.deactivate)

  return router
}
