import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import { AuthIdentityError, getCurrentUser, login } from './loginService'
import { logout as requestLogout } from './logoutService'
import { clearSession, readSession, saveSession, SESSION_KEY } from './sessionStorage'
import type { AuthSession, LoginCredentials, SignInOptions } from './types'
import { createApiClient } from '../api/client'
import { waitForApi } from '../api/availability'
import { SESSION_EXPIRED, tokenExpiresAt, tokenUserId } from './token'
import { resolveProfile } from './profiles'
import { REVALIDATION_THROTTLE_MS, resolveRevalidationPath } from './revalidation'
import { createSessionDraftStore, SessionDraftContext } from './sessionDrafts'
import { SessionExpiryPrompt } from './SessionExpiryPrompt'

const MAX_TIMEOUT_MS = 2_147_483_647
const IDLE_PREPARATION_MS = 5 * 60_000
const SESSION_WARNING_MS = 2 * 60_000
const STORAGE_CLEANUP_ATTEMPTS = 2
const SIGNED_OUT = 'Você saiu deste navegador.'
const SIGNED_OUT_ELSEWHERE = 'Sua sessão foi encerrada em outra aba. Entre novamente.'
const LOGOUT_UNCONFIRMED = 'Você saiu deste navegador, mas não foi possível confirmar a saída com o servidor.'
const STORAGE_CLEANUP_FAILED = 'O navegador impediu a limpeza da sessão. Limpe os dados deste site para encerrar o acesso nas outras abas.'
const DIFFERENT_ACCOUNT_REAUTH = 'As credenciais informadas pertencem a outra conta. Para trocar de usuário, faça logout antes.'

