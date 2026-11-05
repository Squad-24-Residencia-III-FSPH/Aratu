import dotenv from 'dotenv'
import path from 'node:path'
import type { Pool } from 'pg'
import { createPool } from '../pool'
import { UsersRepository } from '../../repositories/users.repository'
import { RolesRepository } from '../../repositories/roles.repository'
import { AuditRepository } from '../../repositories/audit.repository'
import { hashPassword } from '../../services/password.service'
import type { UserRole } from '../../types/auth'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const ROLE_SEEDS: ReadonlyArray<{ name: UserRole; description: string }> = [
  { name: 'ADMINISTRADOR', description: 'Acesso global de parametrização e administração do sistema' },
  { name: 'GESTOR', description: 'Gestão operacional de frotas, condutores e aprovação de viagens FSPH' },
  { name: 'SOLICITANTE', description: 'Abertura e acompanhamento de requisições de transporte institucional' },
  { name: 'MOTORISTA', description: 'Acesso a viagens atribuídas e registro de hodômetro/execução' },
  { name: 'ATENDENTE_SVO', description: 'Recepção, triagem de chamados e solicitação de remoção cadavérica' },
  { name: 'EQUIPE_SVO', description: 'Atendimento operacional sigiloso, coleta e entrega cadavérica no SVO' },
]

const PERMISSION_SEEDS = [
  { name: 'users:manage', description: 'Gerenciar contas de usuários do sistema' },
  { name: 'permissions:manage', description: 'Gerenciar perfis e permissões de acesso do sistema' },
  { name: 'screens:access', description: 'Acessar as telas disponíveis para o perfil' },
] as const

const ADMIN_ONLY_PERMISSIONS = ['users:manage', 'permissions:manage'] as const

const INITIAL_SVO_VEHICLES = [
  { licensePlate: 'SVO1A01', brand: 'Chevrolet', model: 'S10', year: 2024, vehicleType: 'PICKUP_SVO' },
  { licensePlate: 'SVO1A02', brand: 'Chevrolet', model: 'S10', year: 2024, vehicleType: 'PICKUP_SVO' },
  { licensePlate: 'SVO1A03', brand: 'Chevrolet', model: 'S10', year: 2024, vehicleType: 'PICKUP_SVO' },
] as const

const INITIAL_FLEET_SERVICES = [
  {
    name: 'Remoção Cadavérica SVO',
    description: 'Coleta e remoção cadavérica operacional pelo Serviço de Verificação de Óbito',
    categories: ['BODY'],
    requiresTriage: true,
    requiresWeight: false,
    requiresIdentification: true,
  },
  {
    name: 'Transporte Institucional de Passageiros',
    description: 'Deslocamento institucional de servidores e equipes da FSPH',
    categories: ['PASSENGER'],
    requiresTriage: false,
    requiresWeight: false,
    requiresIdentification: false,
  },
  {
    name: 'Transporte de Amostras e Insumos',
    description: 'Logística de materiais biológicos, amostras laboratoriais e insumos hospitalares',
    categories: ['OTHER'],
    requiresTriage: false,
    requiresWeight: true,
    requiresIdentification: false,
  },
] as const

export interface InitialAdminConfig {
  email: string
  password: string
  name: string
}

/**
 * Provisiona a matriz RBAC inicial de forma idempotente.
 *
 * Todos os perfis recebem acesso às telas, enquanto apenas o Administrador pode
 * gerenciar usuários, perfis e permissões. A tabela associativa mantém a matriz
 * editável para futuras telas e ações sem alterar o código de autorização.
 *
 * @param pool - Pool PostgreSQL conectado ao banco que receberá os dados iniciais.
 */
