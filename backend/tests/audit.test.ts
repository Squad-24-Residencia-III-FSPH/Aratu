import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Pool, PoolClient, QueryResult } from 'pg'
import { createApp } from '../src/app'
import { AuditRepository } from '../src/repositories/audit.repository'
import { UsersRepository } from '../src/repositories/users.repository'
import { AuditService, createRecordAudit } from '../src/services/audit.service'
import { hashPassword } from '../src/services/password.service'
import type { UserForLogin } from '../src/types/auth'
import type {
  AuditEntry,
  AuditRepositoryContract,
  NormalizedCreateAuditInput,
} from '../src/types/audit.types'

const syntheticPassword = 'senha-sintetica-de-auditoria'
const jwtConfig = {
  secret: 'segredo-sintetico-de-teste-para-auditoria-aratu',
  expiresInSeconds: 28_800,
}
let passwordHash: string

before(async () => {
  passwordHash = await hashPassword(syntheticPassword)
})

function createInMemoryAuditRepo() {
  const entries: AuditEntry[] = []
  const clientsUsed: Array<PoolClient | undefined> = []

  const repository: AuditRepositoryContract = {
    async create(input: NormalizedCreateAuditInput, client?: PoolClient): Promise<AuditEntry> {
      clientsUsed.push(client)
      const entry: AuditEntry = {
        id: String(entries.length + 1),
        userId: input.userId,
        table: input.table,
        recordId: input.recordId,
        operation: input.operation,
        before: input.before,
        after: input.after,
        actorSnapshot: input.actorSnapshot,
        reason: input.reason,
        registeredAt: new Date('2026-10-17T12:00:00.000Z'),
      }
      entries.push(entry)
      return entry
    },
  }

  return { entries, clientsUsed, repository }
}

test('T01: AuditService e createRecordAudit normalizam campos, higienizam senhas e repassam ao repositório', async () => {
  const { entries, repository } = createInMemoryAuditRepo()
  const recordAudit = createRecordAudit(repository)

  const created = await recordAudit({
    userId: 42,
    table: '  fleet.vehicles ',
    recordId: 105,
    operation: '  UPDATE ',
    before: { identification: 'VTR-01', seats: 4, password: 'vazar-jamais' },
    after: { identification: 'VTR-01', seats: 5, password_hash: 'hash-secreto' },
    actorSnapshot: {
      id: '42',
      email: 'gestor.sintetico@example.test',
      role: 'GESTOR',
      senha: 'ocultar',
    },
    reason: '  Ajuste de capacidade da viatura ',
  })

  assert.equal(entries.length, 1)
  assert.equal(created.id, '1')
  assert.equal(created.userId, '42')
  assert.equal(created.table, 'fleet.vehicles')
  assert.equal(created.recordId, '105')
  assert.equal(created.operation, 'UPDATE')
  assert.deepEqual(created.before, { identification: 'VTR-01', seats: 4 })
  assert.deepEqual(created.after, { identification: 'VTR-01', seats: 5 })
  assert.deepEqual(created.actorSnapshot, {
    id: '42',
    email: 'gestor.sintetico@example.test',
    role: 'GESTOR',
  })
  assert.equal(created.reason, 'Ajuste de capacidade da viatura')
})

test('T02: AuditService rejeita tabela ou operação em branco sem acionar o repositório', async () => {
  const { entries, repository } = createInMemoryAuditRepo()
  const service = new AuditService(repository)

  await assert.rejects(
    service.recordAudit({ table: '   ', operation: 'CREATE' }),
    /tabela\/entidade auditada é obrigatória/,
  )
  await assert.rejects(
    service.recordAudit({ table: 'auth.users', operation: '   ' }),
    /operação auditada é obrigatória/,
  )
  assert.equal(entries.length, 0)
})

test('T03: AuditRepository executa INSERT parametrizado via Pool ou PoolClient transacional e projeta camelCase', async () => {
  let poolCalled = false
  let capturedClientSql = ''
  let capturedClientValues: unknown[] = []

  const fakePool = {
    query: async () => {
      poolCalled = true
      throw new Error('O pool global não deveria ser chamado quando um PoolClient é fornecido.')
    },
  } as unknown as Pool

  const fakeClient = {
    query: async (sql: string, values: unknown[]): Promise<QueryResult> => {
      capturedClientSql = sql
      capturedClientValues = values
      return {
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            id: '99',
            userId: '7',
            table: 'trip.trips',
            recordId: '500',
            operation: 'STATUS_CHANGE',
            before: { state: 'PLANNED' },
            after: { state: 'IN_PROGRESS' },
            actorSnapshot: { id: '7', role: 'MOTORISTA' },
            reason: 'Saída da viatura registrada',
            registeredAt: '2026-10-17T14:30:00.000Z',
          },
        ],
      }
    },
  } as unknown as PoolClient

  const repo = new AuditRepository(fakePool)
  const entry = await repo.create(
    {
      userId: '7',
      table: 'trip.trips',
      recordId: '500',
      operation: 'STATUS_CHANGE',
      before: { state: 'PLANNED' },
      after: { state: 'IN_PROGRESS' },
      actorSnapshot: { id: '7', role: 'MOTORISTA' },
      reason: 'Saída da viatura registrada',
    },
    fakeClient,
  )

  assert.equal(poolCalled, false)
  assert.match(capturedClientSql, /INSERT INTO audit\.logs/i)
  assert.match(capturedClientSql, /id::text AS id/)
  assert.equal(capturedClientSql.includes('*'), false)
  assert.deepEqual(capturedClientValues, [
    '7',
    'trip.trips',
    '500',
    'STATUS_CHANGE',
    JSON.stringify({ state: 'PLANNED' }),
    JSON.stringify({ state: 'IN_PROGRESS' }),
    JSON.stringify({ id: '7', role: 'MOTORISTA' }),
    'Saída da viatura registrada',
  ])
  assert.equal(entry.id, '99')
  assert.equal(entry.userId, '7')
  assert.equal(entry.table, 'trip.trips')
  assert.equal(entry.recordId, '500')
  assert.equal(entry.operation, 'STATUS_CHANGE')
  assert.equal(entry.registeredAt instanceof Date, true)
})

