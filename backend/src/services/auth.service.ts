import jwt = require('jsonwebtoken')
import { USER_ROLES } from '../types/auth'
import type { AuthenticatedUser, JwtConfig, LoginSuccess } from '../types/auth'
import type { AuditLogger } from '../types/audit.types'
import type { UserRepository } from '../repositories/users.repository'
import { comparePassword } from './password.service'

/**
 * Resultado discriminado de uma tentativa de autenticação.
 */
export type LoginResult =
  | { kind: 'invalid-credentials' }
  | { kind: 'inactive' }
  | { kind: 'authenticated'; user: LoginSuccess }

/**
 * Serviço responsável pela autenticação de usuários, emissão de tokens JWT e trilha de auditoria de sessão.
 *
 * Aplica a política de segurança da FSPH e do SVO: tempo de expiração configurável, validação de hash bcrypt,
 * bloqueio de contas inativas e gravação obrigatória de eventos de acesso em `aud_audit`.
 */
export class AuthService {
  private readonly users: UserRepository
  private readonly jwtConfig: JwtConfig
  private readonly auditLogger: AuditLogger | undefined

  /**
   * Construtor do serviço de autenticação.
   *
   * @param users - Repositório de acesso aos dados cadastrais de usuários.
   * @param jwtConfig - Configuração de emissão e expiração de tokens JWT.
   * @param auditLogger - Serviço ou logger de auditoria opcional para registro de acessos e saídas.
   */
  constructor(
    users: UserRepository,
    jwtConfig: JwtConfig,
    auditLogger?: AuditLogger,
  ) {
    this.users = users
    this.jwtConfig = jwtConfig
    this.auditLogger = auditLogger
  }

  /**
   * Valida as credenciais de acesso sem revelar ao chamador se o e-mail ou a senha falhou,
   * registrando o resultado na trilha de auditoria (`aud_audit`).
   *
   * @param email - E-mail informado pelo usuário no formulário de login.
   * @param password - Senha em texto puro para verificação contra o hash bcrypt.
   * @returns Resultado discriminado da tentativa de autenticação (`invalid-credentials`, `inactive` ou `authenticated`).
   * @throws {Error} Se o registro do usuário no banco contiver um perfil RBAC inválido.
   * @remarks Utiliza mensagem idêntica para usuário não encontrado e senha incorreta para prevenir enumeração de contas.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase()
    const user = await this.users.findByEmail(normalizedEmail)
    if (!user) {
      await this.auditLogger?.recordAudit({
        userId: null,
        table: 'usr_user',
        recordId: null,
        operation: 'LOGIN_FAILURE',
        actorSnapshot: { email: normalizedEmail },
        reason: 'User not found',
      })
      return { kind: 'invalid-credentials' }
    }

    const isPasswordValid = await comparePassword(password, user.password_hash)
    if (!isPasswordValid) {
      await this.auditLogger?.recordAudit({
        userId: user.id,
        table: 'usr_user',
        recordId: user.id,
        operation: 'LOGIN_FAILURE',
        actorSnapshot: { id: user.id, email: user.email, role: user.role },
        reason: 'Invalid password',
      })
      return { kind: 'invalid-credentials' }
    }

    if (!user.is_active) {
      await this.auditLogger?.recordAudit({
        userId: user.id,
        table: 'usr_user',
        recordId: user.id,
        operation: 'LOGIN_INACTIVE',
        actorSnapshot: { id: user.id, email: user.email, role: user.role },
        reason: 'Inactive user account',
      })
      return { kind: 'inactive' }
    }

    if (!USER_ROLES.includes(user.role)) {
      throw new Error('O usuário armazenado possui um perfil inválido.')
    }
    const profile = user.role
    const token = jwt.sign(
      { id: user.id, perfil: profile },
      this.jwtConfig.secret,
      { algorithm: 'HS256', expiresIn: this.jwtConfig.expiresInSeconds },
    )

    await this.auditLogger?.recordAudit({
      userId: user.id,
      table: 'usr_user',
      recordId: user.id,
      operation: 'LOGIN_SUCCESS',
      actorSnapshot: { id: user.id, email: user.email, role: profile },
    })

    return {
      kind: 'authenticated',
      user: { token, nome: user.name, perfil: profile },
    }
  }

  /**
   * Registra o encerramento de sessão de um usuário autenticado na trilha de auditoria.
   *
   * @param user - Identificação e perfil extraídos do token JWT validado no middleware de autorização.
   * @remarks Assegura conformidade e rastreabilidade da saída voluntária do operador ou servidor.
   */
  async logout(user?: AuthenticatedUser): Promise<void> {
    if (!user) return
    await this.auditLogger?.recordAudit({
      userId: user.id,
      table: 'usr_user',
      recordId: user.id,
      operation: 'LOGOUT',
      actorSnapshot: { id: user.id, role: user.perfil },
    })
  }
}