export async function seedRolesAndPermissions(pool: Pool): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const role of ROLE_SEEDS) {
      await client.query(
        `INSERT INTO auth.roles (name, description)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [role.name, role.description],
      )
    }

    for (const permission of PERMISSION_SEEDS) {
      await client.query(
        `INSERT INTO auth.permissions (name, description)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [permission.name, permission.description],
      )
    }

    const roleResult = await client.query<{ id: string; name: UserRole }>(
      `SELECT id::text AS id, name
       FROM auth.roles
       WHERE name = ANY($1::text[])`,
      [ROLE_SEEDS.map((role) => role.name)],
    )
    const permissionResult = await client.query<{ id: string; name: string }>(
      `SELECT id::text AS id, name
       FROM auth.permissions
       WHERE name = ANY($1::text[])`,
      [PERMISSION_SEEDS.map((permission) => permission.name)],
    )
    const roleIds = new Map(roleResult.rows.map((role) => [role.name, role.id]))
    const permissionIds = new Map(permissionResult.rows.map((permission) => [permission.name, permission.id]))
    const screensAccessId = permissionIds.get('screens:access')
    const administratorId = roleIds.get('ADMINISTRADOR')

    if (!screensAccessId || !administratorId) {
      throw new Error('Não foi possível localizar os perfis ou permissões provisionados.')
    }

    for (const role of ROLE_SEEDS) {
      const roleId = roleIds.get(role.name)
      if (!roleId) {
        throw new Error(`O perfil ${role.name} não foi provisionado corretamente.`)
      }
      await client.query(
        `INSERT INTO auth.role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roleId, screensAccessId],
      )
    }

    for (const permissionName of ADMIN_ONLY_PERMISSIONS) {
      const permissionId = permissionIds.get(permissionName)
      if (!permissionId) {
        throw new Error(`A permissão ${permissionName} não foi provisionada corretamente.`)
      }
      await client.query(
        `INSERT INTO auth.role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [administratorId, permissionId],
      )
    }

    await client.query('COMMIT')
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Cria o Administrador inicial somente quando a conta ainda não existe.
 *
 * Registra a operação de forma atômica e imutável na tabela `audit.logs`
 * e valida regras de segurança para ambientes de produção.
 *
 * @param pool - Pool PostgreSQL que contém a matriz RBAC já provisionada.
 * @param config - Credenciais de ambiente para o primeiro Administrador.
 */
export async function seedInitialAdmin(pool: Pool, config: InitialAdminConfig): Promise<boolean> {
  const isProduction = process.env.NODE_ENV === 'production'
  const isPlaceholderPassword =
    config.password === 'replace-with-a-strong-password' || config.password.length < 8

  if (isProduction && isPlaceholderPassword) {
    throw new Error(
      'Segurança: Em ambiente de produção, INITIAL_ADMIN_PASSWORD não pode ser o placeholder padrão e deve conter no mínimo 8 caracteres.',
    )
  }

  const userRepository = new UsersRepository(pool)
  const rolesRepository = new RolesRepository(pool)
  const auditRepository = new AuditRepository(pool)

  const adminRole = await rolesRepository.findByName('ADMINISTRADOR')
  if (!adminRole) {
    throw new Error('Perfil ADMINISTRADOR não encontrado. Execute npm run db:migrate antes do seed.')
  }

  const existingUser = await userRepository.findByEmail(config.email)
  if (existingUser) return false

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const passwordHash = await hashPassword(config.password)
    const newUser = await userRepository.create(
      {
        name: config.name,
        email: config.email,
        passwordHash,
        roleId: adminRole.id,
        active: true,
      },
      client,
    )

    await auditRepository.create(
      {
        userId: newUser.id,
        table: 'auth.users',
        recordId: newUser.id,
        operation: 'INSERT',
        before: null,
        after: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          roleId: newUser.roleId,
          role: newUser.role,
          active: newUser.active,
        },
        actorSnapshot: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: 'ADMINISTRADOR',
        },
        reason: 'BOOTSTRAP_INITIAL_ADMIN',
      },
      client,
    )

    await client.query('COMMIT')
    return true
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Provisiona de forma idempotente as viaturas iniciais do SVO, o catálogo básico de
 * tipos de serviço e a matriz de compatibilidade veículo × serviço.
 *
 * Registra o evento `CREATED` em `fleet.vehicle_events` para cada viatura inserida,
 * vinculando a autoria ao Administrador inicial do sistema.
 *
 * @param pool - Pool PostgreSQL com as migrações do schema `fleet` aplicadas.
 * @param adminEmail - E-mail do Administrador inicial usado para compor o snapshot de autoria.
 */
