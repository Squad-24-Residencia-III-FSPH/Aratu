import { Router } from 'express'
import { createProfileController } from '../controllers/profile.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { ProfileServiceContract } from '../services/profile.service'
import type { UsersRepositoryContract } from '../repositories/users.repository'

/** Monta consulta, catálogo e mutações auditáveis de perfis sob grants atuais do servidor. */
export function createProfileRouter(
  profileService: ProfileServiceContract,
  jwtSecret: string,
  users?: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createProfileController(profileService)
  const authenticate = createAuthMiddleware(jwtSecret)
  const currentUser = users ? createCurrentUserMiddleware(users) : undefined
  const chain = [authenticate, ...(currentUser ? [currentUser] : [])]

  router.get('/permissions', ...chain, authorizePermissions('permissions:catalog:read'), controller.permissions)
  router.get('/:id', ...chain, authorizePermissions('profiles:read'), controller.detail)
  router.get('/', ...chain, authorizePermissions('profiles:read'), controller.list)
  router.post('/', ...chain, authorizePermissions('profiles:manage'), controller.create)
  router.put('/:id', ...chain, authorizePermissions('profiles:manage'), controller.update)
  router.patch('/:id/deactivate', ...chain, authorizePermissions('profiles:manage'), (req, res) => controller.setActive(req, res, false))
  router.patch('/:id/activate', ...chain, authorizePermissions('profiles:manage'), (req, res) => controller.setActive(req, res, true))

  return router
}
