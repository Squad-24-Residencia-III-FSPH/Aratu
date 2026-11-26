import type { ApiRequest } from '../api/client.ts'

/** Perfil dinâmico usado nas atribuições de contas e na Administração de acessos. */
export interface ProfileOption {
  id: string
  name: string
  displayName: string
  description: string | null
  active: boolean
  revision: number
  defaultPath: string | null
  activeUserCount: number
  createdAt: string
}

export interface PermissionOption {
  id: string
  name: string
  description: string
  module: string
  label: string
  defaultPath: string
  scopeGroup?: string
  dependencies: readonly string[]
}

export interface ProfileDetails extends ProfileOption {
  permissions: PermissionOption[]
}

export interface ProfilesPage {
  profiles: ProfileOption[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ProfileListQuery {
  active?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export interface ProfileMutation {
  code?: string
  displayName: string
  description: string | null
  defaultPath: string | null
  permissionIds: readonly string[]
  reason: string
  expectedRevision?: number
}

export const PROFILE_ACCESS_DENIED_MESSAGE = 'Você não tem permissão para consultar perfis.'

export class ProfileListError extends Error {
  readonly kind: 'forbidden' | 'unavailable'

  constructor(kind: 'forbidden' | 'unavailable', message?: string) {
    super(kind === 'forbidden' ? PROFILE_ACCESS_DENIED_MESSAGE : message ?? 'Não foi possível carregar os perfis.')
    this.name = 'ProfileListError'
    this.kind = kind
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProfile(value: unknown): ProfileOption {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.displayName !== 'string'
    || !(typeof value.description === 'string' || value.description === null)
    || typeof value.active !== 'boolean'
    || typeof value.revision !== 'number'
    || !(typeof value.defaultPath === 'string' || value.defaultPath === null)) {
    throw new ProfileListError('unavailable', 'A resposta de perfis está em um formato inválido.')
  }
  return {
    id: value.id,
    name: value.name,
    displayName: value.displayName,
    description: value.description,
    active: value.active,
    revision: value.revision,
    defaultPath: value.defaultPath,
    activeUserCount: typeof value.activeUserCount === 'number' ? value.activeUserCount : 0,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
  }
}

function parseProfilesPage(value: unknown): ProfilesPage {
  if (!isRecord(value) || !Array.isArray(value.profiles)
    || typeof value.total !== 'number' || typeof value.page !== 'number'
    || typeof value.pageSize !== 'number' || typeof value.totalPages !== 'number') {
    throw new ProfileListError('unavailable', 'A resposta paginada de perfis está em um formato inválido.')
  }
  return {
    profiles: value.profiles.map(parseProfile),
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
    totalPages: value.totalPages,
  }
}

function errorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.erro === 'string' && value.erro.trim() ? value.erro : fallback
}

function parsePermission(value: unknown): PermissionOption {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
    || typeof value.description !== 'string' || typeof value.module !== 'string'
    || typeof value.label !== 'string' || typeof value.defaultPath !== 'string'
    || !Array.isArray(value.dependencies) || value.dependencies.some((item) => typeof item !== 'string')) {
    throw new Error('A resposta do catálogo de permissões está em um formato inválido.')
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    module: value.module,
    label: value.label,
    defaultPath: value.defaultPath,
    ...(typeof value.scopeGroup === 'string' ? { scopeGroup: value.scopeGroup } : {}),
    dependencies: value.dependencies as string[],
  }
}

function parsePermissionGroups(value: unknown): PermissionOption[] {
  if (!Array.isArray(value)) throw new Error('A resposta do catálogo de permissões está em um formato inválido.')
  return value.flatMap((group) => {
    if (Array.isArray(group)) return group.map(parsePermission)
    if (!isRecord(group) || typeof group.module !== 'string' || !Array.isArray(group.permissions)) {
      throw new Error('A resposta do catálogo de permissões está em um formato inválido.')
    }
    return group.permissions.map(parsePermission)
  })
}

function parseDetails(value: unknown): ProfileDetails {
  if (!isRecord(value) || !Array.isArray(value.permissions)) {
    throw new Error('A resposta detalhada do perfil está em um formato inválido.')
  }
  return { ...parseProfile(value), permissions: value.permissions.map(parsePermission) }
}

function queryString(query: ProfileListQuery): string {
  const params = new URLSearchParams()
  if (query.active !== undefined) params.set('active', String(query.active))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 403) return new ProfileListError('forbidden')
  return new Error(errorMessage(body, fallback))
}

/** Lista perfis no contrato-array legado para os seletores administrativos. */
export async function listProfiles(api: ApiRequest): Promise<ProfileOption[]>
/** Lista perfis com filtros e paginação do servidor. */
export async function listProfiles(api: ApiRequest, query: ProfileListQuery): Promise<ProfilesPage>
export async function listProfiles(api: ApiRequest, query?: ProfileListQuery): Promise<ProfileOption[] | ProfilesPage> {
  const response = await api(`/profiles${query ? queryString(query) : ''}`, { cache: 'no-store' })
  if (!response.ok) throw await readError(response, 'Não foi possível carregar os perfis.')
  const body: unknown = await response.json().catch(() => null)
  if (query) return parseProfilesPage(body)
  if (!Array.isArray(body)) throw new ProfileListError('unavailable', 'A resposta de perfis está em um formato inválido.')
  return body.map(parseProfile)
}

/** Carrega os dados do perfil e seus grants atuais. */
export async function getProfile(api: ApiRequest, id: string): Promise<ProfileDetails> {
  const response = await api(`/profiles/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!response.ok) throw await readError(response, 'Não foi possível carregar os detalhes do perfil.')
  return parseDetails(await response.json().catch(() => null))
}

/** Carrega o catálogo versionado de ações e escopos implementados no servidor. */
export async function listPermissions(api: ApiRequest): Promise<PermissionOption[]> {
  const response = await api('/profiles/permissions', { cache: 'no-store' })
  if (!response.ok) throw await readError(response, 'Não foi possível carregar as permissões.')
  return parsePermissionGroups(await response.json().catch(() => null))
}

async function mutateProfile(api: ApiRequest, url: string, method: 'POST' | 'PUT', input: ProfileMutation, key?: string): Promise<ProfileOption> {
  const response = await api(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, 'Não foi possível salvar o perfil.')
  return parseProfile(await response.json().catch(() => null))
}

/** Cria perfil e grants como uma operação idempotente. */
export function createProfile(api: ApiRequest, input: ProfileMutation, idempotencyKey: string): Promise<ProfileOption> {
  return mutateProfile(api, '/profiles', 'POST', input, idempotencyKey)
}

/** Atualiza os dados e grants sob expectedRevision. */
export function updateProfile(api: ApiRequest, id: string, input: ProfileMutation): Promise<ProfileOption> {
  return mutateProfile(api, `/profiles/${encodeURIComponent(id)}`, 'PUT', input)
}

/** Arquiva ou restaura perfil sem remover vínculos ou eventos. */
export async function setProfileActive(
  api: ApiRequest,
  id: string,
  active: boolean,
  expectedRevision: number,
  reason: string,
): Promise<ProfileOption> {
  const action = active ? 'activate' : 'deactivate'
  const response = await api(`/profiles/${encodeURIComponent(id)}/${action}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, reason }),
  })
  if (!response.ok) throw await readError(response, 'Não foi possível alterar a situação do perfil.')
  return parseProfile(await response.json().catch(() => null))
}
