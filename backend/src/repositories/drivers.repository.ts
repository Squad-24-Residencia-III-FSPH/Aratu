import type { Pool, PoolClient } from 'pg'
import type {
  CreateDriverEventInput,
  Driver,
  DriverActorSnapshot,
  DriverFilters,
  DriverMutationResult,
  DriverStatus,
  DriverUserAccount,
  NormalizedDriverAttributes,
} from '../types/driver.types'

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/** Contrato de persistência usado pelos casos de uso e testes isolados do service. */
export interface DriversRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  list(filters: DriverFilters): Promise<Driver[]>
  findById(id: string, client?: PoolClient): Promise<Driver | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<Driver | null>
  findByCpf(cpf: string, client?: PoolClient): Promise<Driver | null>
  findByUserId(userId: string, client?: PoolClient): Promise<Driver | null>
  findUserAccount(userId: string, client?: PoolClient): Promise<DriverUserAccount | null>
  create(attributes: NormalizedDriverAttributes, status: DriverStatus, client: PoolClient): Promise<Driver>
  saveAttributes(id: string, expectedRevision: number, attributes: NormalizedDriverAttributes, client: PoolClient): Promise<DriverMutationResult>
  saveStatus(id: string, expectedRevision: number, status: DriverStatus, client: PoolClient): Promise<DriverMutationResult>
  findActorSnapshot(id: string, client: PoolClient): Promise<DriverActorSnapshot | null>
  createEvent(input: CreateDriverEventInput, client: PoolClient): Promise<void>
}

/** Acesso parametrizado ao estado vigente e ao histórico de motoristas. */
export class DriversRepository implements DriversRepositoryContract {
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

  /** Lista motoristas por nome parcial (sem diferenciar maiúsculas) e situação. */
  async list(filters: DriverFilters): Promise<Driver[]> {
    const namePattern = filters.name ? `%${escapeLikePattern(filters.name)}%` : null
    const result = await this.pool.query<Driver>(
      `SELECT id::text AS id, name, cpf, cnh_number AS "cnhNumber",
              cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
              phone, status, user_id::text AS "userId", revision,
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM fleet.drivers
        WHERE ($1::text IS NULL OR name ILIKE $1)
          AND ($2::text IS NULL OR status = $2)
        ORDER BY name ASC, id ASC`,
      [namePattern, filters.status ?? null],
    )
    return result.rows
  }

