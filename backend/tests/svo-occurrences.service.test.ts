import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Pool, PoolClient } from 'pg'
import { SvoOccurrencesService } from '../src/services/svo-occurrences.service'
import type { SvoOccurrencesRepositoryContract } from '../src/repositories/svo-occurrences.repository'
import { SvoOccurrencesRepository } from '../src/repositories/svo-occurrences.repository'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { CreateSvoEventInput, SvoActorSnapshot, SvoListFilters, SvoOccurrenceDetail } from '../src/types/svo-occurrence.types'
import { SvoOccurrenceServiceError } from '../src/types/svo-occurrence.types'
import { svoInput } from './fixtures/svo-occurrences.fixture'

function harness() {
  const client = {} as PoolClient
  const time = new Date('2026-01-05T12:00:00Z')
  const actor: SvoActorSnapshot = { id: '1', name: 'Operador Fictício', email: 'svo@example.test', role: 'ATENDENTE_SVO' }
  const occurrence: SvoOccurrenceDetail = {
    ...svoInput(), id: '9007199254740993', status: 'PENDING', receivedAt: time, createdAt: time,
    notes: null, attendantId: actor.id, revision: 1, triagedAt: null, triagedBy: null, updatedAt: time,
    dispatchRequestedAt: null, dispatchRequestedBy: null, dispatchWaitReason: null, executionOrderId: null,
  }
  const calls: string[] = []
  const events: CreateSvoEventInput[] = []
  const audits: CreateAuditInput[] = []
  const repository: SvoOccurrencesRepositoryContract = {
    async withTransaction(work) {
      calls.push('begin')
      try { const result = await work(client); calls.push('commit'); return result }
      catch (error) { calls.push('rollback'); throw error }
    },
    async findActorSnapshot() { calls.push('actor'); return actor },
    async currentTime() { return time },
    async create(input, receivedAt, _actor, transaction) {
      assert.equal(transaction, client); calls.push('create'); return { ...occurrence, ...input, notes: input.notes ?? null, receivedAt }
    },
    async findById() { calls.push('read'); return occurrence },
    async findByIdForUpdate() { calls.push('lock'); return occurrence },
    async list() { return [] },
    async confirm(_id, confirmActor, instant, transaction) {
      assert.equal(transaction, client); calls.push('confirm')
      return { ...occurrence, status: 'CONFIRMED', triagedAt: instant, triagedBy: confirmActor.id,
        dispatchRequestedAt: instant, dispatchRequestedBy: confirmActor.id, revision: 2 }
    },
    async setDispatchIntent() { return occurrence },
    async setDispatchWaitReason() { return occurrence },
    async createEvent(event, transaction) { assert.equal(transaction, client); calls.push('event'); events.push(event) },
  }
  const audit: AuditLogger = {
    async recordAudit(input, transaction) { assert.equal(transaction, client); calls.push('audit'); audits.push(input); return {} as AuditEntry },
  }
  return { service: new SvoOccurrencesService(repository, audit), repository, audit, calls, events, audits, time, actor, occurrence }
}

function code(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof SvoOccurrenceServiceError && error.code === expected
}

test('SVO unit: criação usa relógio do banco, mesmo cliente e projeção mínima da auditoria', async () => {
  const h = harness()
  const paddedInput = Object.fromEntries(Object.entries(svoInput()).map(([key, value]) => [key, `  ${value}  `]))
  const result = await h.service.createOccurrence(paddedInput, '1')
  assert.equal(result.receivedAt, h.time)
  assert.deepEqual(h.calls, ['begin', 'actor', 'create', 'event', 'audit', 'commit'])
  assert.equal(h.events[0]?.reportedBy, svoInput().requesterName)
  assert.equal(h.events[0]?.afterState.requesterType, 'FAMILY')
  assert.equal(h.events[0]?.afterState.notes, svoInput().notes)
  assert.equal(h.events[0]?.occurredAt, h.time)
  assert.deepEqual(Object.keys(h.audits[0]!.after!).sort(), [
    'id', 'receivedAt', 'revision', 'status', 'triagedAt', 'triagedBy',
    'dispatchRequestedAt', 'dispatchRequestedBy', 'dispatchWaitReason', 'executionOrderId',
  ].sort())
  assert.ok(!JSON.stringify(h.audits).includes('SENTINELA_'))
})

