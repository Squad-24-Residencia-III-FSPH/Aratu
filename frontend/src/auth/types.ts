export interface LoginCredentials {
  email: string
  senha: string
}

export interface AuthSession {
  token: string
  nome: string
  perfil: string
}
