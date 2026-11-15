import type { Profile } from '../auth/profiles'

export const SERVICE_TYPES_PATH = '/tipos-de-servico'

/** Perfis autorizados pelo backend a manter tipos e vínculos de veículos. */
export function canManageServiceTypes(profile: Profile | null): boolean {
  return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
}
