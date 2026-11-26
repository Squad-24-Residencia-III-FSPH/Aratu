import type { RoleRepositoryContract, CreateRoleRepositoryInput, UpdateRoleRepositoryInput } from '../repositories/roles.repository'
import type { Role, Permission, AuthenticatedUser } from '../types/auth'
import type { AuditLogger } from '../types/audit.types'
import type {
  CreateRoleEventInput,
  PaginatedProfiles,
  PermissionCatalogItem,
  ProfileFilters,
  ProfileMutationInput,
} from '../types/permission.types'
import { PERMISSION_DEFINITIONS } from '../types/permission.types'
import type { PermissionName } from '../types/permission.types'

const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,62}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PROFILE_NAME_LENGTH = 100
const MAX_PROFILE_DESCRIPTION_LENGTH = 500
const MAX_REASON_LENGTH = 500
const MAX_PAGE_SIZE = 100

const PERMISSION_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  'profiles:manage': ['profiles:read', 'permissions:catalog:read'],
  'users:create': ['users:read', 'profiles:read'],
  'users:update': ['users:read', 'profiles:read'],
  'users:archive': ['users:read'],
  'requests:return': ['requests:read:all'],
  'requests:reject': ['requests:read:all'],
  'requests:approve-and-schedule': ['requests:read:all', 'trips:availability:read'],
  'requests:create': ['requests:read:own'],
  'requests:history:read:all': ['requests:read:all'],
  'requests:history:read:own': ['requests:read:own'],
  'trips:availability:read': ['services:read', 'vehicles:read', 'drivers:read'],
  'trips:create-direct': ['trips:availability:read'],
  'trips:execute:assigned': ['trips:read:assigned'],
  'trips:confirm': ['trips:read:all'],
  'vehicles:create': ['vehicles:read'],
  'vehicles:update': ['vehicles:read'],
  'vehicles:status:change': ['vehicles:read'],
  'vehicles:archive': ['vehicles:read'],
  'vehicles:history:read': ['vehicles:read', 'audit:read', 'audit:history:read'],
  'services:history:read': ['services:read', 'audit:read', 'audit:history:read'],
  'drivers:create': ['drivers:read'],
  'drivers:update': ['drivers:read'],
  'drivers:status:change': ['drivers:read'],
  'drivers:archive': ['drivers:read'],
  'drivers:history:read': ['drivers:read', 'audit:read', 'audit:history:read'],
  'services:create': ['services:read'],
  'services:update': ['services:read'],
  'services:vehicles:manage': ['services:read', 'vehicles:read'],
  'services:archive': ['services:read'],
  'maintenance:create': ['maintenance:read', 'vehicles:read'],
  'maintenance:update': ['maintenance:read', 'vehicles:read'],
  'maintenance:close': ['maintenance:read', 'vehicles:read'],
  'fuelings:read': ['vehicles:read'],
  'fuelings:create': ['fuelings:read', 'vehicles:read'],
  'fuelings:rectify': ['fuelings:read', 'vehicles:read'],
  'fines:read': ['vehicles:read', 'drivers:read'],
  'fines:create': ['fines:read', 'vehicles:read', 'drivers:read'],
  'fines:update': ['fines:read', 'vehicles:read', 'drivers:read'],
  'fines:status:change': ['fines:read', 'vehicles:read', 'drivers:read'],
  'vehicle-documents:read': ['vehicles:read'],
  'vehicle-documents:create': ['vehicle-documents:read', 'vehicles:read'],
  'vehicle-documents:update': ['vehicle-documents:read', 'vehicles:read'],
  'vehicle-documents:annul': ['vehicle-documents:read', 'vehicles:read'],
  'svo:occurrences:create': ['svo:occurrences:read'],
  'svo:occurrences:confirm': ['svo:occurrences:read'],
  'svo:teams:manage': ['svo:teams:read'],
  'svo:orders:update:assigned': ['svo:orders:read:assigned'],
  'svo:orders:result:assigned': ['svo:orders:read:assigned'],
  'svo:orders:manage': ['svo:orders:read:all'],
  'dashboard:svo:read': ['dashboard:read'],
  'reports:export:trips': ['reports:read:trips'],
  'reports:export:fleet': ['reports:read:fleet'],
  'reports:export:maintenance': ['reports:read:maintenance'],
  'reports:export:svo': ['reports:read:svo'],
  'reports:export:auth': ['reports:read:auth'],
  'audit:history:read': ['audit:read'],
}

