import { Router } from 'express'
import { createAvailabilityController } from '../controllers/availability.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { AvailabilityService } from '../services/availability.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/**
 * Cria as consultas `GET /vehicles/available` e `GET /drivers/available`.
 *
 * Deve ser montado em `app` antes dos routers de `/vehicles` e `/drivers`, cujo `GET /:id`
 * capturaria o segmento `available`.
 */
export function createAvailabilityRouter(
  service: AvailabilityService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createAvailabilityController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)
  const authorize = authorizePermissions('trips:availability:read')

  router.get('/vehicles/available', authenticate, currentUser, authorize, controller.listVehicles)
  router.get('/drivers/available', authenticate, currentUser, authorize, controller.listDrivers)

  return router
}
