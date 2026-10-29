import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { AuditService } from '../src/services/audit.service'
import { VehiclesService } from '../src/services/vehicles.service'
import { VehicleServiceError } from '../src/types/vehicle.types'
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  Vehicle,
  VehicleStatus,
} from '../src/types/vehicle.types'
import type { UserRole } from '../src/types/auth'
import {
  closeTestPool,
  getTestPool,
  setupTestDatabase,
  truncateTestDatabase,
} from './helpers/db-test'
import {
  RBAC_JWT_CONFIG,
  RBAC_JWT_SECRET,
  seedRbacTestUsers,
} from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let testUsers: Map<UserRole, RbacTestUser>

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) throw new Error(`Usuário de teste para ${role} não instanciado.`)
  return user
}

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
}

function vehiclePayload(overrides: Partial<CreateVehicleInput> = {}): CreateVehicleInput {
  return {
    licensePlate: 'ABC1D23',
    brand: 'Chevrolet',
    model: 'S10',
    year: 2024,
    vehicleType: 'PICKUP_SVO',
    ownership: 'OWNED',
    categories: ['BODY'],
    seats: 2,
    bodyLimit: 2,
    weightLimit: null,
    operationType: 'SVO',
    reportedBy: 'Gestor Fictício QA',
    reason: 'Cadastro fictício para teste',
    ...overrides,
  }
}

function updatePayload(
  expectedRevision: number,
  overrides: Partial<CreateVehicleInput> = {},
): UpdateVehicleInput {
  return { ...vehiclePayload(overrides), expectedRevision }
}

function createAvailabilityService(): VehiclesService {
  return new VehiclesService(
    new VehiclesRepository(pool),
    new AuditService(new AuditRepository(pool)),
  )
}

async function createVehicle(
  token: string,
  overrides: Partial<CreateVehicleInput> = {},
): Promise<Vehicle> {
  const response = await api('/vehicles', {
    method: 'POST',
    token,
    body: vehiclePayload(overrides),
  })
  assert.equal(response.status, 201)
  return await response.json() as Vehicle
}

async function changeStatus(
  token: string,
  vehicleId: string,
  status: VehicleStatus,
  expectedRevision: number,
): Promise<Vehicle> {
  const response = await api(`/vehicles/${vehicleId}/status`, {
    method: 'PATCH',
    token,
    body: {
      status,
      expectedRevision,
      reportedBy: 'Gestor Fictício QA',
      reason: 'Mudança fictícia de situação',
    },
  })
  assert.equal(response.status, 200)
  return await response.json() as Vehicle
}

async function countVehicleRows(vehicleId: string): Promise<{ events: number; audits: number }> {
  const events = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.vehicle_events WHERE vehicle_id = $1',
    [vehicleId],
  )
  const audits = await pool.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM audit.logs WHERE table_name = 'fleet.vehicles' AND record_id = $1",
    [vehicleId],
  )
  return { events: events.rows[0]?.total ?? 0, audits: audits.rows[0]?.total ?? 0 }
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

test('IT-VEH-01: cadastro válido cria veículo disponível com histórico e auditoria', async () => {
  const gestor = getUser('GESTOR')
  const response = await api('/vehicles', {
    method: 'POST',
    token: gestor.token,
    body: vehiclePayload(),
  })

  assert.equal(response.status, 201)
  const vehicle = await response.json() as Vehicle
  assert.equal(vehicle.licensePlate, 'ABC1D23')
  assert.equal(vehicle.status, 'AVAILABLE')
  assert.equal(vehicle.revision, 1)
  assert.equal(vehicle.operationType, 'SVO')
  assert.deepEqual(vehicle.categories, ['BODY'])

  const events = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM fleet.vehicle_events WHERE vehicle_id = $1 ORDER BY id ASC',
    [vehicle.id],
  )
  assert.deepEqual(events.rows.map((row) => row.event_type), ['CREATED'])

  const audits = await pool.query<{ operation: string }>(
    'SELECT operation FROM audit.logs WHERE record_id = $1 ORDER BY id ASC',
    [vehicle.id],
  )
  assert.deepEqual(audits.rows.map((row) => row.operation), ['CREATE'])
})

test('IT-VEH-02: placas fora do formato antigo ou Mercosul retornam 400', async () => {
  const gestor = getUser('GESTOR')

  for (const licensePlate of ['ABC-1234', 'AB1234', 'ABC12345']) {
    const response = await api('/vehicles', {
      method: 'POST',
      token: gestor.token,
      body: vehiclePayload({ licensePlate }),
    })
    assert.equal(response.status, 400, `Placa ${licensePlate} deveria ser rejeitada.`)
  }
})

test('IT-VEH-03: placa duplicada mesmo em minúsculas retorna 409', async () => {
  const gestor = getUser('GESTOR')
  await createVehicle(gestor.token, { licensePlate: 'ABC1D23' })

  const response = await api('/vehicles', {
    method: 'POST',
    token: gestor.token,
    body: vehiclePayload({ licensePlate: 'abc1d23' }),
  })

  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { erro: 'Placa já cadastrada' })
})

