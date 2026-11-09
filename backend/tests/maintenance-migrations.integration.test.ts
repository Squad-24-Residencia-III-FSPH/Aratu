import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import type { PoolClient } from 'pg'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { closeTestPool, getTestPool, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'

const MIGRATION = '202611030002_extend_maintenance_orders'
let upSql: string
let downSql: string
before(async () => {
  await setupTestDatabase()
  const directory = path.resolve(__dirname, '../src/database/migrations')
  ;[upSql, downSql] = await Promise.all([
    fs.readFile(path.join(directory, `${MIGRATION}.sql`), 'utf8'),
    fs.readFile(path.join(directory, `${MIGRATION}.down.sql`), 'utf8'),
  ])
})
beforeEach(async () => { await truncateTestDatabase(); await seedRolesAndPermissions(getTestPool()) })
after(closeTestPool)

async function fixture(client: PoolClient): Promise<{ vehicleId: string; actorId: string }> {
  const actor = await client.query<{ id: string }>(`INSERT INTO auth.users (name, email, password_hash, role_id)
    SELECT $1, $2, $3, id FROM auth.roles WHERE name = $4 RETURNING id::text AS id`,
  ['Gestora Fictícia Migração', 'migration@example.test', 'hash-ficticio', 'GESTOR'])
  const vehicle = await client.query<{ id: string }>(`INSERT INTO fleet.vehicles
    (license_plate, categories, seats, body_limit, operation_type)
    VALUES ($1, ARRAY['PASSENGER']::text[], 4, 0, 'ADMINISTRATIVE') RETURNING id::text AS id`, ['QAM6A59'])
  return { vehicleId: vehicle.rows[0]!.id, actorId: actor.rows[0]!.id }
}
async function order(client: PoolClient, vehicleId: string, actorId: string, blocks = false): Promise<string> {
  const result = await client.query<{ id: string }>(`INSERT INTO fleet.maintenance_orders
    (vehicle_id, type, description, status, blocks_vehicle, cost, opened_at, closed_at, created_by)
    VALUES ($1, 'PREVENTIVE', $2, $3, $4, $5, '2026-10-01T12:00:00Z', $6, $7) RETURNING id::text AS id`,
  [vehicleId, 'Ordem legada fictícia', blocks ? 'OPEN' : 'DONE', blocks, blocks ? null : '123.45',
    blocks ? null : '2026-10-02T12:00:00Z', actorId])
  return result.rows[0]!.id
}
/** Restaura o schema mesmo após DDL recusado, sem acessar a base operacional. */
async function withMigration(work: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await getTestPool().connect()
  try { await work(client) } finally {
    try {
      await client.query('ROLLBACK')
      await truncateTestDatabase()
      const result = await client.query<{ present: boolean }>(`SELECT EXISTS (
        SELECT column_name FROM information_schema.columns WHERE table_schema = 'fleet'
        AND table_name = 'maintenance_orders' AND column_name = 'creation_key') AS present`)
      if (!result.rows[0]!.present) await client.query(upSql)
    } finally { client.release() }
  }
}

test('IT-MIG-MNT-01: up/down/up preserva custo histórico sem fabricar detalhamento', async () => {
  await withMigration(async client => {
    await client.query(downSql)
    const { vehicleId, actorId } = await fixture(client)
    const id = await order(client, vehicleId, actorId)
    const original = await client.query('SELECT id, vehicle_id, cost::text, opened_at, closed_at, created_by FROM fleet.maintenance_orders WHERE id = $1', [id])
    await client.query(upSql)
    const extended = await client.query(`SELECT expected_completion_date, estimate_items, actual_items, creation_key
      FROM fleet.maintenance_orders WHERE id = $1`, [id])
    assert.deepEqual(extended.rows[0], { expected_completion_date: null, estimate_items: null, actual_items: null, creation_key: null })
    await client.query(downSql)
    await client.query(upSql)
    const restored = await client.query('SELECT id, vehicle_id, cost::text, opened_at, closed_at, created_by FROM fleet.maintenance_orders WHERE id = $1', [id])
    assert.deepEqual(restored.rows, original.rows)
  })
})

test('IT-MIG-MNT-02: impeditivas legadas conflitantes recusam DDL sem alterar as ordens', async () => {
  await withMigration(async client => {
    await client.query(downSql)
    const { vehicleId, actorId } = await fixture(client)
    const ids = [await order(client, vehicleId, actorId, true), await order(client, vehicleId, actorId, true)]
    await assert.rejects(client.query(upSql), /Regularize as ordens impeditivas/)
    await client.query('ROLLBACK')
    const stored = await client.query<{ id: string }>('SELECT id::text AS id FROM fleet.maintenance_orders WHERE vehicle_id = $1 ORDER BY id', [vehicleId])
    assert.deepEqual(stored.rows.map(row => row.id), ids)
  })
})

test('IT-MIG-MNT-03: rollback recusa remover orçamento novo e conserva seus valores', async () => {
  await withMigration(async client => {
    const { vehicleId, actorId } = await fixture(client)
    const id = await order(client, vehicleId, actorId)
    await client.query('UPDATE fleet.maintenance_orders SET estimate_items = $1::jsonb WHERE id = $2', ['[]', id])
    await assert.rejects(client.query(downSql), /Rollback recusado/)
    await client.query('ROLLBACK')
    const stored = await client.query('SELECT cost::text, estimate_items FROM fleet.maintenance_orders WHERE id = $1', [id])
    assert.deepEqual(stored.rows[0], { cost: '123.45', estimate_items: [] })
  })
})

test('IT-MIG-MNT-04: rollback preserva eventos novos mesmo quando a ordem não contém itens', async () => {
  await withMigration(async client => {
    const { vehicleId, actorId } = await fixture(client)
    const id = await order(client, vehicleId, actorId)
    const snapshot = { id: actorId, name: 'Gestora Fictícia Migração', email: 'migration@example.test', role: 'GESTOR' }
    await client.query(`INSERT INTO fleet.maintenance_order_events
      (maintenance_order_id, event_type, reported_by, registered_by, actor_snapshot, reason, after_state)
      VALUES ($1, 'UPDATED', $2, $3, $4::jsonb, $5, $6::jsonb)`,
    [id, 'Documento fictício QA', actorId, JSON.stringify(snapshot), 'Revisão fictícia', JSON.stringify({ estimateItems: null })])
    const before = await client.query('SELECT id, after_state FROM fleet.maintenance_order_events WHERE maintenance_order_id = $1', [id])
    await assert.rejects(client.query(downSql), /Rollback recusado/)
    await client.query('ROLLBACK')
    const after = await client.query('SELECT id, after_state FROM fleet.maintenance_order_events WHERE maintenance_order_id = $1', [id])
    assert.deepEqual(after.rows, before.rows)
  })
})
