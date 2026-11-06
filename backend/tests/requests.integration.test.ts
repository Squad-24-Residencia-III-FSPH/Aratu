import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
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
let fixtures: RequestFixtures

/**
 * Identificadores das solicitações fictícias criadas antes de cada caso de teste.
 *
 * Os nomes remetem ao cenário coberto, não à ordem de inserção, para que as
 * asserções permaneçam legíveis mesmo se a fixture evoluir.
 */
interface RequestFixtures {
  pending: string
  approved: string
  scheduledWithTrip: string
  scheduledWithoutTrip: string
  otherRequester: string
}

const EXPECTED_NOT_FOUND_BODY = { erro: 'Solicitação não encontrada.' }

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()

  const app = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG })
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(async () => {
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  testUsers = await seedRbacTestUsers(pool, RBAC_JWT_SECRET)
  fixtures = await seedRequestFixtures(pool, testUsers)
})

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await closeTestPool()
})

function getUser(role: UserRole): RbacTestUser {
  const user = testUsers.get(role)
  if (!user) {
    throw new Error(`Usuário de teste para o perfil ${role} não está instanciado na fixture.`)
  }
  return user
}

async function insertReturningId(sql: string, values: unknown[]): Promise<string> {
  const result = await pool.query<{ id: string }>(sql, values)
  const id = result.rows[0]?.id
  if (!id) {
    throw new Error('Falha ao inserir fixture de teste: identificador não retornado.')
  }
  return id
}

async function insertRequest(input: {
  requesterId: string
  serviceId: string
  requestedDate: string
  requestedTime: string
  status: 'PENDING' | 'APPROVED' | 'SCHEDULED' | 'REJECTED' | 'CANCELED'
  decidedById?: string
}): Promise<string> {
  return insertReturningId(
    `INSERT INTO trip.requests
       (requester_id, service_id, requested_date, requested_time,
        origin, destination, purpose, passengers, status, decided_by, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id::text AS id`,
    [
      input.requesterId,
      input.serviceId,
      input.requestedDate,
      input.requestedTime,
      'Sede FSPH',
      'Unidade Centro',
      'Reunião institucional fictícia',
      2,
      input.status,
      input.decidedById ?? null,
      input.decidedById ? '2026-11-05T13:00:00.000Z' : null,
    ],
  )
}

/**
 * Cria o cenário compartilhado pelos testes: um serviço, um veículo, um
 * motorista, quatro solicitações do SOLICITANTE (incluindo uma agendada com
 * viagem e outra agendada sem viagem) e uma solicitação de outro usuário.
 *
 * Todos os dados são 100% fictícios, conforme a LGPD e o sigilo do SVO.
 */
