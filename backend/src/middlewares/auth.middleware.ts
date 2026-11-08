import jwt = require('jsonwebtoken')
import type { NextFunction, Request, Response } from 'express'
import { USER_ROLES } from '../types/auth'
import type { AuthenticatedUser } from '../types/auth'
import type { UsersRepositoryContract } from '../repositories/users.repository'

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

/**
 * Revalida a conta antes do RBAC para revogar tokens de contas inativas ou com perfil alterado.
 * @param users - Consulta ao cadastro atual, sem confiar no perfil histórico do token.
 * @returns Middleware a encadear após o JWT; falhas de persistência seguem ao Express 5.
 */
export function createCurrentUserMiddleware(users: Pick<UsersRepositoryContract, 'findById'>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario || !/^[1-9]\d*$/.test(req.usuario.id)
      || BigInt(req.usuario.id) > 9223372036854775807n) {
      res.status(401).json({ erro: 'Autenticação necessária.' })
      return
    }
    const user = await users.findById(req.usuario.id)
    if (!user?.active) {
      res.status(401).json({ erro: 'Sua conta não está ativa. Entre novamente ou procure a administração.' })
      return
    }
    req.usuario = { id: user.id, perfil: user.role }
    next()
  }
}