function currentAppRoutePath(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (hash.startsWith('#/')) return hash.slice(1)
  return window.location.pathname && window.location.pathname !== '/login'
    ? window.location.pathname
    : null
}

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
  const [statusAnnouncement, setStatusAnnouncement] = useState('')
  const [renewalPrompt, setRenewalPrompt] = useState(false)
  const [renewalPending, setRenewalPending] = useState(false)
  const [renewalError, setRenewalError] = useState('')
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
  const lastApiActivity = useRef(0)
  const draftStore = useMemo(() => createSessionDraftStore(), [])
  const revalidationInFlight = useRef<{ token: string; promise: Promise<void> } | null>(null)
  const lastRevalidated = useRef<{ token: string; at: number } | null>(null)

  useEffect(() => {
    if (session) draftStore.bindUser(tokenUserId(session.token))
  }, [session, draftStore])

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
    if (next) draftStore.bindUser(tokenUserId(next.token))
    setSession(next)
    setNotice(message)
    setRenewalPrompt(false)
    setRenewalPending(false)
    setRenewalError('')
  }, [draftStore])

  const reconcileSession = useCallback((): void => {
    let next = readSession()
    const current = sessionRef.current
    if (next?.token === blockedToken.current) next = null
    if (!next && current?.token === previewToken.current) return
    if (next?.token === current?.token && next?.nome === current?.nome && next?.perfil === current?.perfil) return
    if (next) blockedToken.current = undefined
    const expired = Boolean(current && (tokenExpiresAt(current.token, current.perfil) ?? 0) <= Date.now())
    if (!next) {
      if (expired) {
        draftStore.clearSensitive()
        draftStore.setReturnPath(currentAppRoutePath())
      } else {
        draftStore.clear()
      }
    }
    replaceSession(next, next ? '' : expired ? SESSION_EXPIRED : SIGNED_OUT_ELSEWHERE)
  }, [draftStore, replaceSession])

  const endSession = useCallback((message: string, expectedToken: string, preserveDraftsOnExpiry = false): boolean => {
    if (sessionRef.current?.token !== expectedToken) return false
    // Repetir apenas a limpeza local, nunca o pedido HTTP de auditoria.
    for (let attempt = 0; attempt < STORAGE_CLEANUP_ATTEMPTS; attempt += 1) {
      try {
        if (!clearSession(expectedToken)) {
          reconcileSession()
          return false
        }
        previewToken.current = undefined
        if (preserveDraftsOnExpiry) {
          draftStore.clearSensitive()
          draftStore.setReturnPath(currentAppRoutePath())
        } else {
          draftStore.clear()
        }
        replaceSession(null, message)
        return true
      } catch { /* Mesmo com o armazenamento bloqueado, encerrar o acesso nesta aba. */ }
    }
    blockedToken.current = expectedToken
    previewToken.current = undefined
    draftStore.clear()
    replaceSession(null, STORAGE_CLEANUP_FAILED)
    return false
  }, [draftStore, reconcileSession, replaceSession])

  const api = useCallback((path: string, options?: RequestInit) => {
    reconcileSession()
    const current = sessionRef.current
    const request = createApiClient({
      baseUrl,
      getSession: () => sessionRef.current,
      onUnauthorized: (reason?: string) => {
        if (!current) return
        const isRevocation = Boolean(reason)
        endSession(reason ?? SESSION_EXPIRED, current.token, !isRevocation)
      },
      ...(import.meta.env.PROD ? { prepare: prepareApi } : {}),
    })
    return request(path, options)
  }, [baseUrl, endSession, reconcileSession, prepareApi])

  const revalidateSession = useCallback(async (): Promise<void> => {
    reconcileSession()
    const current = sessionRef.current
    if (!current || current.token === previewToken.current) return
    const path = resolveRevalidationPath(current.perfil)
    if (!path) return
    if (revalidationInFlight.current?.token === current.token) {
      await revalidationInFlight.current.promise
      return
    }
    if (lastRevalidated.current?.token === current.token
      && Date.now() - lastRevalidated.current.at < REVALIDATION_THROTTLE_MS) {
      return
    }
    const expectedToken = current.token
    const promise = (async () => {
      try {
        const response = await api(path, { method: 'GET', cache: 'no-store' })
        if (response.ok && sessionRef.current?.token === expectedToken) {
          lastRevalidated.current = { token: expectedToken, at: Date.now() }
        }
      } catch {
        // Falha de rede ou indisponibilidade não deve encerrar sessão já válida;
        // respostas 401 já foram tratadas de forma unificada em `api`.
      } finally {
        if (revalidationInFlight.current?.token === expectedToken) {
          revalidationInFlight.current = null
        }
      }
    })()
    revalidationInFlight.current = { token: expectedToken, promise }
    await promise
  }, [api, reconcileSession])

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== null && event.key !== SESSION_KEY) return
      try {
        if (event.storageArea !== window.localStorage) return
      } catch { /* A reconciliação abaixo falha fechada se o armazenamento estiver bloqueado. */ }
      reconcileSession()
    }
    function onResume(): void {
      void revalidateSession()
    }
    function onVisible(): void {
      if (document.visibilityState === 'visible') void revalidateSession()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      generation.current += 1
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reconcileSession, revalidateSession])

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
      if (remaining <= 0) endSession(SESSION_EXPIRED, token, true)
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
    try {
      saveSession(authenticated)
    } catch {
      throw new Error('Não foi possível manter sua sessão. Permita o armazenamento do navegador e tente novamente.')
    }
    blockedToken.current = undefined
    previewToken.current = undefined
    setStatusAnnouncement('')
    replaceSession(authenticated)
  }

  async function reauthenticate(credentials: LoginCredentials, options: SignInOptions = {}): Promise<void> {
    const current = sessionRef.current
    if (!current) {
      await signIn(credentials, options)
      return
    }
    const expectedUserId = tokenUserId(current.token)
    const attempt = ++generation.current
    const authenticated = await login(credentials, { baseUrl, ...(options.signal ? { signal: options.signal } : {}) })
    if (generation.current !== attempt || options.signal?.aborted) return
    const nextUserId = tokenUserId(authenticated.token)
    if (expectedUserId && nextUserId && nextUserId !== expectedUserId) {
      throw new Error(DIFFERENT_ACCOUNT_REAUTH)
    }
    try {
      saveSession(authenticated)
    } catch {
      throw new Error('Não foi possível manter sua sessão. Permita o armazenamento do navegador e tente novamente.')
    }
    blockedToken.current = undefined
    previewToken.current = undefined
    replaceSession(authenticated)
    setStatusAnnouncement('Sessão renovada com sucesso.')
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
      const expectedProfile = resolveProfile(current.perfil)
      const authenticatedProfile = resolveProfile(authenticated.perfil)
      const currentProfile = resolveProfile(identity.perfil)
      if (!expectedUserId || authenticatedUserId !== expectedUserId || identity.id !== expectedUserId
        || !expectedProfile || authenticatedProfile !== expectedProfile || currentProfile !== expectedProfile) {
        endSession('A conta ou o perfil mudou. Entre novamente para continuar.', expectedToken)
        return
      }
      const renewedSession = { token: authenticated.token, nome: identity.nome, perfil: identity.perfil }
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
    setStatusAnnouncement('')
    const cleared = endSession(SIGNED_OUT, current.token, false)
    const operation = generation.current
    void requestLogout(current.token, { baseUrl }).then((confirmed) => {
      if (!confirmed && cleared && generation.current === operation) setNotice(LOGOUT_UNCONFIRMED)
    })
  }

  const expiresAt = session ? tokenExpiresAt(session.token, session.perfil) : null
  const isPreviewSession = Boolean(import.meta.env.DEV && session?.token.endsWith('.preview'))

  return (
    <AuthContext.Provider value={{
      session,
      signIn,
      renewSession,
      logout,
      api,
      notice,
      reauthenticate,
      revalidateSession,
      renewalPrompt,
      renewalPending,
      renewalError,
    }}>
      <SessionDraftContext.Provider value={draftStore}>
        <span
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {statusAnnouncement}
        </span>
        {children}
        {session && expiresAt !== null && !isPreviewSession && (
          <SessionExpiryPrompt
            key={expiresAt}
            expiresAt={expiresAt}
            userName={session.nome}
            onReauthenticate={reauthenticate}
            onLogout={logout}
          />
        )}
      </SessionDraftContext.Provider>
    </AuthContext.Provider>
  )
}
