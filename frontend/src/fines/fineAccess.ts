import type { Profile } from '../auth/profiles'

export const FINES_PATH = '/multas'
export const FINE_ACCESS_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Espelha os perfis autorizados pela API de multas. */
export function canAccessFines(profile: Profile | null): boolean {
  return profile !== null && FINE_ACCESS_PROFILES.includes(profile)
}
