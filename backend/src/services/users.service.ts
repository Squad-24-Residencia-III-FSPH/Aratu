import { Buffer } from 'node:buffer'
import type { PoolClient } from 'pg'
import type { RoleRepositoryContract } from '../repositories/roles.repository'
import type { UsersRepositoryContract } from '../repositories/users.repository'
import { USER_ROLES } from '../types/auth'
import type { PaginatedUsers, Role, User } from '../types/auth'
import type { AuditActorSnapshot, AuditLogger } from '../types/audit.types'
import { USER_AUDIT_OPERATIONS, UserServiceError } from '../types/user.types'
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserListFilters,
} from '../types/user.types'
import { hashPassword } from './password.service'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PASSWORD_BYTES = 72
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UserServiceError(400, message)
  }
  return value.trim()
}

function normalizeEmail(value: unknown): string {
  const email = requireText(value, 'Informe o e-mail do usuário.').toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    throw new UserServiceError(400, 'Informe um e-mail válido.')
  }
  return email
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UserServiceError(400, 'Informe uma senha inicial.')
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new UserServiceError(400, 'A senha excede o limite de 72 bytes suportado pelo sistema.')
  }
  return value
}

function validateRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new UserServiceError(400, 'Revisão do usuário inválida.')
  }
  return value
}

function validateActive(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'boolean') {
    throw new UserServiceError(400, 'Situação do usuário inválida.')
  }
  return value
}

function validateId(value: string): string {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new UserServiceError(400, 'Identificador de usuário inválido.')
  }
  return value
}

function auditState(user: User): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    role: user.role,
    active: user.active,
    revision: user.revision,
  }
}

function auditActor(actor: User): AuditActorSnapshot {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  }
}

/**
 * Serviço responsável pelo gerenciamento administrativo de contas de usuários do Aratu.
 *
 * Centraliza validações de cadastro, unicidade de e-mail, bloqueio de autoinativação,
 * controle de concorrência por revisão e registro da trilha de auditoria em `audit.logs`.
 */
export class UsersService {
  constructor(
    private readonly users: UsersRepositoryContract,
    private readonly roles: RoleRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /**
   * Lista usuários aplicando filtros administrativos e paginação.
   *
   * @param filters - Filtros opcionais de nome, perfil, situação e paginação.
   * @returns Página de usuários com metadados de total.
   * @throws {UserServiceError} Se o perfil, a situação ou a paginação forem inválidos.
   */
  async listUsers(filters: UserListFilters): Promise<PaginatedUsers> {
    if (filters.role !== undefined && !USER_ROLES.includes(filters.role)) {
      throw new UserServiceError(400, 'Perfil de acesso inválido.')
    }
    if (filters.active !== undefined && typeof filters.active !== 'boolean') {
      throw new UserServiceError(400, 'Situação do usuário inválida.')
    }

    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE
    if (!Number.isInteger(page) || page < 1) {
      throw new UserServiceError(400, 'Página inválida.')
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new UserServiceError(400, `O tamanho da página deve estar entre 1 e ${MAX_PAGE_SIZE}.`)
    }

    return this.users.list({
      ...(filters.name?.trim() ? { search: filters.name.trim() } : {}),
      ...(filters.role !== undefined ? { role: filters.role } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      page,
      pageSize,
    })
  }

  /**
   * Retorna o detalhe de um usuário existente.
   *
   * @param id - Identificador numérico do usuário.
   * @returns Conta pública do usuário, sem credenciais.
   * @throws {UserServiceError} Se o identificador for inválido ou o usuário não existir.
   */
  async getUser(id: string): Promise<User> {
    const user = await this.users.findById(validateId(id))
    if (!user) throw new UserServiceError(404, 'Usuário não encontrado.')
    return user
  }

  /**
   * Cadastra uma conta de usuário com senha inicial protegida por bcrypt.
   *
   * Executa a criação e a auditoria na mesma transação para que uma falha de
   * rastreabilidade não deixe um usuário criado sem registro histórico.
   *
   * @param input - Dados do novo usuário, incluindo a senha inicial em texto puro.
   * @param actorId - Identificador do administrador autenticado que executa a ação.
   * @returns Conta criada, sem qualquer campo de credencial.
   * @throws {UserServiceError} Em validação inválida, perfil inexistente, sessão inválida ou e-mail duplicado.
   */
  async createUser(input: CreateUserRequest, actorId: string): Promise<User> {
    const name = requireText(input.name, 'Informe o nome do usuário.')
    const email = normalizeEmail(input.email)
    const role = await this.requireRole(input.roleId)
    const active = validateActive(input.active)
    const passwordHash = await hashPassword(validatePassword(input.password))

    try {
      return await this.users.withTransaction(async (client) => {
        const actor = await this.requireActor(actorId, client)
        const created = await this.users.create(
          { name, email, passwordHash, roleId: role.id, active },
          client,
        )
        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'auth.users',
          recordId: created.id,
          operation: USER_AUDIT_OPERATIONS.create,
          before: null,
          after: auditState(created),
          actorSnapshot: auditActor(actor),
          reason: 'Cadastro administrativo de usuário',
        }, client)
        return created
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) {
        throw new UserServiceError(409, 'E-mail já cadastrado.')
      }
      throw error
    }
  }

  /**
   * Edita nome, e-mail e perfil de um usuário sob controle de revisão otimista.
   *
   * @param id - Identificador do usuário a editar.
   * @param input - Novos dados e revisão lida pelo cliente.
   * @param actorId - Identificador do administrador autenticado.
   * @returns Conta atualizada, sem credenciais.
   * @throws {UserServiceError} Em validação inválida, usuário inexistente, conflito de revisão ou e-mail duplicado.
   */
  async updateUser(id: string, input: UpdateUserRequest, actorId: string): Promise<User> {
    const userId = validateId(id)
    const name = requireText(input.name, 'Informe o nome do usuário.')
    const email = normalizeEmail(input.email)
    const role = await this.requireRole(input.roleId)
    const revision = validateRevision(input.revision)

    try {
      return await this.users.withTransaction(async (client) => {
        const before = await this.users.findByIdForUpdate(userId, client)
        if (!before) throw new UserServiceError(404, 'Usuário não encontrado.')

        const actor = await this.requireActor(actorId, client)
        const result = await this.users.save(userId, {
          expectedRevision: revision,
          name,
          email,
          roleId: role.id,
        }, client)

        if (result.kind === 'not-found') {
          throw new UserServiceError(404, 'Usuário não encontrado.')
        }
        if (result.kind === 'revision-conflict') {
          throw new UserServiceError(
            409,
            'O usuário foi alterado por outra operação. Atualize os dados e tente novamente.',
          )
        }

        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'auth.users',
          recordId: result.user.id,
          operation: USER_AUDIT_OPERATIONS.edit,
          before: auditState(before),
          after: auditState(result.user),
          actorSnapshot: auditActor(actor),
          reason: 'Edição administrativa de usuário',
        }, client)

        return result.user
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) {
        throw new UserServiceError(409, 'E-mail já cadastrado.')
      }
      throw error
    }
  }

