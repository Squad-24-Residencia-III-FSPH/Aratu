import { PROFILE_HOMES, PROFILE_PERMISSIONS_PATH, resolveProfile } from '../auth/profiles.ts'
import { hasAnyPermission, hasPermission } from '../auth/access.ts'
import { authorizedHomePath } from '../auth/access.ts'
import type { Profile } from '../auth/profiles.ts'
import type { AuthSession } from '../auth/types.ts'
import { tokenExpiresAt } from '../auth/token.ts'
import { VEHICLES_PATH } from '../vehicles/vehicleAccess.ts'
import { MAINTENANCE_PATH } from '../maintenance/maintenanceTypes.ts'
import { DRIVERS_PATH } from '../drivers/driverAccess.ts'
import { FUELINGS_PATH } from '../fuelings/fuelingAccess.ts'
import { TRIP_CONFIRMATION_PATH } from '../trips/tripConfirmationTypes.ts'
import { TRIP_AGENDA_PATH } from '../trips/tripAgendaTypes.ts'
import { SERVICE_TYPES_PATH } from '../services/fleetServicesAccess.ts'
import { TRIP_SCHEDULING_PATH } from '../trips/tripSchedulingAccess.ts'
import { SVO_ORDERS_PATH, SVO_TEAM_ORDERS_PATH } from '../svo/svoOrderTypes.ts'
import { SVO_OCCURRENCES_PATH } from '../svo/svoOccurrenceTypes.ts'
import { SVO_TEAMS_PATH } from '../svo/svoTeamTypes.ts'
import { REPORTS_PATH } from '../reports/reportTypes.ts'
import { AUDIT_PATH } from '../services/auditLogs.ts'
import { FINES_PATH } from '../fines/fineTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../vehicleDocuments/vehicleDocumentTypes.ts'
import { REQUEST_ANALYSIS_PATH } from '../requests/requestAccess.ts'

type RouteDecision =
  | { kind: 'login' }
  | { kind: 'reports'; profile: Profile | null }
  | { kind: 'audit'; profile: Profile | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'home'; profile: Profile | null }
  | { kind: 'users'; profile: Profile | null }
  | { kind: 'dashboard'; profile: Profile | null }
  | { kind: 'profile-permissions'; profile: Profile | null }
  | { kind: 'vehicles'; profile: Profile | null }
  | { kind: 'maintenance'; profile: Profile | null }
  | { kind: 'drivers'; profile: Profile | null }
  | { kind: 'fuelings'; profile: Profile | null }
  | { kind: 'trip-confirmation'; profile: Profile | null }
  | { kind: 'trip-agenda'; profile: Profile | null }
  | { kind: 'service-types'; profile: Profile | null }
  | { kind: 'trip-scheduling'; profile: Profile | null }
  | { kind: 'svo-orders'; profile: Profile | null }
  | { kind: 'svo-team-orders'; profile: Profile | null }
  | { kind: 'svo-occurrences'; profile: Profile | null }
  | { kind: 'svo-teams'; profile: Profile | null }
  | { kind: 'vehicle-documents'; profile: Profile | null }
  | { kind: 'fines'; profile: Profile | null }
  | { kind: 'request-analysis'; profile: Profile | null }

function permitted(session: AuthSession, permission: string): boolean {
  return hasPermission(session, permission)
}

