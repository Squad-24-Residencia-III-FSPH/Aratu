import type { Pool } from 'pg'

/** CPFs sintéticos válidos apenas matematicamente (LGPD: nenhum pertence a pessoa real conhecida). */
export const FICTITIOUS_CPFS = ['12345678909', '11144477735', '52998224725', '39053344705'] as const

async function insertReturningId(pool: Pool, sql: string, values: unknown[]): Promise<string> {
  const result = await pool.query<{ id: string }>(sql, values)
  const id = result.rows[0]?.id
  if (!id) throw new Error('A inserção de fixture não retornou id.')
  return id
}

export function insertService(pool: Pool, name: string): Promise<string> {
  return insertReturningId(pool, 'INSERT INTO fleet.services (name) VALUES ($1) RETURNING id::text AS id', [name])
}

export function insertVehicle(pool: Pool, licensePlate: string, status = 'AVAILABLE', seats = 4): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO fleet.vehicles (license_plate, categories, seats, body_limit, operation_type, status)
     VALUES ($1, ARRAY['PASSENGER'], $2, 0, 'ADMINISTRATIVE', $3) RETURNING id::text AS id`,
    [licensePlate, seats, status],
  )
}

export async function linkVehicleToService(pool: Pool, vehicleId: string, serviceId: string, active = true): Promise<void> {
  await pool.query(
    'INSERT INTO fleet.vehicle_services (vehicle_id, service_id, is_active) VALUES ($1, $2, $3)',
    [vehicleId, serviceId, active],
  )
}

export function insertDriver(pool: Pool, name: string, cpf: string, cnhExpiresAt = '2099-12-31', status = 'ACTIVE'): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO fleet.drivers (name, cpf, cnh_number, cnh_category, cnh_expires_at, status)
     VALUES ($1, $2, $3, 'D', $4::date, $5) RETURNING id::text AS id`,
    [name, cpf, `CNH-${cpf}`, cnhExpiresAt, status],
  )
}

export function insertRequest(pool: Pool, requesterId: string, serviceId: string, status = 'PENDING'): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO trip.requests (requester_id, service_id, requested_date, requested_time, origin, destination, purpose, passengers, status)
     VALUES ($1, $2, '2099-12-01', '08:00', 'Sede fictícia', 'Unidade fictícia', 'Atividade de teste', 2, $3)
     RETURNING id::text AS id`,
    [requesterId, serviceId, status],
  )
}

export interface TripFixture {
  requestId: string
  vehicleId: string
  driverId: string
  start: string
  end: string
  status?: string
}

export function insertTrip(pool: Pool, trip: TripFixture): Promise<string> {
  return insertReturningId(
    pool,
    `INSERT INTO trip.trips (request_id, vehicle_id, driver_id, scheduled_start, scheduled_end, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [trip.requestId, trip.vehicleId, trip.driverId, trip.start, trip.end, trip.status ?? 'SCHEDULED'],
  )
}
