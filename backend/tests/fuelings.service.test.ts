import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { FuelingsRepositoryContract, FuelingTimeline } from '../src/repositories/fuelings.repository'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import { FuelingsService } from '../src/services/fuelings.service'
import type { CreateFuelingInput, FuelingVersion, FuelingWrite } from '../src/types/fueling.types'
import type { Vehicle } from '../src/types/vehicle.types'

const AT = '2026-10-02T12:00:00.000Z'
const metadata = { reportedBy: 'Equipe Fictícia QA', reason: 'Registro fictício QA', evidenceDescription: 'Comprovante fictício' }
const input: CreateFuelingInput = { ...metadata, vehicleId: '1', fueledAt: AT, fuelType: 'DIESEL',
  liters: '1.1', totalValue: '2.2', odometerKm: 51200 }
const actor = { id: '2', name: 'Gestor Fictício QA', email: 'gestor.unit@example.test', role: 'GESTOR' }
const vehicle: Vehicle = { id: '1', licensePlate: 'QAT1A64', brand: null, model: null, year: null, vehicleType: null,
  ownership: 'OWNED', categories: ['BODY'], seats: 2, bodyLimit: 2, weightLimit: null, operationType: 'SVO',
  status: 'AVAILABLE', revision: 1, createdAt: new Date(AT), updatedAt: new Date(AT) }
function version(write: FuelingWrite): FuelingVersion {
  return { ...write.input, id: '10', driverId: write.input.driverId ?? null, station: write.input.station ?? null,
    notes: write.input.notes ?? null, evidenceDescription: write.input.evidenceDescription ?? null,
    attachmentUrl: write.input.attachmentUrl ?? null, supersedesId: write.before?.id ?? null,
    revision: (write.before?.revision ?? 0) + 1, createdBy: actor.id, actorSnapshot: actor,
    vehicleSnapshot: write.vehicleSnapshot, driverSnapshot: write.driverSnapshot, isAnnulled: false,
    annulmentReason: null, registeredAt: AT, createdAt: AT, updatedAt: AT }
}
function fixture(timeline: FuelingTimeline = { facts: [], valid: true }) {
  const calls: string[] = []
  const writes: FuelingWrite[] = []
  const client = {} as PoolClient
  const repository: FuelingsRepositoryContract = {
    list: async (_filters, page, pageSize) => ({ items: [], total: 0, page, pageSize, totalPages: 0, totalLiters: '0.000', totalValue: '0.00' }),
    findById: async () => null,
    lockVersion: async () => null,
    history: async () => null,
    findRequest: async () => null,
    findDriver: async () => null,
    timeline: async (_id, _excluded, tx) => { assert.equal(tx, client); calls.push('timeline'); return timeline },
    correctionReading: async () => ({ id: null, valid: true }),
    insertVersion: async (write, tx) => { assert.equal(tx, client); calls.push('fact'); writes.push(write); return version(write) },
    insertReading: async (_write, _after, _before, tx) => { assert.equal(tx, client); calls.push('reading') },
    insertEvent: async (_write, _after, tx) => { assert.equal(tx, client); calls.push('event') },
  }
  const vehicles: Pick<VehiclesRepositoryContract, 'withTransaction' | 'findByIdForUpdate' | 'findActorSnapshot'> = {
    withTransaction: async work => {
      calls.push('begin')
      try { const result = await work(client); calls.push('commit'); return result }
      catch (e) { calls.push('rollback'); throw e }
    },
    findByIdForUpdate: async (_id, tx) => { assert.equal(tx, client); calls.push('lock'); return vehicle },
    findActorSnapshot: async () => actor,
  }
  const service = new FuelingsService(repository, vehicles, { recordAudit: async (_entry, tx) => {
    assert.equal(tx, client); calls.push('audit')
    return { id: '1', userId: actor.id, table: 'fleet.fuelings', recordId: '10', operation: 'CREATE',
      before: null, after: null, actorSnapshot: actor, reason: metadata.reason, registeredAt: new Date(AT) }
  } }, () => new Date(AT))
  return { service, repository, calls, writes }
}

