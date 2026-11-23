import express from 'express'
import { DatabaseMigrator } from './database/migrator'
import { HealthRepository } from './repositories/health.repository'
import { HealthService } from './services/health.service'
import { createHealthRouter } from './routes/health.routes'
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
import { FuelingsRepository } from './repositories/fuelings.repository'
import { FuelingsService } from './services/fuelings.service'
import { createFuelingsRouter } from './routes/fuelings.routes'
import { MaintenanceOrdersRepository } from './repositories/maintenance-orders.repository'
import { MaintenanceOrdersService } from './services/maintenance-orders.service'
import { createMaintenanceOrdersRouter } from './routes/maintenance-orders.routes'
import { UsersService } from './services/users.service'
import { createUsersRouter } from './routes/users.routes'
import { RequestsRepository } from './repositories/requests.repository'
import { RequestsService } from './services/requests.service'
import { createRequestsRouter } from './routes/requests.routes'
import { DriversRepository } from './repositories/drivers.repository'
import { DriversService } from './services/drivers.service'
import { createDriversRouter } from './routes/drivers.routes'
import { ServicesRepository } from './repositories/services.repository'
import { FleetServicesService } from './services/fleet-services.service'
import { createServicesRouter } from './routes/services.routes'
import { FinesRepository } from './repositories/fines.repository'
import { FinesService } from './services/fines.service'
import { createFinesRouter } from './routes/fines.routes'
import { VehicleDocumentsRepository } from './repositories/vehicle-documents.repository'
import { VehicleDocumentsService } from './services/vehicle-documents.service'
import { DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS } from './services/vehicle-document-config.service'
import { createVehicleDocumentsRouter } from './routes/vehicle-documents.routes'
import { AvailabilityRepository } from './repositories/availability.repository'
import { AvailabilityService } from './services/availability.service'
import { createAvailabilityRouter } from './routes/availability.routes'
import { TripsRepository } from './repositories/trips.repository'
import { TripsService } from './services/trips.service'
import { createTripsRouter } from './routes/trips.routes'
import { RequestDecisionsRepository } from './repositories/request-decisions.repository'
import { RequestDecisionsService } from './services/request-decisions.service'
import { createRequestDecisionsRouter } from './routes/request-decisions.routes'
import { SvoOccurrencesRepository } from './repositories/svo-occurrences.repository'
import { SvoOccurrencesService } from './services/svo-occurrences.service'
import { createSvoOccurrencesRouter, svoErrorHandler } from './routes/svo-occurrences.routes'
import { SvoOrdersRepository } from './repositories/svo-orders.repository'
import { SvoOrdersService } from './services/svo-orders.service'
import { createSvoOrdersRouter, svoOrderErrorHandler } from './routes/svo-orders.routes'
import { ReportsRepository } from './repositories/reports.repository'
import { ReportsService } from './services/reports.service'
import { ReportRegistry } from './services/reports/report-registry'
import { createReportsRouter } from './routes/reports.routes'
import { AuditLogsRepository } from './repositories/audit-logs.repository'
import { AuditLogsService } from './services/audit-logs.service'
import { createAuditLogsRouter } from './routes/audit-logs.routes'
import { DashboardRepository } from './repositories/dashboard.repository'
import { DashboardService } from './services/dashboard.service'
import { createDashboardRouter } from './routes/dashboard.routes'

/**
 * Dependências injetadas para inicialização da aplicação Express do Aratu.
 */
