import { PROFILE_HOMES, resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import type { AuthSession } from '../auth/types.ts'
import { tokenExpiresAt } from '../auth/token.ts'

type RouteDecision = { kind: 'login' } | { kind: 'redirect'; to: string } | { kind: 'home'; profile: Profile }

export function resolveRoute(session: AuthSession | null, path: string, now = Date.now()): RouteDecision {
  const profile = session && resolveProfile(session.perfil)
  const expiresAt = session && tokenExpiresAt(session.token, session.perfil)
  if (!session || !profile || !expiresAt || expiresAt <= now) {
    return path === '/login' ? { kind: 'login' } : { kind: 'redirect', to: '/login' }
  }
  const home = PROFILE_HOMES[profile].path
  return path === home ? { kind: 'home', profile } : { kind: 'redirect', to: home }
}
