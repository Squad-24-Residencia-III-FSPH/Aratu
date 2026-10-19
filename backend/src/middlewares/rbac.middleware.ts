import type { Request, Response, NextFunction } from 'express'
import type { UserRole } from '../types/auth'

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
