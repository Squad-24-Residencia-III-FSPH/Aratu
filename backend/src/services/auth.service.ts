import jwt = require('jsonwebtoken')
import { USER_ROLES } from '../types/auth'
import type { JwtConfig, LoginSuccess, UserRole } from '../types/auth'
import type { UserRepository } from '../repositories/users.repository'
import { comparePassword } from './password.service'

export type LoginResult =
  | { kind: 'invalid-credentials' }
  | { kind: 'inactive' }
  | { kind: 'authenticated'; user: LoginSuccess }

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwtConfig: JwtConfig,
  ) {}

  /** Valida a credencial sem revelar se a conta ou a senha falhou. */
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase()
    const user = await this.users.findByEmail(normalizedEmail)
    if (!user || !(await comparePassword(password, user.password_hash))) {
      return { kind: 'invalid-credentials' }
    }
    if (!user.is_active) return { kind: 'inactive' }

    if (!USER_ROLES.includes(user.role)) {
      throw new Error('O usuário armazenado possui um perfil inválido.')
    }
    const profile = user.role
    const token = jwt.sign(
      { id: user.id, perfil: profile },
      this.jwtConfig.secret,
      { algorithm: 'HS256', expiresIn: this.jwtConfig.expiresInSeconds },
    )

    return {
      kind: 'authenticated',
      user: { token, nome: user.name, perfil: profile },
    }
  }
}
