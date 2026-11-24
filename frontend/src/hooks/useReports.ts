import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import type { ReportCatalogGroup, ReportDefinition, ReportPreview, ReportPrintData, ReportSelection } from '../reports/reportTypes'
import { defaultReportSelection, reportSelectionError, restoreReportSelection, saveReportSelection } from '../reports/reportAccess'
import { ReportApiError, downloadReportCsv, exportReportCsv, fetchReportPreview, fetchReportPrintData, listReportCatalog } from '../services/reportsService'
import {
  buildReportSelectionSignature,
  mapApiReportErrorToField,
  mergeReportValidationErrors,
  resolveAppliedFilterSummaries,
  validateReportSelection,
  type AppliedReportFilterSummary,
  type ReportInvalidTarget,
  type ReportValidationErrors,
} from '../pages/reportsPage/reportHelpers'

const EMPTY_SELECTION: ReportSelection = { from: '', to: '', columns: [], filters: {} }

export interface ConfirmedPreviewMeta {
  signature: string
  reportKey: string
  generatedAt: string
  appliedFilters: readonly AppliedReportFilterSummary[]
}

export interface ReportFocusRequest {
  target: ReportInvalidTarget | 'printTrigger'
  seq: number
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível gerar o relatório. Tente novamente.'
}

/**
 * Gerencia o catálogo modular de relatórios, validação por campo, conferência obrigatória da prévia
 * e ciclo de exportação CSV / preparo de impressão com sinalização de restauração de foco.
 */
