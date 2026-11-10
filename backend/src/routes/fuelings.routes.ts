import { Router } from 'express'
import { createFuelingsController } from '../controllers/fuelings.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { FuelingsService } from '../services/fuelings.service'

/** Restringe inclusive o histórico aos perfis autorizados antes de consultar os fatos. */
export function createFuelingsRouter(service: FuelingsService, config: JwtConfig): Router {
  const router = Router()
  const controller = createFuelingsController(service)
  router.use(createAuthMiddleware(config.secret), authorizeRoles(['GESTOR', 'ADMINISTRADOR']))
  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.rectify)
  return router
}