export async function seedInitialFleet(pool: Pool, adminEmail: string): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const adminResult = await client.query<{
      id: string
      name: string
      email: string
      role: string
    }>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE lower(u.email) = lower($1)
        LIMIT 1`,
      [adminEmail.trim()],
    )
    const adminActor = adminResult.rows[0]
    if (!adminActor) {
      throw new Error(`Administrador inicial (${adminEmail}) não encontrado para assinar o seed da frota.`)
    }

    for (const vehicleSeed of INITIAL_SVO_VEHICLES) {
      const insertVehicle = await client.query<{
        id: string
        licensePlate: string
        brand: string | null
        model: string | null
        year: number | null
        vehicleType: string | null
        ownership: string
        categories: string[]
        seats: number
        bodyLimit: number
        weightLimit: number | null
        operationType: string
        status: string
        revision: number
        createdAt: Date
        updatedAt: Date
      }>(
        `INSERT INTO fleet.vehicles (
           license_plate, brand, model, year, vehicle_type, ownership,
           categories, seats, body_limit, weight_limit, operation_type, status
         )
         VALUES ($1, $2, $3, $4, $5, 'OWNED', ARRAY['BODY']::TEXT[], 2, 2, NULL, 'SVO', 'AVAILABLE')
         ON CONFLICT (upper(license_plate)) DO NOTHING
         RETURNING id::text AS id, license_plate AS "licensePlate", brand, model, year,
                   vehicle_type AS "vehicleType", ownership, categories, seats,
                   body_limit AS "bodyLimit", weight_limit::double precision AS "weightLimit",
                   operation_type AS "operationType", status, revision,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          vehicleSeed.licensePlate,
          vehicleSeed.brand,
          vehicleSeed.model,
          vehicleSeed.year,
          vehicleSeed.vehicleType,
        ],
      )

      const createdVehicle = insertVehicle.rows[0]
      if (createdVehicle) {
        await client.query(
          `INSERT INTO fleet.vehicle_events (
             vehicle_id, event_type, occurred_at, reported_by, registered_by,
             actor_snapshot, reason, before_state, after_state
           )
           VALUES ($1, 'CREATED', clock_timestamp(), 'Bootstrap do Sistema Aratu', $2, $3::jsonb, 'BOOTSTRAP_INITIAL_FLEET', NULL, $4::jsonb)`,
          [
            createdVehicle.id,
            adminActor.id,
            JSON.stringify(adminActor),
            JSON.stringify(createdVehicle),
          ],
        )
      }
    }

    for (const serviceSeed of INITIAL_FLEET_SERVICES) {
      await client.query(
        `INSERT INTO fleet.services (
           name, description, categories, requires_triage, requires_weight, requires_identification, active
         )
         VALUES ($1, $2, $3::TEXT[], $4, $5, $6, true)
         ON CONFLICT (lower(btrim(name))) DO NOTHING`,
        [
          serviceSeed.name,
          serviceSeed.description,
          serviceSeed.categories,
          serviceSeed.requiresTriage,
          serviceSeed.requiresWeight,
          serviceSeed.requiresIdentification,
        ],
      )
    }

    await client.query(
      `INSERT INTO fleet.vehicle_services (vehicle_id, service_id)
       SELECT v.id, s.id
         FROM fleet.vehicles v
         CROSS JOIN fleet.services s
        WHERE upper(v.license_plate) = ANY($1::TEXT[])
          AND lower(btrim(s.name)) = lower(btrim($2))
       ON CONFLICT (vehicle_id, service_id) DO NOTHING`,
      [
        INITIAL_SVO_VEHICLES.map((v) => v.licensePlate),
        'Remoção Cadavérica SVO',
      ],
    )

    await client.query('COMMIT')
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Provisiona de forma idempotente a equipe inicial de plantão do SVO (`Equipe Plantão SVO 01`)
 * e registra seu evento de criação em `svo.team_events` assinado pelo Administrador inicial.
 *
 * @param pool - Pool PostgreSQL com as migrações do schema `svo` aplicadas.
 * @param adminEmail - E-mail do Administrador inicial usado para compor o snapshot de autoria.
 */
