import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import { SvoOrdersService } from '../src/services/svo-orders.service'
import type { SvoOccurrencesRepositoryContract } from '../src/repositories/svo-occurrences.repository'
import type { SvoOrdersRepositoryContract } from '../src/repositories/svo-orders.repository'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { SvoActorSnapshot, SvoOccurrenceDetail } from '../src/types/svo-occurrence.types'
import { SvoOrderServiceError } from '../src/types/svo-order.types'
import type { OpenSvoOrderEvent, SvoOrderErrorCode, SvoTeamSnapshot } from '../src/types/svo-order.types'
import type { Vehicle } from '../src/types/vehicle.types'
import { svoInput } from './fixtures/svo-occurrences.fixture'

const input = { occurrenceId: '9007199254740993', teamId: '2', vehicleId: '3' }

function harness() {
  const client = {} as PoolClient
  const time = new Date('2026-01-05T12:00:00Z')
  const actor: SvoActorSnapshot = { id: '1', name: 'Operador Fictício', email: 'svo@example.test', role: 'ATENDENTE_SVO' }
  const occurrence: SvoOccurrenceDetail = {
    ...svoInput(), id: input.occurrenceId, status: 'CONFIRMED', receivedAt: time, createdAt: time,
    notes: 'SENTINELA_NOTAS', attendantId: '1', revision: 2, triagedAt: time, triagedBy: '1', updatedAt: time,
  }
  const vehicle: Vehicle = {
    id: '3', licensePlate: 'FIC0A01', brand: null, model: null, year: null, vehicleType: null,
    ownership: 'OWNED', categories: ['BODY'], seats: 2, bodyLimit: 1, weightLimit: null,
    operationType: 'SVO', status: 'AVAILABLE', revision: 1, createdAt: time, updatedAt: time,
  }
  const team: SvoTeamSnapshot = { id: '2', name: 'Equipe Fictícia', active: true, revision: 1 }
  const calls: string[] = []
  const events: OpenSvoOrderEvent[] = []
  const audits: CreateAuditInput[] = []
  function step(name: string, transaction: PoolClient): void { assert.equal(transaction, client); calls.push(name) }
  const occurrences: Pick<SvoOccurrencesRepositoryContract, 'withTransaction' | 'findActorSnapshot' | 'currentTime' | 'findByIdForUpdate'> = {
    async withTransaction(work) {
      calls.push('begin')
      try { const result = await work(client); calls.push('commit'); return result }
      catch (error) { calls.push('rollback'); throw error }
    },
    async findActorSnapshot(_id, transaction) { step('actor', transaction); return actor },
    async findByIdForUpdate(id, transaction) { assert.equal(id, input.occurrenceId); step('occurrence', transaction); return occurrence },
    async currentTime(transaction) { step('clock', transaction); return time },
  }
  const orders: SvoOrdersRepositoryContract = {
    async findByOccurrenceId(_id, transaction) { step('unique', transaction); return null },
    async findTeamForShare(_id, transaction) { step('team', transaction); return team },
    async countOccupyingOrders(_id, transaction) { step('capacity', transaction); return 0 },
    async create(order, transaction) { step('create', transaction); return { ...order, id: '4' } },
    async createOpenedEvent(event, transaction) { step('event', transaction); events.push(event) },
  }
  const vehicles: Pick<VehiclesRepositoryContract, 'findByIdForUpdate' | 'hasActiveMaintenanceBlock'> = {
    async findByIdForUpdate(_id, transaction) { step('vehicle', transaction); return vehicle },
    async hasActiveMaintenanceBlock(id, transaction) { assert.equal(id, vehicle.id); step('maintenance', transaction); return false },
  }
  const audit: AuditLogger = {
    async recordAudit(data, transaction) { step('audit', transaction!); audits.push(data); return {} as AuditEntry },
  }
  return { service: new SvoOrdersService(occurrences, orders, vehicles, audit), occurrences, orders, vehicles,
    audit, calls, events, audits, actor, occurrence, vehicle, team, time }
}

function code(expected: SvoOrderErrorCode): (error: unknown) => boolean {
  return (error) => error instanceof SvoOrderServiceError && error.code === expected
}

test('ORD unit: usa ordem fixa de travas, mesmo cliente, relógio e auditoria mínima', async () => {
  const h = harness()
  assert.deepEqual(await h.service.createOrder(input, '1'), { id: '4', status: 'OPEN' })
  assert.deepEqual(h.calls, ['begin', 'actor', 'occurrence', 'unique', 'team', 'vehicle', 'maintenance', 'capacity', 'clock', 'create', 'event', 'audit', 'commit'])
  assert.equal(h.events[0]!.order.openedAt, h.time)
  assert.deepEqual(h.events[0]!.order.teamSnapshot, h.team)
  assert.equal(h.events[0]!.order.occurrenceSnapshot.requesterPhone, svoInput().requesterPhone)
  assert.deepEqual(Object.keys(h.audits[0]!.after!).sort(), ['id', 'occurrenceId', 'teamId', 'vehicleId', 'status', 'openedAt', 'revision'].sort())
  assert.doesNotMatch(JSON.stringify(h.audits), /SENTINELA/)
  assert.deepEqual(h.audits[0]!.actorSnapshot, h.actor)
})

