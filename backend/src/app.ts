import express from 'express'
import cors from 'cors'
import { error as logError } from 'node:console'
import type { Pool } from 'pg'
import { createAuthRouter } from './routes/auth.routes'
import { createProfileRouter } from './routes/profile.routes'
import type { JwtConfig } from './types/auth'
import type { AuditRepositoryContract } from './types/audit.types'
import { AuditRepository } from './repositories/audit.repository'
import type { UserRepository } from './repositories/users.repository'
import { UsersRepository } from './repositories/users.repository'
import type { RoleRepositoryContract } from './repositories/roles.repository'
import { RolesRepository } from './repositories/roles.repository'
import { AuditService } from './services/audit.service'
import { ProfileService } from './services/profile.service'
import { VehiclesRepository } from './repositories/vehicles.repository'
import { VehiclesService } from './services/vehicles.service'
import { createVehiclesRouter } from './routes/vehicles.routes'
import { UsersService } from './services/users.service'
import { createUsersRouter } from './routes/users.routes'

/**
 * Dependências injetadas para inicialização da aplicação Express do Aratu.
 */
export interface AppDependencies {
  /** Configurações de autenticação e expiração de tokens JWT. */
  jwtConfig: JwtConfig
  /** Repositório de usuários customizado (utilizado primariamente em testes unitários). */
  users?: UserRepository
  /** Repositório de perfis RBAC customizado (utilizado primariamente em testes). */
  roles?: RoleRepositoryContract
  /** Repositório de auditoria customizado para gravação em `audit.logs`. */
  audits?: AuditRepositoryContract
  /** Pool de conexões com o PostgreSQL 18 para instanciação dos repositórios padrão. */
  pool?: Pool
}

/**
 * Fábrica principal da aplicação Express do Sistema Aratu.
 *
 * Configura middlewares essenciais (CORS, parser JSON e tratamento global de erros),
 * instancia as dependências necessárias e registra as rotas dos módulos.
 *
 * @param dependencies - Configurações e instâncias de repositórios/pool necessárias para a aplicação.
 * @returns Instância configurada do aplicativo Express.
 * @throws {Error} Se nem o repositório de usuários nem o pool PostgreSQL forem informados.
 */
export function createApp({ jwtConfig, users, roles, audits, pool }: AppDependencies) {
  const userRepository = users ?? (pool ? new UsersRepository(pool) : null)
  if (!userRepository) throw new Error('O repository de usuários ou o pool PostgreSQL é obrigatório.')

  const rolesRepository = roles ?? (pool ? new RolesRepository(pool) : undefined)
  const auditRepository = audits ?? (pool ? new AuditRepository(pool) : undefined)
  const auditService = auditRepository ? new AuditService(auditRepository) : undefined

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.get('/', (_req, res) => {
    res.json({ mensagem: 'Servidor Express rodando com sucesso no Docker!' })
  })
  app.use('/auth', createAuthRouter(userRepository, jwtConfig, auditService))
  if (rolesRepository) {
    app.use('/profiles', createProfileRouter(new ProfileService(rolesRepository), jwtConfig.secret))
  }
  if (pool && auditService) {
    const vehiclesRepository = new VehiclesRepository(pool)
    const vehiclesService = new VehiclesService(vehiclesRepository, auditService)
    app.use('/vehicles', createVehiclesRouter(vehiclesService, jwtConfig))
  }
  if (rolesRepository && auditService && userRepository instanceof UsersRepository) {
    const usersService = new UsersService(userRepository, rolesRepository, auditService)
    app.use('/users', createUsersRouter(usersService, jwtConfig))
  }
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
