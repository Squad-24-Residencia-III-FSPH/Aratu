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
import { SVO_TEAMS_PATH } from '../svo/svoTeamTypes.ts'
import { REQUEST_ANALYSIS_PATH } from '../requests/requestAccess.ts'
import { REPORTS_PATH } from '../reports/reportTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../types/vehicleDocument.ts'
import { FINES_PATH } from '../types/fine.ts'
import { SVO_OCCURRENCES_PATH } from '../types/svoOccurrence.ts'
import { AUDIT_LOGS_PATH } from '../types/auditLog.ts'
import { TRIP_AGENDA_PATH } from '../types/dashboard.ts'

export type SidebarIconName =
  | 'home'
  | 'users'
  | 'permissions'
  | 'audit'
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
  | 'menu'
  | 'add'

export type SidebarAction = 'open-request'

export interface SidebarMenuItem {
  label: string
  icon: SidebarIconName
  behavior: 'link' | 'action'
  path?: string
  action?: SidebarAction
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
  mobileItems: SidebarMenuItem[]
  primaryAction?: SidebarMenuItem
  showDividerAfterTop: boolean
}

const EMPTY_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [],
  footerItems: [],
  mobileItems: [],
  showDividerAfterTop: false,
}

const ADMINISTRATOR_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Perfis e Permissões', icon: 'permissions', behavior: 'link', path: PROFILE_PERMISSIONS_PATH },
    { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
    { label: 'Analisar solicitações', icon: 'analyzeRequests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
    { label: 'Equipes e plantões', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
    { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
    { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
    { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
    { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
    { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
    { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH },
    { label: 'Solicitações SVO', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
    { label: 'Acompanhamento de ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH },
    { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
    { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
    { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_LOGS_PATH },
  ],
  sections: [],
  footerItems: [],
  mobileItems: [
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Analisar', icon: 'analyzeRequests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Equipes', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
    { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
    { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
  ],
  showDividerAfterTop: false,
}

const FLEET_MANAGER_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.GESTOR.path }],
  sections: [
    {
      label: 'OPERAÇÃO',
      spaced: false,
      items: [
        { label: 'Analisar solicitações', icon: 'analyzeRequests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
        { label: 'Agenda de viagens', icon: 'tripAgenda', behavior: 'link', path: TRIP_AGENDA_PATH },
        { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
        { label: 'Solicitações SVO', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
        { label: 'Acompanhamento de ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH },
        { label: 'Equipes e plantões', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
      ],
    },
    {
      label: 'FROTA',
      spaced: true,
      items: [
        { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
        { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
        { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
        { label: 'Agendar viagem', icon: 'trips', behavior: 'link', path: TRIP_SCHEDULING_PATH },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
        { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
      ],
    },
    {
      label: 'CONTROLE',
      spaced: true,
      items: [
        { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
        { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH },
      ],
    },
    {
      label: 'GESTÃO',
      spaced: true,
      items: [
        { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
        { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
        { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_LOGS_PATH },
      ],
    },
  ],
  footerItems: [],
  mobileItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.GESTOR.path },
    { label: 'Agenda', icon: 'tripAgenda', behavior: 'link', path: TRIP_AGENDA_PATH },
    { label: 'Analisar', icon: 'analyzeRequests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Confirmar', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
  ],
  showDividerAfterTop: true,
}

const REQUESTER_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
    { label: 'Nova Solicitação', icon: 'newRequest', behavior: 'link', path: `${PROFILE_HOMES.SOLICITANTE.path}?nova=1` },
    { label: 'Minhas Solicitações', icon: 'confirmTrips', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
  ],
  sections: [],
  footerItems: [],
  mobileItems: [
    { label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
  ],
  primaryAction: { label: 'Nova solicitação', icon: 'add', behavior: 'action', action: 'open-request' },
  showDividerAfterTop: false,
}

const DRIVER_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path }],
  sections: [{
    label: 'OPERAÇÃO',
    spaced: false,
    items: [{ label: 'Minhas viagens', icon: 'trips', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path }],
  }],
  footerItems: [],
  mobileItems: [{ label: 'Minhas viagens', icon: 'trips', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path }],
  showDividerAfterTop: false,
}

const SVO_ATTENDANT_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'link', path: SVO_OCCURRENCES_PATH }],
  sections: [{
    label: 'ATENDIMENTO SVO',
    spaced: false,
    items: [
      { label: 'Solicitações SVO', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
      { label: 'Acompanhamento de ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH },
      { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
      { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
    ],
  }],
  footerItems: [],
  mobileItems: [
    { label: 'Chamados', icon: 'svoRequests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
    { label: 'Ordens', icon: 'svoTracking', behavior: 'link', path: SVO_ORDERS_PATH },
  ],
  showDividerAfterTop: false,
}

const SVO_TEAM_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'link', path: SVO_TEAM_ORDERS_PATH }],
  sections: [{
    label: 'EXECUÇÃO SVO',
    spaced: false,
    items: [{ label: 'Ordens da equipe', icon: 'requests', behavior: 'link', path: SVO_TEAM_ORDERS_PATH }],
  }],
  footerItems: [],
  mobileItems: [{ label: 'Ordens da equipe', icon: 'requests', behavior: 'link', path: SVO_TEAM_ORDERS_PATH }],
  showDividerAfterTop: false,
}

const NAVIGATION_BY_PROFILE: Record<Profile, SidebarNavigation> = {
  ADMINISTRADOR: ADMINISTRATOR_NAVIGATION,
  GESTOR: FLEET_MANAGER_NAVIGATION,
  SOLICITANTE: REQUESTER_NAVIGATION,
  MOTORISTA: DRIVER_NAVIGATION,
  ATENDENTE_SVO: SVO_ATTENDANT_NAVIGATION,
  EQUIPE_SVO: SVO_TEAM_NAVIGATION,
}

export function getSidebarNavigation(profile: Profile | null): SidebarNavigation {
  if (!profile) return EMPTY_NAVIGATION
  const navigation = NAVIGATION_BY_PROFILE[profile]
  return {
    ...navigation,
    topItems: [...navigation.topItems],
    sections: navigation.sections.map((section) => ({ ...section, items: [...section.items] })),
    footerItems: [...navigation.footerItems],
    mobileItems: [...navigation.mobileItems],
  }
}
