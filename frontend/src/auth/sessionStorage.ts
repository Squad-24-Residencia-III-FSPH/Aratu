import { parseLoginResponse } from './loginService.ts'
import type { AuthSession } from './types.ts'

export const SESSION_KEY = 'aratu.auth.session'

// Mantém a sessão após atualizar a página, somente nesta aba.
export function readSession(): AuthSession | null {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    return stored ? parseLoginResponse(JSON.parse(stored)) : null
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY)
}