/** Erro de domínio com status HTTP sem acoplar o serviço à camada Express. */
export class ProfileServiceError extends Error {
  constructor(readonly status: 400 | 401 | 404 | 409 | 422 | 503, message: string) {
    super(message)
    this.name = 'ProfileServiceError'
  }
}

export interface ProfileDetails extends Role {
  permissions: PermissionView[]
}

export type PermissionView = PermissionCatalogItem

export interface ProfileServiceContract {
  listProfiles(filters?: ProfileFilters): Promise<Role[] | PaginatedProfiles>
  getProfile(id: string): Promise<ProfileDetails>
  listPermissionCatalog(): Promise<PermissionView[]>
  createProfile(input: unknown, actor: AuthenticatedUser, idempotencyKey: string | undefined): Promise<{ role: Role; replayed: boolean }>
  updateProfile(id: string, input: unknown, actor: AuthenticatedUser): Promise<Role>
  setProfileActive(id: string, input: unknown, actor: AuthenticatedUser, active: boolean): Promise<Role>
}

interface NormalizedMutation {
  code: string | undefined
  displayName: string
  description: string | null
  defaultPath: string | null
  permissionIds: string[]
  reason: string
  expectedRevision: number | undefined
}

/**
 * Centraliza os perfis e aplica a matriz de autorização efetiva que o servidor consulta por requisição.
 *
 * A tela só pode conceder códigos presentes no catálogo da aplicação; o código de perfil é apenas
 * identificador estável e nunca concede capacidade pelo nome.
 */
export class ProfileService implements ProfileServiceContract {
  constructor(
    private readonly rolesRepository: RoleRepositoryContract,
    private readonly auditLogger?: AuditLogger,
  ) {}

  /** Lista perfis preservando o array legado quando não há filtros. */
  async listProfiles(filters: ProfileFilters = {}): Promise<Role[] | PaginatedProfiles> {
    if (Object.keys(filters).length > 0) {
      if (!this.rolesRepository.listProfiles) throw unavailable()
      validateListFilters(filters)
      return this.rolesRepository.listProfiles(filters)
    }
    return this.rolesRepository.findAll()
  }

  /** Busca detalhes de um perfil e suas permissões efetivas. */
  async getProfile(id: string): Promise<ProfileDetails> {
    validateId(id)
    const [role, permissions, catalog] = await Promise.all([
      this.rolesRepository.findById(id),
      this.rolesRepository.findPermissionsByRoleId(id),
      this.listPermissionCatalog(),
    ])
    if (!role) throw new ProfileServiceError(404, 'O perfil solicitado não foi encontrado.')
    const definitionsByCode = new Map(catalog.map((item) => [item.name, item]))
    return {
      ...role,
      permissions: permissions.flatMap((permission) => {
        const definition = definitionsByCode.get(permission.name)
        return definition ? [{ ...permission, ...definition }] : []
      }),
    }
  }

  /** Devolve somente as permissões que existem na aplicação e têm comportamento implementado. */
  async listPermissionCatalog(): Promise<PermissionView[]> {
    if (!this.rolesRepository.findAllPermissions) throw unavailable()
    const storedPermissions = await this.rolesRepository.findAllPermissions()
    const storedByName = new Map(storedPermissions.map((permission) => [permission.name, permission]))
    return PERMISSION_DEFINITIONS.flatMap((definition) => {
      const stored = storedByName.get(definition.code)
      return stored ? [{
        ...stored,
        ...definition,
        dependencies: PERMISSION_DEPENDENCIES[definition.code] ?? [],
      }] : []
    })
  }

