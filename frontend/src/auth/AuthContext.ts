import { createContext } from 'react'
import type { AuthSession, LoginCredentials } from './types'
import type { ApiRequest } from '../api/client'

export interface AuthContextValue {
  session: AuthSession | null
  signIn: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  api: ApiRequest
  notice: string
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
