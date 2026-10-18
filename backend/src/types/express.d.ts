import type { AuthenticatedUser } from './auth'

declare global {
  namespace Express {
    /**
     * Extensão da interface Request do Express para inclusão de claims de autenticação.
     */
    interface Request {
      /** Dados do usuário autenticado validados e injetados pelo middleware de autenticação JWT. */
      usuario?: AuthenticatedUser
    }
  }
}

export {}
