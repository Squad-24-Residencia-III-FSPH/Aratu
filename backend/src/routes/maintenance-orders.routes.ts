import { Router } from 'express'
import { createMaintenanceOrdersController } from '../controllers/maintenance-orders.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { MaintenanceOrdersService } from '../services/maintenance-orders.service'

/** Restringe as cinco operações ao gestor e administrador, inclusive consultas. */
export function createMaintenanceOrdersRouter(service: MaintenanceOrdersService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createMaintenanceOrdersController(service)
  router.use(createAuthMiddleware(jwtConfig.secret), authorizeRoles(['GESTOR', 'ADMINISTRADOR']))
  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/close', controller.close)
  return router
}
