import type { RequestHandler } from 'express'
import type { ReportsService } from '../services/reports.service'
import { ReportServiceError } from '../types/report.types'
import type { ReportErrorCode } from '../types/report.types'

const ERROR_STATUS: Record<ReportErrorCode, number> = { REPORT_NOT_FOUND: 404, FORBIDDEN_REPORT: 403, INACTIVE_ACTOR: 401,
  INVALID_INPUT: 400, INVALID_PERIOD: 400, INVALID_DATE_RANGE: 422, PERIOD_TOO_LARGE: 422, NO_COLUMNS_SELECTED: 400,
  INVALID_COLUMN: 400, INVALID_FILTER: 400, INVALID_EXPORT_FORMAT: 400, EXPORT_LIMIT_EXCEEDED: 422, PRINT_LIMIT_EXCEEDED: 422 }
export function createReportsController(service: ReportsService): Record<'catalog' | 'preview' | 'export', RequestHandler> {
  const handle = (work: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await work(req, res, next) } catch (error) {
      if (error instanceof ReportServiceError) { res.status(ERROR_STATUS[error.code]).json({ erro: error.message, code: error.code }); return }
      next(error)
    }
  }
  return {
    catalog: handle((req, res) => { res.json(service.getCatalogForRole(req.usuario!.perfil)) }),
    preview: handle(async (req, res) => { res.json(await service.previewReport(String(req.params.reportKey), req.query, req.usuario!)) }),
    export: handle(async (req, res) => {
      const result = await service.exportReport(String(req.params.reportKey), req.query, req.usuario!)
      res.setHeader('Cache-Control', 'no-store')
      if (result.format === 'print') { res.json(result.payload); return }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      res.send(result.buffer)
    }),
  }
}
