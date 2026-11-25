import test from 'node:test'
import assert from 'node:assert/strict'
import { formatOperationalDateTime, operationalDateTimeInput, operationalDateTimeToIso, operationalDateRange } from '../src/time/operationalTime.ts'

test('interpreta e exibe horários no fuso operacional de Maceió', () => {
  assert.equal(operationalDateTimeToIso('2026-11-24T10:00'), '2026-11-24T13:00:00.000Z')
  assert.equal(operationalDateTimeInput('2026-11-24T13:00:00.000Z'), '2026-11-24T10:00')
  assert.match(formatOperationalDateTime('2026-11-24T13:00:00.000Z'), /10:00/)
})

test('filtros diários usam intervalo semiaberto no fuso de Maceió', () => {
  assert.deepEqual(operationalDateRange('2026-11-24', '2026-11-24'), {
    from: '2026-11-24T03:00:00.000Z', to: '2026-11-25T03:00:00.000Z',
  })
})
