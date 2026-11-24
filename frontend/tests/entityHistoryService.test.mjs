import test from 'node:test'
import assert from 'node:assert/strict'
import { listVehicleHistory, listDriverHistory } from '../src/services/entityHistoryService.ts'

const entry = {
  id: '7', eventType: 'UPDATED', occurredAt: '2026-11-24T14:00:00.000Z', registeredAt: '2026-11-24T14:00:00.010Z',
  reportedBy: 'Gestora de teste', reason: 'Correção cadastral', evidenceDescription: null,
  actor: { id: '9', name: 'Gestora de teste', role: 'GESTOR' },
  beforeState: { revision: 1 }, afterState: { revision: 2 },
}

test('consulta e interpreta uma página de histórico do veículo', async () => {
  let requestedPath = ''
  const api = async (path) => {
    requestedPath = path
    return new Response(JSON.stringify({ items: [entry], total: 21, page: 2, pageSize: 20, totalPages: 2 }), { status: 200 })
  }
  const page = await listVehicleHistory(api, '42', 2)
  assert.equal(requestedPath, '/vehicles/42/history?page=2&pageSize=20')
  assert.equal(page.total, 21)
  assert.equal(page.items[0].reason, 'Correção cadastral')
})

test('consulta o histórico do motorista sem aceitar resposta incompleta', async () => {
  let requestedPath = ''
  const api = async (path) => {
    requestedPath = path
    return new Response(JSON.stringify({ items: [entry], total: 1, page: 1, pageSize: 20, totalPages: 1 }), { status: 200 })
  }
  const page = await listDriverHistory(api, '13', 1)
  assert.equal(requestedPath, '/drivers/13/history?page=1&pageSize=20')
  assert.equal(page.items[0].actor.name, 'Gestora de teste')
  await assert.rejects(listDriverHistory(async () => new Response('{"items":[]}', { status: 200 }), '13', 1), /dados inválidos/)
})
