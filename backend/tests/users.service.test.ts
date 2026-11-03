import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { PoolClient } from 'pg'
import type { RoleRepositoryContract } from '../src/repositories/roles.repository'
import type { UsersRepositoryContract } from '../src/repositories/users.repository'
import type { PaginatedUsers, Role, User, UserFilters, UpdateUserResult } from '../src/types/auth'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import { UsersService } from '../src/services/users.service'
import { UserServiceError } from '../src/types/user.types'

interface Harness {
  service: UsersService
  users: Map<string, User>
  audits: CreateAuditInput[]
  setNextId(id: string): void
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    name: 'Administradora Fictícia',
    email: 'admin.qa@example.test',
    roleId: '1',
    role: 'ADMINISTRADOR',
    active: true,
    revision: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function duplicateEmailError(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' })
}

function createHarness(): Harness {
  const users = new Map<string, User>([
    ['1', makeUser()],
    ['2', makeUser({
      id: '2',
      name: 'Motorista Fictício',
      email: 'motorista.qa@example.test',
      roleId: '4',
      role: 'MOTORISTA',
    })],
  ])
  const audits: CreateAuditInput[] = []
  let nextId = 10

  const roles: RoleRepositoryContract = {
    async findAll() { return [] },
    async findById(id) {
      const role = [
        { id: '1', name: 'ADMINISTRADOR' as const },
        { id: '2', name: 'GESTOR' as const },
        { id: '4', name: 'MOTORISTA' as const },
      ].find((item) => item.id === id)
      return role ? { ...role, description: null, createdAt: new Date() } as Role : null
    },
    async findByName() { return null },
    async findPermissionsByRoleId() { return [] },
  }

  const repository: UsersRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
      return work({} as PoolClient)
    },
    async findById(id) {
      return users.get(id) ?? null
    },
    async findByIdForUpdate(id) {
      return users.get(id) ?? null
    },
    async list(filters: UserFilters): Promise<PaginatedUsers> {
      const all = [...users.values()].filter((user) => {
        if (filters.active !== undefined && user.active !== filters.active) return false
        if (filters.role !== undefined && user.role !== filters.role) return false
        if (filters.search && !`${user.name} ${user.email}`.toLowerCase().includes(filters.search.toLowerCase())) {
          return false
        }
        return true
      })
      const page = filters.page ?? 1
      const pageSize = filters.pageSize ?? 20
      return {
        users: all.slice((page - 1) * pageSize, page * pageSize),
        total: all.length,
        page,
        pageSize,
        totalPages: Math.ceil(all.length / pageSize),
      }
    },
    async create(input) {
      if ([...users.values()].some((user) => user.email === input.email)) {
        throw duplicateEmailError()
      }
      const user = makeUser({
        id: String(nextId++),
        name: input.name,
        email: input.email,
        roleId: input.roleId,
        role: input.roleId === '1' ? 'ADMINISTRADOR' : input.roleId === '2' ? 'GESTOR' : 'MOTORISTA',
        active: input.active ?? true,
        revision: 1,
      })
      users.set(user.id, user)
      return user
    },
    async save(id, input): Promise<UpdateUserResult> {
      const current = users.get(id)
      if (!current) return { kind: 'not-found' }
      if (current.revision !== input.expectedRevision) return { kind: 'revision-conflict' }
      if (input.email !== undefined) {
        const duplicated = [...users.values()].some(
          (user) => user.id !== id && user.email === input.email,
        )
        if (duplicated) throw duplicateEmailError()
      }
      const updated: User = {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.roleId !== undefined
          ? {
              roleId: input.roleId,
              role: input.roleId === '1' ? 'ADMINISTRADOR' : input.roleId === '2' ? 'GESTOR' : 'MOTORISTA',
            }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        revision: current.revision + 1,
        updatedAt: new Date(),
      }
      users.set(id, updated)
      return { kind: 'updated', user: updated }
    },
  }

  const auditService: AuditLogger = {
    async recordAudit(input: CreateAuditInput): Promise<AuditEntry> {
      audits.push(input)
      return {
        id: String(audits.length),
        userId: input.userId ? String(input.userId) : null,
        table: input.table,
        recordId: input.recordId ? String(input.recordId) : null,
        operation: input.operation,
        before: input.before ?? null,
        after: input.after ?? null,
        actorSnapshot: input.actorSnapshot ?? null,
        reason: input.reason ?? null,
        registeredAt: new Date(),
      }
    },
  }

  return {
    service: new UsersService(repository, roles, auditService),
    users,
    audits,
    setNextId: (id) => { nextId = Number(id) },
  }
}

function isServiceError(statusCode: number, message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof UserServiceError)
    assert.equal(error.statusCode, statusCode)
    assert.equal(error.message, message)
    return true
  }
}

