import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVehicleDocumentsQuery, createVehicleDocument, getVehicleDocument, listExpiringVehicleDocuments, listVehicleDocuments, updateVehicleDocument } from '../src/services/vehicleDocumentsService.ts'

const document = { id: '8', vehicleId: '3', vehicle: { licensePlate: 'FIC0A01', model: 'Van QA', status: 'AVAILABLE' },
  documentType: 'CRLV', documentNumber: 'QA-2026', issuedAt: '2026-01-01', expiresAt: '2026-12-31', notes: null,
  supersedesId: null, supersededById: null, isAnnulled: false, annulmentReason: null, status: 'VALID',
  daysUntilExpiration: 37, revision: 1, createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' }

test('constrói filtros e lê lista e alerta de vencimentos', async () => {
  assert.equal(buildVehicleDocumentsQuery({ vehicleId: '3', documentType: 'CRLV', status: 'VALID' }), '?vehicleId=3&documentType=CRLV&status=VALID')
  const paths = []
  const api = async (path) => { paths.push(path); return new Response(JSON.stringify({ referenceDate: '2026-11-24', alertDays: 30, items: [document] })) }
  assert.equal((await listVehicleDocuments(api, { vehicleId: '3' })).items[0].id, '8')
  assert.equal((await listExpiringVehicleDocuments(api)).alertDays, 30)
  assert.deepEqual(paths, ['/vehicle-documents?vehicleId=3', '/vehicle-documents/expiring?days=30'])
})

test('lê a linha do tempo e envia correção com revisão', async () => {
  const event = { id: '10', eventType: 'REGISTERED', occurredAt: '2026-01-01T12:00:00.000Z', registeredAt: '2026-01-01T12:01:00.000Z',
    reportedBy: 'Gestor QA', reason: 'Cadastro fictício', actor: { id: '1', name: 'Gestor QA', role: 'GESTOR' }, before: null, after: document }
  const detail = await getVehicleDocument(async () => new Response(JSON.stringify({ ...document, events: [event] })), '8')
  assert.equal(detail.events[0].reason, 'Cadastro fictício')
  let request
  await updateVehicleDocument(async (path, options) => { request = { path, options }; return new Response(JSON.stringify(document)) }, '8', {
    expectedRevision: 1, expiresAt: '2027-01-01', reportedBy: 'Gestor QA', reason: 'Correção fictícia',
  })
  assert.equal(request.path, '/vehicle-documents/8')
  assert.equal(request.options.method, 'PUT')
  assert.equal(JSON.parse(request.options.body).expectedRevision, 1)
  await createVehicleDocument(async (path, options) => { request = { path, options }; return new Response(JSON.stringify(document), { status: 201 }) }, {
    vehicleId: '3', documentType: 'CRLV', expiresAt: '2027-01-01', supersedesId: '8',
    reportedBy: 'Gestor QA', reason: 'Renovação fictícia',
  })
  assert.equal(request.path, '/vehicle-documents')
  assert.equal(JSON.parse(request.options.body).supersedesId, '8')
})

test('erro funcional da API é preservado', async () => {
  await assert.rejects(listVehicleDocuments(async () => new Response(JSON.stringify({ erro: 'Atualize a consulta.' }), { status: 409 })), { message: 'Atualize a consulta.' })
})
