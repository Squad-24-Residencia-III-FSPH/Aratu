import { Router } from 'express'
import { createDriversController } from '../controllers/drivers.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { DriversService } from '../services/drivers.service'

const DRIVER_MANAGER_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const

/** Cria rotas REST de motoristas; leitura e escrita são exclusivas de GESTOR e ADMINISTRADOR (dados pessoais). */
export function createDriversRouter(service: DriversService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createDriversController(service)

  router.use(createAuthMiddleware(jwtConfig.secret), authorizeRoles(DRIVER_MANAGER_ROLES))

  router.get('/', controller.list)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/status', controller.changeStatus)

  return router
}
