import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { DriversRepository } from '../src/repositories/drivers.repository'
import { AuditService } from '../src/services/audit.service'
import { DriversService } from '../src/services/drivers.service'
import { DriverServiceError } from '../src/types/driver.types'
import type {
  CreateDriverInput,
  Driver,
  DriverStatus,
  UpdateDriverInput,
} from '../src/types/driver.types'
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

function driverPayload(overrides: Partial<CreateDriverInput> = {}): CreateDriverInput {
  return {
    name: 'Motorista Fictício QA',
    cpf: '12345678909',
    cnhNumber: '00000000001',
    cnhCategory: 'D',
    cnhExpiresAt: '2099-12-31',
    phone: '(79) 90000-0000',
    reportedBy: 'Coordenação fictícia',
    reason: 'Cadastro inicial de teste',
    ...overrides,
  }
}

function updatePayload(
  expectedRevision: number,
  overrides: Partial<CreateDriverInput> = {},
): UpdateDriverInput {
  return {
    ...driverPayload(overrides),
    expectedRevision,
  }
}

function createAvailabilityService(): DriversService {
  return new DriversService(
    new DriversRepository(pool),
    new AuditService(new AuditRepository(pool)),
  )
}

async function createDriver(
  token: string,
  overrides: Partial<CreateDriverInput> = {},
): Promise<Driver> {
  const response = await api('/drivers', {
    method: 'POST',
    token,
    body: driverPayload(overrides),
  })
  assert.equal(response.status, 201)
  return (await response.json()) as Driver
}

async function changeStatus(
  token: string,
  driverId: string,
  status: DriverStatus,
  expectedRevision: number,
  reportedBy = 'Coordenação fictícia',
  reason = 'Mudança fictícia de situação',
): Promise<Driver> {
  const response = await api(`/drivers/${driverId}/status`, {
    method: 'PATCH',
    token,
    body: {
      status,
      expectedRevision,
      reportedBy,
      reason,
    },
  })
  assert.equal(response.status, 200)
  return (await response.json()) as Driver
}

async function countDriverRows(driverId: string): Promise<{ events: number; audits: number }> {
  const events = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.driver_events WHERE driver_id = $1',
    [driverId],
  )
  const audits = await pool.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM audit.logs WHERE table_name = 'fleet.drivers' AND record_id = $1",
    [driverId],
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

test('IT-DRV-01: cadastro válido com histórico e auditoria', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  assert.equal(driver.status, 'ACTIVE')
  assert.equal(driver.cnhExpiresAt, '2099-12-31')
  assert.equal(driver.revision, 1)
  assert.equal(driver.name, 'Motorista Fictício QA')
  assert.equal(driver.cpf, '12345678909')

  const events = await pool.query<{ event_type: string; reported_by: string; reason: string }>(
    'SELECT event_type, reported_by, reason FROM fleet.driver_events WHERE driver_id = $1 ORDER BY id ASC',
    [driver.id],
  )
  assert.deepEqual(events.rows, [
    {
      event_type: 'CREATED',
      reported_by: 'Coordenação fictícia',
      reason: 'Cadastro inicial de teste',
    },
  ])

  const audits = await pool.query<{ operation: string }>(
    "SELECT operation FROM audit.logs WHERE table_name = 'fleet.drivers' AND record_id = $1 ORDER BY id ASC",
    [driver.id],
  )
  assert.deepEqual(audits.rows.map((row) => row.operation), ['CREATE'])
})

test('IT-DRV-02: validação de CPF (formato, tamanho e dígitos verificadores)', async () => {
  const gestor = getUser('GESTOR')

  const invalidCpfs = [
    '123.456.789-09',
    '1234567890',
    '123456789012',
    '00000000000',
    '11111111111',
    '12345678900',
  ]

  for (const cpf of invalidCpfs) {
    const response = await api('/drivers', {
      method: 'POST',
      token: gestor.token,
      body: driverPayload({ cpf }),
    })
    assert.equal(response.status, 400, `CPF ${cpf} deveria ser rejeitado com 400.`)
    assert.deepEqual(await response.json(), {
      erro: 'CPF inválido. Informe os 11 dígitos, sem pontuação.',
    })
  }

  const count = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.drivers',
  )
  assert.equal(count.rows[0]?.total, 0)
})

test('IT-DRV-03: unicidade de CPF e conflito', async () => {
  const gestor = getUser('GESTOR')
  await createDriver(gestor.token, { cpf: '12345678909' })

  const duplicate = await api('/drivers', {
    method: 'POST',
    token: gestor.token,
    body: driverPayload({
      cpf: '12345678909',
      name: 'Outro Condutor Fictício',
      cnhNumber: '00000000002',
    }),
  })

  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { erro: 'CPF já cadastrado' })
})

