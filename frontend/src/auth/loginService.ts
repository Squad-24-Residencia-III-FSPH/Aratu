import type { AuthSession, LoginCredentials } from './types.ts'
import { SESSION_EXPIRED, tokenExpiresAt } from './token.ts'

export const SERVICE_UNAVAILABLE = 'Serviço temporariamente indisponível'
export const INVALID_CREDENTIALS = 'E-mail ou senha inválidos'

export interface LoginOptions {
  signal?: AbortSignal
  baseUrl?: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

export interface AuthenticatedIdentity {
  id: string
  nome: string
  perfil: string
  profile?: AuthSession['profile']
  permissions?: string[]
  homePath?: string | null
}

function parseProfileContext(value: unknown): AuthSession['profile'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const profile = value as Record<string, unknown>
  const id = typeof profile.id === 'string' ? profile.id : ''
  const code = typeof profile.code === 'string' ? profile.code : ''
  const displayName = typeof profile.displayName === 'string' ? profile.displayName : ''
  const revision = profile.revision
  if (!/^[1-9]\d*$/.test(id) || !code.trim() || !displayName.trim()
    || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return undefined
  return { id, code, displayName: displayName.trim(), revision }
}

/** Erro de leitura de identidade com o status HTTP preservado para a sessão. */
export class AuthIdentityError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AuthIdentityError'
    this.status = status
  }
}

function errorMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('erro' in data)) return
  return typeof data.erro === 'string' && data.erro.trim() ? data.erro : undefined
}

// Contrato confirmado na FROTA-27: { token: JWT, nome: string, perfil: string }.
// FROTA-26 define as falhas em { erro: string }. Uma resposta HTTP 2xx sozinha
// não autentica o usuário; formato, perfil e expiração precisam ser válidos.
export function parseLoginResponse(data: unknown): AuthSession {
  if (typeof data !== 'object' || data === null) throw new Error(SERVICE_UNAVAILABLE)
  if ('erro' in data && data.erro != null && data.erro !== '') {
    throw new Error(errorMessage(data) ?? SERVICE_UNAVAILABLE)
  }
  if (!('token' in data) || !('nome' in data) || !('perfil' in data)) {
    throw new Error(SERVICE_UNAVAILABLE)
  }
  const { token, nome, perfil } = data
  if (typeof token !== 'string' || !token.trim()
    || typeof nome !== 'string' || !nome.trim()
    || typeof perfil !== 'string' || !perfil.trim()) {
    throw new Error(SERVICE_UNAVAILABLE)
  }
  const expiresAt = tokenExpiresAt(token, perfil)
  if (!expiresAt) throw new Error(SERVICE_UNAVAILABLE)
  if (expiresAt <= Date.now()) throw new Error(SESSION_EXPIRED)
  const session: AuthSession = { token, nome, perfil }
  if ('profileId' in data && 'profileName' in data
    && typeof data.profileId === 'string' && /^[1-9]\d*$/.test(data.profileId)
    && typeof data.profileName === 'string' && data.profileName.trim()) {
    session.profile = { id: data.profileId, code: perfil, displayName: data.profileName.trim(), revision: 1 }
  }
  if ('permissions' in data && Array.isArray(data.permissions)
    && data.permissions.every((permission) => typeof permission === 'string')) {
    session.permissions = [...data.permissions]
  }
  if ('homePath' in data && (typeof data.homePath === 'string' || data.homePath === null)) {
    session.homePath = data.homePath
  }
  return session
}

export async function login(
  credentials: LoginCredentials,
  { baseUrl = '/api', timeoutMs = 15_000, fetcher = fetch, signal }: LoginOptions = {},
): Promise<AuthSession> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    let data: unknown
    try {
      response = await fetcher(baseUrl.replace(/\/+$/, '') + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: credentials.email.trim(), senha: credentials.senha }),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        cache: 'no-store',
      })
      data = await response.json().catch(() => null)
    } catch {
      throw new Error(SERVICE_UNAVAILABLE)
    }
    if (controller.signal.aborted || signal?.aborted) throw new Error(SERVICE_UNAVAILABLE)
    if (response.status === 401) throw new Error(INVALID_CREDENTIALS)
    if (response.status >= 500 || response.status === 404 || response.status === 408) {
      throw new Error(SERVICE_UNAVAILABLE)
    }
    if (!response.ok) {
      throw new Error(errorMessage(data) ?? 'Não foi possível entrar. Tente novamente.')
    }
    return parseLoginResponse(data)
  } finally {
    clearTimeout(timeout)
  }
}

/** Revalida a identidade e o perfil retornados por um token recém-autenticado. */
export async function getCurrentUser(
  token: string,
  { baseUrl = '/api', timeoutMs = 15_000, fetcher = fetch, signal }: LoginOptions = {},
): Promise<AuthenticatedIdentity> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    let data: unknown
    try {
      response = await fetcher(baseUrl.replace(/\/+$/, '') + '/auth/me', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        cache: 'no-store',
      })
      data = await response.json().catch(() => null)
    } catch {
      throw new AuthIdentityError(SERVICE_UNAVAILABLE)
    }
    if (controller.signal.aborted || signal?.aborted) throw new AuthIdentityError(SERVICE_UNAVAILABLE)
    if (!response.ok) {
      const statusMessage = response.status === 401 || response.status === 403
        ? 'A conta ou o perfil não está mais autorizado.'
        : SERVICE_UNAVAILABLE
      throw new AuthIdentityError(statusMessage, response.status)
    }
    if (typeof data !== 'object' || data === null || !('id' in data) || !('nome' in data) || !('perfil' in data)) {
      throw new AuthIdentityError(SERVICE_UNAVAILABLE)
    }
    const { id, nome, perfil } = data
    const normalizedId = typeof id === 'string' && /^[1-9]\d*$/.test(id)
      ? id
      : typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : null
    if (!normalizedId || typeof nome !== 'string' || !nome.trim()
      || typeof perfil !== 'string' || !perfil.trim()) {
      throw new AuthIdentityError(SERVICE_UNAVAILABLE)
    }
    const identity: AuthenticatedIdentity = { id: normalizedId, nome: nome.trim(), perfil }
    const profile = parseProfileContext('profile' in data ? data.profile : undefined)
    if (profile) identity.profile = profile
    if ('permissions' in data && Array.isArray(data.permissions)
      && data.permissions.every((permission) => typeof permission === 'string')) {
      identity.permissions = [...data.permissions]
    }
    if ('homePath' in data && (typeof data.homePath === 'string' || data.homePath === null)) {
      identity.homePath = data.homePath
    }
    return identity
  } finally {
    clearTimeout(timeout)
  }
}
