import { Router } from 'express'
import { createAuthController } from '../controllers/auth.controller'
import { createAuthMiddleware } from '../middlewares/auth.middleware'
import type { JwtConfig } from '../types/auth'
import { AuthService } from '../services/auth.service'
import type { UserRepository } from '../repositories/users.repository'

export function createAuthRouter(users: UserRepository, jwtConfig: JwtConfig): Router {
  const router = Router()
  const controller = createAuthController(new AuthService(users, jwtConfig))
  const authenticate = createAuthMiddleware(jwtConfig.secret)

  router.post('/login', controller.login)
  router.post('/logout', authenticate, (_req, res) => {
    res.status(200).json({ mensagem: 'Logout realizado. Apague o token armazenado no cliente.' })
  })

  return router
}
