import { Router } from 'express'
import { createVehiclesController } from '../controllers/vehicles.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { VehiclesService } from '../services/vehicles.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

const READ_ROLES = ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'] as const
const WRITE_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const
const HISTORY_READ_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const

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
  const authorizeRead = authorizeRoles(READ_ROLES)
  const authorizeWrite = authorizeRoles(WRITE_ROLES)
  const authorizeHistoryRead = authorizeRoles(HISTORY_READ_ROLES)

  router.get('/', authenticate, currentUser, authorizeRead, controller.list)
  router.get('/:id', authenticate, currentUser, authorizeRead, controller.getById)
  router.get('/:id/history', authenticate, currentUser, authorizeHistoryRead, controller.history)
  router.post('/', authenticate, currentUser, authorizeWrite, controller.create)
  router.put('/:id', authenticate, currentUser, authorizeWrite, controller.update)
  router.patch('/:id/status', authenticate, currentUser, authorizeWrite, controller.changeStatus)

  return router
}