test('IT-DRV-04: bloqueio de CNH vencida para situação ACTIVE', async () => {
  const gestor = getUser('GESTOR')
  const expiredPayload = driverPayload({ cnhExpiresAt: '2020-01-01' })

  const blocked = await api('/drivers', {
    method: 'POST',
    token: gestor.token,
    body: expiredPayload,
  })
  assert.equal(blocked.status, 422)
  assert.deepEqual(await blocked.json(), {
    erro: 'CNH vencida: renove a validade antes de deixar o motorista ativo.',
  })

  const awayDriver = await createDriver(gestor.token, {
    ...expiredPayload,
    status: 'AWAY',
  })
  assert.equal(awayDriver.status, 'AWAY')

  const activate = await api(`/drivers/${awayDriver.id}/status`, {
    method: 'PATCH',
    token: gestor.token,
    body: {
      status: 'ACTIVE',
      expectedRevision: awayDriver.revision,
      reportedBy: 'Coordenação fictícia',
      reason: 'Tentativa de reativar com CNH vencida',
    },
  })
  assert.equal(activate.status, 422)
  assert.deepEqual(await activate.json(), {
    erro: 'CNH vencida: renove a validade antes de deixar o motorista ativo.',
  })
})

test('IT-DRV-05: filtros de listagem e escape de caracteres curinga', async () => {
  const gestor = getUser('GESTOR')
  const driverActive = await createDriver(gestor.token, {
    name: 'Motorista Fictício QA',
    cpf: '12345678909',
    status: 'ACTIVE',
  })
  const driverAway = await createDriver(gestor.token, {
    name: 'Condutora Fictícia',
    cpf: '11144477735',
    status: 'AWAY',
  })

  const byName = await api('/drivers?name=motorista%20fict', { token: gestor.token })
  assert.equal(byName.status, 200)
  const nameList = (await byName.json()) as Driver[]
  assert.deepEqual(nameList.map((d) => d.id), [driverActive.id])

  const byStatus = await api('/drivers?status=AWAY', { token: gestor.token })
  assert.equal(byStatus.status, 200)
  const statusList = (await byStatus.json()) as Driver[]
  assert.deepEqual(statusList.map((d) => d.id), [driverAway.id])

  const percentFilter = await api('/drivers?name=%25', { token: gestor.token })
  assert.equal(percentFilter.status, 200)
  const percentList = (await percentFilter.json()) as Driver[]
  assert.equal(percentList.length, 0)

  const underscoreFilter = await api('/drivers?name=_', { token: gestor.token })
  assert.equal(underscoreFilter.status, 200)
  const underscoreList = (await underscoreFilter.json()) as Driver[]
  assert.equal(underscoreList.length, 0)

  const invalidStatus = await api('/drivers?status=INVALID_STATUS', { token: gestor.token })
  assert.equal(invalidStatus.status, 400)
  assert.deepEqual(await invalidStatus.json(), { erro: 'Situação de motorista inválida.' })
})

test('IT-DRV-06: consulta de detalhe por identificador e validação', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  const existing = await api(`/drivers/${driver.id}`, { token: gestor.token })
  assert.equal(existing.status, 200)
  const details = (await existing.json()) as Driver
  assert.equal(details.id, driver.id)
  assert.equal(details.cpf, driver.cpf)

  const missing = await api('/drivers/999999', { token: gestor.token })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { erro: 'Motorista não encontrado.' })

  const malformedAlpha = await api('/drivers/abc', { token: gestor.token })
  assert.equal(malformedAlpha.status, 400)
  assert.deepEqual(await malformedAlpha.json(), { erro: 'Identificador de motorista inválido.' })

  const malformedNegative = await api('/drivers/-1', { token: gestor.token })
  assert.equal(malformedNegative.status, 400)
  assert.deepEqual(await malformedNegative.json(), { erro: 'Identificador de motorista inválido.' })

  const malformedZero = await api('/drivers/0', { token: gestor.token })
  assert.equal(malformedZero.status, 400)
  assert.deepEqual(await malformedZero.json(), { erro: 'Identificador de motorista inválido.' })
})

