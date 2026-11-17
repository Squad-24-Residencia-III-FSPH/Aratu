import { parseLoginResponse } from './loginService.ts'
import type { AuthSession } from './types.ts'

export const SESSION_KEY = 'aratu.auth.session'

/** Descarta a cópia legada sem permitir que ela restaure uma sessão encerrada. */
function clearLegacySession(): void {
  try { window.sessionStorage.removeItem(SESSION_KEY) } catch { /* Não é mais fonte de autenticação. */ }
}

/** Restaura somente credenciais válidas da origem, sem renovar a expiração do JWT. */
export function readSession(): AuthSession | null {
  clearLegacySession()
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(SESSION_KEY)
    return stored ? parseLoginResponse(JSON.parse(stored)) : null
  } catch {
    try {
      if (stored && window.localStorage.getItem(SESSION_KEY) === stored) {
        window.localStorage.removeItem(SESSION_KEY)
      }
    } catch { /* Armazenamento indisponível: não autenticar apenas em memória. */ }
    return null
  }
}

/** Persiste apenas o DTO validado, sem senha ou propriedades extras da resposta. */
export function saveSession(session: AuthSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(parseLoginResponse(session)))
  clearLegacySession()
}

/** Não permite que expiração ou 401 de um token anterior apaguem um novo login. */
export function clearSession(expectedToken?: string): boolean {
  clearLegacySession()
  const stored = window.localStorage.getItem(SESSION_KEY)
  if (expectedToken && stored) {
    let data: unknown
    try { data = JSON.parse(stored) } catch { /* Valor corrompido também precisa ser descartado. */ }
    if (data && typeof data === 'object' && 'token' in data && data.token !== expectedToken) return false
  }
  window.localStorage.removeItem(SESSION_KEY)
  return true
}