  /**
   * Cria um perfil e sua matriz como uma única transação idempotente.
   *
   * @param input - Perfil, permissões e justificativa recebidos pela borda HTTP.
   * @param actor - Conta autenticada e revalidada no PostgreSQL.
   * @param idempotencyKey - UUID da criação enviada pelo cliente.
   * @returns Perfil criado ou resultado original da mesma chave.
   */
  async createProfile(
    input: unknown,
    actor: AuthenticatedUser,
    idempotencyKey: string | undefined,
  ): Promise<{ role: Role; replayed: boolean }> {
    if (!this.rolesRepository.withTransaction || !this.rolesRepository.findPermissionNamesByIds
      || !this.rolesRepository.createProfile || !this.rolesRepository.findByCreationKey
      || !this.rolesRepository.replacePermissions || !this.rolesRepository.recordRoleEvent) throw unavailable()
    if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
      throw new ProfileServiceError(400, 'Envie um cabeçalho Idempotency-Key com UUID válido.')
    }
    const normalized = normalizeMutation(input, false)
    const permissionNames = await this.resolvePermissions(normalized.permissionIds)
    validatePermissionSet(permissionNames, normalized.defaultPath)
    const payload = canonicalPayload(normalized, permissionNames)

    return this.rolesRepository.withTransaction(async (client) => {
      const previous = await this.rolesRepository.findByCreationKey!(actor.id, idempotencyKey, client)
      if (previous) {
        if (JSON.stringify(previous.payload) !== JSON.stringify(payload)) {
          throw new ProfileServiceError(409, 'Esta chave de criação já foi usada com outros dados.')
        }
        return { role: previous.role, replayed: true }
      }
      const repositoryInput: CreateRoleRepositoryInput = {
        name: normalized.code ?? '',
        displayName: normalized.displayName,
        description: normalized.description,
        defaultPath: normalized.defaultPath,
        createdBy: actor.id,
        creationKey: idempotencyKey,
        creationPayload: payload,
      }
      let role: Role
      try {
        const createdRole = await this.rolesRepository.createProfile!(repositoryInput, client)
        if (!createdRole) {
          const concurrentlyCreated = await this.rolesRepository.findByCreationKey!(actor.id, idempotencyKey, client)
          if (!concurrentlyCreated || JSON.stringify(concurrentlyCreated.payload) !== JSON.stringify(payload)) {
            throw new ProfileServiceError(409, 'Esta chave de criação já foi usada com outros dados.')
          }
          return { role: concurrentlyCreated.role, replayed: true }
        }
        role = createdRole
      } catch (error) {
        if (isDatabaseError(error, '23505')) {
          throw new ProfileServiceError(409, 'Já existe um perfil com esse código ou chave de criação.')
        }
        throw error
      }
      await this.rolesRepository.replacePermissions!(role.id, permissionNames, client)
      role = (await this.rolesRepository.findById(role.id, client)) ?? role
      const afterState = roleState(role, permissionNames)
      await this.rolesRepository.recordRoleEvent!(eventInput('CREATED', role.id, actor, normalized.reason, null, afterState), client)
      await this.auditLogger?.recordAudit({
        userId: actor.id, table: 'auth.roles', recordId: role.id, operation: 'CREATE',
        before: null, after: afterState, actorSnapshot: actorSnapshot(actor), reason: normalized.reason,
      }, client)
      return { role, replayed: false }
    })
  }

  /** Atualiza metadados e grants com revisão e proteção ao último administrador efetivo. */
  async updateProfile(id: string, input: unknown, actor: AuthenticatedUser): Promise<Role> {
    if (!this.rolesRepository.withTransaction || !this.rolesRepository.findPermissionNamesByIds
      || !this.rolesRepository.findByIdForUpdate || !this.rolesRepository.lockAccessAdministration
      || !this.rolesRepository.updateProfile || !this.rolesRepository.replacePermissions
      || !this.rolesRepository.recordRoleEvent || !this.rolesRepository.countActiveAccessAdministrators) throw unavailable()
    validateId(id)
    const normalized = normalizeMutation(input, true)
    const permissionNames = await this.resolvePermissions(normalized.permissionIds)
    validatePermissionSet(permissionNames, normalized.defaultPath)

    return this.rolesRepository.withTransaction(async (client) => {
      await this.rolesRepository.lockAccessAdministration!(client)
      const current = await this.rolesRepository.findByIdForUpdate!(id, client)
      if (!current) throw new ProfileServiceError(404, 'O perfil solicitado não foi encontrado.')
      if (current.revision !== normalized.expectedRevision) {
        throw new ProfileServiceError(409, 'O perfil foi alterado por outra pessoa. Atualize a página antes de salvar.')
      }
      const oldPermissions = await this.rolesRepository.findPermissionsByRoleId(id, client)
      const beforeState = roleState(current, oldPermissions.map((permission) => permission.name))
      const updatedInput: UpdateRoleRepositoryInput = {
        id,
        expectedRevision: current.revision,
        displayName: normalized.displayName,
        description: normalized.description,
        defaultPath: normalized.defaultPath,
      }
      const updated = await this.rolesRepository.updateProfile!(updatedInput, client)
      if (!updated) throw new ProfileServiceError(409, 'O perfil foi alterado por outra pessoa. Atualize a página antes de salvar.')
      const oldNames = [...oldPermissions.map((permission) => permission.name)].sort()
      const newNames = [...permissionNames].sort()
      const permissionsChanged = JSON.stringify(oldNames) !== JSON.stringify(newNames)
      if (permissionsChanged) await this.rolesRepository.replacePermissions!(id, permissionNames, client)
      const finalRole = (await this.rolesRepository.findById(id, client)) ?? updated
      const afterState = roleState(finalRole, permissionNames)
      if (permissionsChanged && this.isAdministrative(current, oldNames, permissionNames)) {
        const administrators = await this.rolesRepository.countActiveAccessAdministrators!(client)
        if (administrators < 1) {
          throw new ProfileServiceError(409, 'A alteração deixaria o sistema sem uma conta ativa capaz de administrar usuários e perfis.')
        }
      }
      const metadataChanged = current.displayName !== normalized.displayName
        || current.description !== normalized.description || current.defaultPath !== normalized.defaultPath
      if (metadataChanged) {
        await this.rolesRepository.recordRoleEvent!(eventInput('UPDATED', id, actor, normalized.reason, beforeState, afterState), client)
      }
      if (permissionsChanged) {
        await this.rolesRepository.recordRoleEvent!(eventInput('PERMISSIONS_CHANGED', id, actor, normalized.reason, beforeState, afterState), client)
      }
      await this.auditLogger?.recordAudit({
        userId: actor.id, table: 'auth.roles', recordId: id, operation: 'UPDATE',
        before: beforeState, after: afterState, actorSnapshot: actorSnapshot(actor), reason: normalized.reason,
      }, client)
      return finalRole
    })
  }

  /** Arquiva ou restaura um perfil sem apagar vínculos nem eventos anteriores. */
  async setProfileActive(
    id: string,
    input: unknown,
    actor: AuthenticatedUser,
    active: boolean,
  ): Promise<Role> {
    if (!this.rolesRepository.withTransaction || !this.rolesRepository.findByIdForUpdate
      || !this.rolesRepository.lockAccessAdministration || !this.rolesRepository.setProfileActive
      || !this.rolesRepository.countActiveUsersByRole || !this.rolesRepository.countActiveAccessAdministrators
      || !this.rolesRepository.recordRoleEvent) throw unavailable()
    validateId(id)
    const normalized = normalizeStatusMutation(input)
    return this.rolesRepository.withTransaction(async (client) => {
      await this.rolesRepository.lockAccessAdministration!(client)
      const current = await this.rolesRepository.findByIdForUpdate!(id, client)
      if (!current) throw new ProfileServiceError(404, 'O perfil solicitado não foi encontrado.')
      if (current.revision !== normalized.expectedRevision) {
        throw new ProfileServiceError(409, 'O perfil foi alterado por outra pessoa. Atualize a página antes de salvar.')
      }
      if (current.active === active) return current
      const beforeState = roleState(current, (await this.rolesRepository.findPermissionsByRoleId(id, client)).map(({ name }) => name))
      if (!active && await this.rolesRepository.countActiveUsersByRole!(id, client) > 0) {
        throw new ProfileServiceError(409, 'Transfira as contas ativas para outro perfil antes de arquivar este perfil.')
      }
      const updated = await this.rolesRepository.setProfileActive!(id, normalized.expectedRevision, active, client)
      if (!updated) throw new ProfileServiceError(409, 'O perfil foi alterado por outra pessoa. Atualize a página antes de salvar.')
      if (!active && await this.rolesRepository.countActiveAccessAdministrators!(client) < 1) {
        throw new ProfileServiceError(409, 'A alteração deixaria o sistema sem uma conta ativa capaz de administrar usuários e perfis.')
      }
      const afterState = roleState(updated, (await this.rolesRepository.findPermissionsByRoleId(id, client)).map(({ name }) => name))
      const eventType = active ? 'REACTIVATED' : 'DEACTIVATED'
      await this.rolesRepository.recordRoleEvent!(eventInput(eventType, id, actor, normalized.reason, beforeState, afterState), client)
      await this.auditLogger?.recordAudit({
        userId: actor.id, table: 'auth.roles', recordId: id, operation: 'STATUS_CHANGE',
        before: beforeState, after: afterState, actorSnapshot: actorSnapshot(actor), reason: normalized.reason,
      }, client)
      return (await this.rolesRepository.findById(id, client)) ?? updated
    })
  }

  private async resolvePermissions(ids: readonly string[]): Promise<string[]> {
    if (!this.rolesRepository.findPermissionNamesByIds) throw unavailable()
    const names = await this.rolesRepository.findPermissionNamesByIds(ids)
    if (names.length !== ids.length) throw new ProfileServiceError(422, 'A lista contém permissões inexistentes.')
    const known = new Set(PERMISSION_DEFINITIONS.map(({ code }) => code))
    if (names.some((name) => !known.has(name as PermissionName))) {
      throw new ProfileServiceError(422, 'A lista contém uma permissão sem ação disponível na aplicação.')
    }
    return names.sort()
  }

  private isAdministrative(current: Role, before: readonly string[], after: readonly string[]): boolean {
    const canManageUsers = (permissions: readonly string[]) => permissions.includes('users:manage')
      || ['users:create', 'users:update', 'users:archive'].every((permission) => permissions.includes(permission))
    const canManageProfiles = (permissions: readonly string[]) => permissions.includes('profiles:manage')
      || permissions.includes('permissions:manage')
    return current.active && canManageUsers(before) && canManageProfiles(before)
      && (!canManageUsers(after) || !canManageProfiles(after))
  }
}

