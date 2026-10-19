import type { Pool } from 'pg'
import jwt = require('jsonwebtoken')
import { USER_ROLES } from '../../src/types/auth'
import type { UserRole, JwtConfig } from '../../src/types/auth'
import { hashPassword } from '../../src/services/password.service'

/**
 * Senha padronizada 100% fictícia para os usuários de teste RBAC.
 */
export const RBAC_FIXTURE_PASSWORD = 'senha-ficticia-qa-123'

/**
 * Segredo simétrico exclusivo para assinatura e validação dos tokens nos testes de integração.
 */
export const RBAC_JWT_SECRET = 'segredo-ficticio-jwt-para-testes-de-integracao-aratu'

/**
 * Configuração canônica de ciclo de vida de tokens JWT para o ambiente de testes.
 */
export const RBAC_JWT_CONFIG: JwtConfig = {
  secret: RBAC_JWT_SECRET,
  expiresInSeconds: 28_800,
}

/**
 * Metadados fictícios dos 6 perfis RBAC do Sistema Aratu para isolamento de testes.
 */
const RBAC_USER_DEFINITIONS: ReadonlyArray<{
  role: UserRole
  name: string
  email: string
}> = [
  {
    role: 'ADMINISTRADOR',
    name: 'Administrador Fictício QA',
    email: 'admin.qa@example.test',
  },
  {
    role: 'GESTOR',
    name: 'Gestor Fictício QA',
    email: 'gestor.qa@example.test',
  },
  {
    role: 'SOLICITANTE',
    name: 'Solicitante Fictício QA',
    email: 'solicitante.qa@example.test',
  },
  {
    role: 'MOTORISTA',
    name: 'Motorista Fictício QA',
    email: 'motorista.qa@example.test',
  },
  {
    role: 'ATENDENTE_SVO',
    name: 'Atendente SVO Fictício QA',
    email: 'atendente.svo.qa@example.test',
  },
  {
    role: 'EQUIPE_SVO',
    name: 'Equipe SVO Fictícia QA',
    email: 'equipe.svo.qa@example.test',
  },
]

/**
 * Representação completa de um usuário de teste instanciado no banco de testes com token válido.
 */
export interface RbacTestUser {
  /** Identificador numérico no banco formatado como string. */
  id: string
  /** Nome completo fictício do usuário. */
  name: string
  /** E-mail fictício normalizado. */
  email: string
  /** Perfil RBAC ativo do usuário. */
  role: UserRole
  /** Identificador do perfil em `auth.roles`. */
  roleId: string
  /** Token JWT Bearer válido assinado para autenticação nas requisições de teste. */
  token: string
}

/**
 * Gera um token JWT com as claims padronizadas (`id` e `perfil`) do Sistema Aratu.
 *
 * @param user - Usuário com identificador e perfil canônico.
 * @param secret - Chave secreta simétrica para assinatura HS256.
 * @param options - Opções complementares para a biblioteca jsonwebtoken (ex: tempo de expiração customizado).
 * @returns Token JWT Bearer assinado.
 */
export function generateRbacUserToken(
  user: { id: string; role: UserRole },
  secret: string = RBAC_JWT_SECRET,
  options?: jwt.SignOptions,
): string {
  return jwt.sign(
    { id: user.id, perfil: user.role },
    secret,
    { algorithm: 'HS256', expiresIn: '8h', ...options },
  )
}

/**
 * Provisiona no banco PostgreSQL de testes (`aratu_test`) os 6 usuários de teste RBAC com dados fictícios.
 *
 * Garante idempotência através de cláusula `ON CONFLICT (lower(email)) DO UPDATE`, gerando hash bcrypt
 * seguro e tokens de autenticação válidos para cada um dos perfis oficiais.
 *
 * @param pool - Pool de conexões ativo conectado ao banco `aratu_test`.
 * @param secret - Segredo para emissão dos tokens JWT correspondentes.
 * @returns Mapa indexado por `UserRole` contendo os 6 usuários provisionados com seus tokens.
 * @throws {Error} Se algum perfil canônico não estiver previamente provisionado em `auth.roles`.
 */
export async function seedRbacTestUsers(
  pool: Pool,
  secret: string = RBAC_JWT_SECRET,
): Promise<Map<UserRole, RbacTestUser>> {
  const passwordHash = await hashPassword(RBAC_FIXTURE_PASSWORD)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Recupera os identificadores dos 6 perfis canônicos na tabela auth.roles
    const rolesResult = await client.query<{ id: string; name: UserRole }>(
      `SELECT id::text AS id, name
       FROM auth.roles
       WHERE name = ANY($1::text[])`,
      [USER_ROLES],
    )

    const roleMap = new Map<UserRole, string>()
    for (const row of rolesResult.rows) {
      roleMap.set(row.name, row.id)
    }

    const testUsers = new Map<UserRole, RbacTestUser>()

    for (const def of RBAC_USER_DEFINITIONS) {
      const roleId = roleMap.get(def.role)
      if (!roleId) {
        throw new Error(`Perfil RBAC ${def.role} não encontrado na tabela auth.roles. Execute o seed prévio.`)
      }

      const insertResult = await client.query<{ id: string; name: string; email: string; roleId: string }>(
        `INSERT INTO auth.users (name, email, password_hash, role_id, active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (lower(email)) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               role_id = EXCLUDED.role_id,
               active = true
         RETURNING
           id::text AS id,
           name,
           email,
           role_id::text AS "roleId"`,
        [def.name, def.email, passwordHash, roleId],
      )

      const row = insertResult.rows[0]
      if (!row) {
        throw new Error(`Falha ao persistir usuário de teste para o perfil ${def.role}.`)
      }

      const token = generateRbacUserToken({ id: row.id, role: def.role }, secret)

      testUsers.set(def.role, {
        id: row.id,
        name: row.name,
        email: row.email,
        role: def.role,
        roleId: row.roleId,
        token,
      })
    }

    await client.query('COMMIT')
    return testUsers
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
