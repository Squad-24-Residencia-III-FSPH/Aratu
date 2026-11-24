import { GESTOR_DASHBOARD_PATH, PROFILE_HOMES, PROFILE_PERMISSIONS_PATH } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
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
import { REQUEST_ANALYSIS_PATH } from '../requests/requestAccess.ts'
import { REPORTS_PATH } from '../reports/reportTypes.ts'
import { AUDIT_PATH } from '../services/auditLogs.ts'
import { FINES_PATH } from '../fines/fineTypes.ts'
import { VEHICLE_DOCUMENTS_PATH } from '../vehicleDocuments/vehicleDocumentTypes.ts'

export type SidebarIconName =
  | 'home'
  | 'users'
  | 'permissions'
  | 'audit'
  | 'requests'
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
}

export interface SidebarMenuSection {
  label: string
  items: SidebarMenuItem[]
  spaced: boolean
}

export interface SidebarNavigation {
  topItems: SidebarMenuItem[]
  sections: SidebarMenuSection[]
  mobileItems: SidebarMenuItem[]
  primaryAction?: SidebarMenuItem
  showDividerAfterTop: boolean
}

const ADMINISTRATOR_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Perfis e Permissões', icon: 'permissions', behavior: 'link', path: PROFILE_PERMISSIONS_PATH },
    { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
    { label: 'Analisar solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Agenda de viagens', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
    { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
    { label: 'Acompanhamento de ordens', icon: 'requests', behavior: 'link', path: SVO_ORDERS_PATH },
    { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
    { label: 'Solicitações SVO', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
    { label: 'Equipes e plantões', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
    { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
    { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
    { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH },
    { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
    { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
    { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
    { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_PATH },
    { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
  ],
  sections: [],
  mobileItems: [
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Analisar', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Agenda', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
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
        { label: 'Analisar solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
        { label: 'Agenda de viagens', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
        { label: 'Solicitações SVO', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
        { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
        { label: 'Acompanhamento de ordens', icon: 'requests', behavior: 'link', path: SVO_ORDERS_PATH },
        { label: 'Equipes e plantões', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
      ],
    },
    {
      label: 'FROTA',
      spaced: true,
      items: [
        { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
        { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
        { label: 'Multas e Infrações', icon: 'warnings', behavior: 'link', path: FINES_PATH },
        { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
        { label: 'Tipos de serviço', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
        { label: 'Agendar viagem', icon: 'trips', behavior: 'link', path: TRIP_SCHEDULING_PATH },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
        { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
      ],
    },
    {
      label: 'GESTÃO',
      spaced: true,
      items: [
        { label: 'Dashboard', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
        { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
        { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_PATH },
      ],
    },
  ],
  mobileItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: PROFILE_HOMES.GESTOR.path },
    { label: 'Agenda', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
    { label: 'Analisar', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
    { label: 'Confirmar', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
  ],
  showDividerAfterTop: true,
}

const REQUESTER_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
    { label: 'Nova solicitação', icon: 'add', behavior: 'action', action: 'open-request' },
  ],
  sections: [],
  mobileItems: [
    { label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
  ],
  primaryAction: { label: 'Nova solicitação', icon: 'add', behavior: 'action', action: 'open-request' },
  showDividerAfterTop: false,
}

const DRIVER_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [{
    label: 'OPERAÇÃO',
    spaced: false,
    items: [{ label: 'Minhas viagens', icon: 'trips', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path }],
  }],
  mobileItems: [{ label: 'Minhas viagens', icon: 'trips', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path }],
  showDividerAfterTop: false,
}

const SVO_ATTENDANT_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [{
    label: 'ATENDIMENTO SVO',
    spaced: false,
    items: [
      { label: 'Solicitações SVO', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
      { label: 'Acompanhamento de ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH },
      { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
      { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
    ],
  }],
  mobileItems: [
    { label: 'Chamados', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
    { label: 'Ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH },
  ],
  showDividerAfterTop: false,
}

const SVO_TEAM_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [{
    label: 'EXECUÇÃO SVO',
    spaced: false,
    items: [{ label: 'Ordens da equipe', icon: 'requests', behavior: 'link', path: SVO_TEAM_ORDERS_PATH }],
  }],
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
  if (!profile) return { topItems: [], sections: [], mobileItems: [], showDividerAfterTop: false }
  const navigation = NAVIGATION_BY_PROFILE[profile]
  return {
    ...navigation,
    topItems: [...navigation.topItems],
    sections: navigation.sections.map((section) => ({ ...section, items: [...section.items] })),
    mobileItems: [...navigation.mobileItems],
  }
}
