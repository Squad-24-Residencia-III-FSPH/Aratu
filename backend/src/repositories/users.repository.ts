import type { Pool } from 'pg'
import type { UserForLogin } from '../types/auth'

export interface UserRepository {
  findByEmail(email: string): Promise<UserForLogin | null>
}

export class UsersRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserForLogin | null> {
    const result = await this.pool.query<UserForLogin>(
      `SELECT id, name, email, password_hash, role, is_active
       FROM users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email],
    )
    return result.rows[0] ?? null
  }
}
