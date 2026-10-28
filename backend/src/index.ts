import dotenv from 'dotenv'
import path from 'node:path'
import { log } from 'node:console'
import process from 'node:process'
import { createApp } from './app'
import { createPool } from './database/pool'
import { loadJwtConfig } from './services/jwt-config.service'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

async function bootstrap(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória para iniciar a API.')

  const port = Number(process.env.PORT ?? 3000)
  const pool = createPool(databaseUrl)
  const jwtConfig = loadJwtConfig(process.env)
  const app = createApp({ pool, jwtConfig })

  if (process.env.NODE_ENV !== 'production') {
    const { registerApiDocs } = await import('./docs/api-docs.js')
    registerApiDocs(app)
    log(`Documentação da API disponível em http://localhost:${port}/docs`)
  }

  const server = app.listen(port, '0.0.0.0', () => {
    log(`Servidor rodando na porta ${port}`)
  })

  function shutdown(): void {
    server.close((serverError) => {
      if (serverError) {
        log('Falha ao encerrar o servidor HTTP:', serverError)
        process.exit(1)
        return
      }
      void pool.end().then(
        () => process.exit(0),
        (error: unknown) => {
          log('Falha ao encerrar o pool PostgreSQL:', error)
          process.exit(1)
        },
      )
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void bootstrap().catch((error: unknown) => {
  log('Falha ao iniciar o servidor:', error)
  process.exit(1)
})
