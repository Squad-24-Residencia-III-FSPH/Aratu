import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})
const { decideRequest, getRequest, listRequests } = await vite.ssrLoadModule('/src/services/requestsService.ts')
test.after(() => vite.close())

const request = {
  id: 'request-1', requesterId: 'user-1', requesterName: 'Solicitante Fictício',
  serviceId: 'service-1', serviceName: 'Transporte institucional',
  requestedDate: '2026-12-15', requestedTime: '08:30',
  origin: 'Unidade de origem', destination: 'Unidade de destino', purpose: 'Atividade institucional',
  passengers: 2, status: 'PENDING', decidedBy: null, decidedByName: null,
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
  }, 'request/1', 'reject', 'Justificativa fictícia')
  assert.equal(decision.path, '/requests/request%2F1/reject')
  assert.deepEqual(JSON.parse(decision.options.body), { reason: 'Justificativa fictícia' })
})