function validateListFilters(filters: ProfileFilters): void {
  if (filters.active !== undefined && typeof filters.active !== 'boolean') throw new ProfileServiceError(400, 'Filtro de situação inválido.')
  if (filters.search !== undefined && typeof filters.search !== 'string') throw new ProfileServiceError(400, 'Busca inválida.')
  if (filters.page !== undefined && (!Number.isInteger(filters.page) || filters.page < 1)) throw new ProfileServiceError(400, 'Página inválida.')
  if (filters.pageSize !== undefined && (!Number.isInteger(filters.pageSize) || filters.pageSize < 1 || filters.pageSize > MAX_PAGE_SIZE)) {
    throw new ProfileServiceError(400, `O tamanho da página deve estar entre 1 e ${MAX_PAGE_SIZE}.`)
  }
}

function normalizeMutation(value: unknown, update: boolean): NormalizedMutation {
  if (!isRecord(value)) throw new ProfileServiceError(400, 'Informe os dados do perfil.')
  const displayName = requireText(value.displayName, 'Informe o nome do perfil.', MAX_PROFILE_NAME_LENGTH)
  const description = value.description === undefined || value.description === null
    ? null : requireText(value.description, 'A descrição do perfil é inválida.', MAX_PROFILE_DESCRIPTION_LENGTH)
  const defaultPath = value.defaultPath === undefined || value.defaultPath === null
    ? null : requireText(value.defaultPath, 'A página inicial é inválida.', 200)
  const reason = requireText(value.reason, 'Informe o motivo da alteração.', MAX_REASON_LENGTH)
  if (!Array.isArray(value.permissionIds) || value.permissionIds.some((id) => typeof id !== 'string' || !/^[1-9]\d*$/.test(id))) {
    throw new ProfileServiceError(400, 'Selecione as permissões do perfil em um formato válido.')
  }
  const permissionIds = (value.permissionIds as string[]).sort()
  if (new Set(permissionIds).size !== permissionIds.length) throw new ProfileServiceError(422, 'A mesma permissão não pode ser selecionada mais de uma vez.')
  let code: string | undefined
  if (!update) {
    if (typeof value.code !== 'string' || !ROLE_CODE_PATTERN.test(value.code)) {
      throw new ProfileServiceError(400, 'Use um código estável em maiúsculas, com letras, números ou sublinhados.')
    }
    code = value.code
  }
  let expectedRevision: number | undefined
  if (update) {
    if (typeof value.expectedRevision !== 'number' || !Number.isInteger(value.expectedRevision) || value.expectedRevision < 1) {
      throw new ProfileServiceError(400, 'Revisão do perfil inválida.')
    }
    expectedRevision = value.expectedRevision
  }
  return { code, displayName, description, defaultPath, permissionIds, reason, expectedRevision }
}

