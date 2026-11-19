import type { NextFunction, Request, Response } from 'express'
import { AuditLogsError } from '../types/audit-log.types'
import type { AuditLogsService } from '../services/audit-logs.service'

/** Adapta a consulta HTTP de auditoria para o service. */
export function createAuditLogsController(service: AuditLogsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { from, to, userId, operation, table, page, pageSize } = req.query
        res.status(200).json(await service.listLogs({ from, to, userId, operation, table, page, pageSize }))
      } catch (error) {
        if (error instanceof AuditLogsError) {
          res.status(error.statusCode).json({ erro: error.message })
          return
        }
        next(error)
      }
    },
  }
}
