import test from 'node:test'
import assert from 'node:assert/strict'
import { listTripAgenda } from '../src/services/tripAgendaService.ts'

const statuses = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED', 'CANCELED']

function trip(status) {
  return {
    id: '42', requestId: '84', status,
    scheduledStart: '2026-11-24T12:00:00.000Z', scheduledEnd: '2026-11-24T13:00:00.000Z',
    startedAt: status === 'IN_PROGRESS' || status === 'FINISHED' || status === 'CONFIRMED' ? '2026-11-24T12:01:00.000Z' : null,
    finishedAt: status === 'FINISHED' || status === 'CONFIRMED' ? '2026-11-24T12:55:00.000Z' : null,
    vehicleLicensePlate: 'ABC1D23', driverName: 'Motorista de teste', origin: 'Origem', destination: 'Destino',
  }
}

test('agenda interpreta todos os estados aceitos pela API', async () => {
  const api = async () => new Response(JSON.stringify(statuses.map(trip)), { status: 200 })
  const items = await listTripAgenda(api)
  assert.deepEqual(items.map((item) => item.status), statuses)
})

test('agenda envia o intervalo civil e a situação escolhida como filtros', async () => {
  let requestedPath = ''
  const api = async (path) => {
    requestedPath = path
    return new Response(JSON.stringify([trip('SCHEDULED')]), { status: 200 })
  }
  await listTripAgenda(api, { from: '2026-11-24', to: '2026-11-25', status: 'SCHEDULED' })
  assert.equal(requestedPath, '/trips?from=2026-11-24&to=2026-11-25&status=SCHEDULED')
})

test('agenda não aceita uma resposta com situação desconhecida', async () => {
  const api = async () => new Response(JSON.stringify([trip('UNKNOWN')]), { status: 200 })
  await assert.rejects(listTripAgenda(api), /dados inválidos/)
})
