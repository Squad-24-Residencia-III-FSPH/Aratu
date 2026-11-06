import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger } from '../src/types/audit.types'
import type {
  CreateDriverEventInput,
  Driver,
  DriverActorSnapshot,
  DriverFilters,
  DriverMutationResult,
  DriverStatus,
  DriverUserAccount,
  NormalizedDriverAttributes,
} from '../src/types/driver.types'
import { DriverServiceError } from '../src/types/driver.types'
import type { DriversRepositoryContract } from '../src/repositories/drivers.repository'
import { DriversService, isValidCpf } from '../src/services/drivers.service'

const TODAY = '2026-06-15'
const VALID_CPF = '12345678909'
const OTHER_VALID_CPF = '11144477735'
const fakeClient = {} as PoolClient
const actor: DriverActorSnapshot = {
  id: '8',
  name: 'Gestora Fictícia',
  email: 'gestora@example.test',
  role: 'GESTOR',
}
const changeMetadata = { reportedBy: 'Equipe fictícia', reason: 'Atualização de cadastro' }

function createDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: '31',
    name: 'Motorista Fictício',
    cpf: VALID_CPF,
    cnhNumber: '00000000001',
    cnhCategory: 'D',
    cnhExpiresAt: '2027-01-01',
    phone: null,
    status: 'ACTIVE',
    userId: null,
    revision: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function setup(initial: Driver | null = createDriver(), accounts: DriverUserAccount[] = []) {
  let stored: Driver | null = initial
  const events: CreateDriverEventInput[] = []
  const audits: AuditEntry[] = []
  const repository: DriversRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
      return work(fakeClient)
    },
    async list(_filters: DriverFilters): Promise<Driver[]> { return stored ? [stored] : [] },
    async findById(id: string): Promise<Driver | null> { return stored?.id === id ? stored : null },
    async findByIdForUpdate(id: string): Promise<Driver | null> { return stored?.id === id ? stored : null },
    async findByCpf(cpf: string): Promise<Driver | null> { return stored?.cpf === cpf ? stored : null },
    async findByUserId(userId: string): Promise<Driver | null> { return stored?.userId === userId ? stored : null },
    async findUserAccount(userId: string): Promise<DriverUserAccount | null> {
      return accounts.find((account) => account.id === userId) ?? null
    },
    async create(attributes: NormalizedDriverAttributes, status: DriverStatus): Promise<Driver> {
      stored = createDriver({ ...attributes, id: '32', status })
      return stored
    },
    async saveAttributes(id: string, expectedRevision: number, attributes: NormalizedDriverAttributes): Promise<DriverMutationResult> {
      if (!stored || stored.id !== id) return { kind: 'not-found' }
      if (stored.revision !== expectedRevision) return { kind: 'revision-conflict' }
      stored = createDriver({ ...stored, ...attributes, revision: stored.revision + 1 })
      return { kind: 'updated', driver: stored }
    },
    async saveStatus(id: string, expectedRevision: number, status: DriverStatus): Promise<DriverMutationResult> {
      if (!stored || stored.id !== id) return { kind: 'not-found' }
      if (stored.revision !== expectedRevision) return { kind: 'revision-conflict' }
      stored = createDriver({ ...stored, status, revision: stored.revision + 1 })
      return { kind: 'updated', driver: stored }
    },
    async findActorSnapshot(): Promise<DriverActorSnapshot> { return actor },
    async createEvent(input: CreateDriverEventInput): Promise<void> { events.push(input) },
  }
  const auditService: AuditLogger = {
    async recordAudit(input): Promise<AuditEntry> {
      const entry: AuditEntry = {
        id: String(audits.length + 1),
        userId: String(input.userId),
        table: input.table,
        recordId: String(input.recordId),
        operation: input.operation,
        before: input.before ?? null,
        after: input.after ?? null,
        actorSnapshot: input.actorSnapshot ?? null,
        reason: input.reason ?? null,
        registeredAt: new Date('2026-01-01T00:00:00Z'),
      }
      audits.push(entry)
      return entry
    },
  }
  return {
    service: new DriversService(repository, auditService, () => TODAY),
    events,
    audits,
  }
}

const newDriver = {
  name: '  Motorista Novo Fictício ',
  cpf: OTHER_VALID_CPF,
  cnhNumber: ' 00000000002 ',
  cnhCategory: 'B' as const,
  cnhExpiresAt: '2028-03-10',
  ...changeMetadata,
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof DriverServiceError && error.statusCode === statusCode
}

test('isValidCpf aceita dígitos verificadores corretos e rejeita formatação, erro de dígito e repetição', () => {
  assert.equal(isValidCpf(VALID_CPF), true)
  assert.equal(isValidCpf(OTHER_VALID_CPF), true)
  assert.equal(isValidCpf('123.456.789-09'), false)
  assert.equal(isValidCpf('12345678900'), false)
  assert.equal(isValidCpf('11111111111'), false)
  assert.equal(isValidCpf('1234567890'), false)
})

test('cadastro normaliza textos, inicia ACTIVE e grava evento e auditoria', async () => {
  const context = setup(null)
  const created = await context.service.createDriver(newDriver, actor.id)

  assert.equal(created.name, 'Motorista Novo Fictício')
  assert.equal(created.cnhNumber, '00000000002')
  assert.equal(created.status, 'ACTIVE')
  assert.equal(context.events.length, 1)
  assert.equal(context.events[0]?.eventType, 'CREATED')
  assert.equal(context.audits[0]?.table, 'fleet.drivers')
  assert.equal(context.audits[0]?.operation, 'CREATE')
})