test('ORD unit: IDs canônicos até BIGINT, sem perda de precisão ou consulta em entrada inválida', async () => {
  for (const field of Object.keys(input)) {
    for (const value of [undefined, null, 1, 0, '', '0', '-1', '1.2', ' 1', '1 ', '01', '+1', '1e2', '9223372036854775808', '9'.repeat(100), {}, []]) {
      const h = harness()
      await assert.rejects(h.service.createOrder({ ...input, [field]: value }, '1'), code('INVALID_INPUT'))
      assert.deepEqual(h.calls, [])
    }
  }
  for (const body of [null, [], true, 'value', { ...input, status: 'OPEN' }, {}]) {
    await assert.rejects(harness().service.createOrder(body, '1'), code('INVALID_INPUT'))
  }
  const h = harness()
  h.orders.findTeamForShare = async (id) => { assert.equal(id, '9223372036854775807'); return h.team }
  await h.service.createOrder({ ...input, teamId: '9223372036854775807' }, '1')
})

test('ORD unit: conta e perfil são revalidados antes de consultar ocorrência', async () => {
  for (const role of ['GESTOR', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) {
    const h = harness(); h.actor.role = role
    await assert.rejects(h.service.createOrder(input, '1'), code('ACCESS_DENIED'))
    assert.deepEqual(h.calls, ['begin', 'actor', 'rollback'])
  }
  const h = harness(); h.occurrences.findActorSnapshot = async () => null
  await assert.rejects(h.service.createOrder(input, '1'), code('ACCOUNT_UNAVAILABLE'))
})

test('ORD unit: duplicidade precede estado; referências e equipe são validadas', async () => {
  const duplicate = harness(); duplicate.occurrence.status = 'CANCELED'
  duplicate.orders.findByOccurrenceId = async () => '9'
  await assert.rejects(duplicate.service.createOrder(input, '1'), code('ORDER_ALREADY_EXISTS'))
  for (const status of ['PENDING', 'CANCELED'] as const) {
    const h = harness(); h.occurrence.status = status
    await assert.rejects(h.service.createOrder(input, '1'), code('OCCURRENCE_NOT_CONFIRMED'))
    assert.ok(!h.calls.includes('team'))
  }
  const missing = harness(); missing.occurrences.findByIdForUpdate = async () => null
  await assert.rejects(missing.service.createOrder(input, '1'), code('NOT_FOUND'))
  const team = harness(); team.orders.findTeamForShare = async () => null
  await assert.rejects(team.service.createOrder(input, '1'), code('NOT_FOUND'))
  const inactive = harness(); inactive.team.active = false
  await assert.rejects(inactive.service.createOrder(input, '1'), code('TEAM_UNAVAILABLE'))
  const vehicle = harness(); vehicle.vehicles.findByIdForUpdate = async () => null
  await assert.rejects(vehicle.service.createOrder(input, '1'), code('NOT_FOUND'))
})

test('ORD unit: elegibilidade e capacidade vigente incluem limite zero e redução', async () => {
  for (const changes of [{ status: 'INACTIVE' }, { status: 'IN_MAINTENANCE' },
    { operationType: 'ADMINISTRATIVE' }, { categories: ['PASSENGER'] }] as const) {
    const h = harness(); Object.assign(h.vehicle, changes)
    await assert.rejects(h.service.createOrder(input, '1'), code('VEHICLE_UNAVAILABLE'))
  }
  for (const [occupied, limit, allowed] of [[0, 0, false], [0, 1, true], [1, 2, true], [2, 2, false], [3, 1, false]] as const) {
    const h = harness(); h.vehicle.bodyLimit = limit; h.orders.countOccupyingOrders = async () => occupied
    if (allowed) await h.service.createOrder(input, '1')
    else await assert.rejects(h.service.createOrder(input, '1'), code('CAPACITY_EXCEEDED'))
  }
})

test('ORD unit: falhas de evento/auditoria propagam rollback antes do resultado', async () => {
  for (const step of ['event', 'audit'] as const) {
    const h = harness(); const failure = new Error('Falha fictícia')
    if (step === 'event') h.orders.createOpenedEvent = async () => { throw failure }
    else h.audit.recordAudit = async () => { throw failure }
    await assert.rejects(h.service.createOrder(input, '1'), (error) => error === failure)
    assert.equal(h.calls.at(-1), 'rollback')
    assert.ok(!h.calls.includes('commit'))
  }
})

test('ORD unit: manutenção impeditiva em veículo AVAILABLE é consultada sob a mesma trava e impede escritas', async () => {
  const h = harness()
  const normalCheck = h.vehicles.hasActiveMaintenanceBlock
  h.vehicles.hasActiveMaintenanceBlock = async (id, transaction) => {
    await normalCheck(id, transaction)
    return true
  }
  await assert.rejects(h.service.createOrder(input, '1'), code('VEHICLE_UNAVAILABLE'))
  assert.deepEqual(h.calls, ['begin', 'actor', 'occurrence', 'unique', 'team', 'vehicle', 'maintenance', 'rollback'])
  assert.deepEqual(h.events, [])
  assert.deepEqual(h.audits, [])
})

test('ORD unit: somente a constraint histórica conhecida vira conflito de duplicidade', async () => {
  for (const constraint of ['execution_orders_occurrence_id_key', 'outra_constraint']) {
    const h = harness()
    const failure = { code: '23505', schema: 'svo', table: 'execution_orders', constraint }
    h.orders.create = async () => { throw failure }
    await assert.rejects(h.service.createOrder(input, '1'), constraint === 'execution_orders_occurrence_id_key'
      ? code('ORDER_ALREADY_EXISTS') : (error) => error === failure)
    assert.equal(h.calls.at(-1), 'rollback')
  }
})
