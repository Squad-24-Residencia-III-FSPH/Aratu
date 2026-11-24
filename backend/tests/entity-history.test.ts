import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EntityHistoryQueryError, normalizeEntityHistoryFilters } from '../src/services/entity-history'

test('normaliza filtros de histórico e aplica paginação limitada por padrão', () => {
  assert.deepEqual(normalizeEntityHistoryFilters({}), { page: 1, pageSize: 20 })
  assert.deepEqual(normalizeEntityHistoryFilters({
    page: '3', pageSize: '50', eventType: 'STATUS_CHANGED', from: '2026-01-01', to: '2026-01-31',
  }), { page: 3, pageSize: 50, eventType: 'STATUS_CHANGED', from: '2026-01-01', to: '2026-01-31' })
})

test('rejeita filtros de histórico inválidos sem arredondar ou ampliar o limite', () => {
  for (const input of [
    { page: '0' }, { page: '1.5' }, { pageSize: '101' }, { eventType: 'DELETED' },
    { page: '9007199254740991', pageSize: '100' },
    { from: '2026-02-30' }, { from: '2026-02-02', to: '2026-02-01' },
  ]) {
    assert.throws(() => normalizeEntityHistoryFilters(input), EntityHistoryQueryError)
  }
})
