import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import { MaintenanceOrdersService, priceMaintenanceItems } from '../src/services/maintenance-orders.service'
import { VehiclesService } from '../src/services/vehicles.service'
import { AuditService } from '../src/services/audit.service'
import type { MaintenanceRepositoryContract } from '../src/repositories/maintenance-orders.repository'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import type { CreateAuditInput } from '../src/types/audit.types'
import type { Vehicle, CreateVehicleEventInput } from '../src/types/vehicle.types'
import type { CreateMaintenanceInput, MaintenanceOrder, MaintenanceEvent, MaintenanceItem } from '../src/types/maintenance.types'

const key = '00000000-0000-4000-8000-000000000059'
const actor = { id: '1', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' }
const source = { reportedBy: 'Oficina fictícia por telefone', reason: 'Reparo de teste' }
const estimate: MaintenanceItem[] = [
  { kind: 'PART', description: 'Filtro fictício', quantity: '2', unitPrice: '18.75' },
  { kind: 'LABOR', description: 'Instalação fictícia', amount: '40.00' },
]
const input: CreateMaintenanceInput = { ...source, vehicleId: '21', type: 'PREVENTIVE',
  description: 'Manutenção fictícia', blocksVehicle: true, openedAt: '2026-11-01T12:00:00Z', estimateItems: estimate }

function setup() {
  const now = new Date('2026-11-01T12:00:00Z')
  let vehicle: Vehicle = { id: '21', licensePlate: 'ABC1234', brand: null, model: null, year: null,
    vehicleType: null, ownership: 'OWNED', categories: ['PASSENGER'], seats: 4, bodyLimit: 0,
    weightLimit: null, operationType: 'ADMINISTRATIVE', status: 'AVAILABLE', revision: 1, createdAt: now, updatedAt: now }
  let orders: MaintenanceOrder[] = []
  let events: MaintenanceEvent[] = []
  let vehicleEvents: CreateVehicleEventInput[] = []
  let audits: CreateAuditInput[] = []
  let failAudit = false
  let activeTrip = false
  let queue = Promise.resolve()
  const client = {} as PoolClient
  const audit = new AuditService({ async create(entry, suppliedClient) {
    assert.equal(suppliedClient, client)
    if (failAudit) throw new Error('Falha de auditoria simulada')
    audits.push(entry)
    return { ...entry, id: String(audits.length), registeredAt: now }
  } })
  const vehicles: VehiclesRepositoryContract = {
    async withTransaction(work) {
      const previous = queue
      let release!: () => void
      queue = new Promise<void>(resolve => { release = resolve })
      await previous
      const snapshot = structuredClone({ vehicle, orders, events, vehicleEvents, audits })
      try { return await work(client) } catch (error) {
        vehicle = snapshot.vehicle
        orders = snapshot.orders
        events = snapshot.events
        vehicleEvents = snapshot.vehicleEvents
        audits = snapshot.audits
        throw error
      } finally { release() }
    },
    async list() { return [vehicle] },
    async findById(id) { return id === vehicle.id ? vehicle : null },
    async findByIdForUpdate(id) { return id === vehicle.id ? vehicle : null },
    async findByLicensePlate() { return null },
    async create() { return vehicle },
    async saveAttributes() { return { kind: 'updated', vehicle } },
    async saveStatus(_id, revision, status) {
      assert.equal(revision, vehicle.revision)
      vehicle = { ...vehicle, status, revision: revision + 1 }
      return { kind: 'updated', vehicle }
    },
    async findActorSnapshot() { return actor },
    async createEvent(event) { vehicleEvents.push(event) },
    async hasActiveMaintenanceBlock() { return repository.hasActiveBlock(vehicle.id, client) },
  }
  const opening = async (_actorId: string, creationKey: string) => {
    const event = events.find(event => event.eventType === 'OPENED' && event.openingRequest?.creationKey === creationKey)
    return event ? { orderId: event.orderId, request: event.openingRequest! } : null
  }
  const repository: MaintenanceRepositoryContract = {
    async findById(id) { return orders.find(order => order.id === id) ?? null },
    async lockOrder(id) { return this.findById(id) },
    findOpening: opening,
    findOpeningInTransaction: opening,
    async hasActiveBlock(id, _client, excludingId) {
      return orders.some(order => order.vehicleId === id && order.id !== excludingId && order.blocksVehicle
        && ['OPEN', 'IN_PROGRESS'].includes(order.status))
    },
    async hasActiveTrip() { return activeTrip },
    async create(values, snapshot, openedAt, actorId) {
      const order: MaintenanceOrder = { ...values, id: String(orders.length + 1), vehicleId: snapshot.id,
        status: 'OPEN', openedAt, closedAt: null, cost: null, actualItems: null,
        vehicleSnapshot: structuredClone(snapshot), createdBy: actorId, closedBy: null,
        revision: 1, createdAt: now, updatedAt: now }
      orders.push(order)
      return order
    },
    async saveAttributes(id, values) {
      const index = orders.findIndex(order => order.id === id)
      orders[index] = { ...orders[index]!, ...values, revision: orders[index]!.revision + 1 }
      return orders[index]!
    },
    async close(id, items, cost, closedAt, actorId) {
      const index = orders.findIndex(order => order.id === id)
      orders[index] = { ...orders[index]!, status: 'DONE', actualItems: items, cost, closedAt,
        closedBy: actorId, revision: orders[index]!.revision + 1 }
      return orders[index]!
    },
    async createEvent(event) { events.push(structuredClone(event)) },
    async list() { return { items: orders, totalSpent: '0.00' } },
  }
  const vehicleService = new VehiclesService(vehicles, audit)
  const service = new MaintenanceOrdersService(repository, vehicles, vehicleService, audit)
  return { service, vehicleService, state: () => ({ vehicle, orders, events, vehicleEvents, audits }),
    failAudit: () => { failAudit = true }, trip: () => { activeTrip = true },
    setStatus: (status: Vehicle['status']) => { vehicle = { ...vehicle, status } } }
}

test('cálculo exato, arredondamento por peça, serviços gratuitos e limite NUMERIC', () => {
  assert.equal(priceMaintenanceItems(estimate).total, '77.50')
  assert.equal(priceMaintenanceItems([{ ...estimate[0], quantity: '1' }, estimate[1]]).total, '58.75')
  assert.equal(priceMaintenanceItems([{ ...estimate[0], quantity: '0.005', unitPrice: '1.00' }]).total, '0.01')
  assert.equal(priceMaintenanceItems([]).total, '0.00')
  assert.equal(priceMaintenanceItems([{ kind: 'LABOR', description: 'Teste', amount: '9999999999.99' }]).total, '9999999999.99')
  for (const invalid of ['-1.00', 'NaN', 'Infinity', '1.001', '1', 1]) {
    assert.throws(() => priceMaintenanceItems([{ kind: 'LABOR', description: 'Teste', amount: invalid }]))
  }
  assert.throws(() => priceMaintenanceItems([{ kind: 'LABOR', description: 'Teste', amount: '10000000000.00' }]))
  for (const quantity of ['0', '-1', '1.0001', 'NaN']) {
    assert.throws(() => priceMaintenanceItems([{ ...estimate[0], quantity }]))
  }
})

test('abertura e encerramento preservam orçamento, execução e disponibilidade', async () => {
  const { service, state } = setup()
  const order = await service.create(input, actor.id, key)
  assert.equal(state().vehicle.status, 'IN_MAINTENANCE')
  assert.equal(order.cost, null)
  assert.equal(order.estimatedTotal, '77.50')
  const closed = await service.close(order.id, { ...source, expectedRevision: 1,
    actualItems: [{ ...estimate[0]!, quantity: '1' } as MaintenanceItem, estimate[1]!] }, actor.id)
  assert.equal(closed.finalCost, '58.75')
  assert.equal(closed.estimatedTotal, '77.50')
  assert.equal(state().vehicle.status, 'AVAILABLE')
  assert.equal(state().events.length, 2)
  await assert.rejects(service.close(order.id, { ...source, expectedRevision: 1, confirmEstimate: true }, actor.id), { statusCode: 409 })
  assert.equal(state().events.length, 2)
})

test('reenvio após edição compara a abertura imutável e não duplica eventos', async () => {
  const { service, state } = setup()
  const order = await service.create(input, actor.id, key)
  await service.updateOrder(order.id, { ...source, expectedRevision: 1, description: 'Descrição revisada' }, actor.id)
  assert.equal((await service.create(input, actor.id, key)).id, order.id)
  assert.equal(state().events.length, 2)
  await assert.rejects(service.create({ ...input, description: 'Pedido diferente' }, actor.id, key), { statusCode: 409 })
})

test('duas aberturas simultâneas com a mesma chave convergem para uma ordem', async () => {
  const { service, state } = setup()
  const results = await Promise.all([service.create(input, actor.id, key), service.create(input, actor.id, key)])
  assert.equal(results[0].id, results[1].id)
  assert.equal(state().orders.length, 1)
  assert.equal(state().events.length, 1)
})

test('duas chaves simultâneas não criam dois impedimentos para o mesmo veículo', async () => {
  const { service, state } = setup()
  const results = await Promise.allSettled([service.create(input, actor.id, key),
    service.create(input, actor.id, '00000000-0000-4000-8000-000000000060')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult
  assert.equal(failure.reason.statusCode, 409)
  assert.equal(state().orders.length, 1)
})

test('abertura impeditiva rejeita viagem ativa, veículo inativo e impedimento manual', async () => {
  const trip = setup()
  trip.trip()
  await assert.rejects(trip.service.create(input, actor.id, key), { statusCode: 422 })
  for (const status of ['INACTIVE', 'IN_MAINTENANCE'] as const) {
    const fixture = setup()
    fixture.setStatus(status)
    await assert.rejects(fixture.service.create(input, actor.id, key), { statusCode: 422 })
    assert.equal(fixture.state().orders.length, 0)
  }
})

test('promoção a impeditiva valida viagem e retirada do bloqueio libera a viatura', async () => {
  const { service, state } = setup()
  const order = await service.create({ ...input, blocksVehicle: false }, actor.id, key)
  await service.updateOrder(order.id, { ...source, expectedRevision: 1, blocksVehicle: true }, actor.id)
  assert.equal(state().vehicle.status, 'IN_MAINTENANCE')
  await service.updateOrder(order.id, { ...source, expectedRevision: 2, blocksVehicle: false }, actor.id)
  assert.equal(state().vehicle.status, 'AVAILABLE')
  const other = setup()
  const nonblocking = await other.service.create({ ...input, blocksVehicle: false }, actor.id, key)
  other.trip()
  await assert.rejects(other.service.updateOrder(nonblocking.id, { ...source, expectedRevision: 1, blocksVehicle: true }, actor.id), { statusCode: 422 })
})

test('encerramento preserva inativação independente e bloqueio manual', async () => {
  const first = setup()
  const order = await first.service.create(input, actor.id, key)
  first.setStatus('INACTIVE')
  await first.service.close(order.id, { ...source, expectedRevision: 1, confirmEstimate: true }, actor.id)
  assert.equal(first.state().vehicle.status, 'INACTIVE')
  const second = setup()
  second.setStatus('IN_MAINTENANCE')
  const nonblocking = await second.service.create({ ...input, blocksVehicle: false }, actor.id, key)
  await second.service.close(nonblocking.id, { ...source, expectedRevision: 1, actualItems: [] }, actor.id)
  assert.equal(second.state().vehicle.status, 'IN_MAINTENANCE')
})

test('liberação manual rejeitada enquanto a ordem impeditiva estiver ativa', async () => {
  const { service, vehicleService, state } = setup()
  await service.create(input, actor.id, key)
  await assert.rejects(vehicleService.changeVehicleStatus('21', { ...source, status: 'AVAILABLE',
    expectedRevision: state().vehicle.revision }, actor.id), { statusCode: 422 })
})

test('disponibilidade respeita impedimento legado mesmo com situação AVAILABLE', async () => {
  const { service, vehicleService, setStatus } = setup()
  await service.create(input, actor.id, key)
  setStatus('AVAILABLE')
  assert.equal(await vehicleService.isAvailableForAllocation('21'), false)
})

test('falha de auditoria reverte ordem, situação e ambos os eventos', async () => {
  const { service, state, failAudit } = setup()
  failAudit()
  await assert.rejects(service.create(input, actor.id, key), /Falha de auditoria/)
  assert.equal(state().vehicle.status, 'AVAILABLE')
  assert.equal(state().orders.length, 0)
  assert.equal(state().events.length, 0)
  assert.equal(state().vehicleEvents.length, 0)
  assert.equal(state().audits.length, 0)
})

test('valida previsão local, hodômetro livre, intervalos e fechamento', async () => {
  for (const odometerKm of [11700, 12000, 12400]) {
    const { service } = setup()
    await service.create({ ...input, odometerKm, expectedCompletionDate: '2026-11-01' }, actor.id, key)
  }
  const { service } = setup()
  await assert.rejects(service.create({ ...input, expectedCompletionDate: '2026-10-31' }, actor.id, key), { statusCode: 400 })
  await assert.rejects(service.list({ from: '2026-11-02T00:00:00Z', to: '2026-11-01T00:00:00Z' }), { statusCode: 400 })
  const order = await service.create(input, actor.id, key)
  await assert.rejects(service.close(order.id, { ...source, expectedRevision: 1, confirmEstimate: true, cost: '1.00' }, actor.id), { statusCode: 400 })
  await assert.rejects(service.close(order.id, { ...source, expectedRevision: 1, confirmEstimate: true, actualItems: [] }, actor.id), { statusCode: 400 })
})
