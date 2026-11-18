import { Router } from 'express'
import { createDashboardController } from '../controllers/dashboard.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { DashboardService } from '../services/dashboard.service'
import { MANAGEMENT_ROLES } from '../services/reports/definitions/report-definition'
import type { JwtConfig } from '../types/auth'

/** Dashboard gerencial: revalida a conta no banco antes do RBAC, como os relatórios. */
export function createDashboardRouter(service: DashboardService, jwtConfig: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createDashboardController(service)

  router.use(createAuthMiddleware(jwtConfig.secret), createCurrentUserMiddleware(users), authorizeRoles(MANAGEMENT_ROLES))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/summary', controller.summary)
  router.get('/indicators', controller.indicators)

  return router
}