test('IT-DRV-07: edição de motorista e concorrência otimista', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  const updateResponse = await api(`/drivers/${driver.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(driver.revision, {
      name: 'Motorista Atualizado Fictício',
      phone: '(79) 99999-8888',
      cnhCategory: 'E',
    }),
  })

  assert.equal(updateResponse.status, 200)
  const updated = (await updateResponse.json()) as Driver
  assert.equal(updated.name, 'Motorista Atualizado Fictício')
  assert.equal(updated.phone, '(79) 99999-8888')
  assert.equal(updated.cnhCategory, 'E')
  assert.equal(updated.revision, 2)

  const events = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM fleet.driver_events WHERE driver_id = $1 ORDER BY id ASC',
    [driver.id],
  )
  assert.deepEqual(events.rows.map((r) => r.event_type), ['CREATED', 'UPDATED'])

  const audits = await pool.query<{ operation: string }>(
    "SELECT operation FROM audit.logs WHERE table_name = 'fleet.drivers' AND record_id = $1 ORDER BY id ASC",
    [driver.id],
  )
  assert.deepEqual(audits.rows.map((r) => r.operation), ['CREATE', 'UPDATE'])

  const staleUpdate = await api(`/drivers/${driver.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(driver.revision, {
      name: 'Tentativa Conflitante',
    }),
  })
  assert.equal(staleUpdate.status, 409)
  assert.deepEqual(await staleUpdate.json(), {
    erro: 'O motorista foi alterado por outra operação. Atualize os dados e tente novamente.',
  })
})

test('IT-DRV-08: alteração de situação e idempotência do PATCH', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  const inactive = await changeStatus(
    gestor.token,
    driver.id,
    'INACTIVE',
    driver.revision,
    'Coordenação fictícia',
    'Desligamento de condutor',
  )
  assert.equal(inactive.status, 'INACTIVE')
  assert.equal(inactive.revision, 2)

  const countsAfterFirst = await countDriverRows(driver.id)
  assert.deepEqual(countsAfterFirst, { events: 2, audits: 2 })

  const idempotent = await api(`/drivers/${driver.id}/status`, {
    method: 'PATCH',
    token: gestor.token,
    body: {
      status: 'INACTIVE',
      expectedRevision: inactive.revision,
      reportedBy: 'Coordenação fictícia',
      reason: 'Mesma situação repetida',
    },
  })
  assert.equal(idempotent.status, 200)
  const idempotentDriver = (await idempotent.json()) as Driver
  assert.equal(idempotentDriver.status, 'INACTIVE')
  assert.equal(idempotentDriver.revision, 2)

  const countsAfterIdempotent = await countDriverRows(driver.id)
  assert.deepEqual(countsAfterIdempotent, { events: 2, audits: 2 })

  const events = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM fleet.driver_events WHERE driver_id = $1 ORDER BY id ASC',
    [driver.id],
  )
  assert.deepEqual(events.rows.map((r) => r.event_type), ['CREATED', 'STATUS_CHANGED'])

  const audits = await pool.query<{ operation: string }>(
    "SELECT operation FROM audit.logs WHERE table_name = 'fleet.drivers' AND record_id = $1 ORDER BY id ASC",
    [driver.id],
  )
  assert.deepEqual(audits.rows.map((r) => r.operation), ['CREATE', 'STATUS_CHANGE'])
})

test('IT-DRV-09: vínculo e desvinculação com conta de usuário', async () => {
  const gestor = getUser('GESTOR')
  const motoristaUser = getUser('MOTORISTA')
  const solicitanteUser = getUser('SOLICITANTE')

  const linked = await createDriver(gestor.token, {
    userId: motoristaUser.id,
  })
  assert.equal(linked.userId, motoristaUser.id)

  const invalidRole = await api('/drivers', {
    method: 'POST',
    token: gestor.token,
    body: driverPayload({
      cpf: '11144477735',
      userId: solicitanteUser.id,
    }),
  })
  assert.equal(invalidRole.status, 422)
  assert.deepEqual(await invalidRole.json(), {
    erro: 'A conta vinculada deve existir, estar ativa e ter o perfil MOTORISTA.',
  })

  const duplicateLink = await api('/drivers', {
    method: 'POST',
    token: gestor.token,
    body: driverPayload({
      cpf: '11144477735',
      userId: motoristaUser.id,
    }),
  })
  assert.equal(duplicateLink.status, 409)
  assert.deepEqual(await duplicateLink.json(), {
    erro: 'Esta conta já está vinculada a outro motorista.',
  })

  const unlinkedResponse = await api(`/drivers/${linked.id}`, {
    method: 'PUT',
    token: gestor.token,
    body: updatePayload(linked.revision, {
      userId: null,
    }),
  })
  assert.equal(unlinkedResponse.status, 200)
  const unlinked = (await unlinkedResponse.json()) as Driver
  assert.equal(unlinked.userId, null)
  assert.equal(unlinked.revision, 2)
})

