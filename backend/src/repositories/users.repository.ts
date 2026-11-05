import type { Pool, PoolClient } from 'pg'
import type {
  UserForLogin,
  User,
  CreateUserInput,
  UpdateUserInput,
  UpdateUserResult,
  UserFilters,
  PaginatedUsers,
} from '../types/auth'

/**
 * Contrato para operações de persistência e consulta da entidade de usuários (`auth.users`).
 */
export interface UserRepository {
  /**
   * Localiza um usuário com base em seu endereço de e-mail normalizado para autenticação.
   *
   * @param email - Endereço de e-mail em minúsculas e sem espaços extras.
   * @returns Entidade do usuário com credenciais e perfil RBAC, ou `null` caso não exista.
   */
  findByEmail(email: string): Promise<UserForLogin | null>
}

/**
 * Contrato de persistência usado pelo gerenciamento administrativo de usuários.
 *
 * Mantém a interface de autenticação (`UserRepository`) enxuta e permite que testes
 * de service substituam apenas as operações efetivamente consumidas.
 */
export interface UsersRepositoryContract {
  withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>
  findById(id: string, client?: PoolClient): Promise<User | null>
  findByIdForUpdate(id: string, client: PoolClient): Promise<User | null>
  list(filters: UserFilters): Promise<PaginatedUsers>
  create(input: CreateUserInput, client?: PoolClient): Promise<User>
  save(id: string, input: UpdateUserInput, client?: PoolClient): Promise<UpdateUserResult>
}

/**
 * Repositório de acesso a dados da tabela `auth.users` no PostgreSQL 18 utilizando consultas parametrizadas.
 *
 * Realiza JOIN com `auth.roles` para projetar o nome do perfil RBAC nos contratos de saída.
 */
export class UsersRepository implements UserRepository, UsersRepositoryContract {
  private readonly pool: Pool

  /**
   * Inicializa o repositório com o pool de conexões do PostgreSQL.
   *
   * @param pool - Instância configurada do pool de conexões do driver `pg`.
   */
  constructor(pool: Pool) {
    this.pool = pool
  }

  /**
   * Executa uma unidade de trabalho em transação, garantindo commit/rollback e
   * devolução da conexão ao pool mesmo em falha.
   *
   * @param work - Callback que recebe o cliente transacional para executar as operações.
   * @returns Resultado produzido pelo callback após o commit.
   */
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

  /**
   * Busca um usuário pelo e-mail normalizado para o fluxo de autenticação.
   *
   * Projeta `password_hash` e o nome do perfil via JOIN com `auth.roles`.
   * Sargável com índice `auth_users_email_lower_unique`.
   *
   * @param email - Endereço de e-mail em letras minúsculas.
   * @returns Dados do usuário para validação de login ou `null` quando inexistente.
   */
  async findByEmail(email: string): Promise<UserForLogin | null> {
    const result = await this.pool.query<UserForLogin>(
      `SELECT
         u.id::text AS id,
         u.name,
         u.email,
         u.password_hash,
         u.role_id::text AS "roleId",
         r.name AS role,
         u.active AS is_active
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE lower(u.email) = $1
       LIMIT 1`,
      [email.trim().toLowerCase()],
    )
    return result.rows[0] ?? null
  }

