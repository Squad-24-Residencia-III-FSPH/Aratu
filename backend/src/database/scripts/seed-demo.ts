import { Buffer } from 'node:buffer'
import type { Pool } from 'pg'
import { createPool } from '../pool'
import { seedInitialAdmin, seedInitialFleet, seedInitialSvoTeam, seedRolesAndPermissions } from './seed'
import { UsersRepository } from '../../repositories/users.repository'
import { RolesRepository } from '../../repositories/roles.repository'
import { AuditRepository } from '../../repositories/audit.repository'
import { AuditService } from '../../services/audit.service'
import { UsersService } from '../../services/users.service'
import { USER_ROLES } from '../../types/auth'

/** Gera identificadores fictícios estáveis sem inserir dados institucionais reais. */
export function demoEmail(role: typeof USER_ROLES[number]): string {
  return `${role.toLowerCase()}.demo@example.test`
}

/** Provisiona seis contas auditadas; uma reexecução nunca troca senha ou perfil existente. */
export async function seedDemo(pool: Pool, password: string): Promise<void> {
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('A senha de homologação precisa ter pelo menos 12 caracteres e no máximo 72 bytes.')
  }
  await seedRolesAndPermissions(pool)
  const adminEmail = demoEmail('ADMINISTRADOR')
  await seedInitialAdmin(pool, { email: adminEmail, password, name: 'Administrador Fictício' })
  const users = new UsersRepository(pool)
  const roles = new RolesRepository(pool)
  const service = new UsersService(users, roles, new AuditService(new AuditRepository(pool)))
  const admin = await users.findByEmail(adminEmail)
  if (!admin?.is_active || admin.role !== 'ADMINISTRADOR') {
    throw new Error('A conta administrativa de homologação existente precisa estar ativa e ter o perfil correto.')
  }
  for (const role of USER_ROLES) {
    const email = demoEmail(role)
    const existing = await users.findByEmail(email)
    if (existing) {
      if (existing.role !== role || !existing.is_active) {
        throw new Error(`Conta fictícia existente incompatível com o perfil ${role}; ajuste pelo cadastro administrativo.`)
      }
      continue
    }
    const profile = await roles.findByName(role)
    if (!profile) throw new Error(`Perfil ${role} ausente. Execute as migrações.`)
    await service.createUser({ name: `Teste Fictício ${role}`, email, password, roleId: profile.id, active: true }, admin.id)
  }
  await seedInitialFleet(pool, adminEmail)
  await seedInitialSvoTeam(pool, adminEmail)
}

async function run(): Promise<void> {
  if (process.env.DEPLOYMENT_ENVIRONMENT !== 'homologation') {
    throw new Error('Este comando é exclusivo da homologação; defina DEPLOYMENT_ENVIRONMENT=homologation.')
  }
  const pool = createPool(process.env.DATABASE_URL ?? '')
  try {
    await seedDemo(pool, process.env.DEMO_PASSWORD ?? '')
    process.stdout.write('Contas fictícias dos seis perfis conferidas. Senhas existentes foram preservadas.\n')
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  void run().catch(() => {
    process.stderr.write('Falha no provisionamento de homologação. Confira configuração, migrations e contas existentes.\n')
    process.exitCode = 1
  })
}
