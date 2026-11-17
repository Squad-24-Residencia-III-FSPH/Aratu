import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import type { ReportCatalogGroup, ReportDefinition, ReportPreview, ReportPrintData, ReportSelection } from '../reports/reportTypes'
import { defaultReportSelection, reportSelectionError, restoreReportSelection, saveReportSelection } from '../reports/reportAccess'
import { downloadReportCsv, exportReportCsv, fetchReportPreview, fetchReportPrintData, listReportCatalog } from '../services/reportsService'

const EMPTY_SELECTION: ReportSelection = { from: '', to: '', columns: [], filters: {} }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Não foi possível gerar o relatório. Tente novamente.' }

/** Mantém edição, resultado e exportação isolados; respostas antigas não substituem uma seleção nova. */
export function useReports(api: ApiRequest, userId: string | null, allowed: boolean, role: string) {
  const ownerKey = `${userId ?? ''}:${role}`
  const [catalogOwner, setCatalogOwner] = useState('')
  const [catalog, setCatalog] = useState<ReportCatalogGroup[]>([])
  const [module, setModule] = useState('')
  const [report, setReport] = useState<ReportDefinition | null>(null)
  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [printData, setPrintData] = useState<ReportPrintData | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [catalogVersion, setCatalogVersion] = useState(0)
  const generation = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  const exportLock = useRef(false)
  const invalidate = useCallback(() => { generation.current++; activeRequest.current?.abort() }, [])
  const chooseReport = useCallback((next: ReportDefinition | null) => {
    generation.current++
    activeRequest.current?.abort()
    setReport(next); setPreview(null); setPrintData(null); setError(''); setNotice(''); setLoading(false)
    if (!next) { setSelection(EMPTY_SELECTION); setWarning(''); return }
    if (!userId) { setSelection(defaultReportSelection(next)); return }
    try {
      const restored = restoreReportSelection(window.localStorage, userId, next)
      setSelection(restored.selection); setWarning(restored.warning)
    } catch { setSelection(defaultReportSelection(next)); setWarning('As preferências locais estão indisponíveis. A seleção padrão foi aplicada.') }
  }, [userId])

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    let current = true
    listReportCatalog(api, controller.signal).then(groups => {
      if (!current) return
      setCatalog(groups); setCatalogOwner(ownerKey); setModule(groups[0]?.module ?? ''); chooseReport(groups[0]?.reports[0] ?? null); setCatalogError('')
    }).catch(cause => { if (current) { setCatalogOwner(ownerKey); setCatalog([]); setPreview(null); setReport(null); setCatalogError(message(cause)) } }).finally(() => { if (current) setCatalogLoading(false) })
    return () => { current = false; controller.abort(); invalidate() }
  }, [api, allowed, catalogVersion, chooseReport, invalidate, ownerKey])

  useEffect(() => {
    if (!printData) return
    const frame = requestAnimationFrame(() => { window.print(); setPrintData(null) })
    return () => cancelAnimationFrame(frame)
  }, [printData])

  function changeSelection(next: ReportSelection): void {
    generation.current++; activeRequest.current?.abort()
    setSelection(next); setPreview(null); setPrintData(null); setLoading(false); setError(''); setNotice('')
    if (report && userId) {
      try { const warning = saveReportSelection(window.localStorage, userId, report, next); if (warning) setWarning(warning) }
      catch { setWarning('A seleção foi aplicada, mas as preferências locais estão indisponíveis.') }
    }
  }
  async function generate(page = 1): Promise<void> {
    if (!report || reportSelectionError(report, selection)) return
    const version = ++generation.current
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await fetchReportPreview(api, report.key, selection, page, controller.signal)
      if (version === generation.current) setPreview(result)
    } catch (cause) { if (version === generation.current) setError(message(cause)) }
    finally { if (version === generation.current) setLoading(false) }
  }
  async function exportResult(format: 'csv' | 'print'): Promise<void> {
    if (!report || reportSelectionError(report, selection) || exportLock.current) return
    exportLock.current = true
    const version = generation.current
    setExporting(true); setWarning(''); setNotice('')
    try {
      if (format === 'csv') {
        const result = await exportReportCsv(api, report.key, selection)
        if (version !== generation.current) return
        downloadReportCsv(result); setNotice('O arquivo CSV foi gerado e o download foi iniciado.')
      } else {
        const data = await fetchReportPrintData(api, report.key, selection)
        if (version === generation.current) setPrintData(data)
      }
    } catch (cause) { if (version === generation.current) setWarning(message(cause)) }
    finally { exportLock.current = false; setExporting(false) }
  }
  const currentOwner = catalogOwner === ownerKey
  return { catalog: currentOwner ? catalog : [], module: currentOwner ? module : '', report: currentOwner ? report : null,
    selection, preview: currentOwner ? preview : null, printData: currentOwner ? printData : null,
    catalogLoading: catalogLoading || !currentOwner, loading, exporting, catalogError: currentOwner ? catalogError : '', error, warning, notice,
    validation: report ? reportSelectionError(report, selection) : '', chooseReport, changeSelection, generate, exportResult,
    chooseModule(next: string) { setModule(next); chooseReport(catalog.find(group => group.module === next)?.reports[0] ?? null) },
    clearFilters() { if (report) changeSelection({ ...defaultReportSelection(report), columns: selection.columns }) },
    retryCatalog() { setCatalogLoading(true); setCatalogError(''); setCatalogVersion(value => value + 1) },
  }
}
