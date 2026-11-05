import type { Pool, PoolClient } from 'pg'
import type {
  CreateVehicleEventInput,
  Vehicle,
  VehicleActorSnapshot,
  VehicleAttributes,
  VehicleFilters,
  VehicleMutationResult,
  VehicleStatus,
} from '../types/vehicle.types'

/** Contrato de persistência usado pelos casos de uso e testes isolados do service. */
export interface VehiclesRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  list(filters: VehicleFilters): Promise<Vehicle[]>
  findById(id: string, client?: PoolClient): Promise<Vehicle | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<Vehicle | null>
  findByLicensePlate(licensePlate: string, client?: PoolClient): Promise<Vehicle | null>
  create(attributes: VehicleAttributes, client: PoolClient): Promise<Vehicle>
  saveAttributes(id: string, expectedRevision: number, attributes: VehicleAttributes, client: PoolClient): Promise<VehicleMutationResult>
  saveStatus(id: string, expectedRevision: number, status: VehicleStatus, client: PoolClient): Promise<VehicleMutationResult>
  findActorSnapshot(id: string, client: PoolClient): Promise<VehicleActorSnapshot | null>
  createEvent(input: CreateVehicleEventInput, client: PoolClient): Promise<void>
}

/** Acesso parametrizado ao estado vigente e ao histórico de veículos. */
export class VehiclesRepository implements VehiclesRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Executa uma unidade de trabalho com commit/rollback e libera o cliente. */
  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /** Lista veículos aplicando os filtros fornecidos. */
  async list(filters: VehicleFilters): Promise<Vehicle[]> {
    const values = [filters.status ?? null, filters.category ?? null, filters.operationType ?? null]
    const result = await this.pool.query<Vehicle>(
      `SELECT id::text AS id,
              license_plate AS "licensePlate",
              brand,
              model,
              year,
              vehicle_type AS "vehicleType",
              ownership,
              categories,
              seats,
              body_limit AS "bodyLimit",
              weight_limit::double precision AS "weightLimit",
              operation_type AS "operationType",
              status,
              revision,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM fleet.vehicles
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR $2 = ANY(categories))
          AND ($3::text IS NULL OR operation_type = $3)
        ORDER BY license_plate ASC, id ASC`,
      values,
    )
    return result.rows
  }

  /** Busca um veículo pelo identificador, opcionalmente dentro de uma transação. */
  async findById(id: string, client?: PoolClient): Promise<Vehicle | null> {
    const executor = client ?? this.pool
    const result = await executor.query<Vehicle>(
      `SELECT id::text AS id, license_plate AS "licensePlate", brand, model, year,
              vehicle_type AS "vehicleType", ownership, categories, seats,
              body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
              operation_type AS "operationType", status, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.vehicles WHERE id = $1 LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca e bloqueia o registro para serializar mudanças concorrentes. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<Vehicle | null> {
    const result = await client.query<Vehicle>(
      `SELECT id::text AS id, license_plate AS "licensePlate", brand, model, year,
              vehicle_type AS "vehicleType", ownership, categories, seats,
              body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
              operation_type AS "operationType", status, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.vehicles WHERE id = $1 FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca a placa de forma case-insensitive aproveitando o índice funcional upper(license_plate). */
  async findByLicensePlate(licensePlate: string, client?: PoolClient): Promise<Vehicle | null> {
    const executor = client ?? this.pool
    const result = await executor.query<Vehicle>(
      `SELECT id::text AS id, license_plate AS "licensePlate", brand, model, year,
              vehicle_type AS "vehicleType", ownership, categories, seats,
              body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
              operation_type AS "operationType", status, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.vehicles WHERE upper(license_plate) = upper($1) LIMIT 1`,
      [licensePlate],
    )
    return result.rows[0] ?? null
  }

  /** Insere o cadastro inicial com situação AVAILABLE. */
  async create(attributes: VehicleAttributes, client: PoolClient): Promise<Vehicle> {
    const result = await client.query<Vehicle>(
      `INSERT INTO fleet.vehicles (
         license_plate, brand, model, year, vehicle_type, ownership,
         categories, seats, body_limit, weight_limit, operation_type, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'AVAILABLE')
       RETURNING id::text AS id, license_plate AS "licensePlate", brand, model, year,
                 vehicle_type AS "vehicleType", ownership, categories, seats,
                 body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
                 operation_type AS "operationType", status, revision,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.licensePlate,
        attributes.brand ?? null,
        attributes.model ?? null,
        attributes.year ?? null,
        attributes.vehicleType ?? null,
        attributes.ownership ?? 'OWNED',
        attributes.categories,
        attributes.seats,
        attributes.bodyLimit,
        attributes.weightLimit,
        attributes.operationType,
      ],
    )
    const vehicle = result.rows[0]
    if (!vehicle) throw new Error('A criação do veículo não retornou os dados esperados.')
    return vehicle
  }

  /** Atualiza atributos editáveis se a revisão ainda for a esperada. */
  async saveAttributes(
    id: string,
    expectedRevision: number,
    attributes: VehicleAttributes,
    client: PoolClient,
  ): Promise<VehicleMutationResult> {
    const result = await client.query<Vehicle>(
      `UPDATE fleet.vehicles
          SET license_plate = $1,
              brand = $2,
              model = $3,
              year = $4,
              vehicle_type = $5,
              ownership = $6,
              categories = $7,
              seats = $8,
              body_limit = $9,
              weight_limit = $10,
              operation_type = $11,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $12 AND revision = $13
        RETURNING id::text AS id, license_plate AS "licensePlate", brand, model, year,
                  vehicle_type AS "vehicleType", ownership, categories, seats,
                  body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
                  operation_type AS "operationType", status, revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.licensePlate,
        attributes.brand ?? null,
        attributes.model ?? null,
        attributes.year ?? null,
        attributes.vehicleType ?? null,
        attributes.ownership ?? 'OWNED',
        attributes.categories,
        attributes.seats,
        attributes.bodyLimit,
        attributes.weightLimit,
        attributes.operationType,
        id,
        expectedRevision,
      ],
    )
    const vehicle = result.rows[0]
    if (vehicle) return { kind: 'updated', vehicle }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Atualiza situação, revisão e timestamp sob bloqueio transacional. */
  async saveStatus(
    id: string,
    expectedRevision: number,
    status: VehicleStatus,
    client: PoolClient,
  ): Promise<VehicleMutationResult> {
    const result = await client.query<Vehicle>(
      `UPDATE fleet.vehicles
          SET status = $1,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $2 AND revision = $3
        RETURNING id::text AS id, license_plate AS "licensePlate", brand, model, year,
                  vehicle_type AS "vehicleType", ownership, categories, seats,
                  body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
                  operation_type AS "operationType", status, revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, id, expectedRevision],
    )
    const vehicle = result.rows[0]
    if (vehicle) return { kind: 'updated', vehicle }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Carrega o snapshot de autoria do usuário autenticado na transação. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<VehicleActorSnapshot | null> {
    const result = await client.query<VehicleActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Insere um evento imutável na linha histórica do veículo. */
  async createEvent(input: CreateVehicleEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO fleet.vehicle_events (
         vehicle_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, $2, clock_timestamp(), $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)`,
      [
        input.vehicleId,
        input.eventType,
        input.reportedBy,
        input.registeredBy,
        JSON.stringify(input.actorSnapshot),
        input.reason,
        input.beforeState ? JSON.stringify(input.beforeState) : null,
        JSON.stringify(input.afterState),
      ],
    )
  }
}
