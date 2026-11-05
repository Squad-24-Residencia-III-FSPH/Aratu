import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionFor } from './fixtures.mjs'
import { resolveRoute } from '../src/routing/routeDecision.ts'
import { getSidebarNavigation } from '../src/components/sidebarNavigation.ts'
import { formatMoney, formatCivilDate, MAINTENANCE_PATH } from '../src/maintenance/maintenanceTypes.ts'
import { getOdometerError, normalizeFormItems, parseOdometer } from '../src/maintenance/maintenanceForm.ts'
import { listMaintenance, createMaintenance, updateMaintenance, closeMaintenance, getMaintenance, MaintenanceRequestError } from '../src/services/maintenanceService.ts'

const order = { id: '9007199254740993', vehicleId: '21', status: 'OPEN', revision: 1, type: 'PREVENTIVE',
  description: 'Revisão fictícia', blocksVehicle: true, workshop: null, odometerKm: null, expectedCompletionDate: null,
  openedAt: '2026-11-05T12:00:00Z', closedAt: null, vehicleSnapshot: null, estimateItems: null, actualItems: null,
  cost: null, finalCost: null, estimatedTotal: null }

test('erro de hodômetro identifica negativos, frações e excesso e desaparece após correção', () => {
  for (const value of ['-1', '1.5', 'abc', '2147483648']) {
    assert.match(getOdometerError(value), /quilometragem inteira entre zero e 2.147.483.647/)
    assert.throws(() => parseOdometer(value))
  }
  for (const value of ['', '0', '100', '2147483647']) {
    assert.equal(getOdometerError(value), undefined)
  }
})

test('manutenção protege rota e menu pelos mesmos perfis do backend', () => {
  for (const profile of ['GESTOR', 'ADMINISTRADOR', 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO']) {
    const decision = resolveRoute(sessionFor(profile), MAINTENANCE_PATH)
    const menu = getSidebarNavigation(profile)
    const link = [...menu.topItems, ...menu.sections.flatMap(section => section.items)].find(item => item.label === 'Manutenção')
    const allowed = ['GESTOR', 'ADMINISTRADOR'].includes(profile)
    assert.equal(decision.kind, allowed ? 'maintenance' : 'redirect')
    assert.equal(Boolean(link), allowed)
    if (link) assert.deepEqual([link.behavior, link.path], ['link', MAINTENANCE_PATH])
  }
  for (const session of [null, sessionFor('GESTOR', -1)]) {
    assert.deepEqual(resolveRoute(session, MAINTENANCE_PATH), { kind: 'redirect', to: '/login' })
  }
})
test('entrada em reais aceita vírgula e preserva quantidade fracionária sem calcular custos', () => {
  assert.deepEqual(normalizeFormItems([{ kind: 'PART', description: ' Filtro fictício ', quantity: '1,500', unitPrice: '18,75' },
    { kind: 'LABOR', description: 'Serviço fictício', amount: '40' }]), [
    { kind: 'PART', description: 'Filtro fictício', quantity: '1.500', unitPrice: '18.75' },
    { kind: 'LABOR', description: 'Serviço fictício', amount: '40.00' },
  ])
  for (const quantity of ['0', '-1', '1,0001', 'Infinity']) {
    assert.throws(() => normalizeFormItems([{ kind: 'PART', description: 'Teste', quantity, unitPrice: '1' }]))
  }
  assert.equal(parseOdometer(''), null)
  assert.equal(parseOdometer('0'), 0)
  assert.throws(() => parseOdometer('-1'))
  assert.equal(formatMoney(null), 'Não informado')
  assert.equal(formatMoney('0.00'), 'R$ 0,00')
  assert.equal(formatCivilDate('2026-11-05'), '05/11/2026')
})
test('lista preserva gasto da API quando nenhuma ordem foi aberta no período', async () => {
  const filters = { vehicleId: '21', from: '2026-11-01T03:00:00Z', to: '2026-12-01T03:00:00Z' }
  const result = await listMaintenance(async path => {
    const url = new URL(path, 'http://example.test')
    assert.equal(url.pathname, '/maintenance-orders')
    for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), value)
    return Response.json({ items: [], totalSpent: '58.75' })
  }, filters)
  assert.deepEqual(result, { items: [], totalSpent: '58.75' })
})
test('gravações enviam chave, revisão e execução separados sem alterar BIGINT', async () => {
  const calls = []
  const api = async (path, options) => { calls.push({ path, ...options }); return Response.json(order) }
  const input = { vehicleId: '21', reportedBy: 'Oficina fictícia', reason: 'Teste fictício' }
  assert.equal((await createMaintenance(api, input, 'uuid-ficticio')).id, order.id)
  assert.equal(calls[0].headers['Idempotency-Key'], 'uuid-ficticio')
  await updateMaintenance(api, order.id, { expectedRevision: 1, estimateItems: [] })
  await closeMaintenance(api, order.id, { expectedRevision: 2, actualItems: [] })
  assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'PATCH'])
  assert.equal(calls[2].path, `/maintenance-orders/${order.id}/close`)
  assert.deepEqual(JSON.parse(calls[2].body), { expectedRevision: 2, actualItems: [] })
})
test('conflitos preservam mensagem de revisão e respostas inválidas são recusadas', async () => {
  await assert.rejects(getMaintenance(async () => Response.json({ erro: 'Atualize a ordem antes de tentar novamente.' }, { status: 409 }), '1'),
    error => error instanceof MaintenanceRequestError && error.status === 409 && /Atualize/.test(error.message))
  await assert.rejects(getMaintenance(async () => Response.json({ ...order, actualItems: 'inválido' }), '1'), /interpretar/)
  await assert.rejects(listMaintenance(async () => Response.json({ items: [], totalSpent: null }), {}), /inválida/)
})
