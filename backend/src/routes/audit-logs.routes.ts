import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { createAuditLogsController } from '../controllers/audit-logs.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { hasPermission, authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { AuditEntityType } from '../types/audit-log.types'
import type { AuditLogsService } from '../services/audit-logs.service'
import type { JwtConfig } from '../types/auth'

const DOMAIN_HISTORY_PERMISSIONS: Readonly<Partial<Record<AuditEntityType, readonly string[]>>> = {
  vehicle: ['vehicles:read', 'vehicles:history:read'],
  driver: ['drivers:read', 'drivers:history:read'],
  service: ['services:read', 'services:history:read'],
  'maintenance-order': ['maintenance:read'],
  fueling: ['fuelings:read'],
  fine: ['fines:read'],
  'vehicle-document': ['vehicle-documents:read'],
  'svo-occurrence': ['svo:occurrences:read'],
  trip: ['trips:read:assigned', 'trips:read:all'],
  'svo-order': ['svo:orders:read:assigned', 'svo:orders:read:all'],
  'svo-team': ['svo:teams:read'],
  user: ['users:read'],
  profile: ['profiles:read'],
}

function authorizeHistoryDomain(req: Request, res: Response, next: NextFunction): void {
  if (!hasPermission(req.usuario, 'audit:history:read')) {
    res.status(403).json({ erro: 'Acesso negado: seu perfil não pode consultar o histórico central.' })
    return
  }

  const entityType = req.params.entityType as AuditEntityType
  if (entityType === 'trip-request') {
    const own = hasPermission(req.usuario, 'requests:history:read:own')
      && hasPermission(req.usuario, 'requests:read:own')
    const all = hasPermission(req.usuario, 'requests:history:read:all')
      && hasPermission(req.usuario, 'requests:read:all')
    if (!own && !all) {
      res.status(403).json({ erro: 'Acesso negado: seu perfil não pode consultar este histórico de solicitações.' })
      return
    }
    next()
    return
  }

  const required = DOMAIN_HISTORY_PERMISSIONS[entityType]
  if (!required) {
    next()
    return
  }
  if (entityType === 'trip' || entityType === 'svo-order') {
    if (!required.some((permission) => hasPermission(req.usuario, permission))) {
      res.status(403).json({ erro: 'Acesso negado: seu perfil não pode consultar este histórico.' })
      return
    }
    next()
    return
  }
  if (!required.every((permission) => hasPermission(req.usuario, permission))) {
    res.status(403).json({ erro: 'Acesso negado: seu perfil não pode consultar este histórico.' })
    return
  }
  next()
}

/** Consulta a auditoria geral e delega escopos de histórico ao domínio correspondente. */
export function createAuditLogsRouter(service: AuditLogsService, jwtConfig: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createAuditLogsController(service)
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const currentUser = createCurrentUserMiddleware(users)

  router.use(authenticate, currentUser)
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', authorizePermissions('audit:read'), controller.list)
  router.get('/records/:entityType/:recordId/history', authorizeHistoryDomain, controller.recordHistory)
  return router
}
