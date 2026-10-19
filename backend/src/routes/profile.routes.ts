import { Router } from 'express'
import { createProfileController } from '../controllers/profile.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import { authorizeRoles } from '../middlewares/rbac.middleware'
import type { ProfileServiceContract } from '../services/profile.service'

/**
 * Cria o roteador Express com o endpoint de listagem de perfis RBAC.
 *
 * Protege a rota com autenticação JWT e autorização exclusiva para o perfil ADMINISTRADOR,
 * conforme o contrato REST definido na FROTA-37.
 *
 * @param profileService - Serviço de consulta dos perfis RBAC.
 * @param jwtSecret - Segredo para validação do token JWT.
 * @returns Instância do Router configurado com `GET /` (montado em `/profiles`).
 */
export function createProfileRouter(
  profileService: ProfileServiceContract,
  jwtSecret: string,
): Router {
  const router = Router()
  const controller = createProfileController(profileService)
  const authenticate = createAuthMiddleware(jwtSecret)

  router.get(
    '/',
    authenticate,
    authorizeRoles(['ADMINISTRADOR']),
    controller.list,
  )

  return router
}
