import { Router } from 'express'
import { createTripsController } from '../controllers/trips.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { TripsService } from '../services/trips.service'

const SCHEDULING_ROLES = ['GESTOR'] as const

/** Cria as rotas de viagens; agendar é exclusivo do GESTOR. */
export function createTripsRouter(service: TripsService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createTripsController(service)

  router.post('/', createAuthMiddleware(jwtConfig.secret), authorizeRoles(SCHEDULING_ROLES), controller.schedule)

  return router
}