export interface AppDependencies {
  /** Origem pública autorizada para clientes que acessam a API entre domínios. */
  corsOrigin?: string
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
  /** Prazo padrão de alerta de vencimento de documentos em dias corridos (padrão: 30). */
  vehicleDocumentAlertDays?: number
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
export function createApp({
  corsOrigin,
  jwtConfig,
  users,
  roles,
  audits,
  pool,
  vehicleDocumentAlertDays,
}: AppDependencies) {
  const userRepository = users ?? (pool ? new UsersRepository(pool) : null)
  if (!userRepository) throw new Error('O repository de usuários ou o pool PostgreSQL é obrigatório.')

  const rolesRepository = roles ?? (pool ? new RolesRepository(pool) : undefined)
  const auditRepository = audits ?? (pool ? new AuditRepository(pool) : undefined)
  const auditService = auditRepository ? new AuditService(auditRepository) : undefined

  const app = express()
  app.use(cors(corsOrigin ? { origin: corsOrigin } : {}))
  app.use(express.json())
  const health = pool ? new HealthService(new HealthRepository(pool), async () => {
    const files = await new DatabaseMigrator().loadFiles()
    return files.map(file => file.version)
  }) : undefined
  app.use('/health', createHealthRouter(health))
  app.get('/', (_req, res) => {
    res.json({ mensagem: 'Servidor Express rodando com sucesso no Docker!' })
  })
  app.use('/auth', createAuthRouter(userRepository, jwtConfig, auditService))
  if (rolesRepository) {
    app.use('/profiles', createProfileRouter(new ProfileService(rolesRepository), jwtConfig.secret))
  }
  if (pool && auditService) {
    const availabilityService = new AvailabilityService(new AvailabilityRepository(pool))
    app.use(createAvailabilityRouter(availabilityService, jwtConfig))
    const tripsService = new TripsService(new TripsRepository(pool), availabilityService, auditService, new FuelingsRepository(pool))
    app.use('/trips', createTripsRouter(tripsService, jwtConfig))
    const vehiclesRepository = new VehiclesRepository(pool)
    const vehiclesService = new VehiclesService(vehiclesRepository, auditService)
    app.use('/vehicles', createVehiclesRouter(vehiclesService, jwtConfig))
    const fuelingsService = new FuelingsService(new FuelingsRepository(pool), vehiclesRepository, auditService)
    app.use('/fuelings', createFuelingsRouter(fuelingsService, jwtConfig))
    const maintenanceService = new MaintenanceOrdersService(
      new MaintenanceOrdersRepository(pool), vehiclesRepository, vehiclesService, auditService,
    )
    app.use('/maintenance-orders', createMaintenanceOrdersRouter(maintenanceService, jwtConfig))
    const driversService = new DriversService(new DriversRepository(pool), auditService)
    app.use('/drivers', createDriversRouter(driversService, jwtConfig))
    const fleetServicesService = new FleetServicesService(new ServicesRepository(pool), auditService)
    app.use('/services', createServicesRouter(fleetServicesService, jwtConfig))
    const finesService = new FinesService(new FinesRepository(pool), vehiclesRepository,
      new DriversRepository(pool), auditService)
    const vehicleDocumentsService = new VehicleDocumentsService(
      new VehicleDocumentsRepository(pool),
      vehiclesRepository,
      auditService,
      vehicleDocumentAlertDays ?? DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS,
    )
    const currentUsersRepository = userRepository instanceof UsersRepository
      ? userRepository
      : new UsersRepository(pool)
    const reportsService = new ReportsService(new ReportsRepository(pool), new ReportRegistry(vehicleDocumentAlertDays), currentUsersRepository, auditService)
    app.use('/reports', createReportsRouter(reportsService, jwtConfig, currentUsersRepository))
    app.use('/audit-logs', createAuditLogsRouter(new AuditLogsService(new AuditLogsRepository(pool)), jwtConfig, currentUsersRepository))
    const dashboardService = new DashboardService(new DashboardRepository(pool), vehicleDocumentAlertDays ?? DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS)
    app.use('/dashboard', createDashboardRouter(dashboardService, jwtConfig, currentUsersRepository))
    app.use('/fines', createFinesRouter(finesService, jwtConfig, currentUsersRepository))
    app.use('/vehicle-documents', createVehicleDocumentsRouter(vehicleDocumentsService, jwtConfig, currentUsersRepository))
    const requestDecisionsService = new RequestDecisionsService(new RequestDecisionsRepository(pool), auditService)
    app.use('/requests', createRequestDecisionsRouter(requestDecisionsService, jwtConfig))
    const requestsService = new RequestsService(new RequestsRepository(pool), auditService)
    app.use('/requests', createRequestsRouter(requestsService, jwtConfig, currentUsersRepository))
    const svoService = new SvoOccurrencesService(new SvoOccurrencesRepository(pool), auditService)
    app.use('/svo/occurrences', createSvoOccurrencesRouter(svoService, jwtConfig, currentUsersRepository))
    const svoOrdersService = new SvoOrdersService(
      new SvoOccurrencesRepository(pool), new SvoOrdersRepository(), vehiclesRepository, auditService,
    )
    app.use('/svo/orders', createSvoOrdersRouter(svoOrdersService, jwtConfig, currentUsersRepository))
  }
  if (rolesRepository && auditService && userRepository instanceof UsersRepository) {
    const usersService = new UsersService(userRepository, rolesRepository, auditService)
    app.use('/users', createUsersRouter(usersService, jwtConfig))
  }
  app.use('/svo/occurrences', svoErrorHandler)
  app.use('/svo/orders', svoOrderErrorHandler)
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
