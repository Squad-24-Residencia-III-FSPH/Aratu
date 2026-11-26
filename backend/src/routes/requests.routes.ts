import { Router } from 'express'
import { createRequestsController } from '../controllers/requests.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { RequestsService } from '../services/requests.service'
import type { JwtConfig } from '../types/auth'

/**
 * Monta as rotas protegidas de solicitações de viagem.
 *
 * A criação é exclusiva do Solicitante; a consulta é liberada ao próprio
 * Solicitante, ao Gestor e ao Administrador. Todas revalidam a conta no
 * cadastro atual antes de autorizar, impedindo que um token anterior à
 * desativação ou à troca de perfil conserve acesso.
 */
export function createRequestsRouter(
  service: RequestsService,
  jwtConfig: JwtConfig,
  users: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createRequestsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)

  const requestRead = authorizePermissions(['requests:read:own', 'requests:read:all'], 'any')
  const requestHistoryRead = authorizePermissions(['requests:history:read:own', 'requests:history:read:all'], 'any')
  router.get('/', authenticate, currentUser, requestRead, controller.list)
  router.get('/:id/history', authenticate, currentUser, requestHistoryRead, controller.history)
  router.post('/:id/resubmit', authenticate, currentUser, authorizePermissions('requests:resubmit:own'), controller.resubmit)
  router.get('/:id', authenticate, currentUser, requestRead, controller.getById)
  router.post('/', authenticate, currentUser, authorizePermissions('requests:create'), controller.create)

  return router
}
