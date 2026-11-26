import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { createSvoOrdersController } from '../controllers/svo-orders.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import { authorizePermissions } from '../middlewares/rbac.middleware'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import type { SvoOrdersService } from '../services/svo-orders.service'
import type { JwtConfig } from '../types/auth'
import { SvoOrderServiceError } from '../types/svo-order.types'
import type { SvoOrderErrorCode } from '../types/svo-order.types'

const ERROR_STATUS: Record<SvoOrderErrorCode, number> = {
  INVALID_INPUT: 400, ACCOUNT_UNAVAILABLE: 401, ACCESS_DENIED: 403, NOT_FOUND: 404,
  OCCURRENCE_NOT_CONFIRMED: 400, ORDER_ALREADY_EXISTS: 409, TEAM_UNAVAILABLE: 409,
  VEHICLE_UNAVAILABLE: 409, CAPACITY_EXCEEDED: 409, INVALID_TRANSITION: 409,
  NO_TEAM: 409, NO_VEHICLE: 409, CONFLICT: 409, DISPATCH_NOT_REQUESTED: 409,
}

/** Usa o perfil cadastral atual antes de permitir acesso aos dados restritos do SVO. */
export function createSvoOrdersRouter(service: SvoOrdersService, jwt: JwtConfig, users: Pick<UsersRepositoryContract, 'findById'>): Router {
  const router = Router()
  router.use(createAuthMiddleware(jwt.secret), createCurrentUserMiddleware(users))
  const controller = createSvoOrdersController(service)
  const readOrders = authorizePermissions(['svo:orders:read:assigned', 'svo:orders:read:all'], 'any')
  router.get('/', readOrders, controller.list)
  router.get('/:id', readOrders, controller.detail)
  router.patch('/:id/status', authorizePermissions('svo:orders:update:assigned'), controller.updateStatus)
  router.post('/:id/result', authorizePermissions('svo:orders:result:assigned'), controller.recordResult)
  router.post('/dispatch/:occurrenceId', authorizePermissions('svo:orders:manage'), controller.retryDispatch)
  router.post('/', authorizePermissions('svo:orders:manage'), controller.create)
  return router
}

/** Sanitiza inclusive falhas do parser, sem copiar corpo, token ou diagnóstico SQL para logs. */
export function svoOrderErrorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) { res.end(); return }
  if (error instanceof SvoOrderServiceError) {
    res.status(ERROR_STATUS[error.code]).json({ erro: error.message })
    return
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ erro: 'O corpo da requisição deve conter JSON válido.' })
    return
  }
  const operation = req.method === 'PATCH' ? 'UPDATE_STATUS'
    : req.method === 'GET' ? 'READ_ORDER'
      : /\/result\/?$/.test(req.path) ? 'RECORD_RESULT' : 'CREATE_ORDER'
  console.error({ code: 'SVO_ORDER_FAILED', operation, time: new Date().toISOString() })
  const message = operation === 'READ_ORDER' ? 'Não foi possível consultar as ordens. Tente novamente.'
    : operation === 'UPDATE_STATUS' ? 'Não foi possível confirmar a atualização da ordem. Consulte a situação antes de tentar novamente.'
      : operation === 'RECORD_RESULT' ? 'Não foi possível confirmar o encerramento da ordem. Consulte a situação antes de tentar novamente.'
        : 'Não foi possível concluir a geração da ordem. Confirme o resultado com a central antes de tentar novamente.'
  res.status(500).json({ erro: message })
}
