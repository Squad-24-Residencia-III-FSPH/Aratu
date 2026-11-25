import { Router } from 'express'
import { createTripsController } from '../controllers/trips.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { TripsService } from '../services/trips.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

const SCHEDULING_ROLES = ['GESTOR'] as const
const TRIP_READ_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const
const EXECUTION_ROLES = ['MOTORISTA'] as const

/** Cria rotas de viagens: GESTOR opera; GESTOR/ADMINISTRADOR consultam a agenda; MOTORISTA executa as próprias viagens. */
export function createTripsRouter(
  service: TripsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createTripsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  const authorizeScheduling = authorizeRoles(SCHEDULING_ROLES)
  const authorizeTripRead = authorizeRoles(TRIP_READ_ROLES)
  const authorizeExecution = authorizeRoles(EXECUTION_ROLES)

  router.post('/', authenticate, currentUser, authorizeScheduling, controller.schedule)
  router.get('/', authenticate, currentUser, authorizeTripRead, controller.list)
  router.post('/:id/confirm', authenticate, currentUser, authorizeScheduling, controller.confirm)
  router.get('/mine', authenticate, currentUser, authorizeExecution, controller.listMine)
  router.post('/:id/start', authenticate, currentUser, authorizeExecution, controller.start)
  router.post('/:id/finish', authenticate, currentUser, authorizeExecution, controller.finish)

  return router
}
