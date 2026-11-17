import type { ApiRequest } from '../api/client'
import type { ReportCatalogGroup, ReportColumn, ReportPreview, ReportPrintData, ReportSelection } from '../reports/reportTypes.ts'

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function columns(value: unknown): value is ReportColumn[] {
  return Array.isArray(value) && value.every(column => record(column) && typeof column.key === 'string' && typeof column.label === 'string'
    && ['text', 'number', 'currency', 'date', 'datetime', 'boolean', 'status'].includes(String(column.type)) && typeof column.defaultSelected === 'boolean')
}
async function responseFor(api: ApiRequest, path: string, signal?: AbortSignal): Promise<Response> {
  const response = await api(path, signal ? { signal } : undefined)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new Error(record(body) && typeof body.erro === 'string' ? body.erro : 'Não foi possível gerar o relatório. Tente novamente.')
  }
  return response
}
function invalid(): never { throw new Error('A resposta de relatórios da API está em um formato inválido.') }
function resultBody(body: unknown): boolean {
  return record(body) && typeof body.reportKey === 'string' && typeof body.title === 'string' && typeof body.module === 'string'
    && columns(body.columns) && Array.isArray(body.rows) && body.rows.every(row => record(row) && Object.values(row).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)))
    && typeof body.totalCount === 'number' && record(body.totals) && Object.values(body.totals).every(value => typeof value === 'string')
    && record(body.period) && [body.period.from, body.period.to].every(value => value === null || typeof value === 'string')
}
export function buildReportQuery(selection: ReportSelection, page?: number, format?: 'csv' | 'print'): string {
  const params = new URLSearchParams()
  if (selection.from) params.set('from', selection.from)
  if (selection.to) params.set('to', selection.to)
  params.set('columns', selection.columns.join(','))
  for (const [key, value] of Object.entries(selection.filters)) if (value) params.set(key, value)
  if (page !== undefined) params.set('page', String(page))
  if (format) params.set('format', format)
  return `?${params.toString()}`
}
export async function listReportCatalog(api: ApiRequest, signal?: AbortSignal): Promise<ReportCatalogGroup[]> {
  const body: unknown = await (await responseFor(api, '/reports/catalog', signal)).json()
  if (!Array.isArray(body) || !body.every(group => record(group) && typeof group.module === 'string' && Array.isArray(group.reports)
    && group.reports.every(report => record(report) && typeof report.key === 'string' && typeof report.title === 'string' && typeof report.description === 'string' && typeof report.module === 'string'
      && columns(report.columns) && record(report.period) && typeof report.period.required === 'boolean' && typeof report.period.maxDays === 'number'
      && Array.isArray(report.filters) && report.filters.every(filter => record(filter) && typeof filter.key === 'string' && typeof filter.label === 'string' && ['text', 'select', 'boolean'].includes(String(filter.type)))))) invalid()
  return body as ReportCatalogGroup[]
}
export async function fetchReportPreview(api: ApiRequest, key: string, selection: ReportSelection, page = 1, signal?: AbortSignal): Promise<ReportPreview> {
  const body: unknown = await (await responseFor(api, `/reports/${encodeURIComponent(key)}/preview${buildReportQuery(selection, page)}`, signal)).json()
  if (!resultBody(body) || !record(body) || !['page', 'pageSize', 'totalPages'].every(key => typeof body[key] === 'number')) invalid()
  return body as unknown as ReportPreview
}
export async function exportReportCsv(api: ApiRequest, key: string, selection: ReportSelection): Promise<{ blob: Blob; filename: string }> {
  const response = await responseFor(api, `/reports/${encodeURIComponent(key)}/export${buildReportQuery(selection, undefined, 'csv')}`)
  const filename = response.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] ?? `relatorio-${key}.csv`
  return { blob: await response.blob(), filename }
}
export async function fetchReportPrintData(api: ApiRequest, key: string, selection: ReportSelection): Promise<ReportPrintData> {
  const body: unknown = await (await responseFor(api, `/reports/${encodeURIComponent(key)}/export${buildReportQuery(selection, undefined, 'print')}`)).json()
  if (!resultBody(body) || !record(body) || typeof body.generatedAt !== 'string' || !record(body.generatedBy) || typeof body.generatedBy.name !== 'string'
    || !Array.isArray(body.appliedFilters) || !body.appliedFilters.every(filter => record(filter) && typeof filter.label === 'string' && typeof filter.value === 'string')) invalid()
  return body as unknown as ReportPrintData
}
export function downloadReportCsv(result: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(result.blob)
  const link = document.createElement('a')
  link.href = url; link.download = result.filename
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
