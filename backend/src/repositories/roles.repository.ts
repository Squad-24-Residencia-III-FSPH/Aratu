import type { Pool, PoolClient } from 'pg'
import type { Role, Permission, UserRole } from '../types/auth'

/**
 * Contrato para operações de persistência e consulta de perfis RBAC do Aratu.
 */
export interface RoleRepositoryContract {
  findAll(client?: PoolClient): Promise<Role[]>
  findById(id: string, client?: PoolClient): Promise<Role | null>
  findByName(name: UserRole, client?: PoolClient): Promise<Role | null>
  findPermissionsByRoleId(roleId: string, client?: PoolClient): Promise<Permission[]>
}

/**
 * Repositório de acesso a dados das tabelas `auth.roles` e `auth.role_permissions` no PostgreSQL 18.
 */
export class RolesRepository implements RoleRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /**
   * Lista todos os perfis de acesso cadastrados no sistema.
   *
   * @param client - Cliente transacional opcional para uso em operações atômicas.
   * @returns Lista de perfis ordenada por ID.
   */
  async findAll(client?: PoolClient): Promise<Role[]> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT id::text AS id, name, description, created_at AS "createdAt"
        FROM auth.roles
       ORDER BY id ASC;
    `)
    return rows
  }

  /**
   * Busca um perfil de acesso pelo identificador numérico.
   *
   * @param id - Identificador do perfil.
   * @param client - Cliente transacional opcional.
   * @returns Perfil encontrado ou `null` se inexistente.
   */
  async findById(id: string, client?: PoolClient): Promise<Role | null> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT id::text AS id, name, description, created_at AS "createdAt"
        FROM auth.roles
       WHERE id = $1
       LIMIT 1;
    `, [id])
    return rows[0] ?? null
  }

  /**
   * Busca um perfil pelo nome canônico (case-insensitive).
   *
   * @param name - Nome do perfil em UPPER_SNAKE_CASE.
   * @param client - Cliente transacional opcional.
   * @returns Perfil encontrado ou `null`.
   */
  async findByName(name: UserRole, client?: PoolClient): Promise<Role | null> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Role>(`
      SELECT id::text AS id, name, description, created_at AS "createdAt"
        FROM auth.roles
       WHERE upper(name) = upper($1)
       LIMIT 1;
    `, [name])
    return rows[0] ?? null
  }

  /**
   * Recupera as permissões atômicas atribuídas a um perfil específico.
   *
   * @param roleId - Identificador numérico do perfil.
   * @param client - Cliente transacional opcional.
   * @returns Lista de permissões associadas ao perfil.
   */
  async findPermissionsByRoleId(roleId: string, client?: PoolClient): Promise<Permission[]> {
    const executor = client ?? this.pool
    const { rows } = await executor.query<Permission>(`
      SELECT p.id::text AS id, p.name, p.description, p.created_at AS "createdAt"
        FROM auth.permissions p
        JOIN auth.role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.name ASC;
    `, [roleId])
    return rows
  }
}
