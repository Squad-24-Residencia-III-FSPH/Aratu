import type { RequestHandler } from 'express'
import { InvalidAuditFilter, type AuditLogsService } from '../services/audit-logs.service'

/** Converte erros de filtros em respostas legíveis para a tela. */
export function createAuditLogsController(service: AuditLogsService): RequestHandler {
  return async (req, res) => {
    try {
      res.json(await service.list(req.query))
    } catch (error) {
      if (!(error instanceof InvalidAuditFilter)) throw error
      res.status(400).json({ erro: error.message })
    }
  }
}