test('SVO unit: campos, tipos, objetos e propriedades forjadas são recusados antes da transação', async () => {
  for (const field of ['requesterName', 'requesterPhone', 'requesterType', 'location', 'description', 'evidenceDescription']) {
    for (const value of [undefined, null, '', '   ', 12, false, [], {}]) {
      const h = harness()
      await assert.rejects(h.service.createOccurrence({ ...svoInput(), [field]: value }, '1'), code('INVALID_INPUT'))
      assert.deepEqual(h.calls, [])
    }
  }
  for (const body of [null, [], true, 'text', { ...svoInput(), status: 'CONFIRMED' }, { ...svoInput(), notes: false }]) {
    await assert.rejects(harness().service.createOccurrence(body, '1'), code('INVALID_INPUT'))
  }
})

test('SVO unit: datas impossíveis/sem fuso/futuras rejeitam; passado preserva bi-temporalidade', async () => {
  for (const receivedAt of [null, 123, '', '2025-02-29T10:00:00Z', '2025-01-01T10:00:00', '2025-01-01T24:00:00Z', '2025-01-01T10:00:00+25:00', '2027-01-01T00:00:00Z']) {
    const h = harness()
    await assert.rejects(h.service.createOccurrence({ ...svoInput(), receivedAt }, '1'), code('INVALID_INPUT'))
    assert.ok(!h.calls.includes('create'))
  }
  const h = harness()
  await h.service.createOccurrence({ ...svoInput(), receivedAt: '2024-02-29T02:00:00-03:00' }, '1')
  assert.equal(h.events[0]?.occurredAt.toISOString(), '2024-02-29T05:00:00.000Z')
})

test('SVO unit: notes vazias viram null, sem coerção de tipos', async () => {
  for (const notes of [undefined, null, '', '   ']) {
    const h = harness()
    await h.service.createOccurrence({ ...svoInput(), notes }, '1')
    assert.equal(h.events[0]?.afterState.notes, null)
  }
})

test('SVO unit: confirmação decide sob lock, retorna após commit e não exige histórico legado', async () => {
  const h = harness()
  h.occurrence.evidenceDescription = null
  const result = await h.service.confirmOccurrence(h.occurrence.id, { expectedRevision: 1 }, '1')
  assert.deepEqual(h.calls, ['begin', 'actor', 'lock', 'confirm', 'event', 'event', 'audit', 'commit'])
  assert.equal(result.triagedAt, h.events[0]?.occurredAt)
  assert.equal(h.events[0]?.beforeState?.evidenceDescription, null)
  assert.equal(h.audits[0]?.operation, 'STATUS_CHANGE')
})