test('IT-DRV-10: disponibilidade cadastral para alocação (FROTA-96)', async () => {
  const gestor = getUser('GESTOR')
  const availability = createAvailabilityService()

  const driver = await createDriver(gestor.token)
  assert.equal(await availability.isAvailableForAllocation(driver.id), true)

  const awayDriver = await changeStatus(gestor.token, driver.id, 'AWAY', driver.revision)
  assert.equal(await availability.isAvailableForAllocation(driver.id), false)

  const inactiveDriver = await changeStatus(
    gestor.token,
    driver.id,
    'INACTIVE',
    awayDriver.revision,
  )
  assert.equal(await availability.isAvailableForAllocation(driver.id), false)

  const expiredDriver = await createDriver(gestor.token, {
    cpf: '11144477735',
    cnhExpiresAt: '2020-01-01',
    status: 'AWAY',
  })
  assert.equal(await availability.isAvailableForAllocation(expiredDriver.id), false)

  await assert.rejects(
    availability.isAvailableForAllocation('999999'),
    (error: unknown) => error instanceof DriverServiceError && error.statusCode === 404,
  )

  await assert.rejects(
    availability.isAvailableForAllocation('abc'),
    (error: unknown) => error instanceof DriverServiceError && error.statusCode === 400,
  )
})

test('IT-DRV-11: matriz de autorização RBAC e autenticação', async () => {
  const anonymousGet = await api('/drivers')
  assert.equal(anonymousGet.status, 401)

  const anonymousPost = await api('/drivers', {
    method: 'POST',
    body: driverPayload(),
  })
  assert.equal(anonymousPost.status, 401)

  const forbiddenRoles = ['SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const
  for (const role of forbiddenRoles) {
    const token = getUser(role).token
    const getRes = await api('/drivers', { token })
    assert.equal(getRes.status, 403, `Perfil ${role} deveria receber 403 no GET.`)

    const postRes = await api('/drivers', {
      method: 'POST',
      token,
      body: driverPayload(),
    })
    assert.equal(postRes.status, 403, `Perfil ${role} deveria receber 403 no POST.`)
  }

  const allowedRoles = ['GESTOR', 'ADMINISTRADOR'] as const
  for (const role of allowedRoles) {
    const token = getUser(role).token
    const getRes = await api('/drivers', { token })
    assert.equal(getRes.status, 200, `Perfil ${role} deveria receber 200 no GET.`)
  }

  const gestorDriver = await createDriver(getUser('GESTOR').token, { cpf: '12345678909' })
  assert.equal(gestorDriver.revision, 1)

  const adminDriver = await createDriver(getUser('ADMINISTRADOR').token, {
    cpf: '11144477735',
    name: 'Condutor Administrador',
  })
  assert.equal(adminDriver.revision, 1)
})

test('IT-DRV-12: concorrência sob requisições paralelas (Locks com FOR UPDATE)', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  const [first, second] = await Promise.all([
    api(`/drivers/${driver.id}`, {
      method: 'PUT',
      token: gestor.token,
      body: updatePayload(driver.revision, { name: 'Atualização Paralela A' }),
    }),
    api(`/drivers/${driver.id}`, {
      method: 'PUT',
      token: gestor.token,
      body: updatePayload(driver.revision, { name: 'Atualização Paralela B' }),
    }),
  ])

  const statuses = [first.status, second.status].sort((a, b) => a - b)
  assert.deepEqual(statuses, [200, 409])

  const stored = await pool.query<{ revision: number }>(
    'SELECT revision FROM fleet.drivers WHERE id = $1',
    [driver.id],
  )
  assert.equal(stored.rows[0]?.revision, 2)
})

test('IT-DRV-13: atomicidade e rollback em falhas de transação', async () => {
  const gestor = getUser('GESTOR')
  await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [gestor.id])

  const response = await api('/drivers', {
    method: 'POST',
    token: gestor.token,
    body: driverPayload(),
  })

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    erro: 'Usuário autenticado não está ativo ou não existe.',
  })

  const drivers = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.drivers',
  )
  const events = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.driver_events',
  )
  const audits = await pool.query<{ total: number }>(
    "SELECT count(*)::int AS total FROM audit.logs WHERE table_name = 'fleet.drivers'",
  )
  assert.equal(drivers.rows[0]?.total, 0)
  assert.equal(events.rows[0]?.total, 0)
  assert.equal(audits.rows[0]?.total, 0)
})

test('IT-DRV-14: preservação histórica e ausência de exclusão física', async () => {
  const gestor = getUser('GESTOR')
  const driver = await createDriver(gestor.token)

  const response = await api(`/drivers/${driver.id}`, {
    method: 'DELETE',
    token: gestor.token,
  })
  assert.equal(response.status, 404)

  const stored = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM fleet.drivers WHERE id = $1',
    [driver.id],
  )
  assert.equal(stored.rows[0]?.total, 1)
})
