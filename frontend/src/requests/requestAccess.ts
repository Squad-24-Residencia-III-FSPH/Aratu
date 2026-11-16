import type { Profile } from '../auth/profiles'

export const REQUEST_ANALYSIS_PATH = '/frota/solicitacoes/analise'

/** Limita a decisão de solicitações ao perfil Gestor de Frota. */
export function canAnalyzeRequests(profile: Profile): profile is 'GESTOR' {
  return profile === 'GESTOR'
}
