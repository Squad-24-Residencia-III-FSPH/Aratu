import type { ReportExportFormat, ReportExportResult, ReportPrintPayload } from '../../../types/report.types'

export interface ReportExportStrategy {
  export(payload: ReportPrintPayload): ReportExportResult
}
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  // Espaços e controles antes de uma fórmula também são interpretados por planilhas.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/** CSV com BOM, escape de delimitadores e neutralização de fórmulas em cada célula. */
export class CsvReportExportStrategy implements ReportExportStrategy {
  /** Preserva a ordem das colunas e acrescenta somente as somas visíveis. */
  export(payload: ReportPrintPayload): ReportExportResult {
    const lines = [payload.columns.map(column => csvCell(column.label)).join(';'),
      ...payload.rows.map(row => payload.columns.map(column => csvCell(row[column.key])).join(';'))]
    if (Object.keys(payload.totals).length) {
      lines.push(payload.columns.map((column, index) => csvCell(payload.totals[column.key] ?? (index === 0 ? 'TOTAL' : ''))).join(';'))
    }
    const suffix = payload.period.from ? `${payload.period.from}-a-${payload.period.to}` : payload.generatedAt.slice(0, 10)
    return { format: 'csv', buffer: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'), filename: `relatorio-${payload.reportKey}-${suffix}.csv` }
  }
}
/** Mantém o conteúdo de impressão estruturado para renderização segura pelo React. */
export class PrintReportExportStrategy implements ReportExportStrategy {
  /** Inclui cabeçalho, filtros e resultado completo autorizado para impressão. */
  export(payload: ReportPrintPayload): ReportExportResult { return { format: 'print', payload } }
}
/** Seleciona o algoritmo por formato sem acoplar o motor à serialização. */
export class ReportExporterContext {
  private readonly strategies: Readonly<Record<ReportExportFormat, ReportExportStrategy>> = {
    csv: new CsvReportExportStrategy(), print: new PrintReportExportStrategy(),
  }
  /** Delega a serialização para o formato já validado no domínio. */
  export(format: ReportExportFormat, payload: ReportPrintPayload): ReportExportResult { return this.strategies[format].export(payload) }
}
