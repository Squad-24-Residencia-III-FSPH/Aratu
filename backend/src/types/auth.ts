export const USER_ROLES = [
  'ADMINISTRADOR',
  'GESTOR',
  'SOLICITANTE',
  'MOTORISTA',
  'ATENDENTE_SVO',
  'EQUIPE_SVO',
] as const

export type UserRole = typeof USER_ROLES[number]

export interface LoginRequestBody {
  email: string
  senha: string
}

export interface UserForLogin {
  id: string
  name: string
  email: string
  password_hash: string
  role: UserRole
  is_active: boolean
}

export interface AuthenticatedUser {
  id: string
  perfil: UserRole
}

export interface JwtConfig {
  secret: string
  expiresInSeconds: number
}

export interface LoginSuccess {
  token: string
  nome: string
  perfil: UserRole
}
