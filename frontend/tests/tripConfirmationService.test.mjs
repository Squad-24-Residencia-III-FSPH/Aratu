import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmTrip, listTripConfirmations } from '../src/services/tripsService.ts'
import { TripRequestError } from '../src/trips/tripTypes.ts'

const item = {
  id: '73', requestId: '2026-0088', status: 'FINISHED',
  scheduledStart: '2026-11-10T11:00:00.000Z', scheduledEnd: '2026-11-10T12:00:00.000Z',
  startedAt: '2026-11-10T11:05:00.000Z', finishedAt: '2026-11-10T11:44:00.000Z',
  startKm: 41152, endKm: 41200, vehicleLicensePlate: 'ABC1D23', driverName: 'Motorista Fictício',
  origin: 'Unidade A', destination: 'Unidade B', confirmedBy: null, confirmedAt: null,
}

test('GET /trips envia status e período no contrato FROTA-106', async () => {
  let requestedPath = ''
  const result = await listTripConfirmations(async (path) => {
    requestedPath = path
    return Response.json([item])
  }, { from: '2026-11-01', to: '2026-11-30' })
  const url = new URL(requestedPath, 'http://aratu.test')
  assert.equal(url.pathname, '/trips')
  assert.equal(url.searchParams.get('status'), 'FINISHED')
  assert.equal(url.searchParams.get('from'), '2026-11-01')
  assert.equal(url.searchParams.get('to'), '2026-11-30')
  assert.deepEqual(result, [item])
})

test('GET /trips valida a resposta e rejeita status/campos que não pertencem à listagem', async () => {
  await assert.rejects(listTripConfirmations(async () => Response.json({ items: [item] })), { kind: 'invalidResponse' })
  await assert.rejects(listTripConfirmations(async () => Response.json([{ ...item, status: 'CONFIRMED' }])), { kind: 'invalidResponse' })
  await assert.rejects(listTripConfirmations(async () => Response.json([{ ...item, startKm: -1 }])), { kind: 'invalidResponse' })
})

test('POST /trips/:id/confirm não inventa payload e valida a transição', async () => {
  let request
  const confirmation = { id: '73', status: 'CONFIRMED', confirmedBy: '5', confirmedAt: '2026-11-10T12:00:00.000Z', revision: 4 }
  const result = await confirmTrip(async (path, options) => {
    request = { path, options }
    return Response.json(confirmation)
  }, '73')
  assert.equal(request.path, '/trips/73/confirm')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.body, undefined)
  assert.deepEqual(result, confirmation)
  await assert.rejects(confirmTrip(async () => Response.json({ ...confirmation, id: '74' }), '73'), { kind: 'invalidResponse' })
})

test('erros de domínio exibem o campo erro retornado pela API', async () => {
  await assert.rejects(confirmTrip(async () => Response.json({ erro: 'Viagem sem evidências do hodômetro não pode ser confirmada.' }, { status: 422 }), '73'),
    (error) => error instanceof TripRequestError && error.kind === 'validation'
      && error.message === 'Viagem sem evidências do hodômetro não pode ser confirmada.' && error.status === 422)
})
