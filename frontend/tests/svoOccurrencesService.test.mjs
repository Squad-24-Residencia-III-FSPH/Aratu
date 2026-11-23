import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmSvoOccurrence,
  createSvoOccurrence,
  getSvoOccurrence,
  listSvoOccurrences,
} from '../src/services/svoOccurrencesService.ts'
import { SvoOccurrenceRequestError } from '../src/svo/svoOccurrenceTypes.ts'
import { jsonResponse } from './svo-orders.fixture.mjs'

const summary = (overrides = {}) => ({
  id: '41', requesterType: 'HOSPITAL', location: 'Unidade de saúde QA', status: 'PENDING',
  receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1,
  ...overrides,
})

const detail = (overrides = {}) => ({
  ...summary(), requesterName: 'Solicitante fictício QA', requesterPhone: '71999990000',
  description: 'Solicitação sintética de teste', notes: null, attendantId: '7',
  triagedAt: null, triagedBy: null, updatedAt: '2026-11-18T12:10:00.000Z',
  evidenceDescription: 'Telefone', ...overrides,
})

test('lista usa somente os filtros de situação e período definidos na API', async () => {
  let requestedPath
  const rows = await listSvoOccurrences(async (path) => { requestedPath = path; return jsonResponse([summary()]) }, {
    status: 'PENDING', from: '2026-11-18', to: '2026-11-19',
  })
  assert.equal(requestedPath, '/svo/occurrences?status=PENDING&from=2026-11-18&to=2026-11-19')
  assert.equal(rows[0].id, '41')
  assert.deepEqual(await listSvoOccurrences(async () => jsonResponse([]), { status: '', from: '', to: '' }), [])
})

test('detalhe valida o contrato e não aceita identificador divergente', async () => {
  assert.equal((await getSvoOccurrence(async () => jsonResponse(detail()), '41')).requesterName, 'Solicitante fictício QA')
  await assert.rejects(getSvoOccurrence(async () => jsonResponse(detail({ id: '42' })), '41'), { kind: 'invalidResponse' })
  await assert.rejects(getSvoOccurrence(async () => jsonResponse({ erro: 'Não encontrada.' }, 404)), {
    kind: 'notFound', message: 'Não encontrada.',
  })
})

test('criação envia apenas o DTO real, normaliza texto opcional e valida a resposta', async () => {
  let call
  const created = await createSvoOccurrence(async (path, init) => {
    call = { path, init }
    return jsonResponse({ id: '41', status: 'PENDING', receivedAt: '2026-11-18T12:10:00.000Z', createdAt: '2026-11-18T12:10:00.000Z', revision: 1 }, 201)
  }, {
    requesterName: '  Solicitante QA  ', requesterPhone: ' 71999990000 ', requesterType: 'HOSPITAL',
    location: ' Unidade QA ', description: ' Pedido sintético ', evidenceDescription: ' Telefone ',
    notes: '   ',
  })
  assert.equal(call.path, '/svo/occurrences')
  assert.equal(call.init.method, 'POST')
  assert.deepEqual(JSON.parse(call.init.body), {
    requesterName: 'Solicitante QA', requesterPhone: '71999990000', requesterType: 'HOSPITAL',
    location: 'Unidade QA', description: 'Pedido sintético', evidenceDescription: 'Telefone', notes: null,
  })
  assert.equal(created.status, 'PENDING')
  await assert.rejects(createSvoOccurrence(async () => jsonResponse({ id: '41', status: 'CONFIRMED' }, 201), {
    requesterName: 'QA', requesterPhone: 'QA', requesterType: 'OTHER', location: 'QA',
    description: 'QA', evidenceDescription: 'QA', notes: null,
  }), { kind: 'invalidResponse' })
})

test('confirmação envia corpo vazio e exige transição e revisão devolvidas pela API', async () => {
  let call
  const result = await confirmSvoOccurrence(async (path, init) => {
    call = { path, init }
    return jsonResponse({ id: '41', status: 'CONFIRMED', triagedAt: '2026-11-18T12:20:00.000Z', triagedBy: '7', revision: 2 })
  }, detail())
  assert.equal(call.path, '/svo/occurrences/41/confirm')
  assert.equal(call.init.method, 'POST')
  assert.deepEqual(JSON.parse(call.init.body), {})
  assert.equal(result.status, 'CONFIRMED')
  await assert.rejects(confirmSvoOccurrence(async () => jsonResponse({
    id: '41', status: 'CONFIRMED', triagedAt: '2026-11-18T12:20:00.000Z', triagedBy: '7', revision: 1,
  }), detail()), { kind: 'invalidResponse' })
})

test('preserva mensagem de erro da API inclusive em falha 500', async () => {
  for (const status of [400, 403, 409, 500]) {
    await assert.rejects(listSvoOccurrences(async () => jsonResponse({ erro: 'Mensagem pública da API.' }, status), {
      status: '', from: '', to: '',
    }), (error) => error instanceof SvoOccurrenceRequestError && error.message === 'Mensagem pública da API.')
  }
})

test('identifica status e rota quando a resposta HTTP não contém { erro }', async () => {
  await assert.rejects(listSvoOccurrences(async () => new Response('Cannot GET /svo/occurrences', { status: 404 }), {
    status: '', from: '', to: '',
  }), { kind: 'notFound', message: 'A API respondeu HTTP 404 para /svo/occurrences.' })
})
