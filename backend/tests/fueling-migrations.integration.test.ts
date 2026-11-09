import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import type { Pool } from 'pg'
import { DatabaseMigrator } from '../src/database/migrator'
import { seedRolesAndPermissions } from '../src/database/scripts/seed'
import { FuelingsRepository } from '../src/repositories/fuelings.repository'
import { VehiclesRepository } from '../src/repositories/vehicles.repository'
import { AuditRepository } from '../src/repositories/audit.repository'
import { AuditService } from '../src/services/audit.service'
import { FuelingsService } from '../src/services/fuelings.service'
import { randomUUID } from 'node:crypto'
import { closeTestPool, getTestPool, getTestDatabaseUrl, setupTestDatabase, truncateTestDatabase } from './helpers/db-test'
import { seedRbacTestUsers } from './fixtures/rbac-users.fixture'

const VERSION = '202611050001'
const migrationUrl = new URL(getTestDatabaseUrl())
migrationUrl.pathname = '/aratu_fueling_migrations_test'
process.env.DATABASE_URL_TEST = migrationUrl.toString()
let pool: Pool
let down: string
let vehicleId: string
let actorId: string
const migrator = new DatabaseMigrator()

/** Usa a mesma conexão até o rollback de uma migração recusada, liberando-a em finally. */
async function revert(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(down.replace(/^BEGIN;/, '').replace(/COMMIT;\s*$/, ''))
    await client.query('DELETE FROM schema_migrations WHERE version=$1', [VERSION])
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release() }
}
async function seed(): Promise<void> {
  await seedRolesAndPermissions(pool)
  actorId = (await seedRbacTestUsers(pool)).get('GESTOR')!.id
  const vehicle = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate,categories,seats,body_limit,operation_type)
     VALUES ('QAT1A65',ARRAY['BODY'],2,2,'SVO') RETURNING id::text`)
  vehicleId = vehicle.rows[0]!.id
}
async function legacy(predecessor: string | null = null): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.fuelings (vehicle_id,fueled_at,fuel_type,liters,total_value,odometer_km,created_by,supersedes_id)
     VALUES ($1,'2026-10-01T12:00:00Z','DIESEL',10,50,100,$2,$3) RETURNING id::text`, [vehicleId, actorId, predecessor])
  return result.rows[0]!.id
}
async function rows(): Promise<unknown[]> {
  return (await pool.query<{ row: unknown }>(`SELECT to_jsonb(f) - 'request_key' - 'request_payload' AS row FROM fleet.fuelings f ORDER BY id`)).rows
}
before(async () => {
  await setupTestDatabase()
  pool = getTestPool()
  assert.equal((await pool.query<{ db: string }>('SELECT current_database() AS db')).rows[0]!.db, 'aratu_fueling_migrations_test')
  down = await readFile(path.resolve(__dirname, '../src/database/migrations/202611050001_extend_fuelings.down.sql'), 'utf8')
})
beforeEach(async () => {
  await truncateTestDatabase()
  await revert()
  await seed()
})
afterEach(async () => {
  await truncateTestDatabase()
  await migrator.runMigrations(pool, { silent: true })
})
after(async () => { await closeTestPool() })

test('QA19: migração aplica em base sem abastecimentos e runner reexecuta sem duplicar', async () => {
  const first = await migrator.runMigrations(pool, { silent: true })
  assert.equal(first.find(r => r.version === VERSION)?.status, 'applied')
  const second = await migrator.runMigrations(pool, { silent: true })
  assert.equal(second.find(r => r.version === VERSION)?.status, 'skipped')
  assert.equal((await pool.query('SELECT version FROM schema_migrations WHERE version=$1', [VERSION])).rowCount, 1)
  const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='fleet' AND tablename='fuelings'")
  assert.ok(indexes.rows.some(r => r.indexname === 'fleet_fuelings_one_successor'))
})
test('QA19: migração e down sem uso operacional preservam legado byte a byte e campos desconhecidos', async () => {
  const id = await legacy()
  await legacy(id)
  const beforeRows = await rows()
  await migrator.runMigrations(pool, { silent: true })
  assert.deepEqual(await rows(), beforeRows)
  const metadata = await pool.query('SELECT request_key, request_payload, actor_snapshot, vehicle_snapshot, reason FROM fleet.fuelings')
  assert.ok(metadata.rows.every(r => Object.values(r).every(v => v === null)))
  await revert()
  assert.deepEqual(await rows(), beforeRows)
})
test('QA19: ramificação legada bloqueia a migração atomicamente, sem perder registros', async () => {
  const id = await legacy()
  await legacy(id)
  await legacy(id)
  const beforeRows = await rows()
  await assert.rejects(migrator.runMigrations(pool, { silent: true }), /ramificadas/)
  assert.deepEqual(await rows(), beforeRows)
  const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='fleet' AND table_name='fuelings' AND column_name='request_key'")
  assert.equal(columns.rowCount, 0)
  assert.equal((await pool.query('SELECT version FROM schema_migrations WHERE version=$1', [VERSION])).rowCount, 0)
})
test('QA19: down após gravação pela API é recusada e conserva schema e histórico', async () => {
  await migrator.runMigrations(pool, { silent: true })
  const service = new FuelingsService(new FuelingsRepository(pool), new VehiclesRepository(pool),
    new AuditService(new AuditRepository(pool)), () => new Date('2026-10-02T12:00:00Z'))
  const version = await service.create({ vehicleId, fueledAt: '2026-10-01T12:00:00Z',
    fuelType: 'DIESEL', liters: '10', totalValue: '50', odometerKm: 100,
    reportedBy: 'Equipe Fictícia QA', reason: 'Registro fictício QA', evidenceDescription: 'Recibo fictício' }, actorId, randomUUID())
  const original = await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f')
  await assert.rejects(revert(), /preservar histórico/)
  assert.deepEqual((await pool.query('SELECT to_jsonb(f) AS row FROM fleet.fuelings f')).rows, original.rows)
  assert.equal((await pool.query('SELECT id FROM fleet.fueling_events WHERE fueling_id=$1', [version.id])).rowCount, 1)
  await assert.rejects(pool.query("UPDATE fleet.fuelings SET station='QA' WHERE id=$1", [version.id]), /imutáveis/)
})
