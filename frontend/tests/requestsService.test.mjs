import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTestViteServer } from './viteTestServer.mjs'
import { fileURLToPath } from 'node:url'

// O cache precisa ficar fora de `node_modules`, que pode ser somente leitura
// quando as dependências foram instaladas por outro usuário (ex: container).
const viteCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-test-'))

const vite = await createTestViteServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: viteCacheDir,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const { createRequest, decideRequest, getRequest, getRequestHistory, listRequests, resubmitRequest } = await vite.ssrLoadModule('/src/services/requestsService.ts')
test.after(() => vite.close())

const request = {
  id: 'request-1', requesterId: 'user-1', requesterName: 'Solicitante Fictício',
  serviceId: 'service-1', serviceName: 'Transporte institucional',
  requestedDate: '2026-12-15', requestedTime: '08:30',
  origin: 'Unidade de origem', destination: 'Unidade de destino', purpose: 'Atividade institucional',
  passengers: 2, specialRequirements: null, notes: null, status: 'PENDING', revision: 1,
  decidedBy: null, decidedByName: null,
  decidedAt: null, decisionReason: null, createdAt: '2026-11-12T12:00:00.000Z',
  updatedAt: '2026-11-12T12:00:00.000Z', trip: null,
}

test('listRequests envia filtros e paginação; getRequest codifica o identificador da rota', async () => {
  let requestedPath = ''
  const page = { requests: [request], total: 1, page: 1, pageSize: 20, totalPages: 1 }
  const listed = await listRequests(async (path) => {
    requestedPath = path
    return Response.json(page)
  }, { status: 'PENDING', from: '2026-12-01', requester: 'Fictício', service: 'institucional', page: 1, pageSize: 20 })
  assert.equal(requestedPath, '/requests?status=PENDING&from=2026-12-01&requester=Fict%C3%ADcio&service=institucional&page=1&pageSize=20')
  assert.deepEqual(listed, page)

  const result = await getRequest(async (path) => { requestedPath = path; return Response.json(request) }, 'request/1')
  assert.equal(requestedPath, '/requests/request%2F1')
  assert.deepEqual(result, request)
})

test('consultas preservam erros da API, rejeitam envelopes inválidos e enviam decisões', async () => {
  await assert.rejects(
    getRequest(async () => Response.json({ erro: 'Solicitação não encontrada.' }, { status: 404 }), 'missing'),
    /Solicitação não encontrada\./,
  )
  await assert.rejects(
    getRequest(async () => Response.json({ ...request, status: 'UNKNOWN' }), request.id),
    /interpretar os dados da solicitação/,
  )
  await assert.rejects(
    listRequests(async () => Response.json({ requests: [{ ...request, passengers: '2' }], total: 1, page: 1, pageSize: 20, totalPages: 1 }), {}),
    /interpretar a lista/,
  )
  let decision = null
  await decideRequest(async (path, options) => {
    decision = { path, options }
    return Response.json({ status: 'REJECTED' })
  }, 'request/1', 'reject', 'Justificativa fictícia', 1)
  assert.equal(decision.path, '/requests/request%2F1/reject')
  assert.deepEqual(JSON.parse(decision.options.body), { reason: 'Justificativa fictícia', expectedRevision: 1 })
})

test('cria e reenvia solicitações com versão, passageiros e dados opcionais', async () => {
  let requestBody
  const input = {
    requestedDate: '2026-12-20', requestedTime: '09:15', origin: 'Origem fictícia',
    destination: 'Destino fictício', purpose: 'Atividade institucional', serviceId: 'service-1',
    passengers: 3, specialRequirements: 'Acesso sem escadas', notes: null,
  }
  const created = await createRequest(async (path, options) => {
    assert.equal(path, '/requests')
    requestBody = JSON.parse(options.body)
    return Response.json({ id: 'request-1', status: 'PENDING' }, { status: 201 })
  }, input)
  assert.deepEqual(created, { id: 'request-1', status: 'PENDING' })
  assert.deepEqual(requestBody, input)

  let resubmission
  const returned = { ...request, status: 'PENDING', revision: 3 }
  const result = await resubmitRequest(async (path, options) => {
    assert.equal(path, '/requests/request-1/resubmit')
    resubmission = JSON.parse(options.body)
    return Response.json(returned)
  }, 'request-1', 2, input)
  assert.equal(result.revision, 3)
  assert.deepEqual(resubmission, { expectedRevision: 2, ...input })
})

test('carrega histórico paginado e rejeita envelope inválido', async () => {
  const item = {
    id: 'event-1', eventType: 'RETURNED', occurredAt: '2026-11-12T12:00:00.000Z',
    registeredAt: '2026-11-12T12:00:00.000Z', reportedBy: 'Gestor Fictício', registeredBy: 'user-2',
    actorSnapshot: { id: 'user-2', name: 'Gestor Fictício', email: 'gestor@example.test', role: 'GESTOR' },
    reason: 'Corrija a data', beforeState: { revision: 1 }, afterState: { revision: 2 },
  }
  const history = { items: [item], total: 1, page: 1, pageSize: 20, totalPages: 1 }
  let path
  assert.deepEqual(await getRequestHistory(async requested => { path = requested; return Response.json(history) }, 'request-1'), history)
  assert.equal(path, '/requests/request-1/history?page=1&pageSize=20')
  await assert.rejects(getRequestHistory(async () => Response.json({ items: [item] }), 'request-1'), /interpretar o histórico/)
})
