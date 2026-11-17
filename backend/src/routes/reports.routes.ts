import { Router } from 'express'
import { createReportsController } from '../controllers/reports.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { ReportsService } from '../services/reports.service'
import type { JwtConfig } from '../types/auth'

/** Revalida a conta antes do RBAC; o service aplica também a permissão específica do relatório. */
export function createReportsRouter(service: ReportsService, config: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createReportsController(service)
  router.use(createAuthMiddleware(config.secret), createCurrentUserMiddleware(users), authorizeRoles(['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO']))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/catalog', controller.catalog)
  router.get('/:reportKey/preview', controller.preview)
  router.get('/:reportKey/export', controller.export)
  return router
}
