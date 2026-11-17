import { Router } from 'express'
import { createHealthController } from '../controllers/health.controller'
import type { HealthService } from '../services/health.service'

/** Liveness não consulta o banco, permitindo suspensão do Neon durante inatividade. */
export function createHealthRouter(service?: HealthService): Router {
  const router = Router()
  const controller = createHealthController(service)
  router.get('/live', controller.live)
  router.get('/ready', controller.ready)
  return router
}