  /**
   * Busca um usuário pelo identificador numérico projetando dados públicos (sem password_hash).
   *
   * @param id - Identificador do usuário.
   * @param client - Cliente transacional opcional.
   * @returns Entidade pública do usuário ou `null`.
   */
  async findById(id: string, client?: PoolClient): Promise<User | null> {
    const executor = client ?? this.pool
    const result = await executor.query<User>(
      `SELECT
         u.id::text AS id,
         u.name,
         u.email,
         u.role_id::text AS "roleId",
         r.name AS role,
         u.active,
         u.revision,
         u.created_at AS "createdAt",
         u.updated_at AS "updatedAt"
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.id = $1
       LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /**
   * Busca e trava a linha do usuário para leitura seguida de mutação.
   *
   * O `FOR UPDATE OF u` serializa alterações concorrentes de inativação, reativação
   * e edição, impedindo que dois administradores sobrescrevam a mesma conta.
   *
   * @param id - Identificador do usuário.
   * @param client - Cliente transacional obrigatório.
   * @returns Usuário travado para atualização ou `null`.
   */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<User | null> {
    const result = await client.query<User>(
      `SELECT
         u.id::text AS id,
         u.name,
         u.email,
         u.role_id::text AS "roleId",
         r.name AS role,
         u.active,
         u.revision,
         u.created_at AS "createdAt",
         u.updated_at AS "updatedAt"
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.id = $1
       FOR UPDATE OF u
       LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  /**
   * Lista usuários com filtros opcionais e paginação.
   *
   * Suporta filtro por perfil (`roleId`), status (`active`), busca textual por nome/e-mail
   * e paginação com LIMIT/OFFSET. Projeta o nome do perfil via JOIN.
   *
   * @param filters - Critérios de filtragem e paginação.
   * @returns Resultado paginado com lista de usuários e metadados.
   */
  async list(filters: UserFilters = {}): Promise<PaginatedUsers> {
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (filters.roleId !== undefined) {
      conditions.push(`u.role_id = $${paramIndex++}`)
      params.push(filters.roleId)
    }

    if (filters.role !== undefined) {
      conditions.push(`r.name = $${paramIndex++}`)
      params.push(filters.role)
    }

    if (filters.active !== undefined) {
      conditions.push(`u.active = $${paramIndex++}`)
      params.push(filters.active)
    }

    if (filters.search) {
      const searchParam = `%${filters.search.toLowerCase()}%`
      conditions.push(`(lower(u.name) LIKE $${paramIndex} OR lower(u.email) LIKE $${paramIndex})`)
      paramIndex++
      params.push(searchParam)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       ${whereClause}`,
      params,
    )
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10)

    const dataParams = [...params, pageSize, offset]
    const result = await this.pool.query<User>(
      `SELECT
         u.id::text AS id,
         u.name,
         u.email,
         u.role_id::text AS "roleId",
         r.name AS role,
         u.active,
         u.revision,
         u.created_at AS "createdAt",
         u.updated_at AS "updatedAt"
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       ${whereClause}
       ORDER BY u.id ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams,
    )

    return {
      users: result.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /**
   * Cria um novo usuário no banco normalizando o e-mail e vinculando ao perfil via role_id.
   *
   * @param input - Dados para cadastro do usuário.
   * @param client - Cliente transacional opcional.
   * @returns Entidade pública do usuário criado.
   */
  async create(input: CreateUserInput, client?: PoolClient): Promise<User> {
    const executor = client ?? this.pool
    const normalizedEmail = input.email.trim().toLowerCase()
    const active = input.active ?? true

    const result = await executor.query<User>(
      `INSERT INTO auth.users (name, email, password_hash, role_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id::text AS id,
         name,
         email,
         role_id::text AS "roleId",
         active,
         revision,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [input.name, normalizedEmail, input.passwordHash, input.roleId, active],
    )

    const user = result.rows[0]
    if (!user) {
      throw new Error('A criação do usuário não retornou os dados esperados.')
    }

    const roleResult = await executor.query<{ name: string }>(
      `SELECT name FROM auth.roles WHERE id = $1 LIMIT 1`,
      [input.roleId],
    )
    const role = roleResult.rows[0]
    if (!role) {
      throw new Error('O perfil informado não foi encontrado após a criação do usuário.')
    }
    return { ...user, role: role.name as User['role'] }
  }

  /**
   * Persiste alterações em um usuário existente por meio do contrato de gerenciamento.
   *
   * @param id - Identificador do usuário a atualizar.
   * @param input - Campos a serem alterados.
   * @param client - Cliente transacional opcional.
   * @returns Resultado discriminado que separa usuário inexistente de conflito de revisão.
   */
  async save(id: string, input: UpdateUserInput, client?: PoolClient): Promise<UpdateUserResult> {
    return this.update(id, input, client)
  }

  /**
   * Atualiza parcialmente os dados de um usuário existente.
   *
   * Incrementa automaticamente `revision` e atualiza `updated_at`.
   *
   * @param id - Identificador do usuário a atualizar.
   * @param input - Campos a serem alterados.
   * @param client - Cliente transacional opcional.
   * @returns Resultado discriminado que separa usuário inexistente de conflito de revisão.
   */
  async update(id: string, input: UpdateUserInput, client?: PoolClient): Promise<UpdateUserResult> {
    const executor = client ?? this.pool

    const setClauses: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`)
      params.push(input.name)
    }

    if (input.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`)
      params.push(input.email.trim().toLowerCase())
    }

    if (input.roleId !== undefined) {
      setClauses.push(`role_id = $${paramIndex++}`)
      params.push(input.roleId)
    }

    if (input.active !== undefined) {
      setClauses.push(`active = $${paramIndex++}`)
      params.push(input.active)
    }

    if (input.passwordHash !== undefined) {
      setClauses.push(`password_hash = $${paramIndex++}`)
      params.push(input.passwordHash)
    }

    if (setClauses.length === 0) {
      const user = await this.findById(id, client)
      if (!user) return { kind: 'not-found' }
      return user.revision === input.expectedRevision
        ? { kind: 'updated', user }
        : { kind: 'revision-conflict' }
    }

    setClauses.push(`revision = revision + 1`)
    setClauses.push(`updated_at = clock_timestamp()`)

    params.push(id, input.expectedRevision)

    const result = await executor.query<User>(
      `UPDATE auth.users
          SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex++}
          AND revision = $${paramIndex}
        RETURNING
          id::text AS id,
          name,
          email,
          role_id::text AS "roleId",
          active,
          revision,
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
      params,
    )

    if (result.rows.length === 0) {
      const user = await this.findById(id, client)
      return user ? { kind: 'revision-conflict' } : { kind: 'not-found' }
    }

    const user = result.rows[0]
    if (!user) return { kind: 'not-found' }

    const roleResult = await executor.query<{ name: string }>(
      `SELECT name FROM auth.roles WHERE id = $1 LIMIT 1`,
      [user.roleId],
    )
    const role = roleResult.rows[0]
    if (!role) {
      throw new Error('O perfil informado não foi encontrado após a atualização do usuário.')
    }
    return { kind: 'updated', user: { ...user, role: role.name as User['role'] } }
  }
}