let harness: Harness

beforeEach(() => {
  harness = createHarness()
})

test('US-SVC-01: criação válida normaliza e-mail, cria conta ativa e audita CREATE', async () => {
  const created = await harness.service.createUser({
    name: '  Nova Pessoa Fictícia  ',
    email: '  NOVA.PESSOA@EXAMPLE.TEST ',
    roleId: '2',
    password: 'senha-ficticia',
  }, '1')

  assert.equal(created.name, 'Nova Pessoa Fictícia')
  assert.equal(created.email, 'nova.pessoa@example.test')
  assert.equal(created.role, 'GESTOR')
  assert.equal(created.active, true)
  assert.equal(harness.audits.length, 1)
  assert.equal(harness.audits[0]?.operation, 'CREATE')
  assert.equal(harness.audits[0]?.recordId, created.id)
})

test('US-SVC-02: e-mail duplicado retorna 409 e campos inválidos retornam 400', async () => {
  await assert.rejects(
    harness.service.createUser({
      name: 'Outra Pessoa',
      email: 'MOTORISTA.QA@EXAMPLE.TEST',
      roleId: '2',
      password: 'x',
    }, '1'),
    isServiceError(409, 'E-mail já cadastrado.'),
  )

  await assert.rejects(
    harness.service.createUser({
      name: '',
      email: 'a@example.test',
      roleId: '2',
      password: 'x',
    }, '1'),
    isServiceError(400, 'Informe o nome do usuário.'),
  )

  await assert.rejects(
    harness.service.createUser({
      name: 'Pessoa',
      email: 'sem-arroba',
      roleId: '2',
      password: 'x',
    }, '1'),
    isServiceError(400, 'Informe um e-mail válido.'),
  )

  await assert.rejects(
    harness.service.createUser({
      name: 'Pessoa',
      email: 'pessoa@example.test',
      roleId: '2',
      password: 'á'.repeat(37),
    }, '1'),
    isServiceError(400, 'A senha excede o limite de 72 bytes suportado pelo sistema.'),
  )
})

test('US-SVC-03: edição incrementa revisão e audita UPDATE, mas rejeita revisão antiga', async () => {
  const updated = await harness.service.updateUser('2', {
    name: 'Motorista Editado',
    email: 'motorista.editado@example.test',
    roleId: '2',
    revision: 1,
  }, '1')

  assert.equal(updated.name, 'Motorista Editado')
  assert.equal(updated.email, 'motorista.editado@example.test')
  assert.equal(updated.role, 'GESTOR')
  assert.equal(updated.revision, 2)
  assert.equal(harness.audits[0]?.operation, 'UPDATE')

  await assert.rejects(
    harness.service.updateUser('2', {
      name: 'Motorista Editado',
      email: 'motorista.editado@example.test',
      roleId: '2',
      revision: 1,
    }, '1'),
    isServiceError(409, 'O usuário foi alterado por outra operação. Atualize os dados e tente novamente.'),
  )
})

test('US-SVC-04: autoinativação é bloqueada e inativação/reativação são idempotentes', async () => {
  await assert.rejects(
    harness.service.deactivateUser('1', '1'),
    isServiceError(409, 'Você não pode inativar a própria conta.'),
  )

  const deactivated = await harness.service.deactivateUser('2', '1')
  assert.equal(deactivated.active, false)
  assert.equal(harness.audits.length, 1)

  const again = await harness.service.deactivateUser('2', '1')
  assert.equal(again.active, false)
  assert.equal(harness.audits.length, 1)

  const activated = await harness.service.activateUser('2', '1')
  assert.equal(activated.active, true)
  assert.equal(harness.audits.length, 2)
  assert.equal(harness.audits[1]?.operation, 'STATUS_CHANGE')
})

test('US-SVC-05: listagem valida perfil, situação e paginação e repassa filtros', async () => {
  const page = await harness.service.listUsers({ name: 'Motorista', role: 'MOTORISTA', active: true })
  assert.equal(page.total, 1)
  assert.equal(page.users[0]?.email, 'motorista.qa@example.test')

  await assert.rejects(
    harness.service.listUsers({ role: 'INVALIDO' as never }),
    isServiceError(400, 'Perfil de acesso inválido.'),
  )
  await assert.rejects(
    harness.service.listUsers({ pageSize: 101 }),
    isServiceError(400, 'O tamanho da página deve estar entre 1 e 100.'),
  )
})

test('US-SVC-06: detalhe rejeita identificador inválido e usuário inexistente', async () => {
  await assert.rejects(
    harness.service.getUser('abc'),
    isServiceError(400, 'Identificador de usuário inválido.'),
  )
  await assert.rejects(
    harness.service.getUser('999'),
    isServiceError(404, 'Usuário não encontrado.'),
  )
})
