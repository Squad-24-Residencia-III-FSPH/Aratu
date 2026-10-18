import express from 'express'
import cors from 'cors'
import { error as logError } from 'node:console'
import type { Pool } from 'pg'
import { createAuthRouter } from './routes/auth.routes'
import type { JwtConfig } from './types/auth'
import type { UserRepository } from './repositories/users.repository'
import { UsersRepository } from './repositories/users.repository'

export interface AppDependencies {
  jwtConfig: JwtConfig
  users?: UserRepository
  pool?: Pool
}

export function createApp({ jwtConfig, users, pool }: AppDependencies) {
  const userRepository = users ?? (pool ? new UsersRepository(pool) : null)
  if (!userRepository) throw new Error('O repository de usuários ou o pool PostgreSQL é obrigatório.')

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.get('/', (_req, res) => {
    res.json({ mensagem: 'Servidor Express rodando com sucesso no Docker!' })
  })
  app.use('/auth', createAuthRouter(userRepository, jwtConfig))
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error)
      return
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ erro: 'O corpo da requisição deve conter JSON válido.' })
      return
    }
    logError('Erro interno na API:', error)
    res.status(500).json({ erro: 'Erro interno do servidor.' })
  })
  return app
}