function normalizeStatusMutation(value: unknown): { expectedRevision: number; reason: string } {
  if (!isRecord(value) || typeof value.expectedRevision !== 'number'
    || !Number.isInteger(value.expectedRevision) || value.expectedRevision < 1) {
    throw new ProfileServiceError(400, 'Revisão do perfil inválida.')
  }
  return {
    expectedRevision: value.expectedRevision,
    reason: requireText(value.reason, 'Informe o motivo da alteração.', MAX_REASON_LENGTH),
  }
}

function validatePermissionSet(names: readonly string[], defaultPath: string | null): void {
  const byName = new Map<string, typeof PERMISSION_DEFINITIONS[number]>(PERMISSION_DEFINITIONS.map((permission) => [permission.code, permission]))
  const groups = new Map<string, string>()
  for (const name of names) {
    const definition = byName.get(name)
    if (!definition) throw new ProfileServiceError(422, 'A lista contém uma permissão desconhecida.')
    if ('scopeGroup' in definition && definition.scopeGroup) {
      const existing = groups.get(definition.scopeGroup)
      if (existing && existing !== definition.code) {
        throw new ProfileServiceError(422, 'Escolha apenas um escopo para cada ação; “próprios/atribuídos” e “todos” são exclusivos.')
      }
      groups.set(definition.scopeGroup, definition.code)
    }
    const missing = (PERMISSION_DEPENDENCIES[name] ?? []).filter((dependency) => !names.includes(dependency))
    if (missing.length > 0) {
      throw new ProfileServiceError(422, `A permissão ${name} exige também: ${missing.join(', ')}.`)
    }
  }
  if (defaultPath !== null) {
    const allowedHome = names.some((name) => byName.get(name)?.defaultPath === defaultPath)
    if (!allowedHome) throw new ProfileServiceError(422, 'A página inicial precisa pertencer a uma área autorizada pelo perfil.')
  }
}