/** Decide a tela somente pelas permissões vigentes da sessão; a API continua aplicando o RBAC no servidor. */
export function resolveRoute(session: AuthSession | null, path: string, now = Date.now()): RouteDecision {
  if (!session || !tokenExpiresAt(session.token, session.perfil)
    || (tokenExpiresAt(session.token, session.perfil) ?? 0) <= now) {
    return path === '/login' ? { kind: 'login' } : { kind: 'redirect', to: '/login' }
  }

  const profile = resolveProfile(session.perfil)
  const home = authorizedHomePath(session)
  if (path === '/inicio' || path === '/minhas-solicitacoes') return { kind: 'redirect', to: home }

  if (path === PROFILE_HOMES.ADMINISTRADOR.path && permitted(session, 'users:read')) return { kind: 'users', profile }
  if (path === PROFILE_PERMISSIONS_PATH && hasAnyPermission(session, ['profiles:read', 'profiles:manage'])) {
    return { kind: 'profile-permissions', profile }
  }
  if (path === '/solicitacoes/minhas' && hasAnyPermission(session, ['requests:read:own', 'requests:create'])) {
    return { kind: 'home', profile: 'SOLICITANTE' }
  }
  if (path === REQUEST_ANALYSIS_PATH && hasAnyPermission(session, [
    'requests:read:all', 'requests:return', 'requests:reject', 'requests:approve-and-schedule',
  ])) return { kind: 'request-analysis', profile }

  if (path === '/frota/inicio' || path === '/frota/dashboard') {
    return permitted(session, 'dashboard:read') ? { kind: 'dashboard', profile } : { kind: 'redirect', to: home }
  }
  if (path === SVO_OCCURRENCES_PATH) {
    return permitted(session, 'svo:occurrences:read') ? { kind: 'svo-occurrences', profile } : { kind: 'redirect', to: home }
  }
  if (path === SVO_TEAMS_PATH) {
    return hasAnyPermission(session, ['svo:teams:read', 'svo:teams:manage'])
      ? { kind: 'svo-teams', profile } : { kind: 'redirect', to: home }
  }
  if (path === SVO_TEAM_ORDERS_PATH) {
    return hasAnyPermission(session, ['svo:orders:read:assigned', 'svo:orders:read:all', 'svo:orders:manage'])
      ? { kind: 'svo-team-orders', profile } : { kind: 'redirect', to: home }
  }
  if (path === SVO_ORDERS_PATH) {
    return hasAnyPermission(session, ['svo:orders:read:all', 'svo:orders:manage'])
      ? { kind: 'svo-orders', profile } : { kind: 'redirect', to: home }
  }
  if (path === VEHICLE_DOCUMENTS_PATH) {
    return permitted(session, 'vehicle-documents:read') ? { kind: 'vehicle-documents', profile } : { kind: 'redirect', to: home }
  }
  if (path === FINES_PATH) {
    return permitted(session, 'fines:read') ? { kind: 'fines', profile } : { kind: 'redirect', to: home }
  }
  if (path === REPORTS_PATH) {
    return session.permissions?.some((permission) => permission.startsWith('reports:read:'))
      || ['reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth']
        .some((permission) => hasPermission(session, permission))
      ? { kind: 'reports', profile } : { kind: 'redirect', to: home }
  }
  if (path === AUDIT_PATH) return hasAnyPermission(session, ['audit:read', 'audit:history:read'])
    ? { kind: 'audit', profile } : { kind: 'redirect', to: home }
  if (path === TRIP_CONFIRMATION_PATH) {
    return hasAnyPermission(session, ['trips:confirm', 'trips:read:all'])
      ? { kind: 'trip-confirmation', profile } : { kind: 'redirect', to: home }
  }
  if (path === TRIP_AGENDA_PATH) {
    return permitted(session, 'trips:read:all') ? { kind: 'trip-agenda', profile } : { kind: 'redirect', to: home }
  }
  if (path === MAINTENANCE_PATH) {
    return permitted(session, 'maintenance:read') ? { kind: 'maintenance', profile } : { kind: 'redirect', to: home }
  }
  if (path === VEHICLES_PATH) return permitted(session, 'vehicles:read') ? { kind: 'vehicles', profile } : { kind: 'redirect', to: home }
  if (path === DRIVERS_PATH) return permitted(session, 'drivers:read') ? { kind: 'drivers', profile } : { kind: 'redirect', to: home }
  if (path === FUELINGS_PATH) return permitted(session, 'fuelings:read') ? { kind: 'fuelings', profile } : { kind: 'redirect', to: home }
  if (path === SERVICE_TYPES_PATH) return permitted(session, 'services:read') ? { kind: 'service-types', profile } : { kind: 'redirect', to: home }
  if (path === TRIP_SCHEDULING_PATH) {
    return hasAnyPermission(session, ['requests:approve-and-schedule', 'trips:availability:read'])
      ? { kind: 'trip-scheduling', profile } : { kind: 'redirect', to: home }
  }

  if (path === home) return { kind: 'home', profile }
  return { kind: 'redirect', to: home }
}
