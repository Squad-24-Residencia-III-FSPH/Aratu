import { Router } from 'express'
import { createVehiclesController } from '../controllers/vehicles.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { VehiclesService } from '../services/vehicles.service'

const READ_ROLES = ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'] as const
const WRITE_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const

/** Cria rotas REST de veículos protegidas por autenticação JWT e RBAC. */
export function createVehiclesRouter(service: VehiclesService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createVehiclesController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeRead = authorizeRoles(READ_ROLES)
  const authorizeWrite = authorizeRoles(WRITE_ROLES)

  router.get('/', authenticate, authorizeRead, controller.list)
  router.get('/:id', authenticate, authorizeRead, controller.getById)
  router.post('/', authenticate, authorizeWrite, controller.create)
  router.put('/:id', authenticate, authorizeWrite, controller.update)
  router.patch('/:id/status', authenticate, authorizeWrite, controller.changeStatus)

  return router
}
