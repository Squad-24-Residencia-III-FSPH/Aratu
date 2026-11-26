import { Router } from 'express'
import { createReportsController } from '../controllers/reports.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { ReportsService } from '../services/reports.service'
import type { JwtConfig } from '../types/auth'

/** Revalida a conta e deixa o service conferir a permissão do relatório e do formato exportado. */
export function createReportsRouter(service: ReportsService, config: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createReportsController(service)
  router.use(createAuthMiddleware(config.secret), createCurrentUserMiddleware(users))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  const canReadReports = authorizePermissions([
    'reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth',
  ], 'any')
  router.get('/catalog', canReadReports, controller.catalog)
  router.get('/:reportKey/preview', canReadReports, controller.preview)
  router.get('/:reportKey/export', canReadReports, controller.export)
  return router
}
