
import { GESTOR_DASHBOARD_PATH, PROFILE_HOMES, PROFILE_PERMISSIONS_PATH, resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import type { AuthSession } from '../auth/types.ts'
import { tokenExpiresAt } from '../auth/token.ts'
import { canReadVehicles, VEHICLES_PATH } from '../vehicles/vehicleAccess.ts'
import { canManageMaintenance, MAINTENANCE_PATH } from '../maintenance/maintenanceTypes.ts'
import { canReadDrivers, DRIVERS_PATH } from '../drivers/driverAccess.ts'
import { canAccessFuelings, FUELINGS_PATH } from '../fuelings/fuelingAccess.ts'
import { TRIP_CONFIRMATION_PATH } from '../trips/tripConfirmationTypes.ts'
import { TRIP_AGENDA_PATH } from '../trips/tripAgendaTypes.ts'
import { canManageServiceTypes, SERVICE_TYPES_PATH } from '../services/fleetServicesAccess.ts'
import { canScheduleTrips, TRIP_SCHEDULING_PATH } from '../trips/tripSchedulingAccess.ts'
import { SVO_ORDERS_PATH } from '../svo/svoOrderTypes.ts'
import { canAnalyzeRequests, REQUEST_ANALYSIS_PATH } from '../requests/requestAccess.ts'
import { canAccessReports } from '../reports/reportAccess.ts'
import { REPORTS_PATH } from '../reports/reportTypes.ts'
import { AUDIT_PATH, canReadAudit } from '../services/auditLogs.ts'
import { SVO_OCCURRENCES_PATH } from '../svo/svoOccurrenceTypes.ts'
import { SVO_TEAMS_PATH } from '../svo/svoTeamTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../vehicleDocuments/vehicleDocumentTypes.ts'
import { FINES_PATH } from '../fines/fineTypes.ts'

type RouteDecision =
  | { kind: 'login' }
  | { kind: 'reports'; profile: Profile }
  | { kind: 'audit'; profile: Profile }
  | { kind: 'redirect'; to: string }
  | { kind: 'home'; profile: Profile }
  | { kind: 'dashboard'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'profile-permissions'; profile: 'ADMINISTRADOR' }
  | { kind: 'vehicles'; profile: Profile }
  | { kind: 'maintenance'; profile: Profile }
  | { kind: 'drivers'; profile: Profile }
  | { kind: 'fuelings'; profile: Profile }
  | { kind: 'trip-confirmation'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'trip-agenda'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'service-types'; profile: Profile }
  | { kind: 'trip-scheduling'; profile: Profile }
  | { kind: 'svo-orders'; profile: 'ATENDENTE_SVO' | 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'svo-occurrences'; profile: 'ATENDENTE_SVO' | 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'svo-teams'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'vehicle-documents'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'fines'; profile: 'GESTOR' | 'ADMINISTRADOR' }
  | { kind: 'request-analysis'; profile: 'GESTOR' | 'ADMINISTRADOR' }

export function resolveRoute(session: AuthSession | null, path: string, now = Date.now()): RouteDecision {
  const profile = session && resolveProfile(session.perfil)
  const expiresAt = session && tokenExpiresAt(session.token, session.perfil)

  if (!session || !profile || !expiresAt || expiresAt <= now) {
    return path === '/login' ? { kind: 'login' } : { kind: 'redirect', to: '/login' }
  }

  const home = PROFILE_HOMES[profile].path

  if (path === '/inicio' || path === '/minhas-solicitacoes') {
    return { kind: 'redirect', to: home }
  }

  if (path === GESTOR_DASHBOARD_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR' ? { kind: 'dashboard', profile } : { kind: 'redirect', to: home }
  }
  if (path === SVO_OCCURRENCES_PATH) {
    return profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'svo-occurrences', profile }
      : { kind: 'redirect', to: home }
  }
  if (path === SVO_TEAMS_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'svo-teams', profile }
      : { kind: 'redirect', to: home }
  }
  if (path === VEHICLE_DOCUMENTS_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'vehicle-documents', profile } : { kind: 'redirect', to: home }
  }
  if (path === FINES_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'fines', profile } : { kind: 'redirect', to: home }
  }

  if (path === REPORTS_PATH) {
    return canAccessReports(profile) ? { kind: 'reports', profile } : { kind: 'redirect', to: home }
  }
  if (path === AUDIT_PATH) return canReadAudit(profile) ? { kind: 'audit', profile } : { kind: 'redirect', to: home }
  if (path === SVO_ORDERS_PATH) {
    return profile === 'ATENDENTE_SVO' || profile === 'GESTOR' || profile === 'ADMINISTRADOR'
      ? { kind: 'svo-orders', profile }
      : { kind: 'redirect', to: home }
  }

  if (path === TRIP_CONFIRMATION_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR' ? { kind: 'trip-confirmation', profile } : { kind: 'redirect', to: home }
  }
  if (path === TRIP_AGENDA_PATH) {
    return profile === 'GESTOR' || profile === 'ADMINISTRADOR' ? { kind: 'trip-agenda', profile } : { kind: 'redirect', to: home }
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

  if (path === SERVICE_TYPES_PATH) {
    return canManageServiceTypes(profile)
      ? { kind: 'service-types', profile }
      : { kind: 'redirect', to: home }
  }

  if (path === TRIP_SCHEDULING_PATH) {
    return canScheduleTrips(profile)
      ? { kind: 'trip-scheduling', profile }
      : { kind: 'redirect', to: home }
  }

  if (path === REQUEST_ANALYSIS_PATH) {
    return canAnalyzeRequests(profile)
      ? { kind: 'request-analysis', profile }
      : { kind: 'redirect', to: home }
  }

  return path === home ? { kind: 'home', profile } : { kind: 'redirect', to: home }
}
