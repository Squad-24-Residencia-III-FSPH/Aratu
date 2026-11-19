import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { createSvoOccurrencesController } from '../controllers/svo-occurrences.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { SvoOccurrencesService } from '../services/svo-occurrences.service'
import type { JwtConfig } from '../types/auth'
import { SVO_READ_ROLES, SVO_WRITE_ROLES, SvoOccurrenceServiceError } from '../types/svo-occurrence.types'
import type { SvoErrorCode } from '../types/svo-occurrence.types'

const ERROR_STATUS: Record<SvoErrorCode, number> = {
  INVALID_INPUT: 400, ACCOUNT_UNAVAILABLE: 401, ACCESS_DENIED: 403, NOT_FOUND: 404, INVALID_TRANSITION: 409,
}

/** Revalida a conta antes do RBAC, sem conceder privilégios à EQUIPE_SVO. */
export function createSvoOccurrencesRouter(service: SvoOccurrencesService, jwt: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  const controller = createSvoOccurrencesController(service)
  router.use(createAuthMiddleware(jwt.secret), createCurrentUserMiddleware(users))
  router.get('/', authorizeRoles(SVO_READ_ROLES), controller.list)
  router.get('/:id', authorizeRoles(SVO_READ_ROLES), controller.detail)
  router.get('/:id/triage', authorizeRoles(SVO_READ_ROLES), controller.triage)
  router.post('/', authorizeRoles(SVO_WRITE_ROLES), controller.create)
  router.post('/:id/triage', authorizeRoles(SVO_WRITE_ROLES), controller.saveTriage)
  router.post('/:id/confirm', authorizeRoles(SVO_WRITE_ROLES), controller.confirm)
  return router
}

/**
 * Intercepta inclusive erros do parser anterior ao router, sem registrar corpo ou erro SQL bruto.
 * Deve ser montado em app.ts por caminho, antes do handler global.
 */
export function svoErrorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end()
    return
  }
  if (error instanceof SvoOccurrenceServiceError) {
    res.status(ERROR_STATUS[error.code]).json({ erro: error.message })
    return
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ erro: 'O corpo da requisição deve conter JSON válido.' })
    return
  }
  const operation = req.method === 'GET' ? 'READ' : req.route?.path === '/:id/confirm' ? 'CONFIRM' : 'CREATE'
  console.error({ code: 'SVO_OPERATION_FAILED', operation, time: new Date().toISOString() })
  res.status(500).json({ erro: 'Não foi possível concluir a operação. Consulte as solicitações antes de tentar novamente.' })
}
