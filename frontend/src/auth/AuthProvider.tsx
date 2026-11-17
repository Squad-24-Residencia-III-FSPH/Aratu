import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import { login } from './loginService'
import { logout as requestLogout } from './logoutService'
import { clearSession, readSession, saveSession, SESSION_KEY } from './sessionStorage'
import type { AuthSession, LoginCredentials } from './types'
import { createApiClient } from '../api/client'
import { SESSION_EXPIRED, tokenExpiresAt } from './token'

const MAX_TIMEOUT_MS = 2_147_483_647
const STORAGE_CLEANUP_ATTEMPTS = 2
const SIGNED_OUT = 'Você saiu deste navegador.'
const SIGNED_OUT_ELSEWHERE = 'Sua sessão foi encerrada em outra aba. Entre novamente.'
const LOGOUT_UNCONFIRMED = 'Você saiu deste navegador, mas não foi possível confirmar a saída com o servidor.'
const STORAGE_CLEANUP_FAILED = 'O navegador impediu a limpeza da sessão. Limpe os dados deste site para encerrar o acesso nas outras abas.'

function initialSession(): AuthSession | null {
  const storedSession = readSession()
  if (storedSession || !import.meta.env.DEV || new URLSearchParams(window.location.search).get('preview') !== 'gestor') {
    return storedSession
  }

  // Prévia visual local: o backend continua validando cada requisição.
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ id: 'local-preview', role: 'GESTOR', exp: Math.floor(Date.now() / 1000) + 3600 })
  return { token: `${header}.${payload}.preview`, nome: 'Prévia do Gestor', perfil: 'GESTOR' }
}

/** Compartilha a sessão entre abas sem estender a validade ou depender da rede para sair. */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState(initialSession)
  const sessionRef = useRef(session)
  const generation = useRef(0)
  const blockedToken = useRef<string | undefined>(undefined)
  const previewToken = useRef(import.meta.env.DEV && session?.token.endsWith('.preview') ? session.token : undefined)
  const [notice, setNotice] = useState('')
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  const replaceSession = useCallback((next: AuthSession | null, message = ''): void => {
    generation.current += 1
    sessionRef.current = next
    setSession(next)
    setNotice(message)
  }, [])

  const reconcileSession = useCallback((): void => {
    let next = readSession()
    const current = sessionRef.current
    if (next?.token === blockedToken.current) next = null
    if (!next && current?.token === previewToken.current) return
    if (next?.token === current?.token && next?.nome === current?.nome && next?.perfil === current?.perfil) return
    if (next) blockedToken.current = undefined
    const expired = current && (tokenExpiresAt(current.token, current.perfil) ?? 0) <= Date.now()
    replaceSession(next, next ? '' : expired ? SESSION_EXPIRED : SIGNED_OUT_ELSEWHERE)
  }, [replaceSession])

  const endSession = useCallback((message: string, expectedToken: string): boolean => {
    if (sessionRef.current?.token !== expectedToken) return false
    // Repetir apenas a limpeza local, nunca o pedido HTTP de auditoria.
    for (let attempt = 0; attempt < STORAGE_CLEANUP_ATTEMPTS; attempt += 1) {
      try {
        if (!clearSession(expectedToken)) {
          reconcileSession()
          return false
        }
        previewToken.current = undefined
        replaceSession(null, message)
        return true
      } catch { /* Mesmo com o armazenamento bloqueado, encerrar o acesso nesta aba. */ }
    }
    blockedToken.current = expectedToken
    previewToken.current = undefined
    replaceSession(null, STORAGE_CLEANUP_FAILED)
    return false
  }, [reconcileSession, replaceSession])

  const api = useCallback((path: string, options?: RequestInit) => {
    reconcileSession()
    const current = sessionRef.current
    const request = createApiClient({
      baseUrl,
      getSession: () => sessionRef.current,
      onUnauthorized: () => { if (current) endSession(SESSION_EXPIRED, current.token) },
    })
    return request(path, options)
  }, [baseUrl, endSession, reconcileSession])

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== null && event.key !== SESSION_KEY) return
      try {
        if (event.storageArea !== window.localStorage) return
      } catch { /* A reconciliação abaixo falha fechada se o armazenamento estiver bloqueado. */ }
      reconcileSession()
    }
    function onVisible(): void {
      if (document.visibilityState === 'visible') reconcileSession()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', reconcileSession)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      generation.current += 1
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', reconcileSession)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reconcileSession])

  useEffect(() => {
    if (!session) return
    const token = session.token
    const expiresAt = tokenExpiresAt(session.token, session.perfil) ?? 0
    let timer: ReturnType<typeof setTimeout>
    function checkExpiry(): void {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) endSession(SESSION_EXPIRED, token)
      else timer = setTimeout(checkExpiry, Math.min(remaining, MAX_TIMEOUT_MS))
    }
    timer = setTimeout(checkExpiry, Math.max(0, Math.min(expiresAt - Date.now(), MAX_TIMEOUT_MS)))
    return () => clearTimeout(timer)
  }, [session, endSession])

  async function signIn(credentials: LoginCredentials): Promise<void> {
    const attempt = ++generation.current
    const authenticated = await login(credentials, { baseUrl })
    if (generation.current !== attempt) return
    try {
      saveSession(authenticated)
    } catch {
      throw new Error('Não foi possível manter sua sessão. Permita o armazenamento do navegador e tente novamente.')
    }
    blockedToken.current = undefined
    previewToken.current = undefined
    replaceSession(authenticated)
  }

  function logout(): void {
    reconcileSession()
    const current = sessionRef.current
    if (!current) return
    const cleared = endSession(SIGNED_OUT, current.token)
    const operation = generation.current
    void requestLogout(current.token, { baseUrl }).then((confirmed) => {
      if (!confirmed && cleared && generation.current === operation) setNotice(LOGOUT_UNCONFIRMED)
    })
  }

  return <AuthContext.Provider value={{ session, signIn, logout, api, notice }}>{children}</AuthContext.Provider>
}
