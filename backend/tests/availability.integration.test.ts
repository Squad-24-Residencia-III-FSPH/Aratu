import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import type { UserRole } from '../src/types/auth'
import type { DriverAvailability, VehicleAvailability } from '../src/types/availability.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, RBAC_JWT_SECRET, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'
import {
  FICTITIOUS_CPFS,
  insertDriver,
  insertRequest,
  insertService,
  insertTrip,
  insertVehicle,
  linkVehicleToService,
} from './fixtures/scheduling.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

const PERIOD = 'start=2099-12-01T10:00:00-03:00&end=2099-12-01T12:00:00-03:00'

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

async function get<T>(path: string, role: UserRole = 'GESTOR'): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${getUser(role).token}` } })
  return { status: response.status, body: (await response.json()) as T }
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG })
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  testUsers = await seedRbacTestUsers(pool, RBAC_JWT_SECRET)
})

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await closeTestPool()
})

async function scenario() {
  const serviceId = await insertService(pool, 'Transporte Fictício QA')
  const free = await insertVehicle(pool, 'FRE1A00')
  const maintenance = await insertVehicle(pool, 'MAN1A00', 'IN_MAINTENANCE')
  const incompatible = await insertVehicle(pool, 'INC1A00')
  const busy = await insertVehicle(pool, 'OCU1A00')
  const touching = await insertVehicle(pool, 'ENC1A00')
  await insertVehicle(pool, 'INA1A00', 'INACTIVE')
  for (const id of [free, maintenance, busy, touching]) await linkVehicleToService(pool, id, serviceId)
  await linkVehicleToService(pool, incompatible, serviceId, false)

  const activeDriver = await insertDriver(pool, 'A Motorista Livre', FICTITIOUS_CPFS[0])
  const awayDriver = await insertDriver(pool, 'B Motorista Afastado', FICTITIOUS_CPFS[1], '2099-12-31', 'AWAY')
  const expiringDriver = await insertDriver(pool, 'C Motorista CNH Vencendo', FICTITIOUS_CPFS[2], '2099-11-30')
  const busyDriver = await insertDriver(pool, 'D Motorista Ocupado', FICTITIOUS_CPFS[3])

  const requester = getUser('SOLICITANTE').id
  await insertTrip(pool, {
    requestId: await insertRequest(pool, requester, serviceId, 'SCHEDULED'),
    vehicleId: busy, driverId: busyDriver, start: '2099-12-01T11:00:00-03:00', end: '2099-12-01T13:00:00-03:00',
  })
  await insertTrip(pool, {
    requestId: await insertRequest(pool, requester, serviceId, 'SCHEDULED'),
    vehicleId: touching, driverId: activeDriver, start: '2099-12-01T08:00:00-03:00', end: '2099-12-01T10:00:00-03:00',
  })
  await insertTrip(pool, {
    requestId: await insertRequest(pool, requester, serviceId, 'SCHEDULED'),
    vehicleId: free, driverId: awayDriver, start: '2099-12-01T09:00:00-03:00', end: '2099-12-01T11:00:00-03:00', status: 'CANCELED',
  })
  return { serviceId, expiringDriver }
}

test('IT-AVAILABILITY-01: veículos com motivos; encostar e viagem cancelada não conflitam; inativo fica de fora', async () => {
  const { serviceId } = await scenario()
  const { status, body } = await get<VehicleAvailability[]>(`/vehicles/available?${PERIOD}&serviceId=${serviceId}`)
  assert.equal(status, 200)
  assert.deepEqual(body.map((item) => [item.licensePlate, item.available, item.reasons]), [
    ['ENC1A00', true, []],
    ['FRE1A00', true, []],
    ['INC1A00', false, ['INCOMPATIBLE']],
    ['MAN1A00', false, ['MAINTENANCE']],
    ['OCU1A00', false, ['CONFLICT']],
  ])
})

test('IT-AVAILABILITY-02: motoristas afastado, com CNH vencendo antes da viagem e ocupado', async () => {
  await scenario()
  const { status, body } = await get<DriverAvailability[]>(`/drivers/available?${PERIOD}`, 'ADMINISTRADOR')
  assert.equal(status, 200)
  assert.deepEqual(body.map((item) => [item.name, item.available, item.reasons]), [
    ['A Motorista Livre', true, []],
    ['B Motorista Afastado', false, ['AWAY']],
    ['C Motorista CNH Vencendo', false, ['CNH_EXPIRED']],
    ['D Motorista Ocupado', false, ['CONFLICT']],
  ])
})

test('IT-AVAILABILITY-03: parâmetros inválidos, serviço inexistente e rota de detalhe preservada', async () => {
  assert.equal((await get(`/vehicles/available?${PERIOD}`)).status, 400)
  assert.equal((await get('/vehicles/available?start=2099-12-01T10:00&end=2099-12-01T12:00&serviceId=1')).status, 400)
  assert.equal((await get(`/vehicles/available?${PERIOD}&serviceId=999999`)).status, 404)
  assert.equal((await get('/drivers/available?start=2099-12-01T12:00:00-03:00&end=2099-12-01T10:00:00-03:00')).status, 400)
  const vehicleId = await insertVehicle(pool, 'DET1A00')
  assert.equal((await get(`/vehicles/${vehicleId}`)).status, 200)
})

test('IT-AVAILABILITY-04: somente GESTOR e ADMINISTRADOR consultam', async () => {
  for (const role of ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    assert.equal((await get(`/drivers/available?${PERIOD}`, role)).status, 403, role)
  }
  assert.equal((await fetch(`${baseUrl}/drivers/available?${PERIOD}`)).status, 401)
})
