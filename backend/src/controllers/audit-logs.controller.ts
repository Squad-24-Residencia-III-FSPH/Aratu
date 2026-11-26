import type { NextFunction, Request, Response } from 'express'
import { AuditLogsError } from '../types/audit-log.types'
import type { AuditLogsService } from '../services/audit-logs.service'

/** Adapta a consulta HTTP de auditoria para o service. */
export function createAuditLogsController(service: AuditLogsService) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { from, to, userId, operation, table, page, pageSize } = req.query
        const { recordId } = req.query
        res.status(200).json(await service.listLogs({ from, to, userId, operation, table, recordId, page, pageSize }))
      } catch (error) {
        if (error instanceof AuditLogsError) {
          res.status(error.statusCode).json({ erro: error.message })
          return
        }
        next(error)
      }
    },

    async recordHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        res.status(200).json(await service.getRecordHistory({
          entityType: req.params.entityType,
          recordId: req.params.recordId,
          from: req.query.from,
          to: req.query.to,
          page: req.query.page,
          pageSize: req.query.pageSize,
        }, {
          id: req.usuario?.id ?? '',
          permissions: req.usuario?.permissions ?? [],
        }))
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