async function seedRequestFixtures(
  databasePool: Pool,
  users: Map<UserRole, RbacTestUser>,
): Promise<RequestFixtures> {
  const solicitante = users.get('SOLICITANTE')
  const gestor = users.get('GESTOR')
  if (!solicitante || !gestor) {
    throw new Error('Fixture RBAC incompleta para os perfis SOLICITANTE e GESTOR.')
  }

  const serviceId = await insertReturningId(
    `INSERT INTO fleet.services (name, description)
     VALUES ('Transporte Administrativo', 'Serviço fictício para testes de integração.')
     RETURNING id::text AS id`,
    [],
  )

  const vehicleId = await insertReturningId(
    `INSERT INTO fleet.vehicles
       (license_plate, categories, seats, body_limit, operation_type, status, brand, model)
     VALUES ('ABC1D23', ARRAY['PASSENGER']::TEXT[], 5, 0, 'ADMINISTRATIVE', 'AVAILABLE', 'Chevrolet', 'S10')
     RETURNING id::text AS id`,
    [],
  )

  const driverId = await insertReturningId(
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at)
     VALUES ('Motorista Fictício QA', '12345678901', 'CNH-FICT-0001', 'D', '2030-12-31')
     RETURNING id::text AS id`,
    [],
  )

  const pending = await insertRequest({
    requesterId: solicitante.id,
    serviceId,
    requestedDate: '2026-11-01',
    requestedTime: '08:00:00',
    status: 'PENDING',
  })

  const approved = await insertRequest({
    requesterId: solicitante.id,
    serviceId,
    requestedDate: '2026-11-15',
    requestedTime: '09:00:00',
    status: 'APPROVED',
    decidedById: gestor.id,
  })

  const scheduledWithTrip = await insertRequest({
    requesterId: solicitante.id,
    serviceId,
    requestedDate: '2026-11-30',
    requestedTime: '10:00:00',
    status: 'SCHEDULED',
    decidedById: gestor.id,
  })

  const scheduledWithoutTrip = await insertRequest({
    requesterId: solicitante.id,
    serviceId,
    requestedDate: '2026-11-30',
    requestedTime: '11:00:00',
    status: 'SCHEDULED',
    decidedById: gestor.id,
  })

  const otherRequester = await insertRequest({
    requesterId: gestor.id,
    serviceId,
    requestedDate: '2026-11-15',
    requestedTime: '12:00:00',
    status: 'PENDING',
  })

  await databasePool.query(
    `INSERT INTO trip.trips
       (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status)
     VALUES ($1, $2, $3, '2026-11-30T11:00:00.000Z', '2026-11-30T15:00:00.000Z', 'SCHEDULED')`,
    [scheduledWithTrip, vehicleId, driverId],
  )

  return { pending, approved, scheduledWithTrip, scheduledWithoutTrip, otherRequester }
}

function request(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

test('IT-REQ-01: sem token retorna 401', async () => {
  const response = await request('/requests')

  assert.equal(response.status, 401)
})

test('IT-REQ-02: MOTORISTA recebe 403 ao consultar solicitações', async () => {
  const motorista = getUser('MOTORISTA')
  const response = await request('/requests', motorista.token)

  assert.equal(response.status, 403)
})

test('IT-REQ-03: SOLICITANTE lista apenas as próprias solicitações', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await request('/requests', solicitante.token)

  assert.equal(response.status, 200)
  const body = await response.json() as {
    requests: Array<{ requesterId: string }>
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  assert.equal(body.total, 4)
  assert.equal(body.requests.length, 4)
  assert.equal(body.page, 1)
  assert.equal(body.pageSize, 20)
  assert.equal(body.totalPages, 1)
  assert.ok(body.requests.every((item) => item.requesterId === solicitante.id))
})

test('IT-REQ-04: GESTOR e ADMINISTRADOR listam todas as solicitações', async () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const user = getUser(role)
    const response = await request('/requests', user.token)

    assert.equal(response.status, 200)
    const body = await response.json() as { total: number }
    assert.equal(body.total, 5, `Perfil ${role} deve enxergar todas as solicitações.`)
  }
})

test('IT-REQ-05: filtro por situação retorna somente o status pedido', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?status=APPROVED', gestor.token)

  assert.equal(response.status, 200)
  const body = await response.json() as {
    requests: Array<{ id: string; status: string }>
    total: number
  }
  assert.equal(body.total, 1)
  assert.equal(body.requests[0]?.id, fixtures.approved)
  assert.equal(body.requests[0]?.status, 'APPROVED')
})

test('IT-REQ-06: filtro por período é inclusivo nos dois limites', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?from=2026-11-01&to=2026-11-15', gestor.token)

  assert.equal(response.status, 200)
  const body = await response.json() as { requests: Array<{ id: string }>; total: number }
  assert.equal(body.total, 3)
  const returnedIds = body.requests.map((item) => item.id)
  assert.deepEqual(
    new Set(returnedIds),
    new Set([fixtures.pending, fixtures.approved, fixtures.otherRequester]),
  )
})

test('IT-REQ-07: período invertido retorna 400', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?from=2026-11-30&to=2026-11-01', gestor.token)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    erro: 'A data inicial não pode ser posterior à data final.',
  })
})

test('IT-REQ-08: situação desconhecida retorna 400', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?status=APROVADA', gestor.token)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { erro: 'Situação da solicitação inválida.' })
})

test('IT-REQ-09: paginação inválida retorna 400', async () => {
  const gestor = getUser('GESTOR')

  const invalidPage = await request('/requests?page=0', gestor.token)
  assert.equal(invalidPage.status, 400)
  assert.deepEqual(await invalidPage.json(), { erro: 'Página inválida.' })

  const invalidPageSize = await request('/requests?pageSize=101', gestor.token)
  assert.equal(invalidPageSize.status, 400)
  assert.deepEqual(await invalidPageSize.json(), {
    erro: 'O tamanho da página deve estar entre 1 e 100.',
  })
})

test('IT-REQ-10: paginação retorna a página e os metadados corretos', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?page=2&pageSize=2', gestor.token)

  assert.equal(response.status, 200)
  const body = await response.json() as {
    requests: Array<{ id: string }>
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  assert.equal(body.total, 5)
  assert.equal(body.page, 2)
  assert.equal(body.pageSize, 2)
  assert.equal(body.totalPages, 3)
  assert.equal(body.requests.length, 2)
  assert.deepEqual(
    body.requests.map((item) => item.id),
    [fixtures.otherRequester, fixtures.approved],
  )
})

test('IT-REQ-11: lista vazia retorna 200 com requests vazio e total zero', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests?status=REJECTED', gestor.token)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    requests: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })
})

test('IT-REQ-12: SOLICITANTE consulta o detalhe da própria solicitação', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await request(`/requests/${fixtures.pending}`, solicitante.token)

  assert.equal(response.status, 200)
  const body = await response.json() as {
    id: string
    requesterId: string
    requestedDate: string
    requestedTime: string
    status: string
    trip: unknown
  }
  assert.equal(body.id, fixtures.pending)
  assert.equal(body.requesterId, solicitante.id)
  assert.equal(body.requestedDate, '2026-11-01')
  assert.equal(body.requestedTime, '08:00')
  assert.equal(body.status, 'PENDING')
  assert.equal(body.trip, null)
})

test('IT-REQ-13: detalhe de solicitação de outra pessoa retorna 404 sem revelar existência', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await request(`/requests/${fixtures.otherRequester}`, solicitante.token)

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), EXPECTED_NOT_FOUND_BODY)
})

test('IT-REQ-14: GESTOR consulta o detalhe de qualquer solicitação', async () => {
  const gestor = getUser('GESTOR')
  const response = await request(`/requests/${fixtures.pending}`, gestor.token)

  assert.equal(response.status, 200)
  const body = await response.json() as { id: string; requesterId: string }
  assert.equal(body.id, fixtures.pending)
})

test('IT-REQ-15: identificador inválido retorna 400', async () => {
  const gestor = getUser('GESTOR')
  const response = await request('/requests/abc', gestor.token)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    erro: 'Identificador de solicitação inválido.',
  })
})

test('IT-REQ-16: detalhe de solicitação agendada inclui veículo, motorista e horários', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await request(`/requests/${fixtures.scheduledWithTrip}`, solicitante.token)

  assert.equal(response.status, 200)
  const body = await response.json() as {
    status: string
    trip: {
      status: string
      scheduledStart: string
      scheduledEnd: string
      vehicle: { licensePlate: string; brand: string; model: string }
      driver: { name: string }
    } | null
  }
  assert.equal(body.status, 'SCHEDULED')
  assert.ok(body.trip)
  assert.equal(body.trip.status, 'SCHEDULED')
  assert.equal(body.trip.scheduledStart, '2026-11-30T11:00:00.000Z')
  assert.equal(body.trip.scheduledEnd, '2026-11-30T15:00:00.000Z')
  assert.equal(body.trip.vehicle.licensePlate, 'ABC1D23')
  assert.equal(body.trip.vehicle.brand, 'Chevrolet')
  assert.equal(body.trip.vehicle.model, 'S10')
  assert.equal(body.trip.driver.name, 'Motorista Fictício QA')
})

test('IT-REQ-17: solicitação agendada sem viagem retorna trip null', async () => {
  const solicitante = getUser('SOLICITANTE')
  const response = await request(`/requests/${fixtures.scheduledWithoutTrip}`, solicitante.token)

  assert.equal(response.status, 200)
  const body = await response.json() as { status: string; trip: unknown }
  assert.equal(body.status, 'SCHEDULED')
  assert.equal(body.trip, null)
})
