import { createContext } from 'react'
import type { AuthSession, LoginCredentials, SignInOptions } from './types'
import type { ApiRequest } from '../api/client'

export interface AuthContextValue {
  session: AuthSession | null
  signIn: (credentials: LoginCredentials, options?: SignInOptions) => Promise<void>
  renewSession: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  api: ApiRequest
  notice: string
  authorizationLoading: boolean
  authorizationError: string
  refreshAuthorization: () => void
  renewalPrompt: boolean
  renewalPending: boolean
  renewalError: string
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
