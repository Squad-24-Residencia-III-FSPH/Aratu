import type { Pool } from 'pg'
import type { UserForLogin } from '../types/auth'

/**
 * Contrato para operações de persistência e consulta da entidade de usuários (`usr_user`).
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
 * Repositório de acesso a dados da tabela `usr_user` no PostgreSQL 18 utilizando consultas parametrizadas.
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
   * Busca um usuário pelo e-mail normalizado projetando as colunas de `usr_user` para o contrato de autenticação.
   *
   * Remove o prefixo físico `usr_` via projeção SQL explícita (`usr_id::text AS id`), evitando vazamento
   * de detalhes do schema físico e aproveitando o índice sargável `usr_email_lower_unique`.
   *
   * @param email - Endereço de e-mail em letras minúsculas.
   * @returns Dados do usuário para validação de login ou `null` quando inexistente.
   */
  async findByEmail(email: string): Promise<UserForLogin | null> {
    const result = await this.pool.query<UserForLogin>(
      `SELECT
         usr_id::text AS id,
         usr_name AS name,
         usr_email AS email,
         usr_password_hash AS password_hash,
         usr_role AS role,
         usr_active AS is_active
       FROM usr_user
       WHERE lower(usr_email) = $1
       LIMIT 1`,
      [email],
    )
    return result.rows[0] ?? null
  }
}

