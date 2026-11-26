import type { Pool, PoolClient } from 'pg'
import type { Role, Permission, UserRole } from '../types/auth'
import type {
  CreateRoleEventInput,
  PaginatedProfiles,
  ProfileFilters,
} from '../types/permission.types'

const ACCESS_ADMIN_LOCK_CLASS = 1667313457
const ACCESS_ADMIN_LOCK_KEY = 2

export interface CreateRoleRepositoryInput {
  name: string
  displayName: string
  description: string | null
  defaultPath: string | null
  createdBy: string
  creationKey: string
  creationPayload: Record<string, unknown>
}

export interface UpdateRoleRepositoryInput {
  id: string
  expectedRevision: number
  displayName: string
  description: string | null
  defaultPath: string | null
}

export interface RoleRepositoryContract {
  findAll(client?: PoolClient): Promise<Role[]>
  findById(id: string, client?: PoolClient): Promise<Role | null>
  findByIdForUpdate?(id: string, client: PoolClient): Promise<Role | null>
  findByName(name: UserRole, client?: PoolClient): Promise<Role | null>
  findPermissionsByRoleId(roleId: string, client?: PoolClient): Promise<Permission[]>
  withTransaction?<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  listProfiles?(filters: ProfileFilters): Promise<PaginatedProfiles>
  findAllPermissions?(): Promise<Permission[]>
  findPermissionNamesByIds?(ids: readonly string[], client?: PoolClient): Promise<string[]>
  findByCreationKey?(actorId: string, key: string, client: PoolClient): Promise<{ role: Role; payload: Record<string, unknown> } | null>
  createProfile?(input: CreateRoleRepositoryInput, client: PoolClient): Promise<Role | null>
  updateProfile?(input: UpdateRoleRepositoryInput, client: PoolClient): Promise<Role | null>
  setProfileActive?(id: string, expectedRevision: number, active: boolean, client: PoolClient): Promise<Role | null>
  replacePermissions?(roleId: string, permissionNames: readonly string[], client: PoolClient): Promise<void>
  recordRoleEvent?(input: CreateRoleEventInput, client: PoolClient): Promise<void>
  lockAccessAdministration?(client: PoolClient): Promise<void>
  countActiveAccessAdministrators?(client: PoolClient): Promise<number>
  countActiveUsersByRole?(roleId: string, client: PoolClient): Promise<number>
}

