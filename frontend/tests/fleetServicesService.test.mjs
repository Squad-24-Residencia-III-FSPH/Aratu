import test from 'node:test'
import assert from 'node:assert/strict'
import { saveFleetServiceAssignments } from '../src/services/fleetServicesService.ts'

const service = {
  id: 'service-1', name: 'Transporte QA', description: null, categories: ['PASSENGER'],
  requiresTriage: false, requiresWeight: false, requiresIdentification: false, active: true, revision: 1,
}

function snapshot(overrides = {}) {
  return [{ service, revision: 1, vehicleIds: ['vehicle-existing'], ...overrides }]
}

test('usa a revisão do formulário e mantém os vínculos quando outro gestor já alterou o tipo', async () => {
  let sentBody
  const result = await saveFleetServiceAssignments(async (path, init) => {
    assert.equal(path, '/services/service-1/vehicles')
    sentBody = JSON.parse(init.body)
    return Response.json({ erro: 'A associação mudou desde o carregamento.' }, { status: 409 })
  }, 'vehicle-target', ['service-1'], snapshot(), 'Associação a veículo')

  assert.equal(sentBody.expectedRevision, 1)
  assert.deepEqual(sentBody.vehicleIds, ['vehicle-existing', 'vehicle-target'])
  assert.deepEqual(result.failedServices, ['Transporte QA'])
  assert.equal(result.snapshot[0].revision, 1)
  assert.deepEqual(result.snapshot[0].vehicleIds, ['vehicle-existing'])
})

test('atualiza o snapshot após salvar e preserva os demais veículos associados', async () => {
  const result = await saveFleetServiceAssignments(async (_path, init) => {
    const body = JSON.parse(init.body)
    assert.deepEqual(body.vehicleIds, ['vehicle-existing', 'vehicle-target'])
    return Response.json({
      serviceId: 'service-1', revision: 2,
      vehicles: [
        { id: 'vehicle-existing', licensePlate: 'AAA0001' },
        { id: 'vehicle-target', licensePlate: 'BBB0002' },
      ],
    })
  }, 'vehicle-target', ['service-1'], snapshot(), 'Associação a veículo')

  assert.deepEqual(result.failedServices, [])
  assert.equal(result.snapshot[0].revision, 2)
  assert.deepEqual(result.snapshot[0].vehicleIds, ['vehicle-existing', 'vehicle-target'])
})
