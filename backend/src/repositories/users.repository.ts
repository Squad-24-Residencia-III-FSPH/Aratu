import type { Pool } from 'pg'
import type { UserForLogin } from '../types/auth'

/**
 * Contrato para operações de persistência e consulta da entidade de usuários (`auth.users`).
 */
export interface UserRepository {
  /**
   * Localiza um usuário ativo ou inativo com base em seu endereço de e-mail normalizado.
   *
   * @param email - Endereço de e-mail em minúsculas e sem espaços extras.
   * @returns Entidade do usuário com credenciais e perfil RBAC, ou `null` caso não exista.
   */
  findByEmail(email: string): Promise<UserForLogin | null>
}

/**
 * Repositório de acesso a dados da tabela `auth.users` no PostgreSQL 18 utilizando consultas parametrizadas.
 */
export class UsersRepository implements UserRepository {
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
   * Busca um usuário pelo e-mail normalizado projetando as colunas de `auth.users` para o contrato de autenticação.
   *
   * Projeta explicitamente as colunas necessárias e aproveita o índice sargável `auth_users_email_lower_unique`.
   *
   * @param email - Endereço de e-mail em letras minúsculas.
   * @returns Dados do usuário para validação de login ou `null` quando inexistente.
   */
  async findByEmail(email: string): Promise<UserForLogin | null> {
    const result = await this.pool.query<UserForLogin>(
      `SELECT
         id::text AS id,
         name,
         email,
         password_hash,
         role,
         active AS is_active
       FROM auth.users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email.trim().toLowerCase()],
    )
    return result.rows[0] ?? null
  }
}
