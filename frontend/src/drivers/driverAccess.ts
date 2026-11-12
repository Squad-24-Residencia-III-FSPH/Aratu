import type { Profile } from '../auth/profiles'

const DRIVER_MANAGER_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Caminho da tela de gerenciamento de motoristas. */
export const DRIVERS_PATH = '/motoristas'

/** Indica se o perfil pode consultar motoristas segundo o RBAC da API FROTA-49. */
export function canReadDrivers(profile: Profile | null): boolean {
  return profile !== null && DRIVER_MANAGER_PROFILES.includes(profile)
}

/** Indica se o perfil pode cadastrar, editar e alterar a situação de motoristas. */
export function canWriteDrivers(profile: Profile | null): boolean {
  return canReadDrivers(profile)
}
