import type { Profile } from '../auth/profiles'

export const REQUEST_ANALYSIS_PATH = '/frota/solicitacoes/analise'

/** Gestor opera a decisão; o Administrador pode consultar para manutenção/supervisão. */
export function canAnalyzeRequests(profile: Profile): profile is 'GESTOR' | 'ADMINISTRADOR' {
  return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
}
