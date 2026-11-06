import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger } from '../src/types/audit.types'
import type {
  FleetService,
  FleetServiceActorSnapshot,
  FleetServiceFilters,
  FleetServiceMutationResult,
  NormalizedFleetServiceAttributes,
} from '../src/types/fleet-service.types'
import { FleetServiceError } from '../src/types/fleet-service.types'
import type { ServicesRepositoryContract } from '../src/repositories/services.repository'
import { FleetServicesService } from '../src/services/fleet-services.service'

const fakeClient = {} as PoolClient
const actor: FleetServiceActorSnapshot = {
  id: '8',
  name: 'Gestora Fictícia',
  email: 'gestora@example.test',
  role: 'GESTOR',
}

function createService(overrides: Partial<FleetService> = {}): FleetService {
  return {
    id: '11',
    name: 'Coleta de Amostras',
    description: null,
    categories: ['PASSENGER'],
    requiresTriage: false,
    requiresWeight: false,
    requiresIdentification: false,
    active: true,
    revision: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function setup(initial: FleetService[] = [createService()]) {
  let stored = [...initial]
  const audits: AuditEntry[] = []
  const replace = (service: FleetService) => {
    stored = stored.map((item) => (item.id === service.id ? service : item))
  }
  const repository: ServicesRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
      return work(fakeClient)
    },
    async list(filters: FleetServiceFilters): Promise<FleetService[]> {
      return stored.filter((item) => filters.active === undefined || item.active === filters.active)
    },
    async findById(id: string): Promise<FleetService | null> { return stored.find((item) => item.id === id) ?? null },
    async findByIdForUpdate(id: string): Promise<FleetService | null> { return stored.find((item) => item.id === id) ?? null },
    async findByName(name: string): Promise<FleetService | null> {
      return stored.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null
    },
    async create(attributes: NormalizedFleetServiceAttributes): Promise<FleetService> {
      const service = createService({ ...attributes, id: String(stored.length + 20) })
      stored.push(service)
      return service
    },
    async saveAttributes(id: string, expectedRevision: number, attributes: NormalizedFleetServiceAttributes): Promise<FleetServiceMutationResult> {
      const current = stored.find((item) => item.id === id)
      if (!current) return { kind: 'not-found' }
      if (current.revision !== expectedRevision) return { kind: 'revision-conflict' }
      const service = createService({ ...current, ...attributes, revision: current.revision + 1 })
      replace(service)
      return { kind: 'updated', service }
    },
    async saveActive(id: string, expectedRevision: number, active: boolean): Promise<FleetServiceMutationResult> {
      const current = stored.find((item) => item.id === id)
      if (!current) return { kind: 'not-found' }
      if (current.revision !== expectedRevision) return { kind: 'revision-conflict' }
      const service = createService({ ...current, active, revision: current.revision + 1 })
      replace(service)
      return { kind: 'updated', service }
    },
    async findActorSnapshot(): Promise<FleetServiceActorSnapshot> { return actor },
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
  return { service: new FleetServicesService(repository, auditService), audits }
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof FleetServiceError && error.statusCode === statusCode
}

test('cadastro aplica os padrões da tabela, nasce ativo e grava auditoria', async () => {
  const context = setup([])
  const created = await context.service.createService({ name: '  Transporte de Passageiros ', reason: 'Catálogo inicial' }, actor.id)

  assert.equal(created.name, 'Transporte de Passageiros')
  assert.deepEqual(created.categories, ['PASSENGER'])
  assert.equal(created.requiresTriage, false)
  assert.equal(created.active, true)
  assert.equal(context.audits.length, 1)
  assert.equal(context.audits[0]?.table, 'fleet.services')
  assert.equal(context.audits[0]?.operation, 'CREATE')
  assert.equal(context.audits[0]?.reason, 'Catálogo inicial')
})

test('cadastro aceita categorias e flags e remove categorias repetidas', async () => {
  const context = setup([])
  const created = await context.service.createService({
    name: 'Remoção SVO',
    description: '  Remoção para verificação de óbito ',
    categories: ['BODY', 'BODY'],
    requiresTriage: true,
    requiresIdentification: true,
    reason: 'Catálogo inicial',
  }, actor.id)

  assert.deepEqual(created.categories, ['BODY'])
  assert.equal(created.description, 'Remoção para verificação de óbito')
  assert.equal(created.requiresTriage, true)
  assert.equal(created.requiresWeight, false)
  assert.equal(created.requiresIdentification, true)
})

test('validação: nome vazio, categoria inválida, flag não booleana e reason ausente retornam 400', async () => {
  const context = setup([])
  await assert.rejects(context.service.createService({ name: '  ', reason: 'x' }, actor.id), domainError(400))
  await assert.rejects(
    context.service.createService({ name: 'A', categories: ['TRUCK' as unknown as 'BODY'], reason: 'x' }, actor.id),
    domainError(400),
  )
  await assert.rejects(context.service.createService({ name: 'A', categories: [], reason: 'x' }, actor.id), domainError(400))
  await assert.rejects(
    context.service.createService({ name: 'A', requiresWeight: 'sim' as unknown as boolean, reason: 'x' }, actor.id),
    domainError(400),
  )
  await assert.rejects(context.service.createService({ name: 'A', reason: ' ' }, actor.id), domainError(400))
})

test('nome repetido sem diferenciar maiúsculas retorna 409 no cadastro e na renomeação', async () => {
  const context = setup([createService(), createService({ id: '12', name: 'Distribuição de Materiais' })])
  await assert.rejects(
    context.service.createService({ name: ' coleta de AMOSTRAS ', reason: 'x' }, actor.id),
    (error: unknown) => error instanceof FleetServiceError && error.statusCode === 409 && error.message === 'Tipo de serviço já cadastrado',
  )
  await assert.rejects(
    context.service.updateService('12', { name: 'Coleta de amostras', expectedRevision: 1, reason: 'x' }, actor.id),
    domainError(409),
  )
})

test('edição substitui atributos, incrementa revisão e recusa revisão antiga com 409', async () => {
  const context = setup()
  const updated = await context.service.updateService('11', {
    name: 'Coleta de Amostras Laboratoriais',
    requiresWeight: true,
    expectedRevision: 1,
    reason: 'Ajuste de nome',
  }, actor.id)
  assert.equal(updated.revision, 2)
  assert.equal(updated.requiresWeight, true)
  assert.equal(context.audits[0]?.operation, 'UPDATE')

  await assert.rejects(
    context.service.updateService('11', { name: 'Outro', expectedRevision: 1, reason: 'x' }, actor.id),
    domainError(409),
  )
  await assert.rejects(
    context.service.updateService('99', { name: 'Outro', expectedRevision: 1, reason: 'x' }, actor.id),
    domainError(404),
  )
})

test('inativar e ativar gravam auditoria; repetir o estado atual não audita', async () => {
  const context = setup()
  const inactive = await context.service.setServiceActive('11', false, { expectedRevision: 1, reason: 'Fora de uso' }, actor.id)
  assert.equal(inactive.active, false)
  const again = await context.service.setServiceActive('11', false, { expectedRevision: 2, reason: 'Fora de uso' }, actor.id)
  assert.equal(again.revision, 2)
  const active = await context.service.setServiceActive('11', true, { expectedRevision: 2, reason: 'Retomado' }, actor.id)
  assert.equal(active.active, true)
  assert.deepEqual(context.audits.map((audit) => audit.operation), ['STATUS_CHANGE', 'STATUS_CHANGE'])
})

test('não gestores veem só ativos e recebem 404 no detalhe de inativo; gestores veem tudo', async () => {
  const context = setup([createService(), createService({ id: '12', name: 'Antigo', active: false })])

  const requesterList = await context.service.listServices({}, 'SOLICITANTE')
  assert.deepEqual(requesterList.map((item) => item.id), ['11'])
  await assert.rejects(context.service.listServices({ active: false }, 'ATENDENTE_SVO'), domainError(400))
  await assert.rejects(context.service.getService('12', 'SOLICITANTE'), domainError(404))

  const managerList = await context.service.listServices({}, 'GESTOR')
  assert.equal(managerList.length, 2)
  const inactiveOnly = await context.service.listServices({ active: false }, 'ADMINISTRADOR')
  assert.deepEqual(inactiveOnly.map((item) => item.id), ['12'])
  assert.equal((await context.service.getService('12', 'GESTOR')).active, false)
  await assert.rejects(context.service.getService('abc', 'GESTOR'), domainError(400))
})