test('service valida o domínio sem HTTP e só consulta a cronologia depois da trava', async () => {
  const { service, calls, writes } = fixture({ facts: [
    { odometerKm: 51000, occurredAt: '2026-10-01T00:00:00Z' },
    { odometerKm: 52000, occurredAt: '2026-10-03T00:00:00Z' },
  ], valid: true })
  const result = await service.create(input, actor.id, randomUUID())
  assert.equal(result.liters, '1.100')
  assert.equal(result.totalValue, '2.20')
  assert.deepEqual(calls, ['begin','lock','timeline','fact','reading','event','audit','commit'])
  assert.equal(writes.length, 1)
})
test('relógio controlado distingue data futura do instante permitido', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.create({ ...input, fueledAt: '2026-10-02T12:00:00.001Z' }, actor.id, randomUUID()), { code: 'FUTURE_DATE' })
  assert.equal(calls.includes('fact'), false)
  assert.equal(calls.at(-1), 'rollback')
  await service.create(input, actor.id, randomUUID())
})
test('limites contraditórios ou sem instante geram conflito de histórico e preservam o ledger', async () => {
  for (const facts of [
    [{ odometerKm: 51000, occurredAt: null }],
    [{ odometerKm: 52000, occurredAt: '2026-10-01T00:00:00Z' }, { odometerKm: 51000, occurredAt: '2026-10-03T00:00:00Z' }],
    [{ odometerKm: 52000, occurredAt: AT }, { odometerKm: 51000, occurredAt: AT }],
  ]) {
    const { service, calls } = fixture({ valid: true, facts })
    await assert.rejects(service.create(input, actor.id, randomUUID()), { code: 'HISTORY_CONFLICT' })
    assert.equal(calls.includes('fact'), false)
  }
})
test('fronteiras unilaterais e igualdade no mesmo instante são respeitadas', async () => {
  for (const [fact, km, accepted] of [
    [{ odometerKm: 51000, occurredAt: '2026-10-01T00:00:00Z' }, 51000, true],
    [{ odometerKm: 51000, occurredAt: '2026-10-01T00:00:00Z' }, 50999, false],
    [{ odometerKm: 52000, occurredAt: '2026-10-03T00:00:00Z' }, 52000, true],
    [{ odometerKm: 52000, occurredAt: '2026-10-03T00:00:00Z' }, 52001, false],
    [{ odometerKm: 51200, occurredAt: AT }, 51200, true],
    [{ odometerKm: 51200, occurredAt: AT }, 51201, false],
  ] as const) {
    const { service } = fixture({ valid: true, facts: [fact] })
    const result = service.create({ ...input, odometerKm: km }, actor.id, randomUUID())
    if (accepted) await result
    else await assert.rejects(result, { code: 'ODOMETER_CONFLICT' })
  }
})
test('replay normalizado não abre nova transação e recusa conteúdo diferente', async () => {
  const { service, repository, calls, writes } = fixture()
  const created = await service.create(input, actor.id, randomUUID())
  const request = writes[0]!.request
  repository.findRequest = async () => ({ fueling: created, request })
  calls.length = 0
  assert.deepEqual(await service.create({ ...input, liters: '1.100', totalValue: '2.20' }, actor.id, randomUUID()), created)
  assert.deepEqual(calls, [])
  await assert.rejects(service.create({ ...input, liters: '2' }, actor.id, randomUUID()), { code: 'IDEMPOTENCY_CONFLICT' })
})
test('falha de leitura ou evento interrompe a unidade de trabalho antes de auditar', async () => {
  for (const phase of ['insertReading', 'insertEvent'] as const) {
    const { service, repository, calls } = fixture()
    repository[phase] = async () => { throw new Error('Falha fictícia QA') }
    await assert.rejects(service.create(input, actor.id, randomUUID()), /Falha fictícia QA/)
    assert.equal(calls.includes('audit'), false)
    assert.equal(calls.at(-1), 'rollback')
  }
})
test('valores/formas inválidas falham antes de qualquer escrita', async () => {
  const { service, calls } = fixture()
  for (const liters of ['0', '-1', '0.0001', '1e2', '10000000']) {
    await assert.rejects(service.create({ ...input, liters }, actor.id, randomUUID()), { code: 'INVALID_INPUT' })
  }
  await assert.rejects(service.list({ page: '0' }), { code: 'INVALID_INPUT' })
  assert.deepEqual(calls, [])
})

test('microssegundos preservam offsets, precisão máxima e o limite futuro do relógio', async () => {
  const { service } = fixture()
  const past = await service.create({ ...input, fueledAt: '2026-10-02T08:59:59.999999-03:00' }, actor.id, randomUUID())
  assert.equal(past.fueledAt, '2026-10-02T11:59:59.999999Z')
  await assert.rejects(service.create({ ...input, fueledAt: '2026-10-02T12:00:00.000001Z' }, actor.id, randomUUID()), { code: 'FUTURE_DATE' })
  await assert.rejects(service.create({ ...input, fueledAt: '2026-10-02T11:59:59.9999999Z' }, actor.id, randomUUID()), { code: 'INVALID_INPUT' })
  await service.list({ from: '2026-10-02T11:59:59.999Z', to: '2026-10-02T11:59:59.999001Z' })
  await assert.rejects(service.list({ from: '2026-10-02T11:59:59.999001Z', to: '2026-10-02T11:59:59.999Z' }), { code: 'INVALID_INPUT' })
})

test('cronologia anterior a 1970 preserva a fração sem inverter os limites', async () => {
  const { service } = fixture({ valid: true, facts: [
    { odometerKm: 52000, occurredAt: '1969-12-31T23:59:59.999999Z' },
  ] })
  const before = await service.create({ ...input, fueledAt: '1969-12-31T23:59:59.999Z' }, actor.id, randomUUID())
  assert.equal(before.odometerKm, 51200)
  await assert.rejects(service.create({ ...input, fueledAt: '1970-01-01T00:00:00Z' }, actor.id, randomUUID()), { code: 'ODOMETER_CONFLICT' })
})