/** Repositório de perfis, catálogo de permissões e grants persistidos no PostgreSQL. */
export class RolesRepository implements RoleRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Executa alterações do perfil e sua auditoria na mesma transação. */
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

  /** Lista perfis com contagem de contas ativas. */
  async findAll(client?: PoolClient): Promise<Role[]> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT ${ROLE_PROJECTION}, count(u.id) FILTER (WHERE u.active)::int AS "activeUserCount"
        FROM auth.roles r
        LEFT JOIN auth.users u ON u.role_id = r.id
       GROUP BY r.id
       ORDER BY r.id ASC;`)
    return rows
  }

  /** Busca perfil e vínculo ativo por chave primária. */
  async findById(id: string, client?: PoolClient): Promise<Role | null> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT ${ROLE_PROJECTION}, count(u.id) FILTER (WHERE u.active)::int AS "activeUserCount"
        FROM auth.roles r
        LEFT JOIN auth.users u ON u.role_id = r.id
       WHERE r.id = $1
       GROUP BY r.id
       LIMIT 1;`, [id])
    return rows[0] ?? null
  }

  /** Trava o perfil antes de aplicar revisão e concessões em uma transação. */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<Role | null> {
    const { rows } = await client.query<Role>(`
      SELECT ${ROLE_PROJECTION}, 0::int AS "activeUserCount"
        FROM auth.roles r
       WHERE r.id = $1
       LIMIT 1
       FOR UPDATE OF r;`, [id])
    return rows[0] ?? null
  }

  /** Busca perfil por código estável, sem tratar o texto como fonte de autorização. */
  async findByName(name: UserRole, client?: PoolClient): Promise<Role | null> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT ${ROLE_PROJECTION}, count(u.id) FILTER (WHERE u.active)::int AS "activeUserCount"
        FROM auth.roles r
        LEFT JOIN auth.users u ON u.role_id = r.id
       WHERE upper(r.name) = upper($1)
       GROUP BY r.id
       LIMIT 1;`, [name])
    return rows[0] ?? null
  }

  /** Retorna os grants ativos atribuídos ao perfil. */
  async findPermissionsByRoleId(roleId: string, client?: PoolClient): Promise<Permission[]> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Permission>(`
      SELECT p.id::text AS id, p.name, p.description, p.created_at AS "createdAt"
        FROM auth.permissions p
        JOIN auth.role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1 AND rp.is_active = true
       ORDER BY p.name ASC;`, [roleId])
    return rows
  }

  /** Lista os perfis com filtros e paginação aplicados no servidor. */
  async listProfiles(filters: ProfileFilters): Promise<PaginatedProfiles> {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const values: unknown[] = []
    const conditions: string[] = []
    if (filters.active !== undefined) {
      values.push(filters.active)
      conditions.push(`r.active = $${values.length}`)
    }
    if (filters.search?.trim()) {
      values.push(`%${filters.search.trim()}%`)
      conditions.push(`(r.display_name ILIKE $${values.length} OR r.name ILIKE $${values.length})`)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM auth.roles r ${where}`, values,
    )
    const total = Number(countResult.rows[0]?.total ?? 0)
    const offset = (page - 1) * pageSize
    const pageValues = [...values, pageSize, offset]
    const { rows } = await this.pool.query<Role>(`
      SELECT ${ROLE_PROJECTION}, count(u.id) FILTER (WHERE u.active)::int AS "activeUserCount"
        FROM auth.roles r
        LEFT JOIN auth.users u ON u.role_id = r.id
        ${where}
       GROUP BY r.id
       ORDER BY lower(r.display_name), r.id
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length};`, pageValues)
    return { profiles: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /** Retorna o catálogo persistido da aplicação; a interface enriquece com metadados estáticos. */
  async findAllPermissions(): Promise<Permission[]> {
    const { rows } = await this.pool.query<Permission>(`
      SELECT id::text AS id, name, description, created_at AS "createdAt"
        FROM auth.permissions ORDER BY name ASC;`)
    return rows
  }

  /** Converte IDs enviados pela tela em nomes para validação e persistência. */
  async findPermissionNamesByIds(ids: readonly string[], client?: PoolClient): Promise<string[]> {
    if (ids.length === 0) return []
    const executor = client ?? this.pool
    const { rows } = await executor.query<{ name: string }>(`
      SELECT id::text AS id, name FROM auth.permissions WHERE id = ANY($1::bigint[]) ORDER BY name;`, [ids])
    return rows.map((row) => row.name)
  }

  /** Busca operação de criação anterior pelo ator e chave idempotente. */
  async findByCreationKey(
    actorId: string,
    key: string,
    client: PoolClient,
  ): Promise<{ role: Role; payload: Record<string, unknown> } | null> {
    const { rows } = await client.query<Role & { creationPayload: Record<string, unknown> }>(`
      SELECT ${ROLE_PROJECTION}, r.creation_payload AS "creationPayload",
        count(u.id) FILTER (WHERE u.active)::int AS "activeUserCount"
        FROM auth.roles r
        LEFT JOIN auth.users u ON u.role_id = r.id
       WHERE r.created_by = $1 AND r.creation_key = $2
       GROUP BY r.id LIMIT 1;`, [actorId, key])
    const row = rows[0]
    return row ? { role: row, payload: row.creationPayload } : null
  }

  /** Cria perfil com chave idempotente e autoria no banco. */
  async createProfile(input: CreateRoleRepositoryInput, client: PoolClient): Promise<Role | null> {
    const { rows } = await client.query<Role>(`
      INSERT INTO auth.roles (name, display_name, description, default_path, created_by, creation_key, creation_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (created_by, creation_key) WHERE creation_key IS NOT NULL DO NOTHING
      RETURNING id::text AS id, name, display_name AS "displayName", description,
        active, revision, default_path AS "defaultPath", 0::int AS "activeUserCount", created_at AS "createdAt";`,
    [input.name, input.displayName, input.description, input.defaultPath,
      input.createdBy, input.creationKey, JSON.stringify(input.creationPayload)])
    const role = rows[0]
    return role ?? null
  }

  /** Atualiza os dados mutáveis sem alterar o código estável ou a revisão vista pelo cliente. */
  async updateProfile(input: UpdateRoleRepositoryInput, client: PoolClient): Promise<Role | null> {
    const { rows } = await client.query<Role>(`
      UPDATE auth.roles
         SET display_name = $3, description = $4, default_path = $5,
             revision = revision + 1, updated_at = clock_timestamp()
       WHERE id = $1 AND revision = $2
       RETURNING id::text AS id, name, display_name AS "displayName", description,
         active, revision, default_path AS "defaultPath", 0::int AS "activeUserCount", created_at AS "createdAt";`,
    [input.id, input.expectedRevision, input.displayName, input.description, input.defaultPath])
    return rows[0] ?? null
  }

  /** Ativa ou arquiva um perfil sob revisão otimista. */
  async setProfileActive(id: string, expectedRevision: number, active: boolean, client: PoolClient): Promise<Role | null> {
    const { rows } = await client.query<Role>(`
      UPDATE auth.roles
         SET active = $3, revision = revision + 1, updated_at = clock_timestamp()
       WHERE id = $1 AND revision = $2
       RETURNING id::text AS id, name, display_name AS "displayName", description,
         active, revision, default_path AS "defaultPath", 0::int AS "activeUserCount", created_at AS "createdAt";`,
    [id, expectedRevision, active])
    return rows[0] ?? null
  }

  /** Troca grants logicamente sem apagar a linha associativa nem perder autoria temporal. */
  async replacePermissions(roleId: string, permissionNames: readonly string[], client: PoolClient): Promise<void> {
    await client.query(`UPDATE auth.role_permissions rp
       SET is_active = false
      FROM auth.permissions p
     WHERE rp.permission_id = p.id AND rp.role_id = $1 AND rp.is_active = true
       AND NOT (p.name = ANY($2::text[]));`, [roleId, permissionNames])
    await client.query(`INSERT INTO auth.role_permissions(role_id, permission_id, is_active)
      SELECT $1, p.id, true FROM auth.permissions p WHERE p.name = ANY($2::text[])
      ON CONFLICT (role_id, permission_id) DO UPDATE SET is_active = true;`, [roleId, permissionNames])
  }

  /** Grava evento append-only de perfil na mesma transação da alteração. */
  async recordRoleEvent(input: CreateRoleEventInput, client: PoolClient): Promise<void> {
    await client.query(`INSERT INTO auth.role_events (
        role_id, event_type, occurred_at, reported_by, registered_by, actor_snapshot,
        reason, evidence_description, before_state, after_state
      ) VALUES ($1, $2, clock_timestamp(), $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb);`, [
      input.roleId, input.eventType, input.actorId, input.actorId,
      JSON.stringify(input.actorSnapshot), input.reason, input.evidenceDescription ?? null,
      input.beforeState ? JSON.stringify(input.beforeState) : null, JSON.stringify(input.afterState),
    ])
  }

  /** Sérializa todas as operações que podem retirar capacidade de administrar acessos. */
  async lockAccessAdministration(client: PoolClient): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1, $2);', [ACCESS_ADMIN_LOCK_CLASS, ACCESS_ADMIN_LOCK_KEY])
  }

  /** Conta administradores efetivos, independente do código ou nome legível do perfil. */
  async countActiveAccessAdministrators(client: PoolClient): Promise<number> {
    const { rows } = await client.query<{ count: string }>(`
      SELECT count(DISTINCT u.id)::text AS count
        FROM auth.users u
        JOIN auth.roles r ON r.id = u.role_id AND r.active = true
       WHERE u.active = true
         AND (
           EXISTS (
             SELECT 1 FROM auth.role_permissions rp
             JOIN auth.permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'users:manage'
           ) OR (
             EXISTS (SELECT 1 FROM auth.role_permissions rp JOIN auth.permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'users:create')
             AND EXISTS (SELECT 1 FROM auth.role_permissions rp JOIN auth.permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'users:update')
             AND EXISTS (SELECT 1 FROM auth.role_permissions rp JOIN auth.permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'users:archive')
           )
         )
         AND (
           EXISTS (
             SELECT 1 FROM auth.role_permissions rp
             JOIN auth.permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'profiles:manage'
           ) OR EXISTS (
             SELECT 1 FROM auth.role_permissions rp
             JOIN auth.permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = r.id AND rp.is_active = true AND p.name = 'permissions:manage'
           )
         );`)
    return Number(rows[0]?.count ?? 0)
  }

  /** Conta vínculos de contas ativas antes de permitir arquivamento de um perfil. */
  async countActiveUsersByRole(roleId: string, client: PoolClient): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM auth.users WHERE role_id = $1 AND active = true;', [roleId],
    )
    return Number(rows[0]?.count ?? 0)
  }
}

const ROLE_PROJECTION = `
  r.id::text AS id,
  r.name,
  r.display_name AS "displayName",
  r.description,
  r.active,
  r.revision,
  r.default_path AS "defaultPath",
  r.created_at AS "createdAt"`
