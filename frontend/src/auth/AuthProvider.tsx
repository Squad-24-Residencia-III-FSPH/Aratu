import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import { login } from './loginService'
import { clearSession, readSession, saveSession } from './sessionStorage'
import type { LoginCredentials } from './types'
import { createApiClient } from '../api/client'
import { SESSION_EXPIRED, tokenExpiresAt } from './token'

function initialSession() {
  const storedSession = readSession()
  if (storedSession || !import.meta.env.DEV || new URLSearchParams(window.location.search).get('preview') !== 'gestor') {
    return storedSession
  }

  // Visual-only local preview: the backend still validates every API request.
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ id: 'local-preview', role: 'GESTOR', exp: Math.floor(Date.now() / 1000) + 3600 })
  return { token: `${header}.${payload}.preview`, nome: 'Prévia do Gestor', perfil: 'GESTOR' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(initialSession)
  const sessionRef = useRef(session)
  const [notice, setNotice] = useState('')
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  const endSession = useCallback((message = '') => {
    try { clearSession() } catch { /* O armazenamento pode estar bloqueado. */ }
    sessionRef.current = null
    setSession(null)
    setNotice(message)
  }, [])

  const api = useCallback((path: string, options?: RequestInit) => {
    const request = createApiClient({
      baseUrl,
      getSession: () => sessionRef.current,
      onUnauthorized: () => endSession(SESSION_EXPIRED),
    })
    return request(path, options)
  }, [baseUrl, endSession])

  useEffect(() => {
    if (!session) return
    const expiresAt = tokenExpiresAt(session.token, session.perfil) ?? 0
    let timer: ReturnType<typeof setTimeout>
    function checkExpiry() {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) endSession(SESSION_EXPIRED)
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647))
    }
    timer = setTimeout(checkExpiry, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)))
    function onFocus() {
      if (expiresAt <= Date.now()) endSession(SESSION_EXPIRED)
    }
    window.addEventListener('focus', onFocus)
    return () => { clearTimeout(timer); window.removeEventListener('focus', onFocus) }
  }, [session, endSession])

  async function signIn(credentials: LoginCredentials) {
    const authenticated = await login(credentials, {
      baseUrl,
    })
    try {
      saveSession(authenticated)
    } catch {
      throw new Error('Não foi possível manter sua sessão. Permita o armazenamento do navegador e tente novamente.')
    }
    sessionRef.current = authenticated
    setSession(authenticated)
    setNotice('')
  }

  function logout() {
    endSession()
  }

  return <AuthContext.Provider value={{ session, signIn, logout, api, notice }}>{children}</AuthContext.Provider>
}
