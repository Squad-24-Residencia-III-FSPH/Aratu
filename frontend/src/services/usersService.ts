import type { ApiRequest } from '../api/client'
import { resolveProfile } from '../auth/profiles.ts'
import type { Profile } from '../auth/profiles'
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
  UserListQuery,
  UsersPage,
} from '../users/userTypes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.erro === 'string' && value.erro.trim()) {
    return value.erro
  }
  return fallback
}

function parseUser(value: unknown): ManagedUser {
  if (!isRecord(value)) throw new Error('A resposta de usuários da API está em um formato inválido.')
  const role = typeof value.role === 'string' ? resolveProfile(value.role) : null
  if (
    typeof value.id !== 'string' || !value.id.trim()
    || typeof value.name !== 'string'
    || typeof value.email !== 'string'
    || typeof value.roleId !== 'string' || !value.roleId.trim()
    || !role
    || typeof value.active !== 'boolean'
    || typeof value.revision !== 'number' || !Number.isInteger(value.revision)
  ) {
    throw new Error('A resposta de usuários da API está em um formato inválido.')
  }
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    roleId: value.roleId,
    role,
    active: value.active,
    revision: value.revision,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function parseUsersPage(value: unknown): UsersPage {
  if (
    !isRecord(value)
    || !Array.isArray(value.users)
    || typeof value.total !== 'number' || !Number.isInteger(value.total)
    || typeof value.page !== 'number' || !Number.isInteger(value.page)
    || typeof value.pageSize !== 'number' || !Number.isInteger(value.pageSize)
    || typeof value.totalPages !== 'number' || !Number.isInteger(value.totalPages)
  ) {
    throw new Error('A resposta de usuários da API está em um formato inválido.')
  }
  return {
    users: value.users.map(parseUser),
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
    totalPages: value.totalPages,
  }
}

/** Constrói a query string da listagem, omitindo filtros vazios. */
export function buildUsersQuery(query: UserListQuery): string {
  const params = new URLSearchParams()
  if (query.name?.trim()) params.set('nome', query.name.trim())
  if (query.role) params.set('perfil', query.role)
  if (query.active !== undefined) params.set('ativo', String(query.active))
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

/** Lista usuários aplicando filtros e paginação. */
export async function listUsers(api: ApiRequest, query: UserListQuery = {}): Promise<UsersPage> {
  const response = await api(`/users${buildUsersQuery(query)}`)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(errorMessage(body, 'Não foi possível carregar os usuários.'))
  }
  return parseUsersPage(body)
}

/** Cadastra uma conta e retorna o usuário persistido. */
export async function createUser(api: ApiRequest, input: CreateUserInput): Promise<ManagedUser> {
  const response = await api('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(errorMessage(body, 'Não foi possível cadastrar o usuário.'))
  }
  return parseUser(body)
}

/** Edita uma conta existente sob controle de revisão. */
export async function updateUser(
  api: ApiRequest,
  id: string,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  const response = await api(`/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(errorMessage(body, 'Não foi possível atualizar o usuário.'))
  }
  return parseUser(body)
}

async function changeStatus(
  api: ApiRequest,
  id: string,
  action: 'activate' | 'deactivate',
): Promise<ManagedUser> {
  const response = await api(`/users/${encodeURIComponent(id)}/${action}`, { method: 'PATCH' })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(errorMessage(body, 'Não foi possível alterar a situação do usuário.'))
  }
  return parseUser(body)
}

/** Inativa uma conta sem exclusão física. */
export function deactivateUser(api: ApiRequest, id: string): Promise<ManagedUser> {
  return changeStatus(api, id, 'deactivate')
}

/** Reativa uma conta previamente inativada. */
export function activateUser(api: ApiRequest, id: string): Promise<ManagedUser> {
  return changeStatus(api, id, 'activate')
}

/** Resolve um perfil retornado pela API para o catálogo do frontend. */
export function toProfile(value: string): Profile | null {
  return resolveProfile(value)
}
