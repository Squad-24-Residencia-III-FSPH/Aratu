import dotenv from 'dotenv'
import path from 'node:path'
import { createPool } from '../pool'
import { DatabaseMigrator } from '../migrator'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    process.stderr.write('Erro: DATABASE_URL não foi definida nas variáveis de ambiente.\n')
    process.exit(1)
  }

  const pool = createPool(databaseUrl)
  const migrator = new DatabaseMigrator()

  try {
    process.stdout.write('Iniciando execução de migrações no PostgreSQL 18...\n')
    const results = await migrator.runMigrations(pool)
    for (const res of results) {
      process.stdout.write(`- [${res.status.toUpperCase()}] ${res.version} - ${res.name} (${res.durationMs}ms)\n`)
    }
    process.stdout.write('Migrações concluídas com sucesso.\n')
  } finally {
    await pool.end()
  }
}

void run().catch((err: unknown) => {
  process.stderr.write(`Falha fatal na execução de migrações: ${String(err)}\n`)
  process.exit(1)
})
