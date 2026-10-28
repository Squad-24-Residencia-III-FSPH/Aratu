import { PROFILE_HOMES, resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import type { AuthSession } from '../auth/types.ts'
import { tokenExpiresAt } from '../auth/token.ts'

export type RouteDecision =
  | { kind: 'login' }
  | { kind: 'redirect'; to: string }
  | { kind: 'home'; profile: Profile }
  | { kind: 'schedule-trip'; requestId: string }
  | { kind: 'preview-schedule-trip'; requestId: string }

export function resolveRoute(session: AuthSession | null, path: string, now = Date.now()): RouteDecision {
  // Rota pública de demonstração e avaliação visual da US 14 (FROTA-94)
  const previewMatch = path.match(/^\/preview\/agendamento(?:\/([^/]+))?$/)
  if (previewMatch) {
    return { kind: 'preview-schedule-trip', requestId: previewMatch[1] || '123' }
  }

  const profile = session && resolveProfile(session.perfil)
  const expiresAt = session && tokenExpiresAt(session.token, session.perfil)
  if (!session || !profile || !expiresAt || expiresAt <= now) {
    return path === '/login' ? { kind: 'login' } : { kind: 'redirect', to: '/login' }
  }

  // Se o usuário já está autenticado e está na rota /login, verifica se havia uma return_url salva
  if (path === '/login' && typeof window !== 'undefined') {
    try {
      const returnUrl = sessionStorage.getItem('aratu_return_url')
      if (returnUrl && returnUrl !== '/login') {
        sessionStorage.removeItem('aratu_return_url')
        return { kind: 'redirect', to: returnUrl }
      }
    } catch {
      /* ignore */
    }
  }

  // Rota oficial de Agendamento de Viagem (FROTA-94): Acesso exclusivo GESTOR (ou ADMINISTRADOR)
  const scheduleMatch = path.match(/^\/frota\/agendar-viagem(?:\/([^/]+))?$/)
  if (scheduleMatch) {
    if (profile === 'GESTOR' || profile === 'ADMINISTRADOR') {
      const requestId = scheduleMatch[1] || '123'
      return { kind: 'schedule-trip', requestId }
    }
    return { kind: 'redirect', to: PROFILE_HOMES[profile].path }
  }

  const home = PROFILE_HOMES[profile].path
  return path === home ? { kind: 'home', profile } : { kind: 'redirect', to: home }
}
