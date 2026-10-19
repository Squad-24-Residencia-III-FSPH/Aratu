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
 * Papel ou perfil de acesso de um usuário no sistema (`auth.roles.name`).
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
  /** Identificador numérico do usuário formatado como texto (`auth.users.id::text`). */
  id: string
  /** Nome completo do usuário (`auth.users.name`). */
  name: string
  /** Endereço de e-mail institucional (`auth.users.email`). */
  email: string
  /** Hash criptográfico da senha (`auth.users.password_hash`). */
  password_hash: string
  /** Identificador do perfil RBAC atribuído ao usuário (`auth.users.role_id`). */
  roleId: string
  /** Nome do perfil RBAC obtido via JOIN com `auth.roles`. */
  role: UserRole
  /** Indica se a conta está ativa e autorizada a autenticar (`auth.users.active`). */
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

/**
 * Representação de um perfil de acesso RBAC no Sistema Aratu (`auth.roles`).
 */
export interface Role {
  /** Identificador numérico do perfil formatado como texto. */
  id: string
  /** Nome canônico do perfil (ex: ADMINISTRADOR, GESTOR). */
  name: UserRole
  /** Descrição das atribuições operacionais do perfil. */
  description: string | null
  /** Data/hora de criação do perfil. */
  createdAt: Date
}

/**
 * Permissão atômica do sistema (`auth.permissions`).
 */
export interface Permission {
  /** Identificador numérico da permissão formatado como texto. */
  id: string
  /** Código da permissão (ex: users:read, profiles:read). */
  name: string
  /** Descrição textual da ação permitida. */
  description: string
  /** Data/hora de registro da permissão. */
  createdAt: Date
}

/**
 * Representação pública e segura de uma conta de usuário (`auth.users`).
 * NUNCA contém password_hash ou qualquer dado sensível de credencial.
 */
export interface User {
  /** Identificador numérico do usuário. */
  id: string
  /** Nome completo do servidor/colaborador. */
  name: string
  /** E-mail institucional normalizado. */
  email: string
  /** Identificador do perfil de acesso. */
  roleId: string
  /** Nome do perfil obtido via JOIN com auth.roles. */
  role: UserRole
  /** Conta ativa ou desativada. */
  active: boolean
  /** Controle de concorrência otimista. */
  revision: number
  /** Data de cadastro. */
  createdAt: Date
  /** Data da última atualização. */
  updatedAt: Date
}

/** Resultado discriminado de uma atualização protegida por revisão otimista. */
export type UpdateUserResult =
  | { kind: 'updated'; user: User }
  | { kind: 'not-found' }
  | { kind: 'revision-conflict' }

/**
 * Parâmetros de entrada para criação de uma nova conta de usuário.
 */
export interface CreateUserInput {
  /** Nome completo do servidor/colaborador. */
  name: string
  /** Endereço de e-mail institucional. */
  email: string
  /** Hash bcrypt da senha já processado. */
  passwordHash: string
  /** Identificador do perfil RBAC a ser atribuído. */
  roleId: string
  /** Estado inicial da conta (padrão: true). */
  active?: boolean
}

/**
 * Parâmetros de entrada para atualização parcial de dados de usuário.
 */
export interface UpdateUserInput {
  /** Revisão recebida pelo cliente no último carregamento da conta. */
  expectedRevision: number
  /** Novo nome completo (opcional). */
  name?: string
  /** Novo perfil RBAC (opcional). */
  roleId?: string
  /** Ativar ou desativar a conta (opcional). */
  active?: boolean
  /** Novo hash de senha (opcional). */
  passwordHash?: string
}

/**
 * Filtros de busca e paginação para listagem de contas de usuários.
 */
export interface UserFilters {
  /** Filtrar por identificador de perfil. */
  roleId?: string
  /** Filtrar por nome de perfil. */
  role?: UserRole
  /** Filtrar por status da conta. */
  active?: boolean
  /** Termo textual para busca por nome ou e-mail. */
  search?: string
  /** Número da página (base 1). */
  page?: number
  /** Tamanho da página (padrão: 20). */
  pageSize?: number
}

/**
 * Resultado estruturado e paginado da listagem de usuários.
 */
export interface PaginatedUsers {
  /** Lista de usuários da página atual. */
  users: User[]
  /** Total de registros encontrados com os filtros aplicados. */
  total: number
  /** Página atual. */
  page: number
  /** Tamanho da página. */
  pageSize: number
  /** Total de páginas disponíveis. */
  totalPages: number
}
