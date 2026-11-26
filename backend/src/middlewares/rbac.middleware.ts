import type { Request, Response, NextFunction } from 'express'
import type { UserRole } from '../types/auth'
import type { AuthenticatedUser } from '../types/auth'

/** Verifica uma permissão ativa já carregada do perfil da sessão corrente. */
export function hasPermission(user: AuthenticatedUser | undefined, permission: string): boolean {
  return user?.permissions?.includes(permission) ?? false
}

/** Exige uma ou várias concessões atuais, sem confiar no nome legível do perfil. */
export function authorizePermissions(
  required: string | readonly string[],
  mode: 'any' | 'all' = 'all',
) {
  const permissions = typeof required === 'string' ? [required] : required
  return (req: Request, res: Response, next: NextFunction): void => {
    const granted = permissions.map((permission) => hasPermission(req.usuario, permission))
    const allowed = mode === 'all' ? granted.every(Boolean) : granted.some(Boolean)
    if (!allowed) {
      res.status(403).json({ erro: 'Acesso negado: seu perfil não possui a permissão necessária para esta ação.' })
      return
    }
    next()
  }
}

/**
 * Middleware de autorização que restringe o acesso a rotas específicas com base
 * nos perfis RBAC do Sistema Aratu.
 *
 * Verifica se o perfil do usuário autenticado (injetado em `req.usuario.perfil`
 * pelo middleware de autenticação JWT) está contido na lista de papéis autorizados.
 *
 * @param allowedRoles - Lista de perfis RBAC autorizados a acessar a rota.
 * @returns Middleware Express para encadeamento na definição de rotas (Chain of Responsibility).
 * @remarks Retorna HTTP 403 com mensagem orientadora caso o perfil não seja autorizado.
 */
export function authorizeRoles(allowedRoles: readonly UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.usuario?.perfil as UserRole | undefined

    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        erro: 'Acesso negado: perfil de usuário não autorizado para esta operação.',
      })
      return
    }

    next()
  }
}
