import { PROFILE_HOMES, PROFILE_PERMISSIONS_PATH } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'
import { VEHICLES_PATH } from '../vehicles/vehicleAccess.ts'
import { MAINTENANCE_PATH } from '../maintenance/maintenanceTypes.ts'
import { DRIVERS_PATH } from '../drivers/driverAccess.ts'
import { FUELINGS_PATH } from '../fuelings/fuelingAccess.ts'
import { MY_REQUESTS_PATH, NEW_REQUEST_PATH } from '../requests/requestAccess.ts'

export type SidebarIconName =
  | 'home'
  | 'users'
  | 'permissions'
  | 'audit'
  | 'settings'
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
  | 'help'

export interface SidebarMenuItem {
  label: string
  icon: SidebarIconName
  behavior: 'static' | 'button' | 'link'
  path?: string
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

const ADMINISTRATOR_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'static' },
    { label: 'Usuários', icon: 'users', behavior: 'link', path: PROFILE_HOMES.ADMINISTRADOR.path },
    {
      label: 'Perfis e Permissões',
      icon: 'permissions',
      behavior: 'link',
      path: PROFILE_PERMISSIONS_PATH,
    },
    {
      label: 'Veículos',
      icon: 'vehicles',
      behavior: 'link',
      path: VEHICLES_PATH,
      profiles: ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO'],
    },
    { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
    { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
    { label: 'Motoristas', icon: 'drivers', behavior: 'link', path: DRIVERS_PATH },
    { label: 'Auditoria', icon: 'audit', behavior: 'static' },
    { label: 'Configurações', icon: 'settings', behavior: 'static' },
  ],
  sections: [],
  footerItems: [{ label: 'Ajuda', icon: 'help', behavior: 'static' }],
  showDividerAfterTop: false,
}

const OPERATIONAL_NAVIGATION: SidebarNavigation = {
  topItems: [{ label: 'Início', icon: 'home', behavior: 'button', selected: true }],
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
        { label: 'Solicitações', icon: 'requests', behavior: 'button' },
        { label: 'Viagens', icon: 'trips', behavior: 'button' },
        { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'button' },
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
        { label: 'Tipos de serviço', icon: 'requests', behavior: 'button' },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'link', path: MAINTENANCE_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
        { label: 'Abastecimentos', icon: 'fuel', behavior: 'link', path: FUELINGS_PATH, profiles: ['GESTOR', 'ADMINISTRADOR'] },
      ],
    },
    {
      label: 'CONTROLE',
      spaced: true,
      items: [
        { label: 'Documentos', icon: 'documents', behavior: 'button' },
        { label: 'Multas e Infrações', icon: 'warnings', behavior: 'button' },
      ],
    },
    {
      label: 'GESTÃO',
      spaced: true,
      items: [
        { label: 'Dashboard', icon: 'dashboard', behavior: 'button' },
        { label: 'Relatórios', icon: 'reports', behavior: 'button' },
        { label: 'Auditoria', icon: 'audit', behavior: 'button' },
      ],
    },
  ],
  footerItems: [{ label: 'Ajuda', icon: 'help', behavior: 'button' }],
  showDividerAfterTop: true,
}

const SOLICITANTE_NAVIGATION: SidebarNavigation = {
  topItems: [
    { label: 'Início', icon: 'home', behavior: 'link', path: MY_REQUESTS_PATH },
    { label: 'Nova Solicitação', icon: 'requests', behavior: 'link', path: NEW_REQUEST_PATH },
    { label: 'Minhas Solicitações', icon: 'confirmTrips', behavior: 'link', path: MY_REQUESTS_PATH, badgeCount: 2 },
  ],
  sections: [],
  footerItems: [{ label: 'Ajuda', icon: 'help', behavior: 'static' }],
  showDividerAfterTop: true,
}

export function getSidebarNavigation(profile: Profile | null): SidebarNavigation {
  let navigation: SidebarNavigation;

  if (profile === 'ADMINISTRADOR') {
    navigation = ADMINISTRATOR_NAVIGATION;
  } else if (profile === 'SOLICITANTE') {
    navigation = SOLICITANTE_NAVIGATION;
  } else {
    navigation = OPERATIONAL_NAVIGATION;
  }

  const allowed = (item: SidebarMenuItem) =>
    item.profiles === undefined || (profile !== null && item.profiles.includes(profile));

  return {
    ...navigation,
    topItems: navigation.topItems.filter(allowed),
    sections: navigation.sections
      .map((section) => ({ ...section, items: section.items.filter(allowed) }))
      .filter((section) => section.items.length > 0),
    footerItems: navigation.footerItems.filter(allowed),
  };
}