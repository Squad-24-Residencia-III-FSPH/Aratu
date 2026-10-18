import type { Request, Response } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { LoginRequestBody } from '../types/auth'
import { AuthService } from '../services/auth.service'

function isLoginRequestBody(value: unknown): value is LoginRequestBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return typeof body.email === 'string'
    && body.email.trim().length > 0
    && typeof body.senha === 'string'
    && body.senha.length > 0
}

export function createAuthController(authService: AuthService) {
  return {
    login: async (
      req: Request<ParamsDictionary, unknown, unknown>,
      res: Response<unknown>,
    ): Promise<void> => {
      if (!isLoginRequestBody(req.body)) {
        res.status(400).json({ erro: 'Informe um e-mail e uma senha válidos.' })
        return
      }

      const result = await authService.login(req.body.email, req.body.senha)
      if (result.kind === 'invalid-credentials') {
        res.status(401).json({ erro: 'E-mail ou senha inválidos' })
        return
      }
      if (result.kind === 'inactive') {
        res.status(403).json({ erro: 'Acesso desativado' })
        return
      }
      res.status(200).json(result.user)
    },
  }
}
