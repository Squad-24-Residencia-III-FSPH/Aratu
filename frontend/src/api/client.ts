import type { AuthSession } from '../auth/types.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED, tokenExpiresAt } from '../auth/token.ts'

interface ApiClientOptions {
  baseUrl: string
  getSession: () => AuthSession | null
  onUnauthorized: () => void
  fetcher?: typeof fetch
  timeoutMs?: number
}

export type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>

export function createApiClient({
  baseUrl, getSession, onUnauthorized, fetcher = fetch, timeoutMs = 15_000,
}: ApiClientOptions): ApiRequest {
  return async (path, options = {}) => {
    const session = getSession()
    const expiresAt = session && tokenExpiresAt(session.token, session.perfil)
    if (!session || !expiresAt || expiresAt <= Date.now()) {
      onUnauthorized()
      throw new Error(SESSION_EXPIRED)
    }
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Caminho de API inválido.')
    const headers = new Headers(options.headers)
    headers.set('Authorization', 'Bearer ' + session.token)
    headers.set('Accept', 'application/json')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetcher(baseUrl.replace(/\/+$/, '') + path, {
        ...options, headers,
        signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
      })
    } catch {
      throw new Error(SERVICE_UNAVAILABLE)
    } finally {
      clearTimeout(timeout)
    }
    if (response.status === 401) {
      // Uma requisição antiga não deve encerrar uma sessão iniciada depois dela.
      if (getSession()?.token === session.token) onUnauthorized()
      throw new Error(SESSION_EXPIRED)
    }
    return response
  }
}
