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
const service = await vite.ssrLoadModule('/src/services/driversService.ts')
const { DriverRequestError } = await vite.ssrLoadModule('/src/drivers/driverTypes.ts')
test.after(() => vite.close())

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const driver = {
  id: 'driver-1', name: 'Pessoa Fictícia', cpf: '12345678901', cnhNumber: '12345678901',
  cnhCategory: 'B', cnhExpiresAt: '2027-01-15', phone: null, status: 'AWAY', userId: null,
  revision: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
}

test('lista e consulta usam as rotas e filtros documentados', async () => {
  const calls = []
  const api = async (path) => { calls.push(path); return response(path.startsWith('/drivers?') ? [driver] : driver) }
  assert.deepEqual(await service.listDrivers(api, { name: 'Pessoa', status: 'AWAY' }), [driver])
  assert.deepEqual(await service.getDriver(api, 'driver/1'), driver)
  assert.deepEqual(calls, ['/drivers?name=Pessoa&status=AWAY', '/drivers/driver%2F1'])
})

test('cadastro, edição e situação preservam método, rota e payload', async () => {
  const calls = []
  const api = async (path, request) => { calls.push({ path, request }); return response(driver) }
  const payload = { name: driver.name, cpf: driver.cpf, cnhNumber: driver.cnhNumber, cnhCategory: 'B',
    cnhExpiresAt: driver.cnhExpiresAt, phone: null, userId: null, reportedBy: 'Pessoa gestora', reason: 'Registro de teste' }
  await service.createDriver(api, { ...payload, status: 'AWAY' })
  await service.updateDriver(api, driver.id, { ...payload, expectedRevision: 2 })
  await service.changeDriverStatus(api, driver.id, { status: 'INACTIVE', expectedRevision: 2,
    reportedBy: payload.reportedBy, reason: payload.reason })
  assert.deepEqual(calls.map(({ path, request }) => [path, request.method]), [
    ['/drivers', 'POST'], ['/drivers/driver-1', 'PUT'], ['/drivers/driver-1/status', 'PATCH'],
  ])
  assert.deepEqual(JSON.parse(calls[0].request.body), { ...payload, status: 'AWAY' })
  assert.equal(JSON.parse(calls[1].request.body).expectedRevision, 2)
  assert.equal(JSON.parse(calls[2].request.body).status, 'INACTIVE')
})

test('exibe mensagem erro da API e valida respostas incompatíveis', async () => {
  await assert.rejects(service.listDrivers(async () => response({ erro: 'Falha fictícia da API.' }, 409)),
    (error) => error instanceof DriverRequestError && error.kind === 'conflict' && error.message === 'Falha fictícia da API.')
  await assert.rejects(service.listDrivers(async () => response({ users: [] })), /formato inv/i)
})
