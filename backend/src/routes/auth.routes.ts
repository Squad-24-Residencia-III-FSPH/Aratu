import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { createAuthController } from '../controllers/auth.controller'
import { createAuthMiddleware, createCurrentUserMiddleware } from '../middlewares/auth.middleware'
import type { JwtConfig } from '../types/auth'
import type { AuditLogger } from '../types/audit.types'
import { AuthService } from '../services/auth.service'
import type { UserRepository, UsersRepositoryContract } from '../repositories/users.repository'

/**
 * Cria o roteador Express com os endpoints de autenticação (`/auth/login`, `/auth/logout` e `/auth/me`).
 *
 * Encadeia middlewares de segurança (autenticação JWT e revalidação de conta ativa em `/auth/me`)
 * e vincula as requisições aos métodos correspondentes do controlador.
 *
 * @param users - Repositório para consulta de credenciais e status cadastral de usuários.
 * @param jwtConfig - Configurações de expiração e segredo dos tokens JWT.
 * @param auditLogger - Logger opcional para registro da trilha de auditoria em `audit.logs`.
 * @returns Instância do Router configurado com as rotas de autenticação.
 */
export function createAuthRouter(
  users: UserRepository & Partial<Pick<UsersRepositoryContract, 'findById'>>,
  jwtConfig: JwtConfig,
  auditLogger?: AuditLogger,
  currentUsers?: Pick<UsersRepositoryContract, 'findById'>,
): Router {
  const router = Router()
  const controller = createAuthController(new AuthService(users, jwtConfig, auditLogger))
  const authenticate = createAuthMiddleware(jwtConfig.secret)
  const resolvedCurrentUsers = currentUsers ?? (typeof users.findById === 'function'
    ? { findById: users.findById.bind(users) }
    : undefined)
  const currentUser = resolvedCurrentUsers
    ? createCurrentUserMiddleware(resolvedCurrentUsers)
    : undefined
  const meFallback = (_req: Request, res: Response, _next: NextFunction): void => {
    res.status(503).json({ erro: 'Serviço temporariamente indisponível.' })
  }

  router.post('/login', controller.login)
  router.post('/logout', authenticate, ...(currentUser ? [currentUser] : []), controller.logout)
  router.get('/me', authenticate, currentUser ?? meFallback, controller.me)

  return router
}
