import type { Pool, PoolClient } from 'pg'
import type {
  FleetService,
  FleetServiceActorSnapshot,
  FleetServiceFilters,
  FleetServiceMutationResult,
  NormalizedFleetServiceAttributes,
} from '../types/fleet-service.types'
import type { Vehicle } from '../types/vehicle.types'

/** Contrato de persistência usado pelos casos de uso e testes isolados do service. */
export interface ServicesRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  list(filters: FleetServiceFilters): Promise<FleetService[]>
  findById(id: string, client?: PoolClient): Promise<FleetService | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<FleetService | null>
  findByName(name: string, client?: PoolClient): Promise<FleetService | null>
  create(attributes: NormalizedFleetServiceAttributes, client: PoolClient): Promise<FleetService>
  saveAttributes(id: string, expectedRevision: number, attributes: NormalizedFleetServiceAttributes, client: PoolClient): Promise<FleetServiceMutationResult>
  saveActive(id: string, expectedRevision: number, active: boolean, client: PoolClient): Promise<FleetServiceMutationResult>
  saveRevision(id: string, expectedRevision: number, client: PoolClient): Promise<FleetServiceMutationResult>
  findActorSnapshot(id: string, client: PoolClient): Promise<FleetServiceActorSnapshot | null>
  listCompatibleVehicles(serviceId: string, client?: PoolClient): Promise<Vehicle[]>
  findVehiclesByIds(ids: string[], client?: PoolClient): Promise<Vehicle[]>
  findActiveVehicleIdsForUpdate(serviceId: string, client: PoolClient): Promise<string[]>
  findVehicleLink(serviceId: string, vehicleId: string, client: PoolClient): Promise<{ isActive: boolean } | null>
  createVehicleLink(serviceId: string, vehicleId: string, client: PoolClient): Promise<void>
  setVehicleLinkActive(serviceId: string, vehicleId: string, active: boolean, client: PoolClient): Promise<void>
  isVehicleLinked(serviceId: string, vehicleId: string): Promise<boolean>
}

/** Projeção explícita do veículo reutilizada nas consultas de compatibilidade. */
const VEHICLE_PROJECTION = `
  v.id::text AS id,
  v.license_plate AS "licensePlate",
  v.brand,
  v.model,
  v.year,
  v.vehicle_type AS "vehicleType",
  v.ownership,
  v.categories,
  v.seats,
  v.body_limit AS "bodyLimit",
  v.weight_limit::double precision AS "weightLimit",
  v.operation_type AS "operationType",
  v.status,
  v.revision,
  v.created_at AS "createdAt",
  v.updated_at AS "updatedAt"`

/** Acesso parametrizado ao catálogo de tipos de serviço da frota. */
export class ServicesRepository implements ServicesRepositoryContract {
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

  /** Lista tipos de serviço ordenados por nome, opcionalmente filtrando por ativo. */
  async list(filters: FleetServiceFilters): Promise<FleetService[]> {
    const result = await this.pool.query<FleetService>(
      `SELECT id::text AS id, name, description, categories,
              requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
              requires_identification AS "requiresIdentification", active, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.services
        WHERE ($1::boolean IS NULL OR active = $1)
        ORDER BY name ASC, id ASC`,
      [filters.active ?? null],
    )
    return result.rows
  }

