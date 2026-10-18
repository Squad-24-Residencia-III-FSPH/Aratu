import { Router } from 'express'
import { createAuthController } from '../controllers/auth.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import type { JwtConfig } from '../types/auth'
import type { AuditLogger } from '../types/audit.types'
import { AuthService } from '../services/auth.service'
import type { UserRepository } from '../repositories/users.repository'

/**
 * Cria o roteador Express com os endpoints de autenticação (`/auth/login` e `/auth/logout`).
 *
 * Encadeia middlewares de segurança (autenticação JWT em rotas protegidas) e vincula
 * as requisições aos métodos correspondentes do controlador.
 *
 * @param users - Repositório para consulta de credenciais de usuários.
 * @param jwtConfig - Configurações de expiração e segredo dos tokens JWT.
 * @param auditLogger - Logger opcional para registro da trilha de auditoria em `aud_audit`.
 * @returns Instância do Router configurado com as rotas de autenticação.
 */
export function createAuthRouter(
  users: UserRepository,
  jwtConfig: JwtConfig,
  auditLogger?: AuditLogger,
): Router {
  const router = Router()
  const controller = createAuthController(new AuthService(users, jwtConfig, auditLogger))
  const authenticate = createAuthMiddleware(jwtConfig.secret)

  router.post('/login', controller.login)
  router.post('/logout', authenticate, controller.logout)

  return router
}
