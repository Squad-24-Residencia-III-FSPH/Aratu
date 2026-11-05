import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVehiclesQuery,
  changeVehicleStatus,
  createVehicle,
  listVehicles,
  updateVehicle,
  VehicleRequestError,
} from '../src/services/vehiclesService.ts'

const vehicle = {
  id: '1',
  licensePlate: 'ABC1D23',
  brand: 'Marca Fictícia',
  model: 'Modelo Fictício',
  year: 2024,
  vehicleType: 'Van',
  ownership: 'OWNED',
  categories: ['PASSENGER', 'BODY'],
  seats: 5,
  bodyLimit: 2,
  weightLimit: null,
  operationType: 'SVO',
  status: 'AVAILABLE',
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const attributes = {
  licensePlate: 'ABC1D23',
  brand: 'Marca Fictícia',
  model: 'Modelo Fictício',
  year: 2024,
  vehicleType: 'Van',
  ownership: 'OWNED',
  categories: ['PASSENGER'],
  seats: 5,
  bodyLimit: 2,
  weightLimit: null,
  operationType: 'SVO',
}

test('buildVehiclesQuery omite filtros vazios e serializa os suportados', () => {
  assert.equal(buildVehiclesQuery({}), '')
  assert.equal(
    buildVehiclesQuery({ status: 'IN_MAINTENANCE', category: 'BODY', operationType: 'SVO' }),
    '?status=IN_MAINTENANCE&category=BODY&operationType=SVO',
  )
})

test('listVehicles envia filtros e converte a lista da API', async () => {
  let requested = ''
  const api = async (path) => {
    requested = path
    return Response.json([vehicle])
  }

  const result = await listVehicles(api, { status: 'AVAILABLE', category: 'PASSENGER' })
  assert.equal(requested, '/vehicles?status=AVAILABLE&category=PASSENGER')
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].categories, ['PASSENGER', 'BODY'])
  assert.equal(result[0].revision, 1)
  assert.equal(result[0].status, 'AVAILABLE')
})

test('listVehicles rejeita resposta fora do contrato', async () => {
  await assert.rejects(
    listVehicles(async () => Response.json({ vehicles: [] })),
    /formato inválido/,
  )
  await assert.rejects(
    listVehicles(async () => Response.json([{ ...vehicle, status: 'EM_USO' }])),
    /formato inválido/,
  )
})

test('erros da API são classificados e preservam a mensagem do backend', async () => {
  await assert.rejects(
    listVehicles(async () => Response.json({ erro: 'Acesso negado' }, { status: 403 })),
    (error) => error instanceof VehicleRequestError && error.kind === 'forbidden' && error.message === 'Acesso negado',
  )
  await assert.rejects(
    listVehicles(async () => Response.json({ erro: 'Falha inesperada' }, { status: 500 })),
    (error) => error instanceof VehicleRequestError && error.kind === 'unavailable',
  )
})

test('createVehicle envia os atributos e a auditoria exigidos pela API', async () => {
  let captured
  const api = async (path, options) => {
    captured = { path, options }
    return Response.json(vehicle, { status: 201 })
  }

  const created = await createVehicle(api, {
    ...attributes,
    reportedBy: 'Gestora Fictícia',
    reason: 'Cadastro fictício para teste',
  })

  assert.equal(captured.path, '/vehicles')
  assert.equal(captured.options.method, 'POST')
  assert.deepEqual(JSON.parse(captured.options.body), {
    ...attributes,
    reportedBy: 'Gestora Fictícia',
    reason: 'Cadastro fictício para teste',
  })
  assert.equal(created.licensePlate, 'ABC1D23')
})

test('placa duplicada vira conflict-plate e conflito de revisão vira conflict-revision', async () => {
  await assert.rejects(
    createVehicle(async () => Response.json({ erro: 'Placa já cadastrada' }, { status: 409 }), {
      ...attributes,
      reportedBy: 'Gestora Fictícia',
      reason: 'Cadastro fictício',
    }),
    (error) => error instanceof VehicleRequestError
      && error.kind === 'conflict-plate'
      && error.message === 'Placa já cadastrada',
  )

  await assert.rejects(
    createVehicle(async () => Response.json({ erro: 'O veículo foi alterado por outra operação.' }, { status: 409 }), {
      ...attributes,
      reportedBy: 'Gestora Fictícia',
      reason: 'Cadastro fictício',
    }),
    (error) => error instanceof VehicleRequestError && error.kind === 'conflict-revision',
  )
})

test('updateVehicle usa PUT com expectedRevision e changeVehicleStatus usa PATCH /status', async () => {
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return Response.json({ ...vehicle, revision: 2 })
  }

  await updateVehicle(api, '1', {
    ...attributes,
    reportedBy: 'Gestora Fictícia',
    reason: 'Correção fictícia',
    expectedRevision: 1,
  })
  await changeVehicleStatus(api, '1', {
    status: 'IN_MAINTENANCE',
    expectedRevision: 2,
    reportedBy: 'Gestora Fictícia',
    reason: 'Manutenção preventiva fictícia',
  })

  assert.equal(calls[0].path, '/vehicles/1')
  assert.equal(calls[0].options.method, 'PUT')
  assert.equal(JSON.parse(calls[0].options.body).expectedRevision, 1)
  assert.equal(calls[1].path, '/vehicles/1/status')
  assert.equal(calls[1].options.method, 'PATCH')
  assert.equal(JSON.parse(calls[1].options.body).status, 'IN_MAINTENANCE')
})