  /**
   * Inativa uma conta preservando o histórico e impedindo a autoinativação.
   *
   * @param id - Identificador do usuário a inativar.
   * @param actorId - Identificador do administrador autenticado.
   * @returns Conta inativada.
   * @throws {UserServiceError} Se o usuário não existir ou a operação for a própria conta do administrador.
   */
  async deactivateUser(id: string, actorId: string): Promise<User> {
    return this.changeActive(id, false, actorId, 'Inativação administrativa de usuário')
  }

  /**
   * Reativa uma conta previamente inativada.
   *
   * @param id - Identificador do usuário a reativar.
   * @param actorId - Identificador do administrador autenticado.
   * @returns Conta reativada.
   * @throws {UserServiceError} Se o usuário não existir.
   */
  async activateUser(id: string, actorId: string): Promise<User> {
    return this.changeActive(id, true, actorId, 'Reativação administrativa de usuário')
  }

  private async changeActive(
    id: string,
    active: boolean,
    actorId: string,
    reason: string,
  ): Promise<User> {
    const userId = validateId(id)

    return this.users.withTransaction(async (client) => {
      const before = await this.users.findByIdForUpdate(userId, client)
      if (!before) throw new UserServiceError(404, 'Usuário não encontrado.')

      if (!active && before.id === actorId) {
        throw new UserServiceError(409, 'Você não pode inativar a própria conta.')
      }
      if (before.active === active) return before

      const actor = await this.requireActor(actorId, client)
      const result = await this.users.save(userId, {
        expectedRevision: before.revision,
        active,
      }, client)

      if (result.kind === 'not-found') {
        throw new UserServiceError(404, 'Usuário não encontrado.')
      }
      if (result.kind === 'revision-conflict') {
        throw new UserServiceError(
          409,
          'O usuário foi alterado por outra operação. Atualize os dados e tente novamente.',
        )
      }

      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'auth.users',
        recordId: result.user.id,
        operation: USER_AUDIT_OPERATIONS.statusChange,
        before: auditState(before),
        after: auditState(result.user),
        actorSnapshot: auditActor(actor),
        reason,
      }, client)

      return result.user
    })
  }

  private async requireActor(actorId: string, client: PoolClient): Promise<User> {
    if (!/^[1-9]\d*$/.test(actorId)) {
      throw new UserServiceError(401, 'Sessão inválida. Entre novamente.')
    }
    const actor = await this.users.findById(actorId, client)
    if (!actor) throw new UserServiceError(401, 'Sessão inválida. Entre novamente.')
    return actor
  }

  private async requireRole(roleId: unknown): Promise<Role> {
    const id = requireText(roleId, 'Selecione um perfil de acesso.')
    const role = await this.roles.findById(id)
    if (!role) throw new UserServiceError(400, 'Perfil de acesso inválido.')
    return role
  }
}
