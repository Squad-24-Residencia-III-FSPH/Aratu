import { PROFILE_HOMES, PROFILE_PERMISSIONS_PATH } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles.ts'

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
        { label: 'Solicitações', icon: 'requests', behavior: 'button' },
        { label: 'Viagens', icon: 'trips', behavior: 'button' },
        { label: 'Confirmar viagens', icon: 'confirmTrips', behavior: 'button' },
      ],
    },
    {
      label: 'FROTA',
      spaced: true,
      items: [
        { label: 'Veículos', icon: 'vehicles', behavior: 'button' },
        { label: 'Motoristas', icon: 'drivers', behavior: 'button' },
        { label: 'Tipos de serviço', icon: 'requests', behavior: 'button' },
        { label: 'Manutenção', icon: 'maintenance', behavior: 'button' },
        { label: 'Abastecimento', icon: 'fuel', behavior: 'button' },
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

/** Escolhe o conteúdo lateral sem alterar o shell ou os destinos existentes. */
export function getSidebarNavigation(profile: Profile | null): SidebarNavigation {
  return profile === 'ADMINISTRADOR' ? ADMINISTRATOR_NAVIGATION : OPERATIONAL_NAVIGATION
}
