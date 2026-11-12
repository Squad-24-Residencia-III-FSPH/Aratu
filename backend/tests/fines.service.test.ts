import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import { FinesService } from '../src/services/fines.service'
import type { FinesRepositoryContract } from '../src/repositories/fines.repository'
import { FINE_STATUSES, FineServiceError } from '../src/types/fine.types'
import type { Fine, FineStatus, CreateFineInput, ChangeFineStatusInput } from '../src/types/fine.types'

const at = '2026-11-01T14:00:00.000Z'
const source = { reportedBy: 'Protocolo fictício QA', reason: 'Conferência fictícia', evidenceDescription: 'Notificação sintética QA' }
const input: CreateFineInput = { ...source, vehicleId: '1', infractionAt: at, infractionCode: 'QA-001', description: 'Infração fictícia', amount: '195.23' }
const key = '11111111-1111-4111-8111-111111111173'
const vehicle = { id: '1', licensePlate: 'QAT1A73', model: 'Modelo fictício' }
const actor = { id: '1', name: 'Gestor Fictício QA', email: 'gestor@example.test', role: 'GESTOR' }
function fine(status: FineStatus = 'PENDING'): Fine {
  return { ...input, id: '1', driverId: null, tripId: null, location: null, dueAt: null, notes: null,
    vehicleSnapshot: null, driverSnapshot: null, tripSnapshot: null, status, paidAt: null,
    cancellationReason: null, createdBy: '1', revision: 1, createdAt: at, updatedAt: at, vehicle, driver: null }
}
function fixture(status: FineStatus = 'PENDING') {
  let stored = fine(status)
  let writes = 0
  let audits = 0
  let queriedNow = ''
  const unexpected = async (): Promise<never> => { throw new Error('Dependência não esperada neste cenário unitário') }
  const repository: FinesRepositoryContract = {
    list: async () => [], findById: async () => stored, findDetail: async () => ({ ...stored, events: [] }),
    listEvents: async () => [], findRegistration: async () => null,
    findDriverSuggestions: async (_vehicle, _at, now) => { queriedNow = now; return [] },
    findTripForShare: unexpected, lockById: async () => stored,
    create: async (attributes, context) => { writes++; stored = { ...stored, ...attributes, ...context }; return stored },
    saveAttributes: async (_id, attributes, context) => { writes++; stored = { ...stored, ...attributes, ...context, revision: stored.revision + 1 }; return stored },
    saveStatus: async (_id, next, paidAt, reason) => { writes++; stored = { ...stored, status: next, paidAt, cancellationReason: reason, revision: stored.revision + 1 }; return stored },
    createEvent: async () => {},
  }
  const service = new FinesService(repository, {
    withTransaction: async work => work({} as PoolClient),
    findById: async () => ({ ...vehicle } as never), findByIdForUpdate: async () => ({ ...vehicle } as never),
    findActorSnapshot: async () => actor,
  }, { findById: unexpected }, { recordAudit: async () => { audits++; return {} as never } }, () => new Date('2026-11-01T16:00:00Z'))
  return { service, repository, state: () => ({ stored, writes, audits, queriedNow }) }
}
function error(code: string): (value: unknown) => boolean {
  return value => value instanceof FineServiceError && value.code === code
}
test('moeda exata: limites aceitos e formatos inválidos rejeitados antes da persistência', async () => {
  for (const amount of ['0.00', '9999999999.99']) {
    const { service } = fixture()
    assert.equal((await service.create({ ...input, amount }, '1', key)).amount, amount)
  }
  for (const amount of [-1, 0, '1,00', '-1.00', '1.001', '10000000000.00', '01.00', null]) {
    const { service, state } = fixture()
    await assert.rejects(service.create({ ...input, amount } as CreateFineInput, '1', key), error('INVALID_INPUT'))
    assert.equal(state().writes, 0)
  }
})
test('calendário e fuso são validados, normalizando instantes equivalentes', async () => {
  for (const infractionAt of ['2026-02-29T10:00:00Z', '2026-11-01T24:00:00Z', '2026-11-01T14:00:00', '2026-11-01T14:00:00+25:00', '0000-01-01T00:00:00Z', '0001-01-01T00:00:00+03:00', '9999-12-31T23:59:59-03:00']) {
    await assert.rejects(fixture().service.create({ ...input, infractionAt }, '1', key), error('INVALID_INPUT'))
  }
  assert.equal((await fixture().service.create({ ...input, infractionAt: '2026-11-01T11:00:00-03:00' }, '1', key)).infractionAt, at)
})
test('obrigatoriedade, nulabilidade, UUID e limites dos identificadores', async () => {
  for (const field of ['vehicleId', 'infractionAt', 'infractionCode', 'description', 'amount', 'reportedBy', 'reason', 'evidenceDescription']) {
    await assert.rejects(fixture().service.create({ ...input, [field]: null } as CreateFineInput, '1', key), error('INVALID_INPUT'))
  }
  for (const vehicleId of ['0', '-1', '9223372036854775808', '1 OR 1=1', '1.0']) {
    await assert.rejects(fixture().service.create({ ...input, vehicleId }, '1', key), error('INVALID_INPUT'))
  }
  await assert.rejects(fixture().service.create(input, '1', 'invalid'), error('INVALID_INPUT'))
  await assert.rejects(fixture().service.create({ ...input, attachmentUrl: 'https://user:secret@example.test/file' }, '1', key), error('INVALID_INPUT'))
})
test('matriz de situação completa: transições, no-op e revisão', async () => {
  const permitted = new Set(['PENDING:CONTESTED', 'PENDING:PAID', 'PENDING:CANCELED',
    'CONTESTED:PENDING', 'CONTESTED:PAID', 'CONTESTED:CANCELED', 'PAID:PENDING', 'CANCELED:PENDING'])
  for (const from of FINE_STATUSES) for (const to of FINE_STATUSES) {
    const { service, state } = fixture(from)
    const payload = { ...source, expectedRevision: 1, status: to,
      ...(to === 'PAID' ? { paidAt: at } : { occurredAt: at }) } as ChangeFineStatusInput
    if (from !== to && !permitted.has(`${from}:${to}`)) {
      await assert.rejects(service.changeStatus('1', payload, '1'), error('INVALID_TRANSITION'))
      assert.equal(state().writes, 0)
    } else {
      const result = await service.changeStatus('1', payload, '1')
      assert.equal(result.status, to)
      assert.equal(result.revision, from === to ? 1 : 2)
      assert.equal(state().audits, from === to ? 0 : 1)
    }
  }
})
test('pagamento exige instante e não aceita dois momentos diferentes', async () => {
  for (const fields of [{}, { paidAt: at, occurredAt: '2026-11-01T15:00:00Z' }]) {
    await assert.rejects(fixture().service.changeStatus('1', { ...source, expectedRevision: 1, status: 'PAID', ...fields } as ChangeFineStatusInput, '1'), error('INVALID_INPUT'))
  }
})
test('edição fechada exige reabertura; no-op e revisão antiga não criam eventos', async () => {
  for (const status of ['PAID', 'CANCELED'] as const) await assert.rejects(fixture(status).service.updateFine('1', {
    ...source, expectedRevision: 1, occurredAt: at, amount: '1.00',
  }, '1'), error('CLOSED_FINE'))
  const { service, state } = fixture()
  assert.equal((await service.updateFine('1', { ...source, expectedRevision: 1, occurredAt: at, amount: '195.23' }, '1')).revision, 1)
  assert.equal(state().writes, 0)
  await assert.rejects(service.updateFine('1', { ...source, expectedRevision: 2, occurredAt: at, amount: '1.00' }, '1'), error('REVISION_CONFLICT'))
})
test('filtros recusam período vazio e sugestão usa relógio injetado', async () => {
  const { service, state } = fixture()
  await assert.rejects(service.list({ from: at, to: at }), error('INVALID_INPUT'))
  await service.suggestDrivers('1', at)
  assert.equal(state().queriedNow, '2026-11-01T16:00:00.000Z')
})
test('service não aceita campos controlados ou objeto estrutural inválido', async () => {
  for (const payload of [null, [], { ...input, status: 'PAID' }, { ...input, createdBy: '2' }, { ...input, svoExecutionOrderId: '1' }]) {
    await assert.rejects(fixture().service.create(payload as CreateFineInput, '1', key), error('INVALID_INPUT'))
  }
})
