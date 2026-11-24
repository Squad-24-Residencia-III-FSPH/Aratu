import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFinesQuery, changeFineStatus, createFine, getFine, listFines, suggestFineDrivers, updateFine } from '../src/services/finesService.ts'

const fine = { id: '40', vehicleId: '3', driverId: '7', tripId: '11', infractionAt: '2026-11-20T13:00:00.000Z',
  infractionCode: 'QA-01', description: 'Infração fictícia', location: 'Local de teste', amount: '150.00', dueAt: '2026-12-20',
  notes: null, status: 'PENDING', paidAt: null, cancellationReason: null, createdBy: '1', revision: 1,
  createdAt: '2026-11-20T13:00:00.000Z', updatedAt: '2026-11-20T13:00:00.000Z',
  vehicle: { id: '3', licensePlate: 'FIC0A01', model: 'Van QA' }, driver: { id: '7', name: 'Motorista QA' },
  vehicleSnapshot: { id: '3', licensePlate: 'FIC0A01', model: 'Van QA', source: 'TRIP_SNAPSHOT', capturedAt: '2026-11-20T13:00:00.000Z' },
  driverSnapshot: { id: '7', name: 'Motorista QA', source: 'TRIP_SNAPSHOT', capturedAt: '2026-11-20T13:00:00.000Z' },
  tripSnapshot: { id: '11', vehicleId: '3', driverId: '7', startedAt: '2026-11-20T12:00:00.000Z', finishedAt: '2026-11-20T14:00:00.000Z', status: 'FINISHED', capturedAt: '2026-11-20T13:00:00.000Z' } }

test('consulta filtros, histórico e sugestões sem atribuição automática', async () => {
  assert.equal(buildFinesQuery({ vehicleId: '3', status: 'PENDING' }), '?vehicleId=3&status=PENDING')
  let path = ''
  const api = async (nextPath) => { path = nextPath; return new Response(JSON.stringify({ items: [fine] })) }
  assert.equal((await listFines(api, { vehicleId: '3' }))[0].driver.name, 'Motorista QA')
  assert.equal(path, '/fines?vehicleId=3')
  const event = { id: '50', eventType: 'REGISTERED', occurredAt: fine.infractionAt, registeredAt: fine.infractionAt,
    reportedBy: 'Gestor QA', reason: 'Cadastro fictício', evidenceDescription: 'Auto fictício', attachmentUrl: null,
    supersedesId: null, actor: { id: '1', name: 'Gestor QA', role: 'GESTOR' }, before: null, after: fine }
  const detail = await getFine(async () => new Response(JSON.stringify({ ...fine, events: [event] })), '40')
  assert.equal(detail.events[0].reason, 'Cadastro fictício')
  const suggestion = { tripId: '11', driverId: '7', driverName: 'Motorista QA', vehicleId: '3', startedAt: fine.tripSnapshot.startedAt,
    finishedAt: fine.tripSnapshot.finishedAt, tripStatus: 'FINISHED', nameSource: 'TRIP_SNAPSHOT' }
  const suggestions = await suggestFineDrivers(async (nextPath) => { path = nextPath; return new Response(JSON.stringify({ items: [suggestion] })) }, '3', fine.infractionAt)
  assert.equal(suggestions[0].tripId, '11')
  assert.match(path, /^\/fines\/driver-suggestions\?/)
})

test('cria, corrige e altera multa mantendo metadados/revisão e chave de criação', async () => {
  let request
  const api = async (path, options) => { request = { path, options }; return new Response(JSON.stringify(fine), { status: path === '/fines' ? 201 : 200 }) }
  await createFine(api, { vehicleId: '3', infractionAt: fine.infractionAt, infractionCode: 'QA-01', description: fine.description,
    amount: '150.00', reportedBy: 'Gestor QA', reason: 'Registro fictício', evidenceDescription: 'Auto fictício' }, '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11')
  assert.equal(request.options.headers['Idempotency-Key'], '0c4f0e29-df2c-4fd8-9d54-f19cf2021d11')
  await updateFine(api, '40', { expectedRevision: 1, occurredAt: fine.infractionAt, description: 'Descrição corrigida', reportedBy: 'Gestor QA', reason: 'Correção fictícia', evidenceDescription: 'Auto conferido' })
  assert.equal(request.options.method, 'PUT')
  await changeFineStatus(api, '40', { expectedRevision: 1, status: 'PAID', paidAt: fine.infractionAt, reportedBy: 'Gestor QA', reason: 'Pagamento fictício', evidenceDescription: 'Comprovante fictício' })
  assert.equal(request.options.method, 'PATCH')
  assert.equal(JSON.parse(request.options.body).status, 'PAID')
})
