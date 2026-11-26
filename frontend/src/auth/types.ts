export interface LoginCredentials {
  email: string
  senha: string
}

export interface AuthSession {
  token: string
  nome: string
  perfil: string
  profile?: {
    id: string
    code: string
    displayName: string
    revision: number
  }
  permissions?: string[]
  homePath?: string | null
}

/** Permite cancelar o acesso durante a retomada sem repetir a autenticação. */
export interface SignInOptions {
  signal?: AbortSignal
  onPreparing?: (preparing: boolean) => void
}
