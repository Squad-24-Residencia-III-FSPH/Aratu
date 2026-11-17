import type { Pool, PoolClient } from 'pg'
import type { MaintenanceStatus } from '../../src/types/maintenance.types'
import type { SvoOrderStatus } from '../../src/types/svo-order.types'
import type { VehicleOperationType, VehicleStatus } from '../../src/types/vehicle.types'

let nextVehicle = 0

/** Vínculo inteiramente sintético para cenários de vigência e isolamento. */
export async function insertSvoMembership(database: Pool | PoolClient, teamId: string, userId: string, options: {
  active?: boolean; joinedAt?: Date; leftAt?: Date | null
} = {}): Promise<void> {
  await database.query(
    `INSERT INTO svo.team_members (team_id, user_id, active, joined_at, left_at)
      VALUES ($1, $2, $3, $4, $5)`,
    [teamId, userId, options.active ?? true, options.joinedAt ?? new Date('2025-01-01Z'), options.leftAt ?? null],
  )
}

/** Reproduz manutenção legada sem sincronizar a situação cadastral da viatura. */
export async function insertLegacyMaintenance(database: Pool | PoolClient, input: {
  vehicleId: string; actorId: string; status: MaintenanceStatus; blocksVehicle: boolean
}): Promise<void> {
  await database.query(
    `INSERT INTO fleet.maintenance_orders
       (vehicle_id, type, description, created_by, status, blocks_vehicle, cancellation_reason)
     VALUES ($1, 'CORRECTIVE', 'Manutenção legada fictícia QA', $2, $3, $4, $5)`,
    [input.vehicleId, input.actorId, input.status, input.blocksVehicle,
      input.status === 'CANCELED' ? 'Cancelamento fictício QA.' : null],
  )
}

/** Equipe sintética propositalmente sem membros: o contrato não exige composição. */
export async function insertSvoTeam(pool: Pool, active = true): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO svo.teams (name, active) VALUES ($1, $2) RETURNING id::text AS id`,
    [`Equipe Fictícia QA ${crypto.randomUUID()}`, active],
  )
  return result.rows[0]!.id
}

export async function insertSvoVehicle(pool: Pool, options: {
  bodyLimit?: number; status?: VehicleStatus; operationType?: VehicleOperationType; categories?: readonly string[]
} = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type, status)
     VALUES ($1, $2, 2, $3, $4, $5) RETURNING id::text AS id`,
    [`QAF${String(++nextVehicle).padStart(4, '0')}`, options.categories ?? ['BODY'], options.bodyLimit ?? 1,
      options.operationType ?? 'SVO', options.status ?? 'AVAILABLE'],
  )
  return result.rows[0]!.id
}

/** Estado legado sem snapshots; não representa novos endpoints de execução. */
export async function insertLegacySvoOrder(pool: Pool, input: {
  occurrenceId: string; teamId: string; vehicleId: string; actorId: string; status: SvoOrderStatus
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO svo.execution_orders (occurrence_id, team_id, vehicle_id, created_by, status, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [input.occurrenceId, input.teamId, input.vehicleId, input.actorId, input.status,
      input.status === 'NOT_PERFORMED' ? 'Motivo fictício QA.' : null],
  )
  return result.rows[0]!.id
}
