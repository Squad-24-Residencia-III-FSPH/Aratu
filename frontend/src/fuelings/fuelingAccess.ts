import type { Profile } from '../auth/profiles'

const FUELING_ACCESS_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

export const FUELINGS_PATH = '/abastecimentos'

/** Espelha os perfis autorizados nos endpoints de abastecimentos. */
export function canAccessFuelings(profile: Profile | null): boolean {
  return profile !== null && FUELING_ACCESS_PROFILES.includes(profile)
}
