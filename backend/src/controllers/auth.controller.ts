import type { Request, Response } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { LoginRequestBody } from '../types/auth'
import { AuthService } from '../services/auth.service'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isLoginRequestBody(value: unknown): value is LoginRequestBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return typeof body.email === 'string'
    && EMAIL_PATTERN.test(body.email.trim())
    && typeof body.senha === 'string'
    && body.senha.length > 0
}

/**
 * Fábrica de criação do controlador de rotas de autenticação (`/auth`).
 *
 * Realiza o tratamento da borda HTTP: valida a estrutura dos dados recebidos,
 * aciona a camada de domínio (`AuthService`) e retorna status HTTP e mensagens padronizadas.
 *
 * @param authService - Instância do serviço de autenticação de usuários.
 * @returns Objeto com os manipuladores das rotas de login, logout e consulta de sessão atual.
 */
export function createAuthController(authService: AuthService) {
  return {
    /**
     * Manipulador HTTP para login de usuários (`POST /auth/login`).
     *
     * Valida formato básico de e-mail e presença da senha, aciona o serviço e responde
     * com 200 (sucesso), 400 (corpo ou e-mail inválido), 401 (credenciais incorretas)
     * ou 403 (conta desativada).
     */
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
    /**
     * Manipulador HTTP para revalidação da identidade ativa (`GET /auth/me`).
     *
     * Retorna apenas identificador e perfil vigentes do usuário revalidado sem expor credenciais.
     */
    me: async (
      req: Request<ParamsDictionary, unknown, unknown>,
      res: Response<unknown>,
    ): Promise<void> => {
      const current = authService.getCurrentUser(req.usuario)
      if (!current) {
        res.status(401).json({ erro: 'Autenticação necessária.' })
        return
      }
      res.status(200).json(current)
    },
    /**
     * Manipulador HTTP para encerramento de sessão (`POST /auth/logout`).
     *
     * Registra o logout na auditoria via `AuthService` e orienta o cliente a descartar o token JWT.
     */
    logout: async (
      req: Request<ParamsDictionary, unknown, unknown>,
      res: Response<unknown>,
    ): Promise<void> => {
      await authService.logout(req.usuario)
      res.status(200).json({ mensagem: 'Logout realizado. Apague o token armazenado no cliente.' })
    },
  }
}

