import type { UserRole } from './auth'

/** Dados recebidos pela borda HTTP para cadastrar uma conta de usuário. */
export interface CreateUserRequest {
  name: string
  email: string
  roleId: string
  password: string
  active?: boolean
}

/** Dados recebidos pela borda HTTP para editar uma conta existente. */
export interface UpdateUserRequest {
  name: string
  email: string
  roleId: string
  revision: number
}

/** Filtros aceitos pela listagem administrativa de usuários. */
export interface UserListFilters {
  name?: string
  role?: UserRole
  active?: boolean
  page?: number
  pageSize?: number
}

/** Operações de auditoria padronizadas para o gerenciamento de usuários. */
export const USER_AUDIT_OPERATIONS = {
  create: 'CREATE',
  edit: 'UPDATE',
  statusChange: 'STATUS_CHANGE',
} as const

/** Erro de domínio convertido pela borda HTTP em resposta REST apropriada. */
export class UserServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'UserServiceError'
    this.statusCode = statusCode
  }
}

