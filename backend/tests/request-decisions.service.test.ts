import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type {
  CreateRequestEventInput,
  DecidableRequest,
  RequestDecision,
  RequestDecisionActor,
} from '../src/types/request-decision.types'
import { RequestDecisionError } from '../src/types/request-decision.types'
import type { RequestDecisionsRepositoryContract } from '../src/repositories/request-decisions.repository'
import { RequestDecisionsService } from '../src/services/request-decisions.service'

const fakeClient = {} as PoolClient
const manager: RequestDecisionActor = { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' }
const DECIDED_AT = new Date('2026-11-09T12:00:00Z')

function createRequest(overrides: Partial<DecidableRequest> = {}): DecidableRequest {
  return {
    id: '41',
    requesterId: '3',
    serviceId: '2',
    requestedDate: '2026-11-20',
    requestedTime: '08:30',
    origin: 'Sede fictícia',
    destination: 'Unidade fictícia',
    purpose: 'Reunião de teste',
    passengers: 2,
    status: 'PENDING',
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    revision: 1,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  }
}

function setup(initial: DecidableRequest | null = createRequest()) {
  let stored = initial
  const events: CreateRequestEventInput[] = []
  const audits: CreateAuditInput[] = []
  const repository: RequestDecisionsRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return work(fakeClient) },
    async findByIdForUpdate(id: string): Promise<DecidableRequest | null> { return stored?.id === id ? stored : null },
    async saveDecision(id: string, decision: RequestDecision, deciderId: string, reason: string | null): Promise<DecidableRequest | null> {
      if (!stored || stored.id !== id || stored.status !== 'PENDING') return null
      stored = { ...stored, status: decision, decidedBy: deciderId, decidedAt: DECIDED_AT, decisionReason: reason, revision: stored.revision + 1 }
      return stored
    },
    async findActorSnapshot(): Promise<RequestDecisionActor> { return manager },
    async createEvent(input: CreateRequestEventInput): Promise<void> { events.push(input) },
  }
  const auditService: AuditLogger = {
    async recordAudit(input): Promise<AuditEntry> {
      audits.push(input)
      return {
        id: String(audits.length), userId: String(input.userId), table: input.table, recordId: String(input.recordId),
        operation: input.operation, before: input.before ?? null, after: input.after ?? null,
        actorSnapshot: input.actorSnapshot ?? null, reason: input.reason ?? null, registeredAt: DECIDED_AT,
      }
    },
  }
  return { service: new RequestDecisionsService(repository, auditService), events, audits }
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof RequestDecisionError && error.statusCode === statusCode
}

test('aprovação sem motivo registra o Gestor, a data e o motivo padrão no histórico', async () => {
  const context = setup()
  const result = await context.service.approve('41', {}, manager.id)

  assert.deepEqual(result, {
    id: '41', status: 'APPROVED', decidedBy: '8', decidedAt: DECIDED_AT, decisionReason: null, revision: 2,
  })
  assert.equal(context.events.length, 1)
  assert.equal(context.events[0]?.eventType, 'APPROVED')
  assert.equal(context.events[0]?.reason, 'Solicitação aprovada')
  assert.equal(context.events[0]?.beforeState.status, 'PENDING')
  assert.equal(context.audits[0]?.table, 'trip.requests')
  assert.equal(context.audits[0]?.operation, 'STATUS_CHANGE')
})

test('aprovação com motivo grava o motivo informado', async () => {
  const context = setup()
  const result = await context.service.approve('41', { reason: '  Prioridade da diretoria ' }, manager.id)
  assert.equal(result.decisionReason, 'Prioridade da diretoria')
  assert.equal(context.events[0]?.reason, 'Prioridade da diretoria')
})

test('rejeição exige justificativa (400) e grava REJECTED com o motivo', async () => {
  const context = setup()
  await assert.rejects(context.service.reject('41', {}, manager.id), domainError(400))
  await assert.rejects(context.service.reject('41', { reason: '   ' }, manager.id), domainError(400))
  assert.equal(context.events.length, 0)

  const result = await context.service.reject('41', { reason: 'Sem veículo para a data' }, manager.id)
  assert.equal(result.status, 'REJECTED')
  assert.equal(result.decisionReason, 'Sem veículo para a data')
  assert.equal(context.events[0]?.eventType, 'REJECTED')
})

test('solicitação já analisada retorna 409 e não gera novo histórico', async () => {
  const context = setup()
  await context.service.approve('41', {}, manager.id)
  await assert.rejects(context.service.approve('41', {}, manager.id), domainError(409))
  await assert.rejects(context.service.reject('41', { reason: 'x' }, manager.id), domainError(409))
  assert.equal(context.events.length, 1)
  assert.equal(context.audits.length, 1)

  const scheduled = setup(createRequest({ status: 'SCHEDULED' }))
  await assert.rejects(scheduled.service.approve('41', {}, manager.id), domainError(409))
})

test('id inválido retorna 400, inexistente 404 e motivo não textual 400', async () => {
  const context = setup()
  await assert.rejects(context.service.approve('abc', {}, manager.id), domainError(400))
  await assert.rejects(context.service.approve('99', {}, manager.id), domainError(404))
  await assert.rejects(context.service.approve('41', { reason: 5 as unknown as string }, manager.id), domainError(400))
})
