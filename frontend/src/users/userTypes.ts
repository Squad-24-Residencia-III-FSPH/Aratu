import type { Profile } from '../auth/profiles'

/** Conta de usuário retornada pela API administrativa, sem credenciais. */
export interface ManagedUser {
  id: string
  name: string
  email: string
  roleId: string
  role: Profile
  active: boolean
  revision: number
  createdAt: string
  updatedAt: string
}

/** Página de usuários com metadados de paginação. */
export interface UsersPage {
  users: ManagedUser[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Filtros aceitos pela listagem administrativa. */
export interface UserListQuery {
  name?: string
  role?: Profile
  active?: boolean
  page?: number
  pageSize?: number
}

/** Corpo enviado ao cadastrar uma conta. */
export interface CreateUserInput {
  name: string
  email: string
  roleId: string
  password: string
  active: boolean
}

/** Corpo enviado ao editar uma conta sob controle de revisão. */
export interface UpdateUserInput {
  name: string
  email: string
  roleId: string
  revision: number
}
