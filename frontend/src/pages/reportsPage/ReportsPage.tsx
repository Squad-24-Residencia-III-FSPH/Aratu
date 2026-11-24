import { useCallback, useEffect, useRef } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import { tokenUserId } from '../../auth/token'
import PageHeader from '../../components/ui/PageHeader'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import DataTable from '../../components/ui/DataTable'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { canAccessReports } from '../../reports/reportAccess'
import { formatReportCell } from '../../reports/reportPresentation'
import { REPORT_MODULE_LABELS } from '../../reports/reportTypes'
import { useReports } from '../../hooks/useReports'
import { formatAppliedFiltersText, formatReportIssuedAt, formatReportPeriod } from './reportHelpers'
import ReportColumnsSelector from './ReportColumnsSelector'
import ReportPrintView from './ReportPrintView'
import styles from './ReportsPage.module.css'

/** Orquestra o catálogo modular, a conferência obrigatória da prévia e a exportação dos relatórios operacionais. */
export default function ReportsPage() {
  const { api, session } = useAuth()
  const allowed = canAccessReports(session ? resolveProfile(session.perfil) : null)
  const state = useReports(api, session ? tokenUserId(session.token) : null, allowed, session?.perfil ?? '')

  const printTriggerRef = useRef<HTMLButtonElement | null>(null)
  const fromInputRef = useRef<HTMLInputElement | null>(null)
  const toInputRef = useRef<HTMLInputElement | null>(null)
  const filterWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const registerFilterRef = useCallback((key: string) => (node: HTMLDivElement | null) => {
    filterWrapperRefs.current[key] = node
  }, [])

  const { report, selection, preview, confirmedMeta, fieldErrors, focusRequest } = state
  const busy = state.loading || state.exporting

  useEffect(() => { document.title = 'Relatórios Operacionais — Aratu' }, [])

  useEffect(() => {
    if (!focusRequest || busy) return
    const focusNode = (node: HTMLElement | null | undefined) => {
      if (!node || ('disabled' in node && Boolean((node as HTMLButtonElement | HTMLInputElement).disabled))) return false
      node.scrollIntoView?.({ block: 'nearest' })
      node.focus()
      return true
    }

    if (focusRequest.target === 'printTrigger') {
      const target = printTriggerRef.current
      focusNode(target)
      const frame = requestAnimationFrame(() => {
        if (document.activeElement !== target) focusNode(target)
      })
      const timer = setTimeout(() => {
        if (document.activeElement !== target) focusNode(target)
      }, 0)
      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
      }
    }

    if (focusRequest.target === 'from') {
      focusNode(fromInputRef.current)
      return
    }
    if (focusRequest.target === 'to') {
      focusNode(toInputRef.current)
      return
    }
    if (focusRequest.target.startsWith('filter:')) {
      const key = focusRequest.target.slice('filter:'.length)
      const wrapper = filterWrapperRefs.current[key]
      focusNode(wrapper?.querySelector<HTMLElement>('input, [role="combobox"], select, textarea'))
    }
  }, [focusRequest, busy])

  if (!allowed) return <StateFeedback kind="forbidden" title="Seu perfil não tem permissão para gerar relatórios." />

  const canSubmitPreview = Boolean(report && selection.columns.length > 0 && !busy)
  const canExport = Boolean(report && state.isPreviewConfirmed && !fieldErrors.summary && !busy)
  const showConferenceGuidance = Boolean(report && !state.loading && !state.error && !state.isPreviewConfirmed)

  const totalsSummary = preview && state.isPreviewConfirmed && (
    <Stack role="status" aria-live="polite" spacing={0.5} sx={{ mt: 1 }}>
      <Typography>
        {preview.totalCount} {preview.totalCount === 1 ? 'registro encontrado.' : 'registros encontrados.'}
      </Typography>
      {preview.columns
        .filter(column => preview.totals[column.key] !== undefined)
        .map(column => (
          <Typography key={column.key} sx={{ fontWeight: 700 }}>
            {column.label} — total: {formatReportCell(preview.totals[column.key], column)}
          </Typography>
        ))}
    </Stack>
  )

  return (
    <Box
      className={styles.pageContainer}
      aria-busy={state.catalogLoading || busy}
      sx={{
        '& .MuiButton-root:not(.Mui-disabled)': { color: 'primary.dark', borderColor: 'primary.dark' },
        '& .MuiButton-contained:not(.Mui-disabled)': {
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover, &:focus-visible': { bgcolor: 'primary.dark', color: 'common.white' },
        },
        '& .MuiButton-root:focus-visible, & .MuiCheckbox-root:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.dark',
          outlineOffset: 2,
        },
        '& .MuiCheckbox-root.Mui-checked, & .MuiInputLabel-root.Mui-focused': { color: 'primary.dark' },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.dark' },
      }}
    >
      <PageHeader
        title="Relatórios Operacionais"
        description="Escolha o módulo, ajuste o período e as colunas e confira os dados na prévia antes de exportar."
        actions={(
          <>
            <Button
              variant="outlined"
              disabled={!canExport}
              aria-busy={state.exporting && state.exportingFormat === 'csv'}
              onClick={() => void state.exportResult('csv')}
            >
              Exportar CSV
            </Button>
            <Button
              ref={printTriggerRef}
              variant="outlined"
              disabled={!canExport}
              aria-busy={state.exporting && state.exportingFormat === 'print'}
              onClick={() => void state.exportResult('print')}
            >
              Imprimir relatório
            </Button>
          </>
        )}
      />

      {state.catalogLoading ? (
        <StateFeedback kind="loading" title="Carregando catálogo de relatórios..." />
      ) : state.catalogError ? (
        <StateFeedback kind="error" title={state.catalogError} actionLabel="Tentar novamente" onAction={state.retryCatalog} />
      ) : !state.catalog.length ? (
        <StateFeedback kind="empty" title="Nenhum relatório disponível para seu perfil." />
      ) : (
        <>
          <FilterBar label="Seleção do relatório">
            <FormSelect
              label="Módulo"
              disabled={busy}
              value={state.module}
              onChange={state.chooseModule}
              options={state.catalog.map(group => ({ value: group.module, label: REPORT_MODULE_LABELS[group.module] ?? group.module }))}
              sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }}
            />
            <FormSelect
              label="Tipo de relatório"
              disabled={busy}
              value={report?.key ?? ''}
              onChange={key => state.chooseReport(state.catalog.flatMap(group => group.reports).find(item => item.key === key) ?? null)}
              options={(state.catalog.find(group => group.module === state.module)?.reports ?? []).map(item => ({ value: item.key, label: item.title }))}
              sx={{ flex: 2, minWidth: { xs: 0, sm: 200 } }}
            />
          </FilterBar>

          {report && (
            <>
              <Typography>{report.description}</Typography>
              <Box component="form" noValidate onSubmit={event => { event.preventDefault(); void state.generate() }}>
                <FilterBar label="Período e filtros do relatório">
                  <FormField
                    label="Data inicial"
                    type="date"
                    required={report.period.required}
                    value={selection.from}
                    disabled={busy}
                    inputRef={fromInputRef}
                    error={fieldErrors.from}
                    helperText={`${report.period.label}. Máximo de ${report.period.maxDays} dias.`}
                    onChange={from => state.changeSelection({ ...selection, from })}
                    sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }}
                  />
                  <FormField
                    label="Data final"
                    type="date"
                    required={report.period.required}
                    value={selection.to}
                    disabled={busy}
                    inputRef={toInputRef}
                    error={fieldErrors.to}
                    onChange={to => state.changeSelection({ ...selection, to })}
                    sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }}
                  />
                  {report.filters.map(filter => (
                    <Box key={filter.key} ref={registerFilterRef(filter.key)} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }}>
                      {filter.type === 'text' ? (
                        <FormField
                          label={filter.label}
                          placeholder={filter.placeholder}
                          disabled={busy}
                          error={fieldErrors.filters[filter.key]}
                          value={selection.filters[filter.key] ?? ''}
                          maxLength={filter.key === 'licensePlatePrefix' ? 7 : undefined}
                          onChange={value => state.changeSelection({ ...selection, filters: { ...selection.filters, [filter.key]: value } })}
                        />
                      ) : (
                        <FormSelect
                          label={filter.label}
                          disabled={busy}
                          emptyLabel="Todas as opções"
                          error={fieldErrors.filters[filter.key]}
                          value={selection.filters[filter.key] ?? ''}
                          options={filter.options ?? []}
                          onChange={value => state.changeSelection({ ...selection, filters: { ...selection.filters, [filter.key]: value } })}
                        />
                      )}
                    </Box>
                  ))}
                  <Button type="submit" variant="contained" disabled={!canSubmitPreview}>Gerar prévia</Button>
                  <Button disabled={busy} onClick={state.clearFilters}>Limpar filtros</Button>
                </FilterBar>
              </Box>
              <ReportColumnsSelector
                columns={report.columns}
                selected={selection.columns}
                disabled={busy}
                onChange={columns => state.changeSelection({ ...selection, columns })}
              />
            </>
          )}
        </>
      )}

      {state.warning && <StateFeedback kind="partial" title={state.warning} />}
      {state.notice && <Typography role="status" aria-live="polite">{state.notice}</Typography>}
      {state.exporting && (
        <StateFeedback
          kind="loading"
          title={state.exportingFormat === 'print' ? 'Preparando impressão do relatório...' : 'Gerando arquivo CSV...'}
        />
      )}
      {state.error && (
        <StateFeedback
          kind="error"
          title={state.error}
          actionLabel="Tentar novamente"
          onAction={() => void state.generate(preview?.page ?? 1)}
        />
      )}

      {showConferenceGuidance && (
        <Paper
          component="section"
          role="region"
          aria-label="Conferência de seleção"
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, borderColor: state.selectionChangedAfterPreview ? 'warning.main' : 'divider' }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {state.selectionChangedAfterPreview
                  ? 'Critérios alterados após a última prévia'
                  : 'Conferência obrigatória antes de exportar'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {state.selectionChangedAfterPreview
                  ? 'A prévia anterior foi invalidada porque o relatório, período, filtros ou colunas mudaram. Gere uma nova prévia para conferir o recorte atual antes de exportar CSV ou imprimir; cada consulta lê os dados vigentes no servidor.'
                  : 'Gere a prévia para conferir os registros, os filtros aplicados e os totais do recorte atual antes de exportar CSV ou imprimir.'}
              </Typography>
            </Box>
            {state.selectionChangedAfterPreview && (
              <Button
                variant="outlined"
                disabled={!canSubmitPreview}
                onClick={() => void state.generate(1)}
                sx={{ flexShrink: 0 }}
              >
                Gerar nova prévia
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {preview && state.isPreviewConfirmed && confirmedMeta && (
        <Paper
          component="section"
          aria-label="Cabeçalho do relatório conferido"
          variant="outlined"
          sx={{ p: 2, borderRadius: 2 }}
        >
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            {preview.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Módulo: {REPORT_MODULE_LABELS[preview.module] ?? preview.module} · Período: {formatReportPeriod(preview.period)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Filtros aplicados: {formatAppliedFiltersText(confirmedMeta.appliedFilters)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Emitido por {session?.nome ?? 'Usuário autenticado'} em {formatReportIssuedAt(confirmedMeta.generatedAt)}
          </Typography>
          {totalsSummary}
        </Paper>
      )}

      {(preview || state.loading) && (
        <DataTable
          caption={`${report?.title ?? 'Relatório'} — ${selection.from || 'todos os registros'}${selection.to ? ` a ${selection.to}` : ''}`}
          columns={(preview?.columns ?? report?.columns.filter(column => selection.columns.includes(column.key)) ?? []).map(column => ({
            key: column.key,
            header: column.label,
            align: column.align ?? (column.type === 'currency' || column.type === 'number' ? 'right' : 'left'),
            render: (item: { index: number; row: Record<string, string | number | boolean | null> }) => {
              if (column.type === 'status') return <StatusChip label={formatReportCell(item.row[column.key], column)} tone="neutral" />
              const formatted = formatReportCell(item.row[column.key], column)
              if (column.type === 'currency' || column.type === 'number') {
                return <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{formatted}</Box>
              }
              return formatted
            },
          }))}
          rows={(preview?.rows ?? []).map((row, index) => ({ row, index }))}
          rowKey={item => String(item.index)}
          busy={state.loading}
          footerValues={preview && Object.keys(preview.totals).length
            ? preview.columns.map((column, index) => {
              if (preview.totals[column.key] !== undefined) {
                return <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{formatReportCell(preview.totals[column.key], column)}</Box>
              }
              return index === 0 ? 'TOTAL' : ''
            })
            : undefined}
          loadingContent={<StateFeedback kind="loading" title="Carregando dados do relatório..." />}
          emptyContent={(
            <StateFeedback
              kind="empty"
              title="Nenhum registro encontrado para o período e os filtros selecionados."
              description="Amplie o intervalo de datas ou limpe os filtros para tentar novamente."
              actionLabel="Limpar filtros"
              onAction={state.clearFilters}
            />
          )}
        />
      )}

      {preview && state.isPreviewConfirmed && (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Button disabled={busy || preview.page <= 1} aria-label="Página anterior" onClick={() => void state.generate(preview.page - 1)}>
            Página anterior
          </Button>
          <Typography>Página {preview.page} de {Math.max(1, preview.totalPages)}</Typography>
          <Button disabled={busy || preview.page >= preview.totalPages} aria-label="Próxima página" onClick={() => void state.generate(preview.page + 1)}>
            Próxima página
          </Button>
        </Stack>
      )}

      {state.printData && <ReportPrintView data={state.printData} />}
    </Box>
  )
}
