import test from 'node:test'
import assert from 'node:assert/strict'
import { createTripRequest, listActiveServices } from '../src/services/requestsService.ts'
import { TripRequestApiError } from '../src/requests/requestTypes.ts'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('listActiveServices retorna apenas tipos de serviço com active = true', async () => {
  const seenPaths = []
  const api = async (path) => {
    seenPaths.push(path)
    return jsonResponse([
      { id: '1', name: 'Transporte Administrativo', description: 'Unidades FSPH', active: true },
      { id: '2', name: 'Serviço Descontinuado', description: null, active: false },
      { id: '3', name: 'Transporte de Insumos', description: 'Lacen / Hemose', active: true },
    ])
  }

  const services = await listActiveServices(api)
  assert.deepEqual(seenPaths, ['/services'])
  assert.deepEqual(services, [
    { id: '1', name: 'Transporte Administrativo', description: 'Unidades FSPH', active: true },
    { id: '3', name: 'Transporte de Insumos', description: 'Lacen / Hemose', active: true },
  ])
})

test('listActiveServices propaga mensagem da API ou SERVICE_UNAVAILABLE em falha de rede', async () => {
  await assert.rejects(
    () => listActiveServices(async () => jsonResponse({ erro: 'Acesso negado ao catálogo.' }, 403)),
    (error) =>
      error instanceof TripRequestApiError
      && error.kind === 'forbidden'
      && error.message === 'Acesso negado ao catálogo.',
  )

  await assert.rejects(
    () =>
      listActiveServices(async () => {
        throw new Error('Serviço temporariamente indisponível')
      }),
    (error) =>
      error instanceof TripRequestApiError
      && error.kind === 'unavailable'
      && error.message === 'Serviço temporariamente indisponível',
  )
})

test('createTripRequest envia POST /requests com JSON normalizado e retorna { id, status: PENDING } em 201', async () => {
  const calls = []
  const api = async (path, init = {}) => {
    calls.push({ path, init })
    return jsonResponse({ id: '104', status: 'PENDING' }, 201)
  }

  const created = await createTripRequest(api, {
    requestedDate: ' 2027-04-18 ',
    requestedTime: ' 14:30 ',
    origin: ' FSPH — Unidade Central ',
    destination: ' Hemose — Bloco A ',
    purpose: ' Transporte de amostras laboratoriais ',
    serviceId: ' 1 ',
  })

  assert.deepEqual(created, { id: '104', status: 'PENDING' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/requests')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    requestedDate: '2027-04-18',
    requestedTime: '14:30',
    origin: 'FSPH — Unidade Central',
    destination: 'Hemose — Bloco A',
    purpose: 'Transporte de amostras laboratoriais',
    serviceId: '1',
  })
})

test('createTripRequest propaga mensagem do campo erro em 400 e 422 e falha de rede como Serviço temporariamente indisponível', async () => {
  const validInput = {
    requestedDate: '2027-04-18',
    requestedTime: '14:30',
    origin: 'FSPH — Unidade Central',
    destination: 'Hemose — Bloco A',
    purpose: 'Transporte de amostras laboratoriais',
    serviceId: '1',
  }

  await assert.rejects(
    () =>
      createTripRequest(
        async () =>
          jsonResponse(
            { erro: 'A data e o horário da viagem não podem estar no passado.' },
            422,
          ),
        validInput,
      ),
    (error) =>
      error instanceof TripRequestApiError
      && error.kind === 'validation'
      && error.statusCode === 422
      && error.message === 'A data e o horário da viagem não podem estar no passado.',
  )

  await assert.rejects(
    () =>
      createTripRequest(
        async () => jsonResponse({ erro: 'Tipo de serviço inexistente ou inativo.' }, 400),
        validInput,
      ),
    (error) =>
      error instanceof TripRequestApiError
      && error.kind === 'validation'
      && error.statusCode === 400
      && error.message === 'Tipo de serviço inexistente ou inativo.',
  )

  await assert.rejects(
    () =>
      createTripRequest(async () => {
        throw new Error('Serviço temporariamente indisponível')
      }, validInput),
    (error) =>
      error instanceof TripRequestApiError
      && error.kind === 'unavailable'
      && error.message === 'Serviço temporariamente indisponível',
  )
})

test('createTripRequest rejeita resposta 201 com contrato inválido sem assumir sucesso', async () => {
  await assert.rejects(
    () =>
      createTripRequest(
        async () => jsonResponse({ id: '', status: 'APPROVED' }, 201),
        {
          requestedDate: '2027-04-18',
          requestedTime: '14:30',
          origin: 'FSPH — Unidade Central',
          destination: 'Hemose — Bloco A',
          purpose: 'Transporte de amostras laboratoriais',
          serviceId: '1',
        },
      ),
    (error) => error instanceof TripRequestApiError && error.kind === 'invalidResponse',
  )
})
