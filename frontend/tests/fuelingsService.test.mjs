import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFuelingsQuery, createFueling, FuelingCreateError, getFuelingDetail, listFuelings, rectifyFueling, FuelingRectifyError } from '../src/services/fuelingsService.ts'

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

test('POST /fuelings reusa a chave da intenção e envia campos de auditoria', async () => {
  let request
  const api = async (path, options) => {
    request = { path, options }
    return new Response(JSON.stringify(fueling), { status: 201 })
  }
  const key = '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11'
  const result = await createFueling(api, {
    vehicleId: '12', fueledAt: fueling.fueledAt, fuelType: 'DIESEL_S10', liters: '40.500',
    totalValue: '250.00', odometerKm: 51200, reportedBy: 'Gestor QA', reason: 'Registro fictício',
    evidenceDescription: 'Comprovante fictício QA',
  }, key)
  assert.equal(request.path, '/fuelings')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.headers['Idempotency-Key'], key)
  assert.equal(JSON.parse(request.options.body).reportedBy, 'Gestor QA')
  assert.equal(result.id, '91')
})

test('falhas sem confirmação preservam a intenção como resultado incerto', async () => {
  const input = {
    vehicleId: '12', fueledAt: fueling.fueledAt, fuelType: 'DIESEL_S10', liters: '40.500',
    totalValue: '250.00', odometerKm: 51200, reportedBy: 'Gestor QA', reason: 'Registro fictício',
    evidenceDescription: 'Comprovante fictício QA',
  }
  const key = '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11'
  const sentKeys = []
  const api = async (_path, options) => {
    sentKeys.push(options.headers['Idempotency-Key'])
    return new Response(JSON.stringify(fueling), { status: 201 })
  }

  await createFueling(api, input, key)
  await createFueling(api, input, key)
  assert.deepEqual(sentKeys, [key, key])

  await assert.rejects(createFueling(async () => { throw new Error('Conexão interrompida') }, input, key), (error) => {
    assert.ok(error instanceof FuelingCreateError)
    assert.equal(error.outcomeUncertain, true)
    return true
  })
})

test('erro 4xx encerra a tentativa, mas erro 5xx mantém o mesmo resultado incerto', async () => {
  const input = {
    vehicleId: '12', fueledAt: fueling.fueledAt, fuelType: 'DIESEL_S10', liters: '40.500',
    totalValue: '250.00', odometerKm: 51200, reportedBy: 'Gestor QA', reason: 'Registro fictício',
    evidenceDescription: 'Comprovante fictício QA',
  }
  const key = '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11'

  await assert.rejects(createFueling(async () => new Response(JSON.stringify({ erro: 'Dados inválidos.' }), { status: 422 }), input, key), (error) => {
    assert.ok(error instanceof FuelingCreateError)
    assert.equal(error.outcomeUncertain, false)
    return true
  })
  await assert.rejects(createFueling(async () => new Response(JSON.stringify({ erro: 'Erro interno.' }), { status: 500 }), input, key), (error) => {
    assert.ok(error instanceof FuelingCreateError)
    assert.equal(error.outcomeUncertain, true)
    return true
  })
})

test('consulta histórico e versões e retifica com revisão e chave estável', async () => {
  const event = { id: '501', fuelingId: '91', eventType: 'RECORDED', occurredAt: fueling.fueledAt,
    registeredAt: fueling.fueledAt, reportedBy: 'Gestor QA', registeredBy: '1',
    actorSnapshot: { id: '1', name: 'Gestor QA', role: 'GESTOR' }, reason: 'Registro fictício',
    evidenceDescription: 'Comprovante fictício', attachmentUrl: null, supersedesId: null,
    isAnnulled: false, beforeState: null, afterState: fueling }
  const detail = await getFuelingDetail(async () => new Response(JSON.stringify({ fueling, currentId: '91', versions: [fueling], events: [event] })), '91')
  assert.equal(detail.currentId, '91')
  assert.equal(detail.versions.length, 1)
  assert.equal(detail.events[0].reason, 'Registro fictício')

  let request
  const key = '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11'
  await rectifyFueling(async (path, options) => { request = { path, options }; return new Response(JSON.stringify(fueling)) }, '91', {
    expectedRevision: 2, fueledAt: fueling.fueledAt, liters: '41.000', reportedBy: 'Gestor QA',
    reason: 'Correção fictícia', evidenceDescription: 'Nota fictícia',
  }, key)
  assert.equal(request.path, '/fuelings/91')
  assert.equal(request.options.method, 'PUT')
  assert.equal(request.options.headers['Idempotency-Key'], key)
  assert.equal(JSON.parse(request.options.body).expectedRevision, 2)
  await assert.rejects(rectifyFueling(async () => { throw new Error('Conexão interrompida') }, '91', {
    expectedRevision: 2, reportedBy: 'Gestor QA', reason: 'Retry fictício',
  }, key), (error) => error instanceof FuelingRectifyError && error.outcomeUncertain)
})
