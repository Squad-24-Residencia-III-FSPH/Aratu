import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import SessionRenewalDialog from './SessionRenewalDialog'
import { AuthIdentityError, getCurrentUser, login } from './loginService'
import { logout as requestLogout } from './logoutService'
import { clearSession, readSession, saveSession, SESSION_KEY } from './sessionStorage'
import type { AuthSession, LoginCredentials, SignInOptions } from './types'
import { createApiClient } from '../api/client'
import { waitForApi } from '../api/availability'
import { SESSION_EXPIRED, tokenExpiresAt, tokenUserId } from './token'

const MAX_TIMEOUT_MS = 2_147_483_647
const IDLE_PREPARATION_MS = 5 * 60_000
const SESSION_WARNING_MS = 2 * 60_000
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
  return {
    token: `${header}.${payload}.preview`, nome: 'Prévia do Gestor', perfil: 'GESTOR',
    permissions: [
      'dashboard:read', 'requests:read:all', 'requests:approve-and-schedule', 'requests:return', 'requests:reject',
      'trips:availability:read', 'trips:read:all', 'trips:create-direct', 'trips:confirm',
      'vehicles:read', 'drivers:read', 'services:read', 'maintenance:read', 'fuelings:read',
      'svo:occurrences:read', 'svo:teams:read', 'svo:orders:read:all', 'reports:read:trips', 'audit:read',
    ], homePath: '/frota/inicio',
  }
}

