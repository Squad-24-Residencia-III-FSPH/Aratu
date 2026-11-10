import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { createApp } from '../src/app'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { AuditRepository } from '../src/repositories/audit.repository'
import { currentFsphDate } from '../src/services/drivers.service'
import { addDaysToIsoDate } from '../src/services/vehicle-documents.service'
import type { UserRole } from '../src/types/auth'
import type { Vehicle, VehicleActorSnapshot } from '../src/types/vehicle.types'
import type {
  VehicleDocument,
  VehicleDocumentDetail,
  VehicleDocumentList,
} from '../src/types/vehicle-document.types'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { RBAC_JWT_CONFIG, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import type { RbacTestUser } from './fixtures/rbac-users.fixture'

let pool: Pool
let server: Server
let baseUrl: string
let users: Map<UserRole, RbacTestUser>
let failAudit = false
let vehicleSequence = 0

const metadata = {
  reportedBy: 'Setor de Patrimônio Fictício QA por e-mail',
  reason: 'Controle fictício de documentação veicular',
}

type DocResponse = Omit<VehicleDocument, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
type DocDetailResponse = Omit<VehicleDocumentDetail, 'createdAt' | 'updatedAt' | 'events'> & {
  createdAt: string
  updatedAt: string
  events: Array<{
    id: string
    eventType: string
    occurredAt: string
    registeredAt: string
    reportedBy: string
    reason: string
    actor: Record<string, unknown>
    before: DocResponse | null
    after: DocResponse
  }>
}
type RequestOptions = { body?: unknown; role?: UserRole | null }
type StoredEvent = {
  id: string
  event_type: string
  registered_by: string
  actor_snapshot: VehicleActorSnapshot
  before_state: DocResponse | null
  after_state: DocResponse
}
type StoredAudit = {
  id: string
  user_id: string
  table_name: string
  operation: string
  before: DocResponse | null
  after: DocResponse
  actor_snapshot: VehicleActorSnapshot
}

async function api(path: string, method = 'GET', options: RequestOptions = {}): Promise<Response> {
  const role = options.role === undefined ? 'GESTOR' : options.role
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { Authorization: `Bearer ${users.get(role)!.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}

async function json<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body as T
}

async function expectError(response: Response, status: number, message: RegExp): Promise<void> {
  const body = await json<{ erro: string }>(response, status)
  assert.deepEqual(Object.keys(body), ['erro'])
  assert.match(body.erro, message)
  assert.doesNotMatch(body.erro, /SELECT|INSERT|UPDATE|stack|postgres|example\.test|at \w+\./i)
}

async function createVehicle(status: Vehicle['status'] = 'AVAILABLE'): Promise<Vehicle> {
  const created = await json<Vehicle>(
    await api('/vehicles', 'POST', {
      body: {
        ...metadata,
        licensePlate: `DOC${++vehicleSequence}A67`,
        brand: 'Marca Fictícia',
        model: 'Van QA Fictícia',
        year: 2025,
        vehicleType: 'VAN',
        ownership: 'OWNED',
        categories: ['PASSENGER'],
        seats: 12,
        bodyLimit: 0,
        weightLimit: null,
        operationType: 'ADMINISTRATIVE',
      },
    }),
    201,
  )
  if (status !== 'AVAILABLE') {
    return json<Vehicle>(
      await api(`/vehicles/${created.id}/status`, 'PATCH', {
        body: { ...metadata, expectedRevision: created.revision, status },
      }),
    )
  }
  return created
}

async function ledger() {
  const [docs, events, audits] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `SELECT id, vehicle_id, document_type, document_number, issued_at::text AS issued_at,
              expires_at::text AS expires_at, notes, supersedes_id, is_annulled,
              annulment_reason, revision, updated_at
         FROM fleet.vehicle_documents ORDER BY id`,
    ),
    pool.query<StoredEvent>(
      'SELECT id, event_type, registered_by, actor_snapshot, before_state, after_state FROM fleet.vehicle_document_events ORDER BY id',
    ),
    pool.query<StoredAudit>(
      "SELECT id, user_id, table_name, operation, before, after, actor_snapshot FROM audit.logs WHERE table_name = 'fleet.vehicle_documents' ORDER BY id",
    ),
  ])
  return [docs.rows, events.rows, audits.rows] as const
}

before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  const audits = new AuditRepository(pool)
  server = createApp({
    pool,
    jwtConfig: RBAC_JWT_CONFIG,
    vehicleDocumentAlertDays: 30,
    audits: {
      async create(input, client) {
        if (failAudit && input.table === 'fleet.vehicle_documents') {
          throw new Error('Falha fictícia de auditoria QA')
        }
        return audits.create(input, client)
      },
    },
  }).listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(async () => {
  failAudit = false
  vehicleSequence = 0
  await truncateTestDatabase()
  await seedRolesAndPermissions(pool)
  users = await seedRbacTestUsers(pool)
})

after(async () => {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  } finally {
    await closeTestPool()
  }
})

test('IT-DOC-01: cadastro válido (201) grava documento, vehicle_snapshot, evento REGISTERED e audit.logs', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()
  const expiresAt = addDaysToIsoDate(today, 60)
  const issuedAt = addDaysToIsoDate(today, -5)

  const created = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        documentNumber: '000000000-FICT',
        issuedAt,
        expiresAt,
        notes: 'Observação fictícia QA',
      },
    }),
    201,
  )

  assert.equal(created.vehicleId, vehicle.id)
  assert.equal(created.vehicle.licensePlate, vehicle.licensePlate)
  assert.equal(created.documentType, 'CRLV')
  assert.equal(created.status, 'VALID')
  assert.equal(created.daysUntilExpiration, 60)
  assert.equal(created.revision, 1)
  assert.equal(created.vehicleSnapshot?.licensePlate, vehicle.licensePlate)

  const [docs, events, audits] = await ledger()
  assert.equal(docs.length, 1)
  assert.equal(events.length, 1)
  assert.equal(events[0]!.event_type, 'REGISTERED')
  assert.equal(events[0]!.before_state, null)
  assert.equal(events[0]!.after_state.id, created.id)
  assert.equal(audits.length, 1)
  assert.equal(audits[0]!.operation, 'REGISTERED')
})

test('IT-DOC-02: campos obrigatórios, regras de data (400) e permissão para documento já vencido (201 EXPIRED)', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()
  const validBody = {
    ...metadata,
    vehicleId: vehicle.id,
    documentType: 'CRLV',
    issuedAt: today,
    expiresAt: addDaysToIsoDate(today, 30),
  }

  const invalidCases: Array<[Record<string, unknown>, RegExp]> = [
    [{ vehicleId: undefined }, /identificador do veículo/i],
    [{ documentType: 'INVALIDO' }, /tipo de documento/i],
    [{ expiresAt: undefined }, /vencimento/i],
    [{ reportedBy: '   ' }, /reportedBy/i],
    [{ reason: '' }, /reason/i],
    [{ issuedAt: today, expiresAt: addDaysToIsoDate(today, -1) }, /anterior à emissão/i],
    [{ issuedAt: addDaysToIsoDate(today, 1), expiresAt: addDaysToIsoDate(today, 10) }, /no futuro/i],
    [{ documentType: 'OTHER', notes: null }, /observações/i],
  ]

  const before = await ledger()
  for (const [overrides, pattern] of invalidCases) {
    await expectError(
      await api('/vehicle-documents', 'POST', { body: { ...validBody, ...overrides } }),
      400,
      pattern,
    )
    assert.deepEqual(await ledger(), before)
  }

  const expiredDoc = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'IPVA',
        expiresAt: addDaysToIsoDate(today, -10),
      },
    }),
    201,
  )
  assert.equal(expiredDoc.status, 'EXPIRED')
  assert.equal(expiredDoc.daysUntilExpiration, -10)
})

test('IT-DOC-03: duplicidade bloqueada (409, D9) e liberada após anulação do anterior', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()
  const payload = {
    ...metadata,
    vehicleId: vehicle.id,
    documentType: 'LICENSING',
    expiresAt: addDaysToIsoDate(today, 90),
  }

  const first = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', { body: payload }),
    201,
  )
  const snapshotAfterFirst = await ledger()

  await expectError(
    await api('/vehicle-documents', 'POST', { body: payload }),
    409,
    /mesmo vencimento/i,
  )
  assert.deepEqual(await ledger(), snapshotAfterFirst)

  await json<DocResponse>(
    await api(`/vehicle-documents/${first.id}/annul`, 'PATCH', {
      body: { ...metadata, expectedRevision: first.revision, reason: 'Lançado em duplicidade' },
    }),
  )

  const second = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', { body: payload }),
    201,
  )
  assert.notEqual(second.id, first.id)
  assert.equal(second.status, 'VALID')
})

test('IT-DOC-04: cálculo das 5 situações e filtros em GET /vehicle-documents', async () => {
  const today = currentFsphDate()
  const v1 = await createVehicle()
  const v2 = await createVehicle()

  const toRenew = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: v1.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, -20),
      },
    }),
    201,
  )
  const validDoc = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: v1.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 60),
        supersedesId: toRenew.id,
      },
    }),
    201,
  )
  const expiringDoc = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: v1.id,
        documentType: 'INSURANCE',
        expiresAt: addDaysToIsoDate(today, 15),
      },
    }),
    201,
  )
  const expiredDoc = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: v2.id,
        documentType: 'IPVA',
        expiresAt: addDaysToIsoDate(today, -5),
      },
    }),
    201,
  )
  const toAnnul = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: v2.id,
        documentType: 'OTHER',
        notes: 'Autorização especial fictícia',
        expiresAt: addDaysToIsoDate(today, 45),
      },
    }),
    201,
  )
  const annulledDoc = await json<DocResponse>(
    await api(`/vehicle-documents/${toAnnul.id}/annul`, 'PATCH', {
      body: { ...metadata, expectedRevision: toAnnul.revision },
    }),
  )

  for (const [status, expectedId] of [
    ['VALID', validDoc.id],
    ['EXPIRING', expiringDoc.id],
    ['EXPIRED', expiredDoc.id],
    ['RENEWED', toRenew.id],
    ['ANNULLED', annulledDoc.id],
  ] as const) {
    const filtered = await json<VehicleDocumentList>(
      await api(`/vehicle-documents?status=${status}`),
    )
    assert.deepEqual(
      filtered.items.map((item) => item.id),
      [expectedId],
    )
    assert.equal(filtered.items[0]!.status, status)
  }

  const byVehicleAndType = await json<VehicleDocumentList>(
    await api(`/vehicle-documents?vehicleId=${v1.id}&documentType=CRLV`),
  )
  assert.deepEqual(
    byVehicleAndType.items.map((item) => item.id),
    [toRenew.id, validDoc.id],
  )
})

test('IT-DOC-05: alerta de vencimento (/expiring) respeita janela, ?days=, vencimento hoje e exclui veículo INACTIVE', async () => {
  const today = currentFsphDate()
  const activeVehicle = await createVehicle('AVAILABLE')
  const inactiveVehicle = await createVehicle('INACTIVE')

  const expiredActive = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: activeVehicle.id,
        documentType: 'IPVA',
        expiresAt: addDaysToIsoDate(today, -3),
      },
    }),
    201,
  )
  const dueToday = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: activeVehicle.id,
        documentType: 'CRLV',
        expiresAt: today,
      },
    }),
    201,
  )
  assert.equal(dueToday.status, 'EXPIRING')
  assert.equal(dueToday.daysUntilExpiration, 0)

  const dueIn10 = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: activeVehicle.id,
        documentType: 'INSURANCE',
        expiresAt: addDaysToIsoDate(today, 10),
      },
    }),
    201,
  )
  await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: activeVehicle.id,
        documentType: 'LEASE_CONTRACT',
        expiresAt: addDaysToIsoDate(today, 90),
      },
    }),
    201,
  )
  await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: inactiveVehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, -15),
      },
    }),
    201,
  )

  const defaultExpiring = await json<VehicleDocumentList>(await api('/vehicle-documents/expiring'))
  assert.equal(defaultExpiring.alertDays, 30)
  assert.deepEqual(
    defaultExpiring.items.map((item) => item.id),
    [expiredActive.id, dueToday.id, dueIn10.id],
  )

  const shortWindow = await json<VehicleDocumentList>(
    await api('/vehicle-documents/expiring?days=5'),
  )
  assert.equal(shortWindow.alertDays, 5)
  assert.deepEqual(
    shortWindow.items.map((item) => item.id),
    [expiredActive.id, dueToday.id],
  )

  for (const query of ['days=0', 'days=366', 'days=abc', 'days=10&days=20']) {
    await expectError(await api(`/vehicle-documents/expiring?${query}`), 400, /days/i)
  }
})

test('IT-DOC-06: fluxo completo de renovação encadeada (D3, D12, D13, D16)', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()

  const docA = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, -10),
      },
    }),
    201,
  )

  const docR = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 20),
        supersedesId: docA.id,
      },
    }),
    201,
  )
  assert.equal(docR.supersedesId, docA.id)

  const afterR = await json<DocDetailResponse>(await api(`/vehicle-documents/${docA.id}`))
  assert.equal(afterR.status, 'RENEWED')
  assert.equal(afterR.supersededById, docR.id)

  await expectError(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 200),
        supersedesId: docA.id,
      },
    }),
    409,
    /já foi renovado/i,
  )

  const docR3 = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 360),
        supersedesId: docR.id,
      },
    }),
    201,
  )

  await expectError(
    await api(`/vehicle-documents/${docR.id}/annul`, 'PATCH', {
      body: { ...metadata, expectedRevision: docR.revision },
    }),
    409,
    /anule primeiro a renovação mais recente/i,
  )

  await json<DocResponse>(
    await api(`/vehicle-documents/${docR3.id}/annul`, 'PATCH', {
      body: { ...metadata, expectedRevision: docR3.revision },
    }),
  )
  assert.equal((await json<DocDetailResponse>(await api(`/vehicle-documents/${docR.id}`))).status, 'EXPIRING')

  await json<DocResponse>(
    await api(`/vehicle-documents/${docR.id}/annul`, 'PATCH', {
      body: { ...metadata, expectedRevision: docR.revision },
    }),
  )
  assert.equal((await json<DocDetailResponse>(await api(`/vehicle-documents/${docA.id}`))).status, 'EXPIRED')

  const expiring = await json<VehicleDocumentList>(await api('/vehicle-documents/expiring'))
  assert.deepEqual(
    expiring.items.map((item) => item.id),
    [docA.id],
  )
})

test('IT-DOC-07: edição com revisão otimista (PUT), linha do tempo sem e-mail (LGPD) e imutabilidade append-only', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()

  const created = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'INSURANCE',
        documentNumber: 'APOLICE-01',
        expiresAt: addDaysToIsoDate(today, 40),
      },
    }),
    201,
  )

  const updated = await json<DocResponse>(
    await api(`/vehicle-documents/${created.id}`, 'PUT', {
      body: {
        ...metadata,
        expectedRevision: 1,
        documentNumber: 'APOLICE-01-REV',
        expiresAt: addDaysToIsoDate(today, 50),
        notes: 'Apólice endossada',
      },
    }),
  )
  assert.equal(updated.revision, 2)
  assert.equal(updated.documentNumber, 'APOLICE-01-REV')
  assert.equal(updated.notes, 'Apólice endossada')

  await expectError(
    await api(`/vehicle-documents/${created.id}`, 'PUT', {
      body: { ...metadata, expectedRevision: 1, notes: 'Tentativa obsoleta' },
    }),
    409,
    /alterado por outra operação/i,
  )

  const detail = await json<DocDetailResponse>(await api(`/vehicle-documents/${created.id}`))
  assert.deepEqual(
    detail.events.map((event) => event.eventType),
    ['UPDATED', 'REGISTERED'],
  )
  for (const event of detail.events) {
    assert.deepEqual(Object.keys(event.actor).sort(), ['id', 'name', 'role'])
  }

  await assert.rejects(
    pool.query('UPDATE fleet.vehicle_document_events SET reason = $1 WHERE vehicle_document_id = $2', [
      'Adulteração fictícia',
      created.id,
    ]),
    /append-only/,
  )
  await assert.rejects(
    pool.query('DELETE FROM fleet.vehicle_document_events WHERE vehicle_document_id = $1', [
      created.id,
    ]),
    /append-only/,
  )
})

test('IT-DOC-08: falha de auditoria desfaz criação, edição e anulação por completo (rollback transacional)', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()
  const initialLedger = await ledger()

  failAudit = true
  await expectError(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 45),
      },
    }),
    500,
    /^Erro interno do servidor\.$/,
  )
  assert.deepEqual(await ledger(), initialLedger)

  failAudit = false
  const created = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 45),
      },
    }),
    201,
  )
  const savedLedger = await ledger()
  failAudit = true
  for (const [method, path, body] of [
    ['PUT', `/vehicle-documents/${created.id}`, {
      ...metadata, expectedRevision: 1, documentNumber: 'FICT-REV',
      expiresAt: addDaysToIsoDate(today, 60), notes: 'Retificação fictícia QA',
    }],
    ['PATCH', `/vehicle-documents/${created.id}/annul`, { ...metadata, expectedRevision: 1 }],
  ] as const) {
    await expectError(await api(path, method, { body }), 500, /^Erro interno do servidor\.$/)
    assert.deepEqual(await ledger(), savedLedger)
  }
})

test('IT-DOC-09: RBAC nas 6 rotas autoriza GESTOR/ADMINISTRADOR e nega demais perfis (403) e sem token (401)', async () => {
  const today = currentFsphDate()
  const vehicle = await createVehicle()
  const doc = await json<DocResponse>(
    await api('/vehicle-documents', 'POST', {
      role: 'ADMINISTRADOR',
      body: {
        ...metadata,
        vehicleId: vehicle.id,
        documentType: 'CRLV',
        expiresAt: addDaysToIsoDate(today, 60),
      },
    }),
    201,
  )

  for (const role of [null, 'SOLICITANTE', 'MOTORISTA', 'ATENDENTE_SVO', 'EQUIPE_SVO'] as const) {
    for (const [method, path, body] of [
      ['GET', '/vehicle-documents', undefined],
      ['GET', '/vehicle-documents/expiring', undefined],
      ['GET', `/vehicle-documents/${doc.id}`, undefined],
      [
        'POST',
        '/vehicle-documents',
        {
          ...metadata,
          vehicleId: vehicle.id,
          documentType: 'IPVA',
          expiresAt: addDaysToIsoDate(today, 30),
        },
      ],
      [
        'PUT',
        `/vehicle-documents/${doc.id}`,
        { ...metadata, expectedRevision: 1, notes: 'Tentativa sem permissão' },
      ],
      ['PATCH', `/vehicle-documents/${doc.id}/annul`, { ...metadata, expectedRevision: 1 }],
    ] as const) {
      const before = await ledger()
      await expectError(
        await api(path, method, { body, role }),
        role === null ? 401 : 403,
        /autenticação|acesso|permissão/i,
      )
      assert.deepEqual(await ledger(), before)
    }
  }
})

test('IT-DOC-10: conta desativada e perfil revogado perdem acesso nas 6 rotas com o token anterior', async () => {
  const vehicle = await createVehicle()
  const body = {
    ...metadata, vehicleId: vehicle.id, documentType: 'CRLV',
    expiresAt: addDaysToIsoDate(currentFsphDate(), 60),
  }
  const document = await json<DocResponse>(await api('/vehicle-documents', 'POST', { body }), 201)
  const endpoints = [
    ['GET', '/vehicle-documents', undefined],
    ['GET', '/vehicle-documents/expiring', undefined],
    ['GET', `/vehicle-documents/${document.id}`, undefined],
    ['POST', '/vehicle-documents', { ...body, documentType: 'IPVA' }],
    ['PUT', `/vehicle-documents/${document.id}`, { ...metadata, expectedRevision: 1, notes: 'QA' }],
    ['PATCH', `/vehicle-documents/${document.id}/annul`, { ...metadata, expectedRevision: 1 }],
  ] as const
  const savedLedger = await ledger()

  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const actor = users.get(role)!
    try {
      await pool.query('UPDATE auth.users SET active = false WHERE id = $1', [actor.id])
      for (const [method, path, payload] of endpoints) {
        await expectError(await api(path, method, { role, body: payload }), 401, /conta não está ativa/i)
        assert.deepEqual(await ledger(), savedLedger)
      }
      await pool.query('UPDATE auth.users SET active = true, role_id = $2 WHERE id = $1', [
        actor.id, users.get('SOLICITANTE')!.roleId,
      ])
      for (const [method, path, payload] of endpoints) {
        await expectError(await api(path, method, { role, body: payload }), 403, /perfil.*não autorizado/i)
        assert.deepEqual(await ledger(), savedLedger)
      }
    } finally {
      await pool.query('UPDATE auth.users SET active = true, role_id = $2 WHERE id = $1', [actor.id, actor.roleId])
    }
  }
})

test('IT-DOC-11: cadastros e renovações concorrentes produzem um sucesso e um conflito sem duplicar trilhas', async () => {
  const vehicle = await createVehicle()
  const today = currentFsphDate()
  const body = {
    ...metadata, vehicleId: vehicle.id, documentType: 'CRLV',
    expiresAt: addDaysToIsoDate(today, 60),
  }
  const creates = await Promise.all([api('/vehicle-documents', 'POST', { body }), api('/vehicle-documents', 'POST', { body })])
  assert.deepEqual(creates.map((response) => response.status).sort(), [201, 409])
  const created = await json<DocResponse>(creates.find((response) => response.status === 201)!, 201)
  await expectError(creates.find((response) => response.status === 409)!, 409, /mesmo vencimento/i)
  const firstLedger = await ledger()
  assert.deepEqual(firstLedger.map((rows) => rows.length), [1, 1, 1])

  const renewals = await Promise.all([90, 120].map((offset) => api('/vehicle-documents', 'POST', {
    body: { ...body, supersedesId: created.id, expiresAt: addDaysToIsoDate(today, offset) },
  })))
  assert.deepEqual(renewals.map((response) => response.status).sort(), [201, 409])
  const renewed = await json<DocResponse>(renewals.find((response) => response.status === 201)!, 201)
  await expectError(renewals.find((response) => response.status === 409)!, 409, /já foi renovado/i)
  assert.deepEqual((await ledger()).map((rows) => rows.length), [2, 2, 2])
  const previous = await json<DocDetailResponse>(await api(`/vehicle-documents/${created.id}`))
  assert.equal(previous.status, 'RENEWED')
  assert.equal(previous.supersededById, renewed.id)
})
