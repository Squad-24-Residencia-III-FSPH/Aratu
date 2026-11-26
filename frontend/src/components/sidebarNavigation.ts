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

export interface SidebarMenuItem {
  label: string
  icon: SidebarIconName
  behavior: 'link'
  path?: string
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
  showDividerAfterTop: boolean
}

const ADMINISTRATOR_NAVIGATION: SidebarNavigation = {
  topItems: [],
  sections: [
    { label: 'ADMINISTRAÇÃO', spaced: false, items: [
      { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
      { label: 'Perfis', icon: 'permissions', behavior: 'link', path: PROFILE_PERMISSIONS_PATH },
    ] },
    { label: 'OPERAÇÃO', spaced: true, items: [
      { label: 'Solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
      { label: 'Agenda', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
      { label: 'Conferência', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
      { label: 'Painel', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
    ] },
    { label: 'SVO', spaced: true, items: [
      { label: 'Solicitações', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
      { label: 'Ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH },
      { label: 'Equipes', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
    ] },
    { label: 'FROTA', spaced: true, items: [
      { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
      { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
      { label: 'Serviços', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
      { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
      { label: 'Multas', icon: 'warnings', behavior: 'link', path: FINES_PATH },
      { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
      { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
    ] },
    { label: 'GESTÃO', spaced: true, items: [
      { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_PATH },
      { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH },
    ] },
  ],
  mobileItems: [
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    { label: 'Solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
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
        { label: 'Solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH },
        { label: 'Agenda', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH },
        { label: 'Conferência', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH },
      ],
    },
    {
      label: 'SVO',
      spaced: true,
      items: [
        { label: 'Solicitações', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH },
        { label: 'Ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH },
        { label: 'Equipes', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH },
      ],
    },
    {
      label: 'FROTA',
      spaced: true,
      items: [
        { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH },
        { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH },
        { label: 'Multas', icon: 'warnings', behavior: 'link', path: FINES_PATH },
        { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
        { label: 'Serviços', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH },
        { label: 'Agendar', icon: 'trips', behavior: 'link', path: TRIP_SCHEDULING_PATH },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH },
        { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH },
      ],
    },
    {
      label: 'GESTÃO',
      spaced: true,
      items: [
        { label: 'Painel', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH },
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
  topItems: [{ label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path }],
  sections: [],
  mobileItems: [
    { label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path },
  ],
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
      { label: 'Ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH },
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

const PERMISSION_NAVIGATION: readonly { section: string; item: SidebarMenuItem; permissions: readonly string[] }[] = [
  { section: 'ADMINISTRAÇÃO', item: { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path }, permissions: ['users:read'] },
  { section: 'ADMINISTRAÇÃO', item: { label: 'Perfis', icon: 'permissions', behavior: 'link', path: PROFILE_PERMISSIONS_PATH }, permissions: ['profiles:read', 'profiles:manage'] },
  { section: 'OPERAÇÃO', item: { label: 'Solicitações', icon: 'requests', behavior: 'link', path: REQUEST_ANALYSIS_PATH }, permissions: ['requests:read:all', 'requests:return', 'requests:reject', 'requests:approve-and-schedule'] },
  { section: 'OPERAÇÃO', item: { label: 'Agenda', icon: 'trips', behavior: 'link', path: TRIP_AGENDA_PATH }, permissions: ['trips:read:all'] },
  { section: 'OPERAÇÃO', item: { label: 'Conferência', icon: 'confirmTrips', behavior: 'link', path: TRIP_CONFIRMATION_PATH }, permissions: ['trips:confirm', 'trips:read:all'] },
  { section: 'OPERAÇÃO', item: { label: 'Agendar', icon: 'trips', behavior: 'link', path: TRIP_SCHEDULING_PATH }, permissions: ['requests:approve-and-schedule', 'trips:availability:read'] },
  { section: 'OPERAÇÃO', item: { label: 'Painel', icon: 'dashboard', behavior: 'link', path: GESTOR_DASHBOARD_PATH }, permissions: ['dashboard:read'] },
  { section: 'SVO', item: { label: 'Solicitações', icon: 'requests', behavior: 'link', path: SVO_OCCURRENCES_PATH }, permissions: ['svo:occurrences:read'] },
  { section: 'SVO', item: { label: 'Ordens', icon: 'trips', behavior: 'link', path: SVO_ORDERS_PATH }, permissions: ['svo:orders:read:all', 'svo:orders:manage'] },
  { section: 'SVO', item: { label: 'Ordens da equipe', icon: 'trips', behavior: 'link', path: SVO_TEAM_ORDERS_PATH }, permissions: ['svo:orders:read:assigned', 'svo:orders:read:all', 'svo:orders:manage'] },
  { section: 'SVO', item: { label: 'Equipes', icon: 'users', behavior: 'link', path: SVO_TEAMS_PATH }, permissions: ['svo:teams:read', 'svo:teams:manage'] },
  { section: 'FROTA', item: { label: 'Veículos', icon: 'vehicles', behavior: 'link', path: VEHICLES_PATH }, permissions: ['vehicles:read'] },
  { section: 'FROTA', item: { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH }, permissions: ['drivers:read'] },
  { section: 'FROTA', item: { label: 'Serviços', icon: 'serviceTypes', behavior: 'link', path: SERVICE_TYPES_PATH }, permissions: ['services:read'] },
  { section: 'FROTA', item: { label: 'Documentos', icon: 'documents', behavior: 'link', path: VEHICLE_DOCUMENTS_PATH }, permissions: ['vehicle-documents:read'] },
  { section: 'FROTA', item: { label: 'Multas', icon: 'warnings', behavior: 'link', path: FINES_PATH }, permissions: ['fines:read'] },
  { section: 'FROTA', item: { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH }, permissions: ['maintenance:read'] },
  { section: 'FROTA', item: { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH }, permissions: ['fuelings:read'] },
  { section: 'GESTÃO', item: { label: 'Auditoria', icon: 'audit', behavior: 'link', path: AUDIT_PATH }, permissions: ['audit:read', 'audit:history:read'] },
  { section: 'GESTÃO', item: { label: 'Relatórios', icon: 'reports', behavior: 'link', path: REPORTS_PATH }, permissions: ['reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth'] },
]

function permissionNavigation(profile: Profile | null, permissions: readonly string[]): SidebarNavigation {
  const granted = new Set(permissions)
  const visible = PERMISSION_NAVIGATION.filter(({ permissions: required }) => required.some((permission) => granted.has(permission)))
  const personalItems: SidebarMenuItem[] = []
  if (granted.has('requests:read:own') || granted.has('requests:create')) {
    personalItems.push({ label: 'Minhas solicitações', icon: 'requests', behavior: 'link', path: PROFILE_HOMES.SOLICITANTE.path })
  }
  if (granted.has('trips:read:assigned') || granted.has('trips:execute:assigned')) {
    personalItems.push({ label: 'Minhas viagens', icon: 'trips', behavior: 'link', path: PROFILE_HOMES.MOTORISTA.path })
  }
  if (profile === 'GESTOR' && granted.has('dashboard:read')) {
    personalItems.unshift({ label: 'Início', icon: 'home', behavior: 'link', path: GESTOR_DASHBOARD_PATH })
  }
  const groups = [...new Set(visible.map(({ section }) => section))]
  const sections = groups.map((label) => ({
    label,
    spaced: true,
    items: visible.filter((entry) => entry.section === label).map(({ item }) => item),
  }))
  const mobileItems = [...personalItems, ...sections.flatMap(({ items }) => items)]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.path === item.path) === index)
  return {
    topItems: personalItems,
    sections,
    mobileItems,
    showDividerAfterTop: personalItems.length > 0 && sections.length > 0,
  }
}

export function getSidebarNavigation(profile: Profile | null, permissions?: readonly string[]): SidebarNavigation {
  if (permissions !== undefined) return permissionNavigation(profile, permissions)
  if (!profile) return { topItems: [], sections: [], mobileItems: [], showDividerAfterTop: false }
  const navigation = NAVIGATION_BY_PROFILE[profile]
  return {
    ...navigation,
    topItems: [...navigation.topItems],
    sections: navigation.sections.map((section) => ({ ...section, items: [...section.items] })),
    mobileItems: [...navigation.mobileItems],
  }
}