export async function seedInitialSvoTeam(pool: Pool, adminEmail: string): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const adminResult = await client.query<{
      id: string
      name: string
      email: string
      role: string
    }>(
      `SELECT u.id::text AS id, u.name, u.email, r.name AS role
         FROM auth.users u
         JOIN auth.roles r ON r.id = u.role_id
        WHERE lower(u.email) = lower($1)
        LIMIT 1`,
      [adminEmail.trim()],
    )
    const adminActor = adminResult.rows[0]
    if (!adminActor) {
      throw new Error(`Administrador inicial (${adminEmail}) não encontrado para assinar o seed da equipe SVO.`)
    }

    const insertTeam = await client.query<{
      id: string
      name: string
      active: boolean
      revision: number
      createdAt: Date
      updatedAt: Date
    }>(
      `INSERT INTO svo.teams (name, active)
       VALUES ($1, true)
       ON CONFLICT (lower(btrim(name))) DO NOTHING
       RETURNING id::text AS id, name, active, revision,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      ['Equipe Plantão SVO 01'],
    )

    const createdTeam = insertTeam.rows[0]
    if (createdTeam) {
      await client.query(
        `INSERT INTO svo.team_events (
           team_id, event_type, occurred_at, reported_by, registered_by,
           actor_snapshot, reason, before_state, after_state
         )
         VALUES ($1, 'CREATED', clock_timestamp(), 'Bootstrap do Sistema Aratu', $2, $3::jsonb, 'BOOTSTRAP_INITIAL_SVO_TEAM', NULL, $4::jsonb)`,
        [
          createdTeam.id,
          adminActor.id,
          JSON.stringify(adminActor),
          JSON.stringify(createdTeam),
        ],
      )
    }

    await client.query('COMMIT')
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function loadInitialAdminConfig(): InitialAdminConfig | null {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!email || !password) return null

  return {
    email,
    password,
    name: process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador do Sistema',
  }
}

async function runSeed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  const adminConfig = loadInitialAdminConfig()

  if (!databaseUrl) {
    process.stderr.write('Erro: DATABASE_URL é obrigatória para o seed.\n')
    process.exit(1)
  }

  if (!adminConfig) {
    process.stderr.write('Erro: Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD no .env para o seed.\n')
    process.exit(1)
  }

  const pool = createPool(databaseUrl)

  try {
    await seedRolesAndPermissions(pool)
    const created = await seedInitialAdmin(pool, adminConfig)
    await seedInitialFleet(pool, adminConfig.email)
    await seedInitialSvoTeam(pool, adminConfig.email)
    const status = created ? 'criado e auditado com sucesso' : 'já existe na base'
    process.stdout.write(`Seed: matriz RBAC, frota e equipe SVO iniciais conferidas; Administrador "${adminConfig.email}" ${status}.\n`)
    if (created && process.env.NODE_ENV === 'production') {
      process.stdout.write('Aviso de Segurança: Altere a senha do Administrador no primeiro acesso ao sistema.\n')
    }
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  void runSeed().catch((error: unknown) => {
    process.stderr.write(`Falha fatal no seed de usuários: ${String(error)}\n`)
    process.exit(1)
  })
}