test('SVO unit: FSM e dados armazenados incompletos não produzem escrita', async () => {
  for (const status of ['CONFIRMED', 'CANCELED'] as const) {
    const h = harness(); h.occurrence.status = status
    await assert.rejects(h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1'), code('INVALID_TRANSITION'))
    assert.ok(!h.calls.includes('confirm'))
  }
  const h = harness(); h.occurrence.location = ''
  await assert.rejects(h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1'), code('INVALID_INPUT'))
  assert.ok(!h.calls.includes('confirm'))
})

test('SVO unit: conta é revalidada dentro da transação para ambas as escritas', async () => {
  for (const confirm of [false, true]) {
    for (const role of ['GESTOR', 'EQUIPE_SVO', 'SOLICITANTE', 'MOTORISTA'] as const) {
      const h = harness(); h.actor.role = role
      await assert.rejects(confirm ? h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1') : h.service.createOccurrence(svoInput(), '1'), code('ACCESS_DENIED'))
      assert.deepEqual(h.calls, ['begin', 'actor', 'rollback'])
    }
    const h = harness(); h.repository.findActorSnapshot = async () => null
    await assert.rejects(confirm ? h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1') : h.service.createOccurrence(svoInput(), '1'), code('ACCOUNT_UNAVAILABLE'))
  }
})

test('SVO unit: falha de evento, auditoria ou commit nunca retorna sucesso', async () => {
  for (const confirm of [false, true]) {
    for (const point of ['event', 'audit', 'commit']) {
      const h = harness()
      const error = new Error('Falha sintética')
      if (point === 'event') h.repository.createEvent = async () => { throw error }
      if (point === 'audit') h.audit.recordAudit = async () => { throw error }
      if (point === 'commit') {
        const transaction = h.repository.withTransaction.bind(h.repository)
        h.repository.withTransaction = async (work) => { await transaction(work); throw error }
      }
      await assert.rejects(confirm ? h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1') : h.service.createOccurrence(svoInput(), '1'), error)
      if (point !== 'commit') assert.equal(h.calls.at(-1), 'rollback')
    }
  }
})

test('SVO unit: IDs preservam BIGINT e confirmação não aceita corpo extra', async () => {
  for (const id of ['0', '-1', '01', '1.1', '1e2', '9223372036854775808', '9'.repeat(100), [], undefined]) {
    await assert.rejects(harness().service.getOccurrence(id), code('INVALID_INPUT'))
  }
  for (const body of [null, [], { revision: 5 }]) {
    await assert.rejects(harness().service.confirmOccurrence('1', body, '1'), code('INVALID_INPUT'))
  }
  const h = harness(); h.repository.findById = async () => null; h.repository.findByIdForUpdate = async () => null
  await assert.rejects(h.service.getOccurrence('9223372036854775807'), code('NOT_FOUND'))
  await assert.rejects(h.service.confirmOccurrence('1', { expectedRevision: 1 }, '1'), code('NOT_FOUND'))
})

test('SVO unit: filtros rejeitam normalização e usam limites civis de Maceio', async () => {
  const h = harness()
  let captured: SvoListFilters | undefined
  h.repository.list = async (filters) => { captured = filters; return [] }
  await h.service.listOccurrences({ from: '2024-02-29', to: '2024-02-29', status: 'PENDING' })
  assert.equal(captured?.from?.toISOString(), '2024-02-29T03:00:00.000Z')
  assert.equal(captured?.until?.toISOString(), '2024-03-01T03:00:00.000Z')
  await h.service.listOccurrences({ to: '9999-12-31' })
  assert.equal(captured?.until?.toISOString(), '+010000-01-01T03:00:00.000Z')
  for (const query of [{ from: '2025-02-29' }, { to: ['2025-01-01'] }, { status: 'UNKNOWN' }, { from: '2025-02-01', to: '2025-01-01' }, { from: {} }]) {
    await assert.rejects(h.service.listOccurrences(query), code('INVALID_INPUT'))
  }
})

test('SVO unit: repositório aguarda commit e libera a conexão também quando o commit falha', async () => {
  const calls: string[] = []
  let allowCommit: () => void = () => {}
  const gate = new Promise<void>((resolve) => { allowCommit = resolve })
  let failCommit = false
  const client = {
    async query(sql: string) {
      calls.push(sql)
      if (sql === 'COMMIT') {
        await gate
        if (failCommit) throw new Error('Commit fictício recusado')
      }
    },
    release() { calls.push('release') },
  } as unknown as PoolClient
  const pool = { async connect() { return client } } as unknown as Pool
  const repository = new SvoOccurrencesRepository(pool)
  let settled = false
  const transaction = repository.withTransaction(async () => 'resultado').then((value) => { settled = true; return value })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['BEGIN', 'COMMIT']); assert.equal(settled, false)
  allowCommit(); assert.equal(await transaction, 'resultado'); assert.equal(calls.at(-1), 'release')
  calls.length = 0; failCommit = true
  await assert.rejects(repository.withTransaction(async () => 'resultado'), /Commit fictício recusado/)
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'ROLLBACK', 'release'])
})