test('IT-VEH-04: detalhe inexistente retorna 404 e identificador malformado retorna 400', async () => {
  const gestor = getUser('GESTOR')

  const missing = await api('/vehicles/999999', { token: gestor.token })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { erro: 'Veículo não encontrado.' })

  const malformed = await api('/vehicles/abc', { token: gestor.token })
  assert.equal(malformed.status, 400)
  assert.deepEqual(await malformed.json(), { erro: 'Identificador de veículo inválido.' })
})

test('IT-VEH-05: listagem filtra por situação, categoria e operação e rejeita filtro inválido', async () => {
  const gestor = getUser('GESTOR')
  const available = await createVehicle(gestor.token, { licensePlate: 'ABC1D23' })
  const maintenance = await createVehicle(gestor.token, {
    licensePlate: 'QAB1C23',
    operationType: 'ADMINISTRATIVE',
    categories: ['PASSENGER'],
  })
  await changeStatus(gestor.token, maintenance.id, 'IN_MAINTENANCE', maintenance.revision)

  const byStatus = await api('/vehicles?status=IN_MAINTENANCE', { token: gestor.token })
  assert.equal(byStatus.status, 200)
  const maintenanceVehicles = await byStatus.json() as Vehicle[]
  assert.equal(maintenanceVehicles.length, 1)
  assert.equal(maintenanceVehicles[0]?.id, maintenance.id)

  const byCategory = await api('/vehicles?category=PASSENGER', { token: gestor.token })
  assert.equal(byCategory.status, 200)
  const passengerVehicles = await byCategory.json() as Vehicle[]
  assert.deepEqual(passengerVehicles.map((vehicle) => vehicle.id), [maintenance.id])

  const byOperation = await api('/vehicles?operationType=SVO', { token: gestor.token })
  assert.equal(byOperation.status, 200)
  const svoVehicles = await byOperation.json() as Vehicle[]
  assert.deepEqual(svoVehicles.map((vehicle) => vehicle.id), [available.id])

  const invalid = await api('/vehicles?status=INVALID', { token: gestor.token })
  assert.equal(invalid.status, 400)
  assert.deepEqual(await invalid.json(), { erro: 'Situação de veículo inválida.' })
})

