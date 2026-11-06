import type { Pool, PoolClient } from 'pg'
import type {
  FleetService,
  FleetServiceActorSnapshot,
  FleetServiceFilters,
  FleetServiceMutationResult,
  NormalizedFleetServiceAttributes,
} from '../types/fleet-service.types'

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
  findActorSnapshot(id: string, client: PoolClient): Promise<FleetServiceActorSnapshot | null>
}

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
}
