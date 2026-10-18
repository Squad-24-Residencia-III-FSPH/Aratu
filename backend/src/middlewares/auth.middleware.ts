import jwt = require('jsonwebtoken')
import type { NextFunction, Request, Response } from 'express'
import { USER_ROLES } from '../types/auth'
import type { AuthenticatedUser } from '../types/auth'

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return typeof payload.id === 'string'
    && payload.id.length > 0
    && USER_ROLES.some((perfil) => perfil === payload.perfil)
}

/** Valida o JWT e disponibiliza as claims autorizadas em req.usuario. */
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
