import test from 'node:test'
import assert from 'node:assert/strict'
import { SVO_ORDER_LABELS, SVO_ACTION_LABELS, orderConfirmation, formatDateTime } from '../src/svo/svoOrderPresentation.ts'
import { SVO_ORDER_STATUSES } from '../src/svo/svoOrderTypes.ts'

test('todos os estados têm rótulo e o legado permanece identificado', () => {
  assert.deepEqual(Object.keys(SVO_ORDER_LABELS), [...SVO_ORDER_STATUSES])
  assert.match(SVO_ORDER_LABELS.IN_PROGRESS, /legado/)
  assert.equal(SVO_ACTION_LABELS.IN_TRANSIT, 'Confirmar saída')
  assert.match(orderConfirmation('19', 'IN_SERVICE'), /chegada.*#19/)
  assert.match(formatDateTime('2026-11-15T12:00:00Z'), /09:00/)
})
