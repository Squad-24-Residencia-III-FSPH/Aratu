import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AuditLogFilters, StoredAuditLog } from '../src/types/audit-log.types'
import { AuditLogsError } from '../src/types/audit-log.types'
import type { AuditLogsRepositoryContract } from '../src/repositories/audit-logs.repository'
import { AuditLogsService, maskAuditPayload } from '../src/services/audit-logs.service'

function log(overrides: Partial<StoredAuditLog> = {}): StoredAuditLog {
  return {
    id: '1', registeredAt: new Date('2026-11-18T12:00:00Z'), userId: '8', actorName: 'Gestora Fictícia',
    operation: 'UPDATE', table: 'fleet.drivers', recordId: '31', reason: 'Ajuste',
    before: { cpf: '12345678909', cnhNumber: '00000000001', name: 'Motorista Fictício' },
    after: { cpf: '123.456.789-09', nested: { password: 'x', token: 'y', items: [{ cnh_number: '987654', apiSecret: 'z' }] } },
    actorSnapshot: { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR', passwordHash: 'h' },
    ...overrides,
  }
}

function setup(rows: StoredAuditLog[] = [log()], total = 1) {
  const received: AuditLogFilters[] = []
  const repository: AuditLogsRepositoryContract = {
    async list(filters) { received.push(filters); return rows },
    async count() { return total },
  }
  return { service: new AuditLogsService(repository), received }
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof AuditLogsError && error.statusCode === statusCode
}

test('máscara: CPF e CNH só com os 2 últimos dígitos; senhas, hashes, tokens e segredos removidos em qualquer nível', () => {
  assert.deepEqual(maskAuditPayload(log().before), { cpf: '***.***.***-09', cnhNumber: '*********01', name: 'Motorista Fictício' })
  assert.deepEqual(maskAuditPayload(log().after), { cpf: '***.***.***-09', nested: { items: [{ cnh_number: '****54' }] } })
  assert.deepEqual(maskAuditPayload(log().actorSnapshot), { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' })
  assert.equal(maskAuditPayload(null), null)
  assert.deepEqual(maskAuditPayload({ cpf: null }), { cpf: null })
})

test('registros do SVO ocultam before, after e reason na projeção, preservando eventos não-SVO', async () => {
  const { service } = setup([
    log({
      table: 'svo.occurrences',
      reason: 'Narrativa livre fictícia do atendimento SVO',
      before: null,
      after: { requesterName: 'Familiar Fictício', location: 'Local' },
    }),
    log({
      id: '2',
      table: 'svo.execution_orders',
      reason: 'Justificativa livre fictícia de não realização',
      before: { status: 'IN_TRANSIT' },
      after: { status: 'NOT_PERFORMED' },
    }),
    log({
      id: '3',
      table: 'fleet.drivers',
      reason: 'Correção cadastral não sensível',
    }),
  ])
  const page = await service.listLogs({})
  assert.equal(page.logs[0]?.before, null)
  assert.equal(page.logs[0]?.after, null)
  assert.equal(page.logs[0]?.reason, null)
  assert.equal(page.logs[0]?.sensitiveDataHidden, true)
  assert.equal(page.logs[0]?.operation, 'UPDATE')

  assert.equal(page.logs[1]?.before, null)
  assert.equal(page.logs[1]?.after, null)
  assert.equal(page.logs[1]?.reason, null)
  assert.equal(page.logs[1]?.sensitiveDataHidden, true)

  assert.equal(page.logs[2]?.reason, 'Correção cadastral não sensível')
  assert.equal(page.logs[2]?.sensitiveDataHidden, false)
})

test('paginação padrão 20 e cálculo de página e total de páginas', async () => {
  const context = setup([log()], 45)
  const first = await context.service.listLogs({})
  assert.deepEqual([first.page, first.pageSize, first.total, first.totalPages], [1, 20, 45, 3])
  const third = await context.service.listLogs({ page: '3', pageSize: '10' })
  assert.deepEqual([third.page, third.pageSize], [3, 10])
  assert.deepEqual(context.received[1], { from: null, to: null, userId: null, operation: null, table: null, limit: 10, offset: 20 })
})

test('filtros válidos são repassados ao repositório', async () => {
  const context = setup()
  await context.service.listLogs({ from: '2026-11-01', to: '2026-12-01', userId: '8', operation: 'STATUS_CHANGE', table: 'reports.svo-orders' })
  assert.deepEqual(context.received[0], {
    from: '2026-11-01', to: '2026-12-01', userId: '8', operation: 'STATUS_CHANGE', table: 'reports.svo-orders', limit: 20, offset: 0,
  })
})

test('filtros inválidos retornam 400', async () => {
  const { service } = setup()
  for (const query of [
    { from: '01/11/2026' }, { to: '2026-02-30' }, { from: '2026-12-01', to: '2026-11-01' }, { from: '2026-11-01', to: '2026-11-01' },
    { from: '2025-01-01', to: '2026-01-03' }, { userId: 'abc' }, { userId: '0' }, { userId: '-1' }, { userId: '01' },
    { userId: '9223372036854775808' }, { userId: '9999999999999999999' }, { userId: '10000000000000000000' }, { userId: ['1'] },
    { operation: 'drop table' }, { table: 'logs; --' },
    { page: '0' }, { pageSize: '101' }, { page: ['1', '2'] },
  ]) {
    await assert.rejects(service.listLogs(query), domainError(400), JSON.stringify(query))
  }
})

test('userId aceita fronteiras válidas de BIGINT sem perda de precisão acima de MAX_SAFE_INTEGER', async () => {
  const context = setup()
  const validBoundaries = ['1', '9007199254740992', '9223372036854775806', '9223372036854775807']
  for (const [index, userId] of validBoundaries.entries()) {
    await context.service.listLogs({ userId })
    assert.equal(context.received[index]?.userId, userId)
  }
})