export function useReports(api: ApiRequest, userId: string | null, allowed: boolean, role: string) {
  const ownerKey = `${userId ?? ''}:${role}`
  const [catalogOwner, setCatalogOwner] = useState('')
  const [catalog, setCatalog] = useState<ReportCatalogGroup[]>([])
  const [module, setModule] = useState('')
  const [report, setReport] = useState<ReportDefinition | null>(null)
  const [selection, setSelection] = useState(EMPTY_SELECTION)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [confirmedMeta, setConfirmedMeta] = useState<ConfirmedPreviewMeta | null>(null)
  const [selectionChangedAfterPreview, setSelectionChangedAfterPreview] = useState(false)
  const [serverFieldError, setServerFieldError] = useState<Partial<Pick<ReportValidationErrors, 'from' | 'to' | 'columns' | 'filters' | 'firstInvalid'>> | null>(null)
  const [focusRequest, setFocusRequest] = useState<ReportFocusRequest | null>(null)
  const [printData, setPrintData] = useState<ReportPrintData | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'print' | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [catalogVersion, setCatalogVersion] = useState(0)

  const generation = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  const exportLock = useRef(false)

  const requestFocus = useCallback((target: ReportInvalidTarget | 'printTrigger' | null) => {
    if (!target) return
    setFocusRequest(current => ({ target, seq: (current?.seq ?? 0) + 1 }))
  }, [])

  const invalidate = useCallback(() => {
    generation.current++
    activeRequest.current?.abort()
  }, [])

  const chooseReport = useCallback((next: ReportDefinition | null) => {
    generation.current++
    activeRequest.current?.abort()
    setReport(next)
    setPreview(null)
    setConfirmedMeta(null)
    setSelectionChangedAfterPreview(false)
    setServerFieldError(null)
    setPrintData(null)
    setError('')
    setNotice('')
    setLoading(false)
    if (!next) {
      setSelection(EMPTY_SELECTION)
      setWarning('')
      return
    }
    if (!userId) {
      setSelection(defaultReportSelection(next))
      return
    }
    try {
      const restored = restoreReportSelection(window.localStorage, userId, next)
      setSelection(restored.selection)
      setWarning(restored.warning)
    } catch {
      setSelection(defaultReportSelection(next))
      setWarning('As preferências locais estão indisponíveis. A seleção padrão foi aplicada.')
    }
  }, [userId])

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    let current = true
    listReportCatalog(api, controller.signal).then(groups => {
      if (!current) return
      setCatalog(groups)
      setCatalogOwner(ownerKey)
      setModule(groups[0]?.module ?? '')
      chooseReport(groups[0]?.reports[0] ?? null)
      setCatalogError('')
    }).catch(cause => {
      if (current) {
        setCatalogOwner(ownerKey)
        setCatalog([])
        setPreview(null)
        setConfirmedMeta(null)
        setReport(null)
        setCatalogError(message(cause))
      }
    }).finally(() => {
      if (current) setCatalogLoading(false)
    })
    return () => {
      current = false
      controller.abort()
      invalidate()
    }
  }, [api, allowed, catalogVersion, chooseReport, invalidate, ownerKey])

  useEffect(() => {
    if (!printData) return
    let finalized = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined

    const finalizePrint = () => {
      if (finalized) return
      finalized = true
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)
      window.removeEventListener('afterprint', finalizePrint)
      setPrintData(null)
      setNotice('Diálogo de impressão fechado. A gravação em PDF ou impressão depende da confirmação no navegador.')
      requestFocus('printTrigger')
    }

    const frame = requestAnimationFrame(() => {
      window.addEventListener('afterprint', finalizePrint, { once: true })
      window.print()
      if (!finalized) {
        fallbackTimer = setTimeout(() => {
          const stillPrinting = typeof window.matchMedia === 'function' && window.matchMedia('print').matches
          if (!stillPrinting) finalizePrint()
        }, 50)
      }
    })

    return () => {
      cancelAnimationFrame(frame)
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)
      window.removeEventListener('afterprint', finalizePrint)
    }
  }, [printData, requestFocus])

  function changeSelection(next: ReportSelection): void {
    generation.current++
    activeRequest.current?.abort()
    if (confirmedMeta !== null) setSelectionChangedAfterPreview(true)
    setConfirmedMeta(null)
    setServerFieldError(null)
    setSelection(next)
    setPreview(null)
    setPrintData(null)
    setLoading(false)
    setError('')
    setNotice('')
    if (report && userId) {
      try {
        const saveWarning = saveReportSelection(window.localStorage, userId, report, next)
        if (saveWarning) setWarning(saveWarning)
      } catch {
        setWarning('A seleção foi aplicada, mas as preferências locais estão indisponíveis.')
      }
    }
  }

  async function generate(page = 1): Promise<void> {
    if (!report) return
    const clientValidation = validateReportSelection(report, selection)
    if (clientValidation.summary) {
      requestFocus(clientValidation.firstInvalid)
      return
    }

    const requestSignature = buildReportSelectionSignature(report.key, selection)
    const requestFilters = resolveAppliedFilterSummaries(report, selection)
    const version = ++generation.current
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    setError('')
    setNotice('')
    setServerFieldError(null)

    try {
      const result = await fetchReportPreview(api, report.key, selection, page, controller.signal)
      if (version === generation.current) {
        setPreview(result)
        setConfirmedMeta({
          signature: requestSignature,
          reportKey: report.key,
          generatedAt: new Date().toISOString(),
          appliedFilters: requestFilters,
        })
        setSelectionChangedAfterPreview(false)
        setServerFieldError(null)
      }
    } catch (cause) {
      if (version === generation.current) {
        const errorMessage = message(cause)
        const errorCode = cause instanceof ReportApiError ? cause.code : undefined
        setError(errorMessage)
        const mapped = mapApiReportErrorToField(report, errorMessage, errorCode)
        if (mapped.firstInvalid) {
          setServerFieldError(mapped)
          requestFocus(mapped.firstInvalid)
        }
      }
    } finally {
      if (version === generation.current) setLoading(false)
    }
  }

  const currentOwner = catalogOwner === ownerKey
  const activeReport = currentOwner ? report : null
  const activePreview = currentOwner ? preview : null
  const activeConfirmedMeta = currentOwner ? confirmedMeta : null
  const fieldErrors: ReportValidationErrors = activeReport
    ? mergeReportValidationErrors(validateReportSelection(activeReport, selection), serverFieldError)
    : { filters: {}, summary: '', firstInvalid: null }
  const isPreviewConfirmed = Boolean(
    activeReport
    && activePreview
    && activeConfirmedMeta
    && activeConfirmedMeta.reportKey === activeReport.key
    && activeConfirmedMeta.signature === buildReportSelectionSignature(activeReport.key, selection),
  )

  async function exportResult(format: 'csv' | 'print'): Promise<void> {
    if (!activeReport || exportLock.current) return
    if (fieldErrors.summary) {
      requestFocus(fieldErrors.firstInvalid)
      return
    }
    if (!isPreviewConfirmed) return

    exportLock.current = true
    const version = generation.current
    setExporting(true)
    setExportingFormat(format)
    setWarning('')
    setNotice('')

    try {
      if (format === 'csv') {
        const result = await exportReportCsv(api, activeReport.key, selection)
        if (version !== generation.current) return
        downloadReportCsv(result)
        setNotice('O arquivo CSV foi gerado e o download foi iniciado.')
      } else {
        const data = await fetchReportPrintData(api, activeReport.key, selection)
        if (version === generation.current) setPrintData(data)
      }
    } catch (cause) {
      if (version === generation.current) setWarning(message(cause))
    } finally {
      exportLock.current = false
      setExporting(false)
      setExportingFormat(null)
    }
  }

  return {
    catalog: currentOwner ? catalog : [],
    module: currentOwner ? module : '',
    report: activeReport,
    selection,
    preview: activePreview,
    confirmedMeta: activeConfirmedMeta,
    isPreviewConfirmed,
    selectionChangedAfterPreview: currentOwner ? selectionChangedAfterPreview : false,
    focusRequest,
    printData: currentOwner ? printData : null,
    catalogLoading: catalogLoading || !currentOwner,
    loading,
    exporting,
    exportingFormat,
    catalogError: currentOwner ? catalogError : '',
    error,
    warning,
    notice,
    validation: activeReport ? reportSelectionError(activeReport, selection) : '',
    fieldErrors,
    chooseReport,
    changeSelection,
    generate,
    exportResult,
    chooseModule(next: string) {
      setModule(next)
      chooseReport(catalog.find(group => group.module === next)?.reports[0] ?? null)
    },
    clearFilters() {
      if (activeReport) changeSelection({ ...defaultReportSelection(activeReport), columns: selection.columns })
    },
    retryCatalog() {
      setCatalogLoading(true)
      setCatalogError('')
      setCatalogVersion(value => value + 1)
    },
  }
}
