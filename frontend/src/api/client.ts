import type { AuthSession } from '../auth/types.ts'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { SESSION_EXPIRED, tokenExpiresAt } from '../auth/token.ts'

interface ApiClientOptions {
  baseUrl: string
  getSession: () => AuthSession | null
  onUnauthorized: (reason?: string) => void
  fetcher?: typeof fetch
  timeoutMs?: number
  prepare?: (signal?: AbortSignal) => Promise<void>
}

export type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>

const GENERIC_UNAUTHORIZED_MESSAGES = new Set([
  'Autenticação necessária.',
  'Token inválido ou expirado.',
  'Token inválido.',
  'Token inválido',
])

/** Extrai motivo específico de revogação em respostas HTTP 401 (ex.: conta desativada). */
async function extractUnauthorizedReason(response: Response): Promise<string | undefined> {
  try {
    const data: unknown = await response.clone().json()
    if (typeof data !== 'object' || data === null || !('erro' in data)) return undefined
    const message = typeof data.erro === 'string' ? data.erro.trim() : ''
    if (!message || GENERIC_UNAUTHORIZED_MESSAGES.has(message)) return undefined
    return message
  } catch {
    return undefined
  }
}

/**
 * Cria cliente HTTP autenticado com tratamento único de expiração e resposta HTTP 401.
 *
 * @param options - Configuração de base URL, leitor de sessão e callback único de invalidação.
 * @returns Função de requisição compatível com `fetch` para rotas relativas da API.
 */
export function createApiClient({
  baseUrl, getSession, onUnauthorized, fetcher = fetch, timeoutMs = 15_000, prepare,
}: ApiClientOptions): ApiRequest {
  return async (path, options = {}) => {
    const session = getSession()
    const expiresAt = session && tokenExpiresAt(session.token, session.perfil)
    if (!session || !expiresAt || expiresAt <= Date.now()) {
      onUnauthorized()
      throw new Error(SESSION_EXPIRED)
    }
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Caminho de API inválido.')
    if (prepare) await prepare(options.signal ?? undefined)
    if (getSession()?.token !== session.token) throw new Error(SESSION_EXPIRED)
    if (expiresAt <= Date.now()) {
      onUnauthorized()
      throw new Error(SESSION_EXPIRED)
    }
    options.signal?.throwIfAborted()
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
      if (getSession()?.token === session.token) {
        const reason = await extractUnauthorizedReason(response)
        if (getSession()?.token === session.token) onUnauthorized(reason)
      }
      throw new Error(SESSION_EXPIRED)
    }
    return response
  }
}
