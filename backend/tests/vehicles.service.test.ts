import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditLogger, AuditEntry } from '../src/types/audit.types'
import type {
  CreateVehicleEventInput,
  Vehicle,
  VehicleActorSnapshot,
  VehicleAttributes,
  VehicleFilters,
  VehicleMutationResult,
  VehicleStatus,
} from '../src/types/vehicle.types'
import { VehicleServiceError } from '../src/types/vehicle.types'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import { VehiclesService } from '../src/services/vehicles.service'

const fakeClient = {} as PoolClient
const actor: VehicleActorSnapshot = {
  id: '8',
  name: 'Gestora Fictícia',
  email: 'gestora@example.test',
  role: 'GESTOR',
}

function createVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: '21',
    licensePlate: 'ABC1234',
    brand: null,
    model: null,
    year: null,
    vehicleType: null,
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 4,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status: 'AVAILABLE',
    revision: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function setup(initial: Vehicle | null = createVehicle()) {
  let stored: Vehicle | null = initial
  const events: CreateVehicleEventInput[] = []
  const audits: AuditEntry[] = []
  const repository: VehiclesRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
      return work(fakeClient)
    },
    async list(_filters: VehicleFilters): Promise<Vehicle[]> { return stored ? [stored] : [] },
    async findById(id: string): Promise<Vehicle | null> { return stored?.id === id ? stored : null },
    async findByIdForUpdate(id: string): Promise<Vehicle | null> { return stored?.id === id ? stored : null },
    async findByLicensePlate(licensePlate: string): Promise<Vehicle | null> {
      return stored?.licensePlate === licensePlate ? stored : null
    },
    async create(attributes: VehicleAttributes): Promise<Vehicle> {
      stored = createVehicle({ ...attributes, status: 'AVAILABLE' })
      return stored
    },
    async saveAttributes(id: string, expectedRevision: number, attributes: VehicleAttributes): Promise<VehicleMutationResult> {
      if (!stored || stored.id !== id) return { kind: 'not-found' }
      if (stored.revision !== expectedRevision) return { kind: 'revision-conflict' }
      stored = createVehicle({ ...stored, ...attributes, revision: stored.revision + 1 })
      return { kind: 'updated', vehicle: stored }
    },
    async saveStatus(id: string, expectedRevision: number, status: VehicleStatus): Promise<VehicleMutationResult> {
      if (!stored || stored.id !== id) return { kind: 'not-found' }
      if (stored.revision !== expectedRevision) return { kind: 'revision-conflict' }
      stored = createVehicle({ ...stored, status, revision: stored.revision + 1 })
      return { kind: 'updated', vehicle: stored }
    },
    async findActorSnapshot(): Promise<VehicleActorSnapshot> { return actor },
    async createEvent(input: CreateVehicleEventInput): Promise<void> { events.push(input) },
  }
  const auditService: AuditLogger = {
    async recordAudit(input, _client): Promise<AuditEntry> {
      const result: AuditEntry = {
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
      audits.push(result)
      return result
    },
  }
  return {
    service: new VehiclesService(repository, auditService),
    events,
    audits,
    getStored: () => stored,
  }
}

const changeMetadata = { reportedBy: 'Equipe fictícia', reason: 'Atualização de cadastro' }

test('cadastro normaliza a placa e grava histórico e auditoria com estado AVAILABLE', async () => {
  const context = setup(null)
  const created = await context.service.createVehicle({
    licensePlate: ' abc1d23 ',
    categories: ['BODY'],
    seats: 0,
    bodyLimit: 2,
    weightLimit: null,
    operationType: 'SVO',
    ...changeMetadata,
  }, actor.id)

  assert.equal(created.licensePlate, 'ABC1D23')
  assert.equal(created.status, 'AVAILABLE')
  assert.equal(context.events.length, 1)
  assert.equal(context.audits.length, 1)
})

test('placa inválida e duplicada retornam erros de domínio 400 e 409', async () => {
  const context = setup()
  await assert.rejects(
    context.service.createVehicle({
      licensePlate: 'ABC-1234', categories: ['PASSENGER'], seats: 1, bodyLimit: 0,
      weightLimit: null, operationType: 'ADMINISTRATIVE', ...changeMetadata,
    }, actor.id),
    (error: unknown) => error instanceof VehicleServiceError && error.statusCode === 400,
  )
  await assert.rejects(
    context.service.createVehicle({
      licensePlate: ' abc1234 ', categories: ['PASSENGER'], seats: 1, bodyLimit: 0,
      weightLimit: null, operationType: 'ADMINISTRATIVE', ...changeMetadata,
    }, actor.id),
    (error: unknown) => error instanceof VehicleServiceError
      && error.statusCode === 409
      && error.message === 'Placa já cadastrada',
  )
})

test('transições bloqueiam inativo para manutenção e disponibilidade respeita os três estados', async () => {
  const context = setup(createVehicle({ status: 'INACTIVE' }))
  assert.equal(await context.service.isAvailableForAllocation('21'), false)
  await assert.rejects(
    context.service.changeVehicleStatus('21', {
      status: 'IN_MAINTENANCE', expectedRevision: 1, ...changeMetadata,
    }, actor.id),
    (error: unknown) => error instanceof VehicleServiceError && error.statusCode === 422,
  )

  const available = await context.service.changeVehicleStatus('21', {
    status: 'AVAILABLE', expectedRevision: 1, ...changeMetadata,
  }, actor.id)
  assert.equal(available.status, 'AVAILABLE')
  assert.equal(await context.service.isAvailableForAllocation('21'), true)

  const maintenance = await context.service.changeVehicleStatus('21', {
    status: 'IN_MAINTENANCE', expectedRevision: 2, ...changeMetadata,
  }, actor.id)
  assert.equal(maintenance.status, 'IN_MAINTENANCE')
  assert.equal(await context.service.isAvailableForAllocation('21'), false)
  assert.equal(context.events.length, 2)
  assert.equal(context.audits.length, 2)
})

test('normaliza campos descritivos (brand, model, year, vehicleType, ownership) e rejeita ano inválido', async () => {
  const context = setup(null)
  const created = await context.service.createVehicle({
    licensePlate: 'SVO1A99',
    brand: '  Chevrolet ',
    model: ' S10 ',
    year: 2024,
    vehicleType: ' PICKUP_SVO ',
    ownership: 'LEASED',
    categories: ['BODY'],
    seats: 2,
    bodyLimit: 2,
    weightLimit: null,
    operationType: 'SVO',
    ...changeMetadata,
  }, actor.id)

  assert.equal(created.brand, 'Chevrolet')
  assert.equal(created.model, 'S10')
  assert.equal(created.year, 2024)
  assert.equal(created.vehicleType, 'PICKUP_SVO')
  assert.equal(created.ownership, 'LEASED')

  await assert.rejects(
    context.service.createVehicle({
      licensePlate: 'SVO1A98',
      year: 1950,
      categories: ['BODY'],
      seats: 2,
      bodyLimit: 2,
      weightLimit: null,
      operationType: 'SVO',
      ...changeMetadata,
    }, actor.id),
    (error: unknown) => error instanceof VehicleServiceError && error.statusCode === 400,
  )
})
