import type { Request, Response } from 'express'
import type { HealthService } from '../services/health.service'

/** Traduz prontidão em HTTP sem expor detalhes do banco ou de configuração. */
export function createHealthController(service?: HealthService) {
  return {
    live(_req: Request, res: Response): void {
      res.set('Cache-Control', 'no-store').json({ status: 'alive' })
    },
    async ready(_req: Request, res: Response): Promise<void> {
      const ready = await service?.isReady() ?? false
      res.set('Cache-Control', 'no-store').status(ready ? 200 : 503)
        .json({ status: ready ? 'ready' : 'unavailable' })
    },
  }
}
