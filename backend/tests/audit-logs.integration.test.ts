import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp } from '../src/app'
import { RBAC_JWT_CONFIG, seedRbacTestUsers } from './fixtures/rbac-users.fixture'
import { closeTestPool, getTestPool, setupTestDatabase } from './helpers/db-test'

test('GET /audit-logs consulta o PostgreSQL com RBAC, paginação e projeção segura', async () => {
  await setupTestDatabase()
  const pool = getTestPool()
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /test/i)
  try {
    const users = await seedRbacTestUsers(pool)
    const gestor = users.get('GESTOR')!
    const entity = 'audit.qa_consulta'
    await pool.query('DELETE FROM audit.logs WHERE table_name = $1', [entity])
    await pool.query(`INSERT INTO audit.logs (user_id, table_name, operation, after, reason, registered_at)
      SELECT $1, $2, 'UPDATE', '{"cpf":"teste-sigiloso"}', 'teste-sigiloso',
        '2026-11-18T03:00:00Z'::timestamptz + n * interval '1 minute'
      FROM generate_series(0, 25) n`, [gestor.id, entity])

    const server = createApp({ pool, jwtConfig: RBAC_JWT_CONFIG }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/audit-logs'
      const query = new URLSearchParams({ inicio: '2026-11-18', fim: '2026-11-18', usuario_id: gestor.id, acao: 'UPDATE', entidade: entity })
      const get = (path: string, token?: string) => fetch(url + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      assert.equal((await get('?' + query)).status, 401)
      assert.equal((await get('?' + query, users.get('MOTORISTA')!.token)).status, 403)
      assert.equal((await get('?inicio=2026-02-30', gestor.token)).status, 400)

      const first = await get('?' + query, gestor.token)
      assert.equal(first.status, 200)
      assert.equal(first.headers.get('cache-control'), 'no-store')
      const text = await first.text()
      assert.doesNotMatch(text, /teste-sigiloso|password_hash/)
      const result = JSON.parse(text)
      assert.equal(result.total, 26)
      assert.equal(result.rows.length, 25)
      assert.equal(result.rows[0].created_at, '2026-11-18T03:25:00.000Z')
      assert.equal(result.rows[0].usuario, gestor.name)
      const second = await get('?' + query + '&page=2', users.get('ADMINISTRADOR')!.token)
      assert.equal(second.status, 200)
      const last = await second.json() as { rows: Array<{ created_at: string }>; total: number }
      assert.equal(last.total, 26)
      assert.equal(last.rows.length, 1)
      assert.equal(last.rows[0]?.created_at, '2026-11-18T03:00:00.000Z')

      const { readAuditLogs } = await import('../../frontend/src/services/auditLogs.ts')
      const frontendResult = await readAuditLogs(
        (path, options) => fetch(url.slice(0, -'/audit-logs'.length) + path, {
          ...options,
          headers: { Authorization: 'Bearer ' + gestor.token },
        }),
        { inicio: '2026-11-18', fim: '2026-11-18', usuario_id: gestor.id, acao: 'UPDATE', entidade: entity },
        2,
        new AbortController().signal,
      )
      assert.equal(frontendResult.total, 26)
      assert.equal(frontendResult.partial, false)
      assert.equal(frontendResult.rows[0]?.usuario, gestor.name)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await pool.query('DELETE FROM audit.logs WHERE table_name = $1', [entity])
    }
  } finally {
    await closeTestPool()
  }
})