test('UsersRepository consulta a tabela padronizada auth.users com projeção explícita', async () => {
  let executedSql = ''
  let executedParams: unknown[] = []

  const fakePool = {
    query: async (sql: string, params: unknown[]) => {
      executedSql = sql
      executedParams = params
      return {
        rows: [
          {
            id: '10',
            name: 'Servidor Fictício',
            email: 'servidor@example.test',
            password_hash: passwordHash,
            role: 'SOLICITANTE',
            is_active: true,
          },
        ],
      }
    },
  } as unknown as Pool

  const usersRepo = new UsersRepository(fakePool)
  const found = await usersRepo.findByEmail('servidor@example.test')

  assert.match(executedSql, /FROM auth\.users/i)
  assert.match(executedSql, /id::text AS id/)
  assert.deepEqual(executedParams, ['servidor@example.test'])
  assert.equal(found?.id, '10')
  assert.equal(found?.role, 'SOLICITANTE')
})

function buildSyntheticUser(overrides: Partial<UserForLogin> = {}): UserForLogin {
  return {
    id: '15',
    name: 'Motorista Sintético FSPH',
    email: 'motorista.auditoria@example.test',
    password_hash: passwordHash,
    roleId: '4',
    role: 'MOTORISTA',
    is_active: true,
    ...overrides,
  }
}

test('T04 e T05: Rotas /auth/login e /auth/logout gravam trilha completa em audit.logs sem expor senhas', async () => {
  const { entries, repository: audits } = createInMemoryAuditRepo()
  const users = {
    findByEmail: async (email: string): Promise<UserForLogin | null> => {
      if (email === 'motorista.auditoria@example.test') return buildSyntheticUser()
      if (email === 'inativo.auditoria@example.test') {
        return buildSyntheticUser({
          id: '16',
          email: 'inativo.auditoria@example.test',
          is_active: false,
        })
      }
      return null
    },
  }

  const app = createApp({ users, audits, jwtConfig })
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  try {
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`

    // 1. Login com e-mail inexistente -> LOGIN_FAILURE (User not found)
    const resUnknown = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'desconhecido@example.test', senha: syntheticPassword }),
    })
    assert.equal(resUnknown.status, 401)

    // 2. Login com senha incorreta -> LOGIN_FAILURE (Invalid password)
    const resWrongPass = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'motorista.auditoria@example.test',
        senha: 'senha-errada-ficticia',
      }),
    })
    assert.equal(resWrongPass.status, 401)

    // 3. Login de conta inativa -> LOGIN_INACTIVE
    const resInactive = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'inativo.auditoria@example.test',
        senha: syntheticPassword,
      }),
    })
    assert.equal(resInactive.status, 403)

    // 4. Login com sucesso -> LOGIN_SUCCESS
    const resSuccess = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'MOTORISTA.AUDITORIA@example.test',
        senha: syntheticPassword,
      }),
    })
    assert.equal(resSuccess.status, 200)
    const { token } = (await resSuccess.json()) as { token: string }

    // 5. Logout autenticado -> LOGOUT
    const resLogout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(resLogout.status, 200)

    assert.equal(entries.length, 5)

    assert.equal(entries[0]?.operation, 'LOGIN_FAILURE')
    assert.equal(entries[0]?.userId, null)
    assert.equal(entries[0]?.recordId, null)
    assert.equal(entries[0]?.reason, 'User not found')
    assert.deepEqual(entries[0]?.actorSnapshot, { email: 'desconhecido@example.test' })

    assert.equal(entries[1]?.operation, 'LOGIN_FAILURE')
    assert.equal(entries[1]?.userId, '15')
    assert.equal(entries[1]?.recordId, '15')
    assert.equal(entries[1]?.reason, 'Invalid password')

    assert.equal(entries[2]?.operation, 'LOGIN_INACTIVE')
    assert.equal(entries[2]?.userId, '16')
    assert.equal(entries[2]?.recordId, '16')
    assert.equal(entries[2]?.reason, 'Inactive user account')

    assert.equal(entries[3]?.operation, 'LOGIN_SUCCESS')
    assert.equal(entries[3]?.userId, '15')
    assert.equal(entries[3]?.recordId, '15')
    assert.deepEqual(entries[3]?.actorSnapshot, {
      id: '15',
      email: 'motorista.auditoria@example.test',
      role: 'MOTORISTA',
    })

    assert.equal(entries[4]?.operation, 'LOGOUT')
    assert.equal(entries[4]?.userId, '15')
    assert.equal(entries[4]?.recordId, '15')
    assert.deepEqual(entries[4]?.actorSnapshot, {
      id: '15',
      role: 'MOTORISTA',
    })

    const serializedAuditLog = JSON.stringify(entries)
    assert.equal(serializedAuditLog.includes(syntheticPassword), false)
    assert.equal(serializedAuditLog.includes(passwordHash), false)
    assert.equal(serializedAuditLog.includes('senha-errada-ficticia'), false)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }
})
