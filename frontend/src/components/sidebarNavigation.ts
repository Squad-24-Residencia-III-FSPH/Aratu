import { GESTOR_DASHBOARD_PATH, PROFILE_HOMES, PROFILE_PERMISSIONS_PATH } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import { VEHICLES_PATH } from '../vehicles/vehicleAccess.ts'
import { MAINTENANCE_PATH } from '../maintenance/maintenanceTypes.ts'
import { DRIVERS_PATH } from '../drivers/driverAccess.ts'
import { FUELINGS_PATH } from '../fuelings/fuelingAccess.ts'
import { TRIP_CONFIRMATION_PATH } from '../trips/tripConfirmationTypes.ts'
import { SERVICE_TYPES_PATH } from '../services/fleetServicesAccess.ts'
import { TRIP_SCHEDULING_PATH } from '../trips/tripSchedulingAccess.ts'
import { SVO_ORDERS_PATH, SVO_TEAM_ORDERS_PATH } from '../svo/svoOrderTypes.ts'
import { REQUEST_ANALYSIS_PATH } from '../requests/requestAccess.ts'
import { REPORTS_PATH } from '../reports/reportTypes.ts'
import { VEHICLE_DOCUMENT_MANAGER_ROLES, VEHICLE_DOCUMENTS_PATH } from '../types/vehicleDocument.ts'
import { FINE_ACCESS_PROFILES, FINES_PATH } from '../types/fine.ts'
import { SVO_OCCURRENCE_READ_ROLES, SVO_OCCURRENCES_PATH } from '../types/svoOccurrence.ts'
import { AUDIT_LOGS_PATH } from '../types/auditLog.ts'
import { DASHBOARD_READ_ROLES, TRIP_AGENDA_PATH, TRIP_AGENDA_ROLES } from '../types/dashboard.ts'

export type SidebarIconName =
  | 'home'
  | 'users'
  | 'permissions'
  | 'audit'
  | 'settings'
  | 'requests'
  | 'newRequest'
  | 'analyzeRequests'
  | 'svoRequests'
  | 'svoTracking'
  | 'tripAgenda'
  | 'trips'
  | 'confirmTrips'
  | 'vehicles'
  | 'drivers'
  | 'serviceTypes'
  | 'maintenance'
  | 'fuel'
  | 'documents'
  | 'warnings'
  | 'dashboard'
  | 'reports'
  | 'help'

export interface SidebarMenuItem {
  label: string
  icon: SidebarIconName
  behavior: 'static' | 'button' | 'link'
  path: string
  selected?: boolean
  badgeCount?: number
  profiles?: readonly Profile[]
}

export interface SidebarMenuSection {
  label: string
  items: SidebarMenuItem[]
  spaced: boolean
}

export interface SidebarNavigation {
  topItems: SidebarMenuItem[]
  sections: SidebarMenuSection[]
  footerItems: SidebarMenuItem[]
  showDividerAfterTop: boolean
}

const EMPTY_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [],
  footerItems: [],
  showDividerAfterTop: false,
}

const ADMINISTRATOR_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    {
      label: 'Perfis e Permissões',
      icon: 'permissions',
      behavior: 'link',
      path: PROFILE_PERMISSIONS_PATH,
    },
    { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
    {
      label: 'Veículos',
      icon: 'vehicles',
      behavior: 'link',
      path: VEHICLES_PATH,
      profiles: ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'],
    },
    { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
    { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
    { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
    { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH, profiles: VEHICLE_DOCUMENT_MANAGER_ROLES },
    { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH, profiles: FINE_ACCESS_PROFILES },
    { label: 'Solicitações SVO', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH, profiles: SVO_OCCURRENCE_READ_ROLES },
    { label: 'Acompanhamento de ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH, profiles: ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'] },
    { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH, profiles: DASHBOARD_READ_ROLES },
    { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'] },
    { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_LOGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
  ],
  sections: [],
  footerItems: [],
  showDividerAfterTop: false,
}

const OPERATIONAL_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.GESTOR.path }],
  sections: [
    {
      label: 'OPERAÇÃO',
      spaced: false,
      items: [
        {
          label: PROFILE_HOMES.MOTORISTA.title,
          icon: 'trips',
          behavior: 'link',
          path: PROFILE_HOMES.MOTORISTA.path,
          profiles: ['MOTORISTA'],
        },
        { label: 'Analisar solicitações', icon: 'analyzeRequests', behavior: 'link', path: REQUEST_ANALYSIS_PATH, profiles: ['GESTOR'] },
        { label: 'Agenda de viagens', icon: 'tripAgenda', behavior: 'link', path: TRIP_AGENDA_PATH, profiles: TRIP_AGENDA_ROLES },
        { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH, profiles: ['GESTOR'] },
        { label: 'Solicitações SVO', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH, profiles: SVO_OCCURRENCE_READ_ROLES },
        { label: 'Ordens da equipe', icon: 'requests', behavior: 'link', path: SVO_TEAM_ORDERS_PATH, profiles: ['EQUIPE_SVO'] },
        { label: 'Acompanhamento de ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH, profiles: ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'] },
      ],
    },
    {
      label: 'FROTA',
      spaced: true,
      items: [
        {
          label: 'Veículos',
          icon: 'vehicles',
          behavior: 'link',
          path: VEHICLES_PATH,
          profiles: ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'],
        },
        { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH, profiles: ['GESTOR'] },
        { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH, profiles: ['GESTOR'] },
        { label: 'Agendar viagem', icon: 'trips', behavior: 'link', path: TRIP_SCHEDULING_PATH, profiles: ['GESTOR'] },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
        { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
      ],
    },
    {
      label: 'CONTROLE',
      spaced: true,
      items: [
        { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH, profiles: VEHICLE_DOCUMENT_MANAGER_ROLES },
        { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH, profiles: FINE_ACCESS_PROFILES },
      ],
    },
    {
      label: 'GESTÃO',
      spaced: true,
      items: [
        { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH, profiles: DASHBOARD_READ_ROLES },
        { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'] },
        { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_LOGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
      ],
    },
  ],
  footerItems: [],
  showDividerAfterTop: true,
}

const SOLICITANTE_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
    { label: 'Nova Solicitação', icon: 'newRequest', behavior: 'link', path: `${PROFILE_HOMES.SOLICITANTE.path}?nova=1` },
    { label: 'Minhas Solicitações', icon: 'confirmTrips', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
  ],
  sections: [],
  footerItems: [],
  showDividerAfterTop: false,
}

export function getSidebarNavigation(profile: Profile | null): SidebarNavigation {
  if (profile === null) return EMPTY_NAVIGATION

  let navigation: SidebarNavigation
  if (profile === 'ADMINISTRADOR') {
    navigation = ADMINISTRATOR_NAVIGATION
  } else if (profile === 'SOLICITANTE') {
    navigation = SOLICITANTE_NAVIGATION
  } else {
    navigation = OPERATIONAL_NAVIGATION
  }

  const allowed = (item: SidebarMenuItem) =>
    item.profiles === undefined || item.profiles.includes(profile)

  const homePath = PROFILE_HOMES[profile].path
  const topItems = navigation.topItems.map((item) =>
    item.label === 'Início' ? { ...item, path: homePath } : item,
  )

  return {
    ...navigation,
    topItems: topItems.filter(allowed),
    sections: navigation.sections
      .map((section) => ({ ...section, items: section.items.filter(allowed) }))
      .filter((section) => section.items.length > 0),
    footerItems: navigation.footerItems.filter(allowed),
  }
}
