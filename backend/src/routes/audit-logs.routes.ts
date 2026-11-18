import { Router } from 'express'
import { createAuditLogsController } from '../controllers/audit-logs.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { AuditLogsService } from '../services/audit-logs.service'
import type { JwtConfig } from '../types/auth'

/** Exige conta ativa e perfil atual autorizado para consultar a trilha. */
export function createAuditLogsRouter(service: AuditLogsService, config: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  router.get('/', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() },
    createAuthMiddleware(config.secret), createCurrentUserMiddleware(users),
    authorizeRoles(['GESTOR', 'ADMINISTRADOR']), createAuditLogsController(service))
  return router
}