function canonicalPayload(input: NormalizedMutation, permissionNames: readonly string[]): Record<string, unknown> {
  return {
    code: input.code,
    displayName: input.displayName,
    description: input.description,
    defaultPath: input.defaultPath,
    permissionNames: [...permissionNames].sort(),
    reason: input.reason,
  }
}

function roleState(role: Role, permissionNames: readonly string[]): Record<string, unknown> {
  return {
    id: role.id, code: role.name, displayName: role.displayName, description: role.description,
    active: role.active, revision: role.revision, defaultPath: role.defaultPath,
    permissionNames: [...permissionNames].sort(),
  }
}

function actorSnapshot(actor: AuthenticatedUser): Record<string, unknown> {
  return { id: actor.id, role: actor.perfil, profileId: actor.roleId, profileName: actor.displayName }
}

function eventInput(
  eventType: CreateRoleEventInput['eventType'],
  roleId: string,
  actor: AuthenticatedUser,
  reason: string,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown>,
): CreateRoleEventInput {
  return { roleId, eventType, actorId: actor.id, actorSnapshot: actorSnapshot(actor), reason, beforeState, afterState }
}

function validateId(value: string): void {
  if (!/^[1-9]\d*$/.test(value)) throw new ProfileServiceError(400, 'Identificador de perfil inválido.')
}

function requireText(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ProfileServiceError(400, message)
  }
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function unavailable(): ProfileServiceError {
  return new ProfileServiceError(503, 'A administração de perfis não está disponível neste ambiente.')
}
