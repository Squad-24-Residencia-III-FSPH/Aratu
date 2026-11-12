import { PROFILE_HOMES, PROFILE_PERMISSIONS_PATH, resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import type { AuthSession } from '../auth/types.ts'
import { tokenExpiresAt } from '../auth/token.ts'
import { canReadVehicles, VEHICLES_PATH } from '../vehicles/vehicleAccess.ts'
import { canManageMaintenance, MAINTENANCE_PATH } from '../maintenance/maintenanceTypes.ts'
import { canReadDrivers, DRIVERS_PATH } from '../drivers/driverAccess.ts'
import { canAccessFuelings, FUELINGS_PATH } from '../fuelings/fuelingAccess.ts'
import { TRIP_CONFIRMATION_PATH } from '../trips/tripConfirmationTypes.ts'

type RouteDecision =
  | { kind: 'login' }
  | { kind: 'redirect'; to: string }
  | { kind: 'home'; profile: Profile }
  | { kind: 'profile-permissions'; profile: 'ADMINISTRADOR' }
  | { kind: 'vehicles'; profile: Profile }
  | { kind: 'maintenance'; profile: Profile }
  | { kind: 'drivers'; profile: Profile }
  | { kind: 'fuelings'; profile: Profile }
  | { kind: 'trip-confirmation'; profile: 'GESTOR' }

export function resolveRoute(session: AuthSession | null, path: string, now = Date.now()): RouteDecision {
  const profile = session && resolveProfile(session.perfil)
  const expiresAt = session && tokenExpiresAt(session.token, session.perfil)
  if (!session || !profile || !expiresAt || expiresAt <= now) {
    return path === '/login' ? { kind: 'login' } : { kind: 'redirect', to: '/login' }
  }
  const home = PROFILE_HOMES[profile].path
  if (path === TRIP_CONFIRMATION_PATH) {
    return profile === 'GESTOR' ? { kind: 'trip-confirmation', profile } : { kind: 'redirect', to: home }
  }
  if (path === MAINTENANCE_PATH) {
    return canManageMaintenance(profile) ? { kind: 'maintenance', profile } : { kind: 'redirect', to: home }
  }
  if (path === PROFILE_PERMISSIONS_PATH) {
    return profile === 'ADMINISTRADOR'
      ? { kind: 'profile-permissions', profile }
      : { kind: 'redirect', to: home }
  }
  if (path === VEHICLES_PATH) {
    return canReadVehicles(profile)
      ? { kind: 'vehicles', profile }
      : { kind: 'redirect', to: home }
  }
  if (path === DRIVERS_PATH) {
    return canReadDrivers(profile)
      ? { kind: 'drivers', profile }
      : { kind: 'redirect', to: home }
  }
  if (path === FUELINGS_PATH) {
    return canAccessFuelings(profile)
      ? { kind: 'fuelings', profile }
      : { kind: 'redirect', to: home }
  }
  return path === home ? { kind: 'home', profile } : { kind: 'redirect', to: home }
}
