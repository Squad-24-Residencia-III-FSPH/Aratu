import { Router } from 'express'
import { createAvailabilityController } from '../controllers/availability.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { AvailabilityService } from '../services/availability.service'

const AVAILABILITY_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const

/**
 * Cria as consultas `GET /vehicles/available` e `GET /drivers/available`.
 *
 * Deve ser montado em `app` antes dos routers de `/vehicles` e `/drivers`, cujo `GET /:id`
 * capturaria o segmento `available`.
 */
export function createAvailabilityRouter(service: AvailabilityService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createAvailabilityController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorize = authorizeRoles(AVAILABILITY_ROLES)

  router.get('/vehicles/available', authenticate, authorize, controller.listVehicles)
  router.get('/drivers/available', authenticate, authorize, controller.listDrivers)

  return router
}
