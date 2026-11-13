// Somente dados 100% fictícios (LGPD/SVO): unidades, serviços e finalidades inventados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { listApprovedRequests } from '../src/services/schedulingService.ts'
import { TripRequestError } from '../src/trips/tripTypes.ts'
import { jsonResponse } from './my-trips.fixture.mjs'

function makeApproved(overrides = {}) {
  return {
    id: '10',
    requesterId: '2',
    requesterName: 'Solicitante Fictício QA',
    serviceId: '3',
    serviceName: 'Transporte Administrativo',
    requestedDate: '2026-11-20',
    requestedTime: '08:30',
    origin: 'Sede Fictícia FSPH',
    destination: 'Unidade Fictícia Centro',
    purpose: 'Reunião institucional fictícia',
    passengers: 2,
    status: 'APPROVED',
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    ...overrides,
  }
}

function makePage(requests, overrides = {}) {
  return {
    requests,
    total: requests.length,
    page: 1,
    pageSize: 100,
    totalPages: requests.length > 0 ? 1 : 0,
    ...overrides,
  }
}

test('consulta a listagem paginada com status APPROVED e mapeia os campos usados na tela', async () => {
  const calls = []
  const api = async (path) => { calls.push(path); return jsonResponse(makePage([makeApproved()])) }

  const requests = await listApprovedRequests(api)

  assert.deepEqual(calls, ['/requests?status=APPROVED&page=1&pageSize=100'])
  assert.deepEqual(requests, [{
    id: '10',
    serviceId: '3',
    serviceName: 'Transporte Administrativo',
    requestedDate: '2026-11-20',
    requestedTime: '08:30',
    origin: 'Sede Fictícia FSPH',
    destination: 'Unidade Fictícia Centro',
    purpose: 'Reunião institucional fictícia',
    passengers: 2,
    status: 'APPROVED',
  }])
})

test('percorre todas as páginas e consolida as solicitações aprovadas', async () => {
  const calls = []
  const pages = new Map([
    ['/requests?status=APPROVED&page=1&pageSize=100', makePage([makeApproved({ id: '10' }), makeApproved({ id: '11' })], { totalPages: 2 })],
    ['/requests?status=APPROVED&page=2&pageSize=100', makePage([makeApproved({ id: '12' })], { page: 2, totalPages: 2 })],
  ])
  const api = async (path) => {
    calls.push(path)
    return jsonResponse(pages.get(path))
  }

  const requests = await listApprovedRequests(api)

  assert.deepEqual(calls, [...pages.keys()])
  assert.deepEqual(requests.map((request) => request.id), ['10', '11', '12'])
})

test('lista vazia não dispara uma segunda página', async () => {
  const calls = []
  const api = async (path) => { calls.push(path); return jsonResponse(makePage([])) }

  assert.deepEqual(await listApprovedRequests(api), [])
  assert.equal(calls.length, 1)
})

test('página vazia encerra a leitura mesmo com totalPages inconsistente', async () => {
  const calls = []
  const api = async (path) => {
    calls.push(path)
    return jsonResponse(makePage([], { totalPages: 9 }))
  }

  assert.deepEqual(await listApprovedRequests(api), [])
  assert.equal(calls.length, 1)
})

test('rejeita envelope paginado malformado em vez de exibir lista vazia silenciosa', async () => {
  const bodies = [
    [makeApproved()],
    { requests: 'nada', totalPages: 1 },
    { requests: [], totalPages: -1 },
    { requests: [], totalPages: 1.5 },
    { requests: [makeApproved({ status: 'PENDING' })] },
    { requests: [makeApproved({ passengers: '2' })] },
    { requests: [{ id: '10' }] },
  ]
  for (const body of bodies) {
    await assert.rejects(
      listApprovedRequests(async () => jsonResponse(body)),
      (error) => error instanceof TripRequestError && error.kind === 'invalidResponse',
    )
  }
  await assert.rejects(
    listApprovedRequests(async () => new Response('não é json', { status: 200 })),
    { kind: 'invalidResponse' },
  )
})

test('preserva a mensagem segura da API e classifica o erro HTTP', async () => {
  await assert.rejects(
    listApprovedRequests(async () => jsonResponse({ erro: 'Autenticação necessária.' }, 401)),
    { kind: 'session', message: 'Autenticação necessária.', status: 401 },
  )
  await assert.rejects(
    listApprovedRequests(async () => jsonResponse({ erro: 'select * from trip.requests falhou' }, 500)),
    (error) => error.kind === 'server'
      && error.message === 'Não foi possível carregar as solicitações aprovadas.',
  )
  await assert.rejects(
    listApprovedRequests(async () => jsonResponse({}, 418)),
    { kind: 'rejected', message: 'Não foi possível carregar as solicitações aprovadas.' },
  )
})

test('falha de rede vira erro tipado de conexão', async () => {
  await assert.rejects(
    listApprovedRequests(async () => { throw new Error('fetch failed') }),
    { kind: 'network' },
  )
})