  /** Busca um tipo de serviço pelo identificador. */
  async findById(id: string, client?: PoolClient): Promise<FleetService | null> {
    const executor = client ?? this.pool
    const result = await executor.query<FleetService>(
      `SELECT id::text AS id, name, description, categories,
              requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
              requires_identification AS "requiresIdentification", active, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.services WHERE id = $1 LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca e bloqueia o registro para serializar mudanças concorrentes. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<FleetService | null> {
    const result = await client.query<FleetService>(
      `SELECT id::text AS id, name, description, categories,
              requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
              requires_identification AS "requiresIdentification", active, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.services WHERE id = $1 FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca pelo nome com a mesma expressão do índice único `lower(btrim(name))`. */
  async findByName(name: string, client?: PoolClient): Promise<FleetService | null> {
    const executor = client ?? this.pool
    const result = await executor.query<FleetService>(
      `SELECT id::text AS id, name, description, categories,
              requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
              requires_identification AS "requiresIdentification", active, revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.services WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`,
      [name],
    )
    return result.rows[0] ?? null
  }

  /** Insere um novo tipo de serviço, que nasce ativo. */
  async create(attributes: NormalizedFleetServiceAttributes, client: PoolClient): Promise<FleetService> {
    const result = await client.query<FleetService>(
      `INSERT INTO fleet.services (
         name, description, categories, requires_triage, requires_weight, requires_identification
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::text AS id, name, description, categories,
                 requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
                 requires_identification AS "requiresIdentification", active, revision,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.name,
        attributes.description,
        attributes.categories,
        attributes.requiresTriage,
        attributes.requiresWeight,
        attributes.requiresIdentification,
      ],
    )
    const service = result.rows[0]
    if (!service) throw new Error('A criação do tipo de serviço não retornou os dados esperados.')
    return service
  }

  /** Substitui os atributos editáveis se a revisão ainda for a esperada. */
  async saveAttributes(
    id: string,
    expectedRevision: number,
    attributes: NormalizedFleetServiceAttributes,
    client: PoolClient,
  ): Promise<FleetServiceMutationResult> {
    const result = await client.query<FleetService>(
      `UPDATE fleet.services
          SET name = $1,
              description = $2,
              categories = $3,
              requires_triage = $4,
              requires_weight = $5,
              requires_identification = $6,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $7 AND revision = $8
        RETURNING id::text AS id, name, description, categories,
                  requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
                  requires_identification AS "requiresIdentification", active, revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.name,
        attributes.description,
        attributes.categories,
        attributes.requiresTriage,
        attributes.requiresWeight,
        attributes.requiresIdentification,
        id,
        expectedRevision,
      ],
    )
    const service = result.rows[0]
    if (service) return { kind: 'updated', service }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Ativa ou inativa o tipo de serviço sob controle de revisão. */
  async saveActive(
    id: string,
    expectedRevision: number,
    active: boolean,
    client: PoolClient,
  ): Promise<FleetServiceMutationResult> {
    const result = await client.query<FleetService>(
      `UPDATE fleet.services
          SET active = $1,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $2 AND revision = $3
        RETURNING id::text AS id, name, description, categories,
                  requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
                  requires_identification AS "requiresIdentification", active, revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [active, id, expectedRevision],
    )
    const service = result.rows[0]
    if (service) return { kind: 'updated', service }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Carrega o snapshot de autoria do usuário autenticado na transação. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<FleetServiceActorSnapshot | null> {
    const result = await client.query<FleetServiceActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Incrementa a revisão do tipo de serviço sob controle otimista. */
  async saveRevision(id: string, expectedRevision: number, client: PoolClient): Promise<FleetServiceMutationResult> {
    const result = await client.query<FleetService>(
      `UPDATE fleet.services
          SET revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1 AND revision = $2
        RETURNING id::text AS id, name, description, categories,
                  requires_triage AS "requiresTriage", requires_weight AS "requiresWeight",
                  requires_identification AS "requiresIdentification", active, revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, expectedRevision],
    )
    const service = result.rows[0]
    if (service) return { kind: 'updated', service }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Lista os veículos com vínculo ativo ao tipo de serviço, ordenados por placa. */
  async listCompatibleVehicles(serviceId: string, client?: PoolClient): Promise<Vehicle[]> {
    const executor = client ?? this.pool
    const result = await executor.query<Vehicle>(
      `SELECT
         ${VEHICLE_PROJECTION}
         FROM fleet.vehicle_services vs
         JOIN fleet.vehicles v ON v.id = vs.vehicle_id
        WHERE vs.service_id = $1 AND vs.is_active = true
        ORDER BY v.license_plate ASC, v.id ASC`,
      [serviceId],
    )
    return result.rows
  }

  /** Busca os veículos informados para validar existência e situação antes do vínculo. */
  async findVehiclesByIds(ids: string[], client?: PoolClient): Promise<Vehicle[]> {
    if (ids.length === 0) return []
    const executor = client ?? this.pool
    const result = await executor.query<Vehicle>(
      `SELECT
         ${VEHICLE_PROJECTION}
         FROM fleet.vehicles v
        WHERE v.id = ANY($1::bigint[])
        FOR SHARE`,
      [ids],
    )
    return result.rows
  }

  /** Trava e devolve os veículos atualmente vinculados e ativos ao serviço. */
  async findActiveVehicleIdsForUpdate(serviceId: string, client: PoolClient): Promise<string[]> {
    const result = await client.query<{ id: string }>(
      `SELECT vehicle_id::text AS id
         FROM fleet.vehicle_services
        WHERE service_id = $1 AND is_active = true
        ORDER BY vehicle_id ASC
        FOR UPDATE`,
      [serviceId],
    )
    return result.rows.map((row) => row.id)
  }

  /** Busca o par veículo × serviço, ativo ou inativo, para decidir entre reativar e inserir. */
  async findVehicleLink(serviceId: string, vehicleId: string, client: PoolClient): Promise<{ isActive: boolean } | null> {
    const result = await client.query<{ isActive: boolean }>(
      `SELECT is_active AS "isActive"
         FROM fleet.vehicle_services
        WHERE service_id = $1 AND vehicle_id = $2
        LIMIT 1`,
      [serviceId, vehicleId],
    )
    return result.rows[0] ?? null
  }

  /** Cria o vínculo já ativo; a unicidade do par é garantida pela constraint da tabela. */
  async createVehicleLink(serviceId: string, vehicleId: string, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO fleet.vehicle_services (vehicle_id, service_id)
       VALUES ($1, $2)`,
      [vehicleId, serviceId],
    )
  }

  /** Ativa ou desativa o vínculo incrementando a revisão da linha do par. */
  async setVehicleLinkActive(serviceId: string, vehicleId: string, active: boolean, client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE fleet.vehicle_services
          SET is_active = $3,
              revision = revision + 1
        WHERE service_id = $1 AND vehicle_id = $2`,
      [serviceId, vehicleId, active],
    )
  }

  /** Informa se existe vínculo ativo entre o serviço e o veículo, base da regra de compatibilidade. */
  async isVehicleLinked(serviceId: string, vehicleId: string): Promise<boolean> {
    const result = await this.pool.query<{ linked: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM fleet.vehicle_services
          WHERE service_id = $1 AND vehicle_id = $2 AND is_active = true
       ) AS linked`,
      [serviceId, vehicleId],
    )
    return result.rows[0]?.linked ?? false
  }
}
