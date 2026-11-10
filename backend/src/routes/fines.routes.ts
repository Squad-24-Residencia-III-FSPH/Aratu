import { Router } from 'express'
import { createFinesController } from '../controllers/fines.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { FinesService } from '../services/fines.service'
import type { JwtConfig } from '../types/auth'

/** Restringe todas as operações à conta atual de gestor/administrador, antes de validar o domínio. */
export function createFinesRouter(service: FinesService, jwt: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createFinesController(service)
  router.use(createAuthMiddleware(jwt.secret), createCurrentUserMiddleware(users), authorizeRoles(['GESTOR', 'ADMINISTRADOR']))
  router.get('/', controller.list)
  router.get('/driver-suggestions', controller.suggestDrivers)
  router.get('/:id', controller.getById)
  router.post('/', controller.create)
  router.put('/:id', controller.update)
  router.patch('/:id/status', controller.changeStatus)
  return router
}
