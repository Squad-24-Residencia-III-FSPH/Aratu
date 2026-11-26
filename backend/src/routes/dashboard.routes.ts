import { Router } from 'express'
import { createDashboardController } from '../controllers/dashboard.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { DashboardService } from '../services/dashboard.service'
import type { JwtConfig } from '../types/auth'

/** Dashboard gerencial: revalida a conta no banco antes do RBAC, como os relatórios. */
export function createDashboardRouter(service: DashboardService, jwtConfig: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createDashboardController(service)

  router.use(createAuthMiddleware(jwtConfig.secret), createCurrentUserMiddleware(users), authorizePermissions('dashboard:read'))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/summary', controller.summary)
  router.get('/indicators', controller.indicators)

  return router
}
