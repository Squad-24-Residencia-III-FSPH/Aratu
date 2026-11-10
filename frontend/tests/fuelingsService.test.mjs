import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFuelingsQuery, createFueling, listFuelings } from '../src/services/fuelingsService.ts'

const fueling = {
  id: '91',
  vehicleId: '12',
  driverId: null,
  fueledAt: '2026-11-04T13:00:00.000Z',
  fuelType: 'DIESEL_S10',
  liters: '40.500',
  totalValue: '250.00',
  odometerKm: 51200,
  station: 'Posto Fictício QA',
  vehicleSnapshot: { licensePlate: 'ABC1D23' },
  driverSnapshot: null,
  isAnnulled: false,
}

test('serializa somente filtros e paginação aceitos pelo GET /fuelings', () => {
  assert.equal(
    buildFuelingsQuery({ vehicleId: '12', driverId: '8', from: '2026-11-01T03:00:00.000Z', to: '2026-11-08T03:00:00.000Z', page: 2, pageSize: 20 }),
    '?vehicleId=12&driverId=8&from=2026-11-01T03%3A00%3A00.000Z&to=2026-11-08T03%3A00%3A00.000Z&page=2&pageSize=20',
  )
})

test('consulta itens e totais do filtro e preserva erro retornado pela API', async () => {
  const calls = []
  const api = async (path) => {
    calls.push(path)
    return new Response(JSON.stringify({ items: [fueling], total: 1, page: 1, pageSize: 20, totalPages: 1, totalLiters: '40.500', totalValue: '250.00' }))
  }
  const result = await listFuelings(api, { vehicleId: '12' })
  assert.equal(calls[0], '/fuelings?vehicleId=12')
  assert.equal(result.items[0].id, '91')
  assert.equal(result.totalLiters, '40.500')
  assert.equal(result.totalValue, '250.00')

  await assert.rejects(
    listFuelings(async () => new Response(JSON.stringify({ erro: 'Revise o período informado.' }), { status: 400 })),
    { message: 'Revise o período informado.' },
  )
})

test('POST /fuelings envia contrato, campos de auditoria e chave de idempotência', async () => {
  let request
  const api = async (path, options) => {
    request = { path, options }
    return new Response(JSON.stringify(fueling), { status: 201 })
  }
  const result = await createFueling(api, {
    vehicleId: '12', fueledAt: fueling.fueledAt, fuelType: 'DIESEL_S10', liters: '40.500',
    totalValue: '250.00', odometerKm: 51200, reportedBy: 'Gestor QA', reason: 'Registro fictício',
    evidenceDescription: 'Comprovante fictício QA',
  })
  assert.equal(request.path, '/fuelings')
  assert.equal(request.options.method, 'POST')
  assert.match(request.options.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/i)
  assert.equal(JSON.parse(request.options.body).reportedBy, 'Gestor QA')
  assert.equal(result.id, '91')
})
