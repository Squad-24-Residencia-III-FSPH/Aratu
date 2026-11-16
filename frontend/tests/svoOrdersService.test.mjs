import test from 'node:test'
import assert from 'node:assert/strict'
import { listSvoOrders, getSvoOrder, updateSvoOrderStatus, recordSvoOrderResult } from '../src/services/svoOrdersService.ts'
import { SESSION_EXPIRED } from '../src/auth/token.ts'
import { makeOrder, makeDetail, jsonResponse } from './svo-orders.fixture.mjs'

test('consulta filtra no backend e detalhe valida ID e snapshots ausentes', async () => {
  const calls = []
  assert.equal((await listSvoOrders(async (path) => { calls.push(path); return jsonResponse([makeOrder()]) }, 'OPEN')).length, 1)
  assert.deepEqual(calls, ['/svo/orders?status=OPEN'])
  assert.equal((await getSvoOrder(async () => jsonResponse(makeDetail()), '1')).occurrenceSnapshot, null)
  await assert.rejects(getSvoOrder(async () => jsonResponse(makeDetail({ id: '9' })), '1'), { kind: 'invalidResponse' })
})

test('PATCH envia destino/revisão sem seletores de equipe e confirma etapa exata', async () => {
  let sent
  const result = makeOrder({ status: 'IN_TRANSIT', revision: 2, departedAt: '2026-11-15T12:10:00.000Z', allowedTransitions: ['IN_SERVICE'] })
  assert.equal((await updateSvoOrderStatus(async (path, init) => { sent = { path, init }; return jsonResponse(result) }, makeOrder(), 'IN_TRANSIT')).status, 'IN_TRANSIT')
  assert.equal(sent.path, '/svo/orders/1/status'); assert.equal(sent.init.method, 'PATCH')
  assert.deepEqual(JSON.parse(sent.init.body), { status: 'IN_TRANSIT', revision: 1 })
  for (const change of [{ status: 'OPEN' }, { revision: 1 }, { id: '9' }, { teamId: '9' }, { departedAt: null }]) {
    await assert.rejects(updateSvoOrderStatus(async () => jsonResponse({ ...result, ...change }), makeOrder(), 'IN_TRANSIT'), { kind: 'invalidResponse' })
  }
})

test('rejeita lista inválida, carimbos sem fuso, revisão inválida e ações desconhecidas', async () => {
  for (const body of [{ items: [] }, [makeOrder({ id: '01' })], [makeOrder({ id: '9223372036854775808' })],
    [makeOrder({ revision: -1 })], [makeOrder({ departedAt: '2026-11-15 12:00:00' })],
    [makeOrder({ status: 'BAD' })], [makeOrder({ allowedTransitions: ['COMPLETED'] })], [makeOrder({ current: null })]]) {
    await assert.rejects(listSvoOrders(async () => jsonResponse(body), ''), { kind: 'invalidResponse' })
  }
  await assert.rejects(listSvoOrders(async () => new Response('não é JSON'), ''), { kind: 'invalidResponse' })
  for (const overrides of [{ occurrenceSnapshot: {} }, { teamSnapshot: undefined }, { vehicleSnapshot: { id: '1' } }]) {
    await assert.rejects(getSvoOrder(async () => jsonResponse(makeDetail(overrides)), '1'), { kind: 'invalidResponse' })
  }
})

test('erros tipados distinguem rejeição de resultado incerto sem expor erro interno', async () => {
  for (const [status, kind] of [[400, 'validation'], [401, 'session'], [403, 'forbidden'], [404, 'notFound'], [409, 'conflict'], [500, 'server']]) {
    await assert.rejects(listSvoOrders(async () => jsonResponse({ erro: 'Mensagem sintética' }, status), ''), { kind })
  }
  await assert.rejects(listSvoOrders(async () => { throw new Error('Falha de rede') }, ''), { kind: 'network' })
  await assert.rejects(listSvoOrders(async () => { throw new Error(SESSION_EXPIRED) }, ''), { kind: 'session' })
  await assert.rejects(listSvoOrders(async () => jsonResponse({ erro: 'SQL SENTINELA' }, 500), ''), (error) => !/SQL SENTINELA/.test(error.message))
})

test('recordSvoOrderResult envia payload normalizado e valida coerência de coleta, fechamento e autoria', async () => {
  let sent
  const base = makeOrder({ status: 'IN_SERVICE', revision: 3, allowedTransitions: [], allowedResults: ['COMPLETED', 'NOT_PERFORMED'] })
  const closedTime = '2026-11-15T12:30:00.000Z'
  const completedDetail = makeDetail({
    ...base, status: 'COMPLETED', result: 'COMPLETED', revision: 4,
    collectedAt: closedTime, closedAt: closedTime, closedBy: '7', notes: 'Observação sintética',
    allowedTransitions: [], allowedResults: [],
  })
  const completed = await recordSvoOrderResult(async (path, init) => { sent = { path, init }; return jsonResponse(completedDetail) }, base, {
    result: 'COMPLETED', failureReason: '   ', notes: '  Observação sintética  ',
  })
  assert.equal(completed.result, 'COMPLETED')
  assert.equal(sent.path, '/svo/orders/1/result'); assert.equal(sent.init.method, 'POST')
  assert.deepEqual(JSON.parse(sent.init.body), { result: 'COMPLETED', revision: 3, failureReason: null, notes: 'Observação sintética' })
  for (const invalidChange of [
    { collectedAt: null }, { collectedAt: '2026-11-15T12:29:00.000Z' }, { closedAt: null },
    { closedBy: null }, { failureReason: 'Contraditório' }, { revision: 3 }, { allowedResults: ['COMPLETED'] },
  ]) {
    await assert.rejects(recordSvoOrderResult(async () => jsonResponse({ ...completedDetail, ...invalidChange }), base, {
      result: 'COMPLETED', failureReason: null, notes: null,
    }), { kind: 'invalidResponse' })
  }
  const notPerformedDetail = makeDetail({
    ...base, status: 'NOT_PERFORMED', result: 'NOT_PERFORMED', revision: 4,
    collectedAt: null, closedAt: closedTime, closedBy: '7', failureReason: 'Local inacessível QA',
    allowedTransitions: [], allowedResults: [],
  })
  const notPerformed = await recordSvoOrderResult(async () => jsonResponse(notPerformedDetail), base, {
    result: 'NOT_PERFORMED', failureReason: ' Local inacessível QA ', notes: ' ',
  })
  assert.equal(notPerformed.result, 'NOT_PERFORMED')
  for (const invalidChange of [{ collectedAt: closedTime }, { failureReason: null }, { failureReason: '   ' }]) {
    await assert.rejects(recordSvoOrderResult(async () => jsonResponse({ ...notPerformedDetail, ...invalidChange }), base, {
      result: 'NOT_PERFORMED', failureReason: 'Local inacessível QA', notes: null,
    }), { kind: 'invalidResponse' })
  }
})