/** Compartilha a sessão entre abas sem estender a validade ou depender da rede para sair. */
export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [session, setSession] = useState(initialSession)
  const sessionRef = useRef(session)
  const generation = useRef(0)
  const blockedToken = useRef<string | undefined>(undefined)
  const previewToken = useRef(import.meta.env.DEV && session?.token.endsWith('.preview') ? session.token : undefined)
  const [notice, setNotice] = useState('')
  const [renewalPrompt, setRenewalPrompt] = useState(false)
  const [renewalPending, setRenewalPending] = useState(false)
  const [renewalError, setRenewalError] = useState('')
  const [authorizationLoading, setAuthorizationLoading] = useState(false)
  const [authorizationError, setAuthorizationError] = useState('')
  const [authorizationRefresh, setAuthorizationRefresh] = useState(0)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
  const lastApiActivity = useRef(0)

  const prepareApi = useCallback(async (signal?: AbortSignal): Promise<void> => {
    // A prévia local e os testes mantêm o proxy de desenvolvimento sem espera adicional.
    if (import.meta.env.DEV) return
    if (Date.now() - lastApiActivity.current >= IDLE_PREPARATION_MS) {
      await waitForApi(baseUrl, signal ? { signal } : {})
    }
    lastApiActivity.current = Date.now()
  }, [baseUrl])

  const replaceSession = useCallback((next: AuthSession | null, message = ''): void => {
    generation.current += 1
    sessionRef.current = next
    setSession(next)
    setNotice(message)
    setRenewalPrompt(false)
    setRenewalPending(false)
    setRenewalError('')
  }, [])

  const reconcileSession = useCallback((): void => {
    let next = readSession()
    const current = sessionRef.current
    if (next?.token === blockedToken.current) next = null
    if (!next && current?.token === previewToken.current) return
    if (next?.token === current?.token && next?.nome === current?.nome && next?.perfil === current?.perfil
      && JSON.stringify(next?.permissions) === JSON.stringify(current?.permissions)
      && next?.profile?.revision === current?.profile?.revision && next?.homePath === current?.homePath) return
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
      ...(import.meta.env.PROD ? { prepare: prepareApi } : {}),
    })
    return request(path, options)
  }, [baseUrl, endSession, reconcileSession, prepareApi])

  useEffect(() => {
    if (!session || session.permissions !== undefined || session.token === previewToken.current) return
    const token = session.token
    let current = true
    setAuthorizationLoading(true)
    setAuthorizationError('')
    void getCurrentUser(token, { baseUrl }).then((identity) => {
      if (!current || sessionRef.current?.token !== token) return
      const expectedUserId = tokenUserId(token)
      if (!expectedUserId || identity.id !== expectedUserId || identity.perfil !== sessionRef.current.perfil) {
        endSession('A conta ou o perfil mudou. Entre novamente para continuar.', token)
        return
      }
      const enriched: AuthSession = {
        ...sessionRef.current,
        nome: identity.nome,
        ...(identity.profile ? { profile: identity.profile } : {}),
        permissions: identity.permissions ?? [],
        ...(identity.homePath !== undefined ? { homePath: identity.homePath } : {}),
      }
      saveSession(enriched)
      replaceSession(enriched)
    }).catch((error: unknown) => {
      if (!current || sessionRef.current?.token !== token) return
      if (error instanceof AuthIdentityError && (error.status === 401 || error.status === 403)) {
        endSession('A conta ou o perfil mudou. Entre novamente para continuar.', token)
      } else {
        setAuthorizationError(error instanceof Error ? error.message : 'Não foi possível carregar suas permissões.')
      }
    }).finally(() => {
      if (current) setAuthorizationLoading(false)
    })
    return () => { current = false }
  }, [authorizationRefresh, baseUrl, endSession, replaceSession, session])

  const refreshAuthorization = useCallback(() => {
    if (!sessionRef.current) return
    setAuthorizationError('')
    setAuthorizationRefresh((value) => value + 1)
  }, [])

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
    let warningTimer: ReturnType<typeof setTimeout>
    function checkRenewal(): void {
      const remaining = expiresAt - Date.now()
      if (remaining <= SESSION_WARNING_MS) {
        if (sessionRef.current?.token === token) setRenewalPrompt(true)
        return
      }
      warningTimer = setTimeout(checkRenewal, Math.min(remaining - SESSION_WARNING_MS, MAX_TIMEOUT_MS))
    }
    function checkExpiry(): void {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) endSession(SESSION_EXPIRED, token)
      else timer = setTimeout(checkExpiry, Math.min(remaining, MAX_TIMEOUT_MS))
    }
    checkRenewal()
    timer = setTimeout(checkExpiry, Math.max(0, Math.min(expiresAt - Date.now(), MAX_TIMEOUT_MS)))
    return () => { clearTimeout(timer); clearTimeout(warningTimer) }
  }, [session, endSession])

  async function signIn(credentials: LoginCredentials, options: SignInOptions = {}): Promise<void> {
    const attempt = ++generation.current
    if (import.meta.env.PROD) {
      options.onPreparing?.(true)
      try {
        await prepareApi(options.signal)
      } finally {
        options.onPreparing?.(false)
      }
    }
    if (generation.current !== attempt || options.signal?.aborted) return
    const authenticated = await login(credentials, { baseUrl, ...(options.signal ? { signal: options.signal } : {}) })
    if (generation.current !== attempt || options.signal?.aborted) return
    const identity = await getCurrentUser(authenticated.token, { baseUrl, ...(options.signal ? { signal: options.signal } : {}) })
    const authenticatedUserId = tokenUserId(authenticated.token)
    if (!authenticatedUserId || identity.id !== authenticatedUserId || identity.perfil !== authenticated.perfil) {
      throw new AuthIdentityError('Não foi possível confirmar o contexto de acesso da conta.')
    }
    const completeSession: AuthSession = {
      ...authenticated,
      nome: identity.nome,
      ...(identity.profile ? { profile: identity.profile } : {}),
      permissions: identity.permissions ?? [],
      ...(identity.homePath !== undefined ? { homePath: identity.homePath } : {}),
    }
    if (generation.current !== attempt || options.signal?.aborted) return
    try {
      saveSession(completeSession)
    } catch {
      throw new Error('Não foi possível manter sua sessão. Permita o armazenamento do navegador e tente novamente.')
    }
    blockedToken.current = undefined
    previewToken.current = undefined
    replaceSession(completeSession)
  }

  /** Troca o token somente após confirmar que login e GET /auth/me mantêm a mesma identidade/perfil. */
  async function renewSession(credentials: LoginCredentials): Promise<void> {
    reconcileSession()
    const current = sessionRef.current
    if (!current) return
    const expectedToken = current.token
    const attempt = ++generation.current
    setRenewalPending(true)
    setRenewalError('')
    try {
      if (import.meta.env.PROD) await prepareApi()
      if (generation.current !== attempt || sessionRef.current?.token !== expectedToken) return
      const authenticated = await login(credentials, { baseUrl })
      if (generation.current !== attempt || sessionRef.current?.token !== expectedToken) return
      const identity = await getCurrentUser(authenticated.token, { baseUrl })
      if (generation.current !== attempt || sessionRef.current?.token !== expectedToken) return
      const expectedUserId = tokenUserId(expectedToken)
      const authenticatedUserId = tokenUserId(authenticated.token)
      const expectedProfile = current.profile?.id
      const authenticatedProfile = authenticated.profile?.id
      if (!expectedUserId || authenticatedUserId !== expectedUserId || identity.id !== expectedUserId
        || authenticated.perfil !== current.perfil || identity.perfil !== current.perfil
        || (expectedProfile && authenticatedProfile && authenticatedProfile !== expectedProfile)) {
        endSession('A conta ou o perfil mudou. Entre novamente para continuar.', expectedToken)
        return
      }
      const renewedSession: AuthSession = {
        ...authenticated,
        nome: identity.nome,
        ...(identity.profile ? { profile: identity.profile } : {}),
        permissions: identity.permissions ?? [],
        ...(identity.homePath !== undefined ? { homePath: identity.homePath } : {}),
      }
      saveSession(renewedSession)
      blockedToken.current = undefined
      previewToken.current = undefined
      replaceSession(renewedSession)
    } catch (error) {
      if (generation.current !== attempt || sessionRef.current?.token !== expectedToken) return
      if (error instanceof AuthIdentityError && (error.status === 401 || error.status === 403)) {
        endSession('A conta ou o perfil mudou. Entre novamente para continuar.', expectedToken)
      } else {
        const remaining = (tokenExpiresAt(expectedToken, current.perfil) ?? Date.now()) - Date.now()
        const message = error instanceof Error && error.message ? error.message : 'Não foi possível confirmar sua identidade.'
        setRenewalError(`${message} Ainda há ${Math.max(0, Math.ceil(remaining / 1000))} segundos antes de a sessão expirar.`)
      }
    } finally {
      if (generation.current === attempt) setRenewalPending(false)
    }
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

  return <AuthContext.Provider value={{
    session, signIn, renewSession, logout, api, notice,
    authorizationLoading, authorizationError, refreshAuthorization,
    renewalPrompt, renewalPending, renewalError,
  }}>
    {children}
    <SessionRenewalDialog />
  </AuthContext.Provider>
}
