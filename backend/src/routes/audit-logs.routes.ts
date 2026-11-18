import { Router } from 'express'
import { createAuditLogsController } from '../controllers/audit-logs.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { AuditLogsService } from '../services/audit-logs.service'
import { MANAGEMENT_ROLES } from '../services/reports/definitions/report-definition'
import type { JwtConfig } from '../types/auth'

/** Consulta de auditoria somente leitura: não há rotas de escrita, então PUT, PATCH e DELETE respondem 404. */
export function createAuditLogsRouter(service: AuditLogsService, jwtConfig: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createAuditLogsController(service)

  router.use(createAuthMiddleware(jwtConfig.secret), createCurrentUserMiddleware(users), authorizeRoles(MANAGEMENT_ROLES))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', controller.list)

  return router
}
