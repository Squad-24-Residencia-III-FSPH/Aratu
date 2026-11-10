import { Router } from 'express'
import { createTripsController } from '../controllers/trips.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { TripsService } from '../services/trips.service'

const SCHEDULING_ROLES = ['GESTOR'] as const
const EXECUTION_ROLES = ['MOTORISTA'] as const

/** Cria as rotas de viagens: agendar, conferir e confirmar é do GESTOR; executar e consultar as próprias viagens é do MOTORISTA. */
export function createTripsRouter(service: TripsService, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createTripsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const authorizeScheduling = authorizeRoles(SCHEDULING_ROLES)
  const authorizeExecution = authorizeRoles(EXECUTION_ROLES)

  router.post('/', authenticate, authorizeScheduling, controller.schedule)
  router.get('/', authenticate, authorizeScheduling, controller.list)
  router.post('/:id/confirm', authenticate, authorizeScheduling, controller.confirm)
  router.get('/mine', authenticate, authorizeExecution, controller.listMine)
  router.post('/:id/start', authenticate, authorizeExecution, controller.start)
  router.post('/:id/finish', authenticate, authorizeExecution, controller.finish)

  return router
}
