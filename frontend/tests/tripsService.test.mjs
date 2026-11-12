import test from 'node:test'
import assert from 'node:assert/strict'
import { finishTrip, listMyTrips, startTrip } from '../src/services/tripsService.ts'
import { isOutcomeUncertain, TripRequestError } from '../src/trips/tripTypes.ts'
import { SESSION_EXPIRED } from '../src/auth/token.ts'
import { jsonResponse, makeDriverTrip, makeTrip } from './my-trips.fixture.mjs'

test('GET /trips/mine devolve as viagens validadas', async () => {
  const calls = []
  const api = async (path) => { calls.push(path); return jsonResponse([makeDriverTrip(5), makeDriverTrip(6, { status: 'IN_PROGRESS', startKm: 1500, startedAt: '2026-11-09T12:00:00.000Z' })]) }
  const trips = await listMyTrips(api)
  assert.deepEqual(calls, ['/trips/mine'])
  assert.equal(trips.length, 2)
  assert.equal(trips[1].startKm, 1500)
})

test('GET /trips/mine rejeita corpo que não é lista, status desconhecido e campos ausentes', async () => {
  for (const body of [{ items: [] }, [makeDriverTrip(1, { status: 'FINISHED' })], [makeDriverTrip(1, { scheduledStart: 'ontem' })], [{ id: '1' }], [makeDriverTrip(1, { startKm: -1 })]]) {
    await assert.rejects(listMyTrips(async () => jsonResponse(body)), (error) => error instanceof TripRequestError && error.kind === 'invalidResponse')
  }
  await assert.rejects(listMyTrips(async () => new Response('não é json', { status: 200 })), { kind: 'invalidResponse' })
})

test('POST /trips/:id/start envia somente startKm e confirma id e situação', async () => {
  let request
  const api = async (path, options) => { request = { path, options }; return jsonResponse(makeTrip(5)) }
  const trip = await startTrip(api, '5', 1500)
  assert.equal(request.path, '/trips/5/start')
  assert.equal(request.options.method, 'POST')
  assert.deepEqual(JSON.parse(request.options.body), { startKm: 1500 })
  assert.equal(trip.status, 'IN_PROGRESS')
})

test('POST /trips/:id/finish envia somente endKm e confirma FINISHED', async () => {
  let request
  const finished = makeTrip(5, { status: 'FINISHED', endKm: 1580, finishedAt: '2026-11-10T14:00:00.000Z' })
  const api = async (path, options) => { request = { path, options }; return jsonResponse(finished) }
  const trip = await finishTrip(api, '5', 1580)
  assert.equal(request.path, '/trips/5/finish')
  assert.deepEqual(JSON.parse(request.options.body), { endKm: 1580 })
  assert.equal(trip.endKm, 1580)
})

test('resposta com id ou situação divergente nunca vira sucesso', async () => {
  await assert.rejects(startTrip(async () => jsonResponse(makeTrip(9)), '5', 1500), { kind: 'invalidResponse' })
  await assert.rejects(startTrip(async () => jsonResponse(makeTrip(5, { status: 'SCHEDULED' })), '5', 1500), { kind: 'invalidResponse' })
  await assert.rejects(finishTrip(async () => jsonResponse(makeTrip(5)), '5', 1580), { kind: 'invalidResponse' })
  await assert.rejects(finishTrip(async () => jsonResponse(makeTrip(5, { status: 'FINISHED', endKm: null, finishedAt: null })), '5', 1580), { kind: 'invalidResponse' })
  await assert.rejects(startTrip(async () => new Response('{', { status: 200 }), '5', 1500), { kind: 'invalidResponse' })
})

test('mapeia 400/401/403/404/409/422/500 preservando o texto da API quando seguro', async () => {
  const cases = [
    [400, 'validation', 'Km malformado.'], [403, 'forbidden', 'Outro motorista.'], [404, 'notFound', 'Viagem não encontrada.'],
    [409, 'conflict', 'Somente viagens agendadas podem ser iniciadas.'], [422, 'validation', 'A quilometragem inicial (10 km) é menor que a última registrada.'],
  ]
  for (const [status, kind, erro] of cases) {
    await assert.rejects(startTrip(async () => jsonResponse({ erro }, status), '5', 10), (error) => error.kind === kind && error.message === erro && error.status === status)
  }
  await assert.rejects(startTrip(async () => jsonResponse({ erro: 'select * from trip.trips falhou' }, 500), '5', 10),
    (error) => error.kind === 'server' && !error.message.includes('select'))
  await assert.rejects(startTrip(async () => jsonResponse({}, 418), '5', 10), { kind: 'rejected' })
})

test('sessão expirada, timeout e rede viram erros tipados distintos', async () => {
  await assert.rejects(listMyTrips(async () => { throw new Error(SESSION_EXPIRED) }), { kind: 'session' })
  await assert.rejects(startTrip(async () => { throw new Error('Serviço temporariamente indisponível') }, '5', 10), { kind: 'network' })
})

test('só rede, 5xx e resposta inválida contam como resultado incerto', async () => {
  assert.equal(isOutcomeUncertain(new TripRequestError('network', 'x')), true)
  assert.equal(isOutcomeUncertain(new TripRequestError('server', 'x')), true)
  assert.equal(isOutcomeUncertain(new TripRequestError('invalidResponse', 'x')), true)
  for (const kind of ['validation', 'conflict', 'forbidden', 'notFound', 'rejected', 'session']) {
    assert.equal(isOutcomeUncertain(new TripRequestError(kind, 'x')), false)
  }
  assert.equal(isOutcomeUncertain(new Error('x')), false)
})
