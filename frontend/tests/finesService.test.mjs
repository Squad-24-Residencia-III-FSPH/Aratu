import test from 'node:test'
import assert from 'node:assert/strict'
import { changeFineStatus, createFine, listFines, suggestFineDrivers } from '../src/services/finesService.ts'

test('consulta multas combinando os filtros e inclui todo o dia final', async () => {
  const signal = new AbortController().signal
  const api = async (path, options) => {
    const url = new URL(path, 'http://localhost')
    assert.equal(url.pathname, '/fines')
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      vehicleId: '5', driverId: '7', status: 'PAID',
      from: new Date('2026-11-18T00:00:00').toISOString(),
      to: new Date('2026-11-19T00:00:00').toISOString(),
    })
    assert.equal(options.signal, signal)
    return Response.json({ items: [{ id: '1' }] })
  }
  const items = await listFines(api, { vehicleId: '5', driverId: '7', status: 'PAID', from: '2026-11-18', to: '2026-11-18' }, signal)
  assert.deepEqual(items, [{ id: '1' }])
})

test('consulta sugestões sem atribuir motorista e preserva erro de revisão da API', async () => {
  const at = '2026-11-18T14:00:00.000Z'
  const signal = new AbortController().signal
  await suggestFineDrivers(async (path, options) => {
    const url = new URL(path, 'http://localhost')
    assert.equal(url.pathname, '/fines/driver-suggestions')
    assert.deepEqual(Object.fromEntries(url.searchParams), { vehicleId: '5', infractionAt: at })
    assert.equal(options.signal, signal)
    return Response.json({ items: [] })
  }, '5', at, signal)

  const input = { status: 'PAID', paidAt: at, expectedRevision: 2, reportedBy: 'Setor de teste', reason: 'Pagamento', evidenceDescription: 'Comprovante fictício' }
  await assert.rejects(changeFineStatus(async (path, options) => {
    assert.equal(path, '/fines/1/status')
    assert.equal(options.method, 'PATCH')
    assert.deepEqual(JSON.parse(options.body), input)
    return Response.json({ erro: 'A multa foi alterada por outra operação.' }, { status: 409 })
  }, '1', input), { status: 409, message: 'A multa foi alterada por outra operação.' })
})

test('registra multa sem motorista e mantém a chave fornecida no reenvio', async () => {
  const key = crypto.randomUUID()
  const input = {
    vehicleId: '5', driverId: null, tripId: null, infractionAt: '2026-11-18T14:00:00.000Z',
    infractionCode: 'TESTE', description: 'Infração fictícia', amount: '150.75', dueAt: null,
    reportedBy: 'Setor de teste', reason: 'Registro', evidenceDescription: 'Notificação fictícia',
  }
  const api = async (path, options) => {
    assert.equal(path, '/fines')
    assert.equal(options.method, 'POST')
    assert.equal(new Headers(options.headers).get('Idempotency-Key'), key)
    assert.deepEqual(JSON.parse(options.body), input)
    return Response.json({}, { status: 201 })
  }
  await createFine(api, input, key)
  await createFine(api, input, key)
})
