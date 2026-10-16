import type { AuthenticatedUser } from './auth'

declare global {
  namespace Express {
    interface Request {
      usuario?: AuthenticatedUser
    }
  }
}

export {}
