import { Router } from 'express'
import { createTripsController } from '../controllers/trips.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { JwtConfig } from '../types/auth'
import type { TripsService } from '../services/trips.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

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
  router.post('/', authenticate, currentUser, authorizePermissions('requests:approve-and-schedule'), controller.schedule)
  router.post('/direct', authenticate, currentUser, authorizePermissions('trips:create-direct'), controller.createDirect)
  router.get('/', authenticate, currentUser, authorizePermissions('trips:read:all'), controller.list)
  router.post('/:id/confirm', authenticate, currentUser, authorizePermissions('trips:confirm'), controller.confirm)
  router.get('/mine', authenticate, currentUser, authorizePermissions('trips:read:assigned'), controller.listMine)
  router.post('/:id/start', authenticate, currentUser, authorizePermissions('trips:execute:assigned'), controller.start)
  router.post('/:id/finish', authenticate, currentUser, authorizePermissions('trips:execute:assigned'), controller.finish)

  return router
}
