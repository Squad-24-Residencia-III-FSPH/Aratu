import type { Profile } from '../auth/profiles'

/** Perfis com leitura de veículos, espelhando `vehicles.routes.ts`. */
const VEHICLE_READ_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO']
/** Perfis com escrita de veículos, espelhando `vehicles.routes.ts`. */
const VEHICLE_WRITE_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Caminho canônico da tela de veículos. */
export const VEHICLES_PATH = '/veiculos'

/** Indica se o perfil pode consultar veículos. */
export function canReadVehicles(profile: Profile | null): boolean {
  return profile !== null && VEHICLE_READ_PROFILES.includes(profile)
}

/** Indica se o perfil pode cadastrar, editar e mudar a situação. */
export function canWriteVehicles(profile: Profile | null): boolean {
  return profile !== null && VEHICLE_WRITE_PROFILES.includes(profile)
}
