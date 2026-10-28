import dotenv from 'dotenv'
import { log } from 'node:console'
import process from 'node:process'
import { createApp } from './app'
import { createPool } from './database/pool'
import { loadJwtConfig } from './services/jwt-config.service'

dotenv.config({ path: '../.env' })

const PORT = Number(process.env.PORT ?? 3000)
const pool = createPool(process.env.DATABASE_URL ?? '')
const jwtConfig = loadJwtConfig(process.env)  

async function bootstrap(): Promise<void> {
  const app = createApp({ pool, jwtConfig })

  if (process.env.NODE_ENV !== 'production') {
    const { registerApiDocs } = await import('./docs/api-docs.js')
    registerApiDocs(app)
    log(`Documentação da API disponível em http://localhost:${PORT}/docs`)
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    log(`Servidor rodando na porta ${PORT}`)
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
