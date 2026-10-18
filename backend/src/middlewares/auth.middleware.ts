import jwt = require('jsonwebtoken')
import type { NextFunction, Request, Response } from 'express'
import { USER_ROLES } from '../types/auth'
import type { AuthenticatedUser } from '../types/auth'

/**
 * Predicado de tipo para validação em tempo de execução das claims contidas no payload do token JWT.
 *
 * @param value - Valor decodificado pela biblioteca jsonwebtoken.
 * @returns `true` se o valor contiver `id` não vazio e um perfil RBAC válido do sistema Aratu.
 */
function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return typeof payload.id === 'string'
    && payload.id.length > 0
    && USER_ROLES.some((perfil) => perfil === payload.perfil)
}

/**
 * Middleware que intercepta requisições HTTP exigindo token JWT Bearer válido.
 *
 * Extrai o token do cabeçalho `Authorization`, valida a assinatura criptográfica HS256,
 * verifica a expiração da sessão e checa se o payload contém um perfil RBAC reconhecido.
 * Injeta o payload validado em `req.usuario` para consumo nos controllers e middlewares seguintes.
 *
 * @param secret - Chave secreta compartilhada para validação da assinatura do JWT.
 * @returns Middleware Express pronto para encadeamento em rotas protegidas.
 * @remarks Retorna HTTP 401 se o cabeçalho estiver ausente, se a assinatura for inválida ou se o token estiver expirado.
 */
export function createAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authorization = req.get('authorization')
    const match = authorization?.match(/^Bearer\s+(\S+)$/i)
    const token = match?.[1]
    if (!token) {
      res.status(401).json({ erro: 'Autenticação necessária.' })
      return
    }

    let payload: unknown
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    } catch {
      res.status(401).json({ erro: 'Token inválido ou expirado.' })
      return
    }

    if (!isAuthenticatedUser(payload)) {
      res.status(401).json({ erro: 'Token inválido.' })
      return
    }
    req.usuario = { id: payload.id, perfil: payload.perfil }
    next()
  }
}
