import dotenv from 'dotenv'
import { createPool } from '../pool'
import { hashPassword } from '../../services/password.service'

dotenv.config({ path: '../.env' })

async function runSeed() {
  const pool = createPool(process.env.DATABASE_URL ?? '')
  const defaultPassword = 'senha-sintetica-123'
  const passwordHash = await hashPassword(defaultPassword)

  console.log(`Hashing de senha padrão gerado: ${defaultPassword}`)

  const users = [
    { name: 'Administrador Teste', email: 'admin@aratu.test', role: 'ADMINISTRADOR', active: true },
    { name: 'Gestor de Frota Teste', email: 'gestor@aratu.test', role: 'GESTOR', active: true },
    { name: 'Solicitante FSPH Teste', email: 'solicitante@aratu.test', role: 'SOLICITANTE', active: true },
    { name: 'Motorista Teste', email: 'motorista@aratu.test', role: 'MOTORISTA', active: true },
    { name: 'Atendente SVO Teste', email: 'atendente.svo@aratu.test', role: 'ATENDENTE_SVO', active: true },
    { name: 'Equipe SVO Teste', email: 'equipe.svo@aratu.test', role: 'EQUIPE_SVO', active: true },
    { name: 'Usuário Inativo Teste', email: 'inativo@aratu.test', role: 'MOTORISTA', active: false },
  ]

  for (const u of users) {
    await pool.query(
      `INSERT INTO usr_user (usr_name, usr_email, usr_password_hash, usr_role, usr_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lower(usr_email)) DO UPDATE
       SET usr_name = EXCLUDED.usr_name,
           usr_password_hash = EXCLUDED.usr_password_hash,
           usr_role = EXCLUDED.usr_role,
           usr_active = EXCLUDED.usr_active`,
      [u.name, u.email, passwordHash, u.role, u.active],
    )
  }

  console.log('7 usuários sintéticos de desenvolvimento inseridos/atualizados com sucesso.')
  await pool.end()
}

runSeed().catch((err) => {
  console.error('Erro ao executar seed:', err)
  process.exit(1)
})
