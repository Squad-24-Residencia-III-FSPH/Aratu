import { resolveProfile } from './profiles.ts'

export const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente.'

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return data && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown> : null
  } catch { return null }
}

// A assinatura é validada pelo backend, nunca pelo cliente. Aqui verificamos
// apenas formato, perfil e expiração para não manter uma sessão inválida na UI.
/** Extrai o identificador do usuário do payload do JWT, sem validar a assinatura. */
export function tokenUserId(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null
  const payload = decodePart(parts[1])
  if (!payload) return null
  if (typeof payload.id === 'string' && payload.id.trim()) return payload.id
  if (typeof payload.id === 'number' && Number.isSafeInteger(payload.id) && payload.id > 0) {
    return String(payload.id)
  }
  return null
}

export function tokenExpiresAt(token: string, perfil: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null
  const header = decodePart(parts[0])
  const payload = decodePart(parts[1])
  const profile = resolveProfile(perfil)
  const tokenProfile = payload && typeof payload.role === 'string'
    ? resolveProfile(payload.role)
    : payload && typeof payload.perfil === 'string'
      ? resolveProfile(payload.perfil)
      : null
  if (!header || typeof header.alg !== 'string' || header.alg.toLowerCase() === 'none'
    || !payload || !profile || tokenProfile !== profile
    || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= 0
    || !((typeof payload.id === 'string' && payload.id.trim())
      || (typeof payload.id === 'number' && Number.isSafeInteger(payload.id) && payload.id > 0))) return null
  const expiresAt = payload.exp * 1000
  return Number.isSafeInteger(expiresAt) ? expiresAt : null
}