  /** Busca um motorista pelo identificador, opcionalmente dentro de uma transação. */
  async findById(id: string, client?: PoolClient): Promise<Driver | null> {
    const executor = client ?? this.pool
    const result = await executor.query<Driver>(
      `SELECT id::text AS id, name, cpf, cnh_number AS "cnhNumber",
              cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
              phone, status, user_id::text AS "userId", revision,
              created_at AS "createdAt", updated_at AS "updatedAt" FROM fleet.drivers WHERE id = $1 LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca e bloqueia o registro para serializar mudanças concorrentes. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<Driver | null> {
    const result = await client.query<Driver>(
      `SELECT id::text AS id, name, cpf, cnh_number AS "cnhNumber",
              cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
              phone, status, user_id::text AS "userId", revision,
              created_at AS "createdAt", updated_at AS "updatedAt" FROM fleet.drivers WHERE id = $1 FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Busca pelo CPF normalizado aproveitando o índice único `fleet_drivers_cpf_unique`. */
  async findByCpf(cpf: string, client?: PoolClient): Promise<Driver | null> {
    const executor = client ?? this.pool
    const result = await executor.query<Driver>(
      `SELECT id::text AS id, name, cpf, cnh_number AS "cnhNumber",
              cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
              phone, status, user_id::text AS "userId", revision,
              created_at AS "createdAt", updated_at AS "updatedAt" FROM fleet.drivers WHERE cpf = $1 LIMIT 1`,
      [cpf],
    )
    return result.rows[0] ?? null
  }

  /** Busca o motorista já vinculado a uma conta de usuário. */
  async findByUserId(userId: string, client?: PoolClient): Promise<Driver | null> {
    const executor = client ?? this.pool
    const result = await executor.query<Driver>(
      `SELECT id::text AS id, name, cpf, cnh_number AS "cnhNumber",
              cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
              phone, status, user_id::text AS "userId", revision,
              created_at AS "createdAt", updated_at AS "updatedAt" FROM fleet.drivers WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    return result.rows[0] ?? null
  }

  /** Carrega perfil e situação da conta candidata ao vínculo. */
  async findUserAccount(userId: string, client?: PoolClient): Promise<DriverUserAccount | null> {
    const executor = client ?? this.pool
    const result = await executor.query<DriverUserAccount>(
      `SELECT u.id::text AS id, r.name AS role, u.active
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1
        LIMIT 1`,
      [userId],
    )
    return result.rows[0] ?? null
  }

  /** Insere o cadastro inicial com a situação já validada pelo service. */
  async create(attributes: NormalizedDriverAttributes, status: DriverStatus, client: PoolClient): Promise<Driver> {
    const result = await client.query<Driver>(
      `INSERT INTO fleet.drivers (
         name, cpf, cnh_number, cnh_category, cnh_expires_at, phone, user_id, status
       ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)
       RETURNING id::text AS id, name, cpf, cnh_number AS "cnhNumber",
                  cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
                  phone, status, user_id::text AS "userId", revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.name,
        attributes.cpf,
        attributes.cnhNumber,
        attributes.cnhCategory,
        attributes.cnhExpiresAt,
        attributes.phone,
        attributes.userId,
        status,
      ],
    )
    const driver = result.rows[0]
    if (!driver) throw new Error('A criação do motorista não retornou os dados esperados.')
    return driver
  }

  /** Atualiza atributos editáveis se a revisão ainda for a esperada. */
  async saveAttributes(
    id: string,
    expectedRevision: number,
    attributes: NormalizedDriverAttributes,
    client: PoolClient,
  ): Promise<DriverMutationResult> {
    const result = await client.query<Driver>(
      `UPDATE fleet.drivers
          SET name = $1,
              cpf = $2,
              cnh_number = $3,
              cnh_category = $4,
              cnh_expires_at = $5::date,
              phone = $6,
              user_id = $7,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $8 AND revision = $9
        RETURNING id::text AS id, name, cpf, cnh_number AS "cnhNumber",
                  cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
                  phone, status, user_id::text AS "userId", revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        attributes.name,
        attributes.cpf,
        attributes.cnhNumber,
        attributes.cnhCategory,
        attributes.cnhExpiresAt,
        attributes.phone,
        attributes.userId,
        id,
        expectedRevision,
      ],
    )
    const driver = result.rows[0]
    if (driver) return { kind: 'updated', driver }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Atualiza situação, revisão e timestamp sob bloqueio transacional. */
  async saveStatus(
    id: string,
    expectedRevision: number,
    status: DriverStatus,
    client: PoolClient,
  ): Promise<DriverMutationResult> {
    const result = await client.query<Driver>(
      `UPDATE fleet.drivers
          SET status = $1,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $2 AND revision = $3
        RETURNING id::text AS id, name, cpf, cnh_number AS "cnhNumber",
                  cnh_category AS "cnhCategory", to_char(cnh_expires_at, 'YYYY-MM-DD') AS "cnhExpiresAt",
                  phone, status, user_id::text AS "userId", revision,
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, id, expectedRevision],
    )
    const driver = result.rows[0]
    if (driver) return { kind: 'updated', driver }
    const existing = await this.findById(id, client)
    return existing ? { kind: 'revision-conflict' } : { kind: 'not-found' }
  }

  /** Carrega o snapshot de autoria do usuário autenticado na transação. */
  async findActorSnapshot(id: string, client: PoolClient): Promise<DriverActorSnapshot | null> {
    const result = await client.query<DriverActorSnapshot>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.active = true
        LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /** Insere um evento imutável na linha histórica do motorista. */
  async createEvent(input: CreateDriverEventInput, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO fleet.driver_events (
         driver_id, event_type, occurred_at, reported_by, registered_by,
         actor_snapshot, reason, before_state, after_state
       ) VALUES ($1, $2, clock_timestamp(), $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)`,
      [
        input.driverId,
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
