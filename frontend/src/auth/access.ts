import type { AuthSession } from './types'
import { resolveProfile } from './profiles'

type SessionAccess = Pick<AuthSession, 'perfil' | 'permissions'> | null

const LEGACY_GRANTS: Readonly<Record<string, readonly string[]>> = {
  ADMINISTRADOR: ['users:read', 'users:create', 'users:update', 'users:archive', 'profiles:read', 'profiles:manage',
    'permissions:catalog:read', 'requests:read:all', 'requests:history:read:all', 'trips:read:all', 'vehicles:read',
    'vehicles:create', 'vehicles:update', 'vehicles:status:change', 'vehicles:archive', 'vehicles:history:read',
    'drivers:read', 'drivers:create', 'drivers:update', 'drivers:status:change', 'drivers:archive', 'drivers:history:read',
    'services:read', 'services:create', 'services:update', 'services:vehicles:manage', 'services:archive',
    'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:close', 'fuelings:read',
    'fuelings:create', 'fuelings:rectify', 'fines:read', 'fines:create', 'fines:update', 'fines:status:change',
    'vehicle-documents:read', 'vehicle-documents:create', 'vehicle-documents:update', 'vehicle-documents:annul',
    'svo:occurrences:read', 'svo:occurrences:create', 'svo:occurrences:confirm', 'svo:orders:read:all',
    'svo:orders:manage', 'svo:teams:read', 'svo:teams:manage', 'dashboard:read', 'dashboard:svo:read',
    'reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth',
    'reports:export:trips', 'reports:export:fleet', 'reports:export:maintenance', 'reports:export:svo',
    'reports:export:auth', 'audit:read', 'audit:history:read'],
  GESTOR: ['requests:read:all', 'requests:history:read:all', 'requests:return', 'requests:reject', 'requests:approve-and-schedule',
    'trips:availability:read', 'trips:read:all', 'trips:create-direct', 'trips:confirm', 'vehicles:read', 'vehicles:create',
    'vehicles:update', 'vehicles:status:change', 'vehicles:archive', 'vehicles:history:read', 'drivers:read', 'drivers:create',
    'drivers:update', 'drivers:status:change', 'drivers:archive', 'drivers:history:read', 'services:read', 'services:create',
    'services:update', 'services:vehicles:manage', 'services:archive', 'maintenance:read', 'maintenance:create',
    'maintenance:update', 'maintenance:close', 'fuelings:read', 'fuelings:create', 'fuelings:rectify', 'fines:read',
    'fines:create', 'fines:update', 'fines:status:change', 'vehicle-documents:read', 'vehicle-documents:create',
    'vehicle-documents:update', 'vehicle-documents:annul', 'svo:occurrences:read', 'svo:teams:read', 'svo:teams:manage',
    'svo:orders:read:all', 'svo:orders:manage', 'dashboard:read', 'dashboard:svo:read', 'reports:read:trips',
    'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:export:trips', 'reports:export:fleet',
    'reports:export:maintenance', 'reports:export:svo', 'audit:read', 'audit:history:read'],
  SOLICITANTE: ['requests:read:own', 'requests:create', 'requests:resubmit:own', 'requests:history:read:own', 'services:read'],
  MOTORISTA: ['trips:read:assigned', 'trips:execute:assigned'],
  ATENDENTE_SVO: ['vehicles:read', 'services:read', 'svo:occurrences:read', 'svo:occurrences:create',
    'svo:occurrences:confirm', 'svo:orders:read:all', 'reports:read:svo', 'reports:export:svo'],
  EQUIPE_SVO: ['svo:orders:read:assigned', 'svo:orders:update:assigned', 'svo:orders:result:assigned'],
}

/** Verifica uma concessão efetiva do perfil retornado pelo servidor. */
export function hasPermission(session: SessionAccess, permission: string): boolean {
  if (!session) return false
  if (session.permissions !== undefined) return session.permissions.includes(permission)
  const profile = resolveProfile(session.perfil)
  return profile ? (LEGACY_GRANTS[profile] ?? []).includes(permission) : false
}

/** Verifica se a sessão tem ao menos uma das concessões informadas. */
export function hasAnyPermission(session: SessionAccess, permissions: readonly string[]): boolean {
  return permissions.some((permission) => hasPermission(session, permission))
}

/** Verifica se a sessão possui todas as concessões informadas. */
export function hasAllPermissions(session: SessionAccess, permissions: readonly string[]): boolean {
  return permissions.every((permission) => hasPermission(session, permission))
}

/** Escolhe uma página inicial conhecida que a sessão atual pode abrir. */
export function authorizedHomePath(session: AuthSession): string {
  if (session.homePath?.startsWith('/') && !session.homePath.startsWith('//')) return session.homePath
  const homeByPermission: readonly [string, string][] = [
    ['users:read', '/administracao/usuarios'], ['profiles:read', '/administracao/perfis'],
    ['requests:approve-and-schedule', '/solicitacoes/analisar'], ['requests:read:all', '/solicitacoes/analisar'],
    ['requests:read:own', '/solicitacoes/minhas'], ['trips:execute:assigned', '/viagens/minhas'],
    ['trips:read:assigned', '/viagens/minhas'], ['svo:occurrences:read', '/svo/solicitacoes'],
    ['svo:orders:read:assigned', '/svo/ordens'], ['svo:orders:read:all', '/svo/ordens'],
    ['svo:teams:read', '/svo/equipes'], ['svo:teams:manage', '/svo/equipes'],
    ['svo:orders:manage', '/svo/acompanhamento'], ['vehicles:read', '/veiculos'], ['drivers:read', '/motoristas'],
    ['services:read', '/tipos-de-servico'], ['vehicle-documents:read', '/frota/documentos'],
    ['fines:read', '/frota/multas'], ['maintenance:read', '/maintenance-orders'], ['fuelings:read', '/abastecimentos'],
    ['trips:confirm', '/viagens/confirmacao'], ['trips:read:all', '/viagens/agenda'],
    ['trips:availability:read', '/agendar-viagem'],
    ['audit:read', '/auditoria'], ['audit:history:read', '/auditoria'],
    ['dashboard:read', '/frota/dashboard'],
  ]
  const home = homeByPermission.find(([permission]) => hasPermission(session, permission))?.[1]
  if (home) return home
  return session.permissions?.some((permission) => permission.startsWith('reports:read:')) ? '/relatorios' : '/login'
}
