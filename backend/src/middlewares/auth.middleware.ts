import jwt = require('jsonwebtoken')
import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedUser } from '../types/auth'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import { LEGACY_ROLE_PERMISSIONS } from '../types/permission.types'

/**
 * Predicado de tipo para validação em tempo de execução das claims contidas no payload do token JWT.
 *
 * @param value - Valor decodificado pela biblioteca jsonwebtoken.
 * @returns `true` se o valor contiver um identificador de usuário.
 */
function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return typeof payload.id === 'string'
    && payload.id.length > 0
}

/**
 * Middleware que intercepta requisições HTTP exigindo token JWT Bearer válido.
 *
 * Extrai o token do cabeçalho `Authorization`, valida a assinatura criptográfica HS256,
 * verifica a expiração da sessão e lê somente o identificador imutável da conta.
 * Perfil e permissões são recarregados do PostgreSQL pelo middleware seguinte.
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
    req.usuario = { id: payload.id, perfil: '' }
    next()
  }
}

/**
 * Revalida a conta após a assinatura do JWT, usando o cadastro atual para a autorização.
 *
 * Impede que tokens anteriores à desativação ou à troca de perfil conservem acesso.
 * Deve ser encadeado depois da autenticação JWT e antes dos guards de autorização.
 *
 * @param users - Consulta cadastral sem acesso a credenciais.
 * @returns Middleware que atualiza `req.usuario.perfil` ou responde 401 para conta indisponível.
 * @remarks Falhas de persistência seguem para o tratamento global do Express 5.
 */
export function createCurrentUserMiddleware(
  users: Pick<UsersRepositoryContract, 'findById'>
    & Partial<Pick<UsersRepositoryContract, 'findAuthorizationById'>>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.usuario || !/^[1-9]\d*$/.test(req.usuario.id)
      || BigInt(req.usuario.id) > 9223372036854775807n) {
      res.status(401).json({ erro: 'Autenticação necessária.' })
      return
    }
    if (users.findAuthorizationById) {
      const context = await users.findAuthorizationById(req.usuario.id)
      if (!context?.active || !context.profileActive) {
        res.status(401).json({
          erro: 'Sua conta ou perfil não está ativo. Entre novamente ou procure a administração.',
        })
        return
      }
      req.usuario = {
        id: context.id,
        perfil: context.role,
        roleId: context.roleId,
        displayName: context.displayName,
        roleRevision: context.roleRevision,
        defaultPath: context.defaultPath,
        permissions: context.permissions,
      }
      res.locals.authenticatedUserName = context.name
      res.locals.authenticatedProfileName = context.displayName
      res.locals.authenticatedProfileId = context.roleId
      res.locals.authenticatedProfileRevision = context.roleRevision
      res.locals.authenticatedHomePath = context.defaultPath
      res.locals.authenticatedPermissions = context.permissions
      next()
      return
    }

    const user = await users.findById(req.usuario.id)
    if (!user?.active) {
      res.status(401).json({
        erro: 'Sua conta não está ativa. Entre novamente ou procure a administração.',
      })
      return
    }
    req.usuario = {
      id: user.id,
      perfil: user.role,
      roleId: user.roleId,
      permissions: LEGACY_ROLE_PERMISSIONS[user.role] ?? [],
    }
    res.locals.authenticatedUserName = user.name
    next()
  }
}