test('IT-VEH-06: edição válida atualiza dados, revision, histórico e auditoria', async () => {
  const gestor = getUser('GESTOR')
  const vehicle = await createVehicle(gestor.token)

  const response = await api(`/vehicles/${vehicle.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(vehicle.revision, {
      brand: 'Volkswagen',
      model: 'Amarok',
      year: 2025,
      seats: 5,
    }),
  })

  assert.equal(response.status, 200)
  const updated = await response.json() as Vehicle
  assert.equal(updated.brand, 'Volkswagen')
  assert.equal(updated.model, 'Amarok')
  assert.equal(updated.year, 2025)
  assert.equal(updated.seats, 5)
  assert.equal(updated.revision, 2)
  assert.equal(updated.licensePlate, 'ABC1D23')

  const events = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM fleet.vehicle_events WHERE vehicle_id = $1 ORDER BY id ASC',
    [vehicle.id],
  )
  assert.deepEqual(events.rows.map((row) => row.event_type), ['CREATED', 'UPDATED'])

  const audits = await pool.query<{ operation: string }>(
    'SELECT operation FROM audit.logs WHERE record_id = $1 ORDER BY id ASC',
    [vehicle.id],
  )
  assert.deepEqual(audits.rows.map((row) => row.operation), ['CREATE', 'UPDATE'])
})

test('IT-VEH-07: edição com revision antiga retorna 409', async () => {
  const gestor = getUser('GESTOR')
  const vehicle = await createVehicle(gestor.token)

  const first = await api(`/vehicles/${vehicle.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(vehicle.revision, { model: 'S10 High Country' }),
  })
  assert.equal(first.status, 200)

  const stale = await api(`/vehicles/${vehicle.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(vehicle.revision, { model: 'S10 Stale' }),
  })
  assert.equal(stale.status, 409)
  assert.deepEqual(await stale.json(), {
    erro: 'O veículo foi alterado por outra operação. Atualize os dados e tente novamente.',
  })
})

test('IT-VEH-08: transições permitidas, transição proibida e idempotência do PATCH', async () => {
  const gestor = getUser('GESTOR')
  const availability = createAvailabilityService()
  const vehicle = await createVehicle(gestor.token)

  assert.equal(await availability.isAvailableForAllocation(vehicle.id), true)

  const maintenance = await changeStatus(
    gestor.token,
    vehicle.id,
    'IN_MAINTENANCE',
    vehicle.revision,
  )
  assert.equal(maintenance.revision, 2)
  assert.equal(await availability.isAvailableForAllocation(vehicle.id), false)

  const inactive = await changeStatus(gestor.token, vehicle.id, 'INACTIVE', maintenance.revision)
  assert.equal(inactive.revision, 3)
  assert.equal(await availability.isAvailableForAllocation(vehicle.id), false)

  const forbidden = await api(`/vehicles/${vehicle.id}/status`, {
    method: 'PATCH',
    token: gestor.token,
    body: {
      status: 'IN_MAINTENANCE',
      expectedRevision: inactive.revision,
      reportedBy: 'Gestor Fictício QA',
      reason: 'Tentativa proibida',
    },
  })
  assert.equal(forbidden.status, 422)
  assert.deepEqual(await forbidden.json(), {
    erro: 'Transição de INACTIVE para IN_MAINTENANCE não permitida.',
  })

  const afterForbidden = await countVehicleRows(vehicle.id)
  assert.deepEqual(afterForbidden, { events: 3, audits: 3 })

  const availableAgain = await changeStatus(
    gestor.token,
    vehicle.id,
    'AVAILABLE',
    inactive.revision,
  )
  assert.equal(availableAgain.revision, 4)
  assert.equal(await availability.isAvailableForAllocation(vehicle.id), true)

  const idempotent = await changeStatus(
    gestor.token,
    vehicle.id,
    'AVAILABLE',
    availableAgain.revision,
  )
  assert.equal(idempotent.revision, 4)
  assert.deepEqual(await countVehicleRows(vehicle.id), { events: 4, audits: 4 })

  const audits = await pool.query<{ operation: string }>(
    'SELECT operation FROM audit.logs WHERE record_id = $1 ORDER BY id ASC',
    [vehicle.id],
  )
  assert.deepEqual(audits.rows.map((row) => row.operation), [
    'CREATE',
    'STATUS_CHANGE',
    'STATUS_CHANGE',
    'STATUS_CHANGE',
  ])

  await assert.rejects(
    availability.isAvailableForAllocation('999999'),
    (error: unknown) => error instanceof VehicleServiceError && error.statusCode === 404,
  )
})

test('IT-VEH-09: RBAC restringe leitura e escrita conforme os perfis', async () => {
  const gestor = getUser('GESTOR')
  const admin = getUser('ADMINISTRADOR')
  const atendente = getUser('ATENDENTE_SVO')
  const solicitante = getUser('SOLICITANTE')

  const anonymousList = await api('/vehicles')
  assert.equal(anonymousList.status, 401)

  const anonymousCreate = await api('/vehicles', {
    method: 'POST',
    body: vehiclePayload(),
  })
  assert.equal(anonymousCreate.status, 401)

  const forbiddenList = await api('/vehicles', { token: solicitante.token })
  assert.equal(forbiddenList.status, 403)

  const forbiddenCreate = await api('/vehicles', {
    method: 'POST',
    token: solicitante.token,
    body: vehiclePayload(),
  })
  assert.equal(forbiddenCreate.status, 403)

  const atendenteList = await api('/vehicles', { token: atendente.token })
  assert.equal(atendenteList.status, 200)

  const atendenteCreate = await api('/vehicles', {
    method: 'POST',
    token: atendente.token,
    body: vehiclePayload(),
  })
  assert.equal(atendenteCreate.status, 403)

  const gestorVehicle = await createVehicle(gestor.token, { licensePlate: 'ABC1D23' })
  await createVehicle(admin.token, { licensePlate: 'QAB1C23' })

  const remove = await api(`/vehicles/${gestorVehicle.id}`, {
    method: 'DELETE',
    token: gestor.token,
  })
  assert.equal(remove.status, 404)
})

test('IT-VEH-10: edições concorrentes com a mesma revision resultam em 200 e 409', async () => {
  const gestor = getUser('GESTOR')
  const vehicle = await createVehicle(gestor.token)

  const [first, second] = await Promise.all([
    api(`/vehicles/${vehicle.id}`, {
      method: 'PUT',
      token: gestor.token,
      body: updatePayload(vehicle.revision, { brand: 'Marca Concorrente A' }),
    }),
    api(`/vehicles/${vehicle.id}`, {
      method: 'PUT',
      token: gestor.token,
      body: updatePayload(vehicle.revision, { brand: 'Marca Concorrente B' }),
    }),
  ])

  const statuses = [first.status, second.status].sort((a, b) => a - b)
  assert.deepEqual(statuses, [200, 409])

  const stored = await pool.query<{ revision: number }>(
    'SELECT revision FROM fleet.vehicles WHERE id = $1',
    [vehicle.id],
  )
  assert.equal(stored.rows[0]?.revision, 2)
})

test('IT-VEH-11: falha do ator inativado faz rollback do cadastro e da auditoria', async () => {
  const gestor = getUser('GESTOR')
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [gestor.id])

  const response = await api('/vehicles', {
    method: 'POST',
    token: gestor.token,
    body: vehiclePayload(),
  })

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    erro: 'Usuário autenticado não está ativo ou não existe.',
  })

  const vehicles = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.vehicles',
  )
  const events = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.vehicle_events',
  )
  const audits = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM audit.logs',
  )
  assert.equal(vehicles.rows[0]?.total, 0)
  assert.equal(events.rows[0]?.total, 0)
  assert.equal(audits.rows[0]?.total, 0)
})