test('CPF inválido retorna 400 e CPF já cadastrado retorna 409', async () => {
  const context = setup()
  await assert.rejects(context.service.createDriver({ ...newDriver, cpf: '123.456.789-09' }, actor.id), domainError(400))
  await assert.rejects(context.service.createDriver({ ...newDriver, cpf: '12345678900' }, actor.id), domainError(400))
  await assert.rejects(
    context.service.createDriver({ ...newDriver, cpf: VALID_CPF }, actor.id),
    (error: unknown) => error instanceof DriverServiceError && error.statusCode === 409 && error.message === 'CPF já cadastrado',
  )
})

test('CNH exige número, categoria conhecida e validade em data real', async () => {
  const context = setup(null)
  await assert.rejects(context.service.createDriver({ ...newDriver, cnhNumber: '  ' }, actor.id), domainError(400))
  await assert.rejects(
    context.service.createDriver({ ...newDriver, cnhCategory: 'F' as unknown as 'B' }, actor.id),
    domainError(400),
  )
  await assert.rejects(context.service.createDriver({ ...newDriver, cnhExpiresAt: '2028-02-30' }, actor.id), domainError(400))
})

test('CNH vencida impede cadastro ACTIVE (422), mas permite cadastrar afastado', async () => {
  const context = setup(null)
  await assert.rejects(context.service.createDriver({ ...newDriver, cnhExpiresAt: '2026-06-14' }, actor.id), domainError(422))

  const away = await context.service.createDriver({ ...newDriver, cnhExpiresAt: '2026-06-14', status: 'AWAY' }, actor.id)
  assert.equal(away.status, 'AWAY')
})

test('CNH que vence hoje ainda é válida', async () => {
  const context = setup(null)
  const created = await context.service.createDriver({ ...newDriver, cnhExpiresAt: TODAY }, actor.id)
  assert.equal(await context.service.isAvailableForAllocation(created.id), true)
})

test('transições são livres, mas ACTIVE exige CNH válida', async () => {
  const context = setup(createDriver({ status: 'INACTIVE', cnhExpiresAt: '2026-01-01' }))
  await assert.rejects(
    context.service.changeDriverStatus('31', { status: 'ACTIVE', expectedRevision: 1, ...changeMetadata }, actor.id),
    domainError(422),
  )
  const away = await context.service.changeDriverStatus('31', { status: 'AWAY', expectedRevision: 1, ...changeMetadata }, actor.id)
  assert.equal(away.status, 'AWAY')
  const inactive = await context.service.changeDriverStatus('31', { status: 'INACTIVE', expectedRevision: 2, ...changeMetadata }, actor.id)
  assert.equal(inactive.status, 'INACTIVE')
  assert.equal(context.events.length, 2)
  assert.equal(context.audits.length, 2)
})

test('mudar para a mesma situação não gera evento e revisão divergente retorna 409', async () => {
  const context = setup()
  const same = await context.service.changeDriverStatus('31', { status: 'ACTIVE', expectedRevision: 1, ...changeMetadata }, actor.id)
  assert.equal(same.revision, 1)
  assert.equal(context.events.length, 0)
  await assert.rejects(
    context.service.changeDriverStatus('31', { status: 'AWAY', expectedRevision: 5, ...changeMetadata }, actor.id),
    domainError(409),
  )
  await assert.rejects(
    context.service.updateDriver('31', { ...newDriver, cpf: VALID_CPF, expectedRevision: 5 }, actor.id),
    domainError(409),
  )
})

test('edição de motorista ativo com CNH vencida retorna 422', async () => {
  const context = setup()
  await assert.rejects(
    context.service.updateDriver('31', { ...newDriver, cpf: VALID_CPF, cnhExpiresAt: '2026-06-01', expectedRevision: 1 }, actor.id),
    domainError(422),
  )
})

test('vínculo exige conta ativa de perfil MOTORISTA (422) e não pode repetir conta (409)', async () => {
  const accounts: DriverUserAccount[] = [
    { id: '50', role: 'MOTORISTA', active: true },
    { id: '51', role: 'SOLICITANTE', active: true },
    { id: '52', role: 'MOTORISTA', active: false },
  ]
  const context = setup(createDriver({ userId: '50' }), accounts)
  await assert.rejects(context.service.createDriver({ ...newDriver, userId: '51' }, actor.id), domainError(422))
  await assert.rejects(context.service.createDriver({ ...newDriver, userId: '52' }, actor.id), domainError(422))
  await assert.rejects(context.service.createDriver({ ...newDriver, userId: '99' }, actor.id), domainError(422))
  await assert.rejects(context.service.createDriver({ ...newDriver, userId: '50' }, actor.id), domainError(409))
})

test('disponibilidade exige ACTIVE e CNH não vencida', async () => {
  assert.equal(await setup(createDriver()).service.isAvailableForAllocation('31'), true)
  assert.equal(await setup(createDriver({ status: 'AWAY' })).service.isAvailableForAllocation('31'), false)
  assert.equal(await setup(createDriver({ cnhExpiresAt: '2026-06-14' })).service.isAvailableForAllocation('31'), false)
})

test('filtro de situação inválido, id malformado e motorista ausente', async () => {
  const context = setup(null)
  await assert.rejects(
    context.service.listDrivers({ status: 'ON_VACATION' as unknown as DriverStatus }),
    domainError(400),
  )
  await assert.rejects(context.service.getDriver('abc'), domainError(400))
  await assert.rejects(context.service.getDriver('77'), domainError(404))
})

test('mutações exigem reportedBy e reason', async () => {
  const context = setup(null)
  await assert.rejects(context.service.createDriver({ ...newDriver, reason: ' ' }, actor.id), domainError(400))
})
