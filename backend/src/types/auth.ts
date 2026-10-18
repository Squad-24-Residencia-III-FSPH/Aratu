/**
 * Lista canônica de perfis de usuário (RBAC) suportados pelo Sistema Aratu.
 */
export const USER_ROLES = [
  'ADMINISTRADOR',
  'GESTOR',
  'SOLICITANTE',
  'MOTORISTA',
  'ATENDENTE_SVO',
  'EQUIPE_SVO',
] as const

/**
 * Papel ou perfil de acesso de um usuário no sistema (`usr_role`).
 */
export type UserRole = typeof USER_ROLES[number]

/**
 * Payload JSON recebido na requisição de autenticação (`POST /auth/login`).
 */
export interface LoginRequestBody {
  /** Endereço de e-mail informado no login. */
  email: string
  /** Senha em texto puro para verificação com bcrypt. */
  senha: string
}

/**
 * Dados de usuário retornados pelo repositório para o fluxo de autenticação.
 */
export interface UserForLogin {
  /** Identificador numérico do usuário formatado como texto (`usr_id::text`). */
  id: string
  /** Nome completo do usuário (`usr_name`). */
  name: string
  /** Endereço de e-mail institucional (`usr_email`). */
  email: string
  /** Hash criptográfico da senha (`usr_password_hash`). */
  password_hash: string
  /** Perfil de acesso RBAC atribuído ao usuário (`usr_role`). */
  role: UserRole
  /** Indica se a conta está ativa e autorizada a autenticar (`usr_active`). */
  is_active: boolean
}

/**
 * Dados do usuário autenticado extraídos do token JWT e injetados na requisição (`req.usuario`).
 */
export interface AuthenticatedUser {
  /** Identificador único do usuário autenticado. */
  id: string
  /** Perfil RBAC ativo durante a sessão. */
  perfil: UserRole
}

/**
 * Configuração de segurança e ciclo de vida de tokens JWT.
 */
export interface JwtConfig {
  /** Chave secreta compartilhada para assinatura HMAC-SHA256. */
  secret: string
  /** Tempo de expiração da sessão em segundos. */
  expiresInSeconds: number
}

/**
 * Resposta de sucesso retornada pelo endpoint de autenticação (`POST /auth/login`).
 */
export interface LoginSuccess {
  /** Token JWT assinado contendo as claims de sessão. */
  token: string
  /** Nome de exibição do usuário na interface. */
  nome: string
  /** Perfil RBAC do usuário para roteamento e autorização no frontend. */
  perfil: UserRole
}
