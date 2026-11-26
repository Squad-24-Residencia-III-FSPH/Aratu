import { useEffect } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { hasAnyPermission, hasPermission } from '../../auth/access'
import { tokenUserId } from '../../auth/token'
import PageHeader from '../../components/ui/PageHeader'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import DataTable from '../../components/ui/DataTable'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { formatReportCell } from '../../reports/reportPresentation'
import { REPORT_MODULE_LABELS } from '../../reports/reportTypes'
import { useReports } from '../../hooks/useReports'
import ReportColumnsSelector from './ReportColumnsSelector'
import ReportPrintView from './ReportPrintView'
import styles from './ReportsPage.module.css'

/** Orquestra o catálogo modular, os filtros e a conferência dos relatórios operacionais. */
export default function ReportsPage() {
  const { api, session } = useAuth()
  const allowed = hasAnyPermission(session, ['reports:read:trips', 'reports:read:fleet', 'reports:read:maintenance', 'reports:read:svo', 'reports:read:auth'])
  const accessRevision = `${session?.profile?.id ?? session?.perfil ?? ''}:${session?.profile?.revision ?? 0}`
  const state = useReports(api, session ? tokenUserId(session.token) : null, allowed, accessRevision)
  useEffect(() => { document.title = 'Relatórios Operacionais — Aratu' }, [])
  if (!allowed) return <StateFeedback kind="forbidden" title="Seu perfil não tem permissão para gerar relatórios." />
  const { report, selection, preview } = state
  const busy = state.loading || state.exporting
  const canGenerate = Boolean(report && !state.validation && !busy)
  const exportModule = report?.module === 'VIAGENS' ? 'trips'
    : report?.module === 'MANUTENCOES' ? 'maintenance'
      : report?.module === 'SVO' ? 'svo'
        : report?.module === 'AUTENTICACAO_RBAC' ? 'auth' : 'fleet'
  const canExport = hasPermission(session, `reports:export:${exportModule}`)
  const totals = preview && <Stack role="status" aria-live="polite" spacing={1}>
    <Typography>{preview.totalCount} registros encontrados.</Typography>
    {preview.columns.filter(column => preview.totals[column.key] !== undefined).map(column => <Typography key={column.key} sx={{ fontWeight: 700 }}>{column.label} — total: {formatReportCell(preview.totals[column.key], column)}</Typography>)}
  </Stack>
  return <Box className={styles.pageContainer} aria-busy={state.catalogLoading || busy} sx={{
    '& .MuiButton-root:not(.Mui-disabled)': { color: 'primary.dark', borderColor: 'primary.dark' },
    '& .MuiButton-contained:not(.Mui-disabled)': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover, &:focus-visible': { bgcolor: 'primary.dark', color: 'common.white' } },
    '& .MuiButton-root:focus-visible, & .MuiCheckbox-root:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: 2 },
    '& .MuiCheckbox-root.Mui-checked, & .MuiInputLabel-root.Mui-focused': { color: 'primary.dark' },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.dark' },
  }}>
    <PageHeader title="Relatórios" description="Escolha o módulo, ajuste o período e as colunas e confira os dados antes de exportar."
      actions={<><Button variant="outlined" disabled={!canGenerate || !canExport} aria-busy={state.exporting} onClick={() => void state.exportResult('csv')}>Exportar CSV</Button>
        <Button variant="outlined" disabled={!canGenerate || !canExport} aria-busy={state.exporting} onClick={() => void state.exportResult('print')}>Imprimir relatório</Button></>} />
    {state.catalogLoading ? <StateFeedback kind="loading" title="Carregando catálogo de relatórios..." /> : state.catalogError
      ? <StateFeedback kind="error" title={state.catalogError} actionLabel="Tentar novamente" onAction={state.retryCatalog} />
      : !state.catalog.length ? <StateFeedback kind="empty" title="Nenhum relatório disponível para seu perfil." /> : <>
        <FilterBar label="Seleção do relatório">
          <FormSelect label="Módulo" disabled={busy} value={state.module} onChange={state.chooseModule} options={state.catalog.map(group => ({ value: group.module, label: REPORT_MODULE_LABELS[group.module] ?? group.module }))} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
          <FormSelect label="Tipo de relatório" disabled={busy} value={report?.key ?? ''} onChange={key => state.chooseReport(state.catalog.flatMap(group => group.reports).find(item => item.key === key) ?? null)}
            options={(state.catalog.find(group => group.module === state.module)?.reports ?? []).map(item => ({ value: item.key, label: item.title }))} sx={{ flex: 2, minWidth: { xs: 0, sm: 200 } }} />
        </FilterBar>
        {report && <>
          <Typography>{report.description}</Typography>
          <Box component="form" onSubmit={event => { event.preventDefault(); void state.generate() }}>
            <FilterBar label="Período e filtros do relatório">
              <FormField label="Data inicial" type="date" required={report.period.required} value={selection.from} disabled={busy}
                error={state.validation && selection.columns.length ? state.validation : undefined} helperText={`${report.period.label}. Máximo de ${report.period.maxDays} dias.`}
                onChange={from => state.changeSelection({ ...selection, from })} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
              <FormField label="Data final" type="date" required={report.period.required} value={selection.to} disabled={busy}
                onChange={to => state.changeSelection({ ...selection, to })} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
              {report.filters.map(filter => filter.type === 'text' ? <FormField key={filter.key} label={filter.label} placeholder={filter.placeholder} disabled={busy}
                value={selection.filters[filter.key] ?? ''} maxLength={filter.key === 'licensePlatePrefix' ? 7 : undefined}
                onChange={value => state.changeSelection({ ...selection, filters: { ...selection.filters, [filter.key]: value } })} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
                : <FormSelect key={filter.key} label={filter.label} disabled={busy} emptyLabel="Todas as opções" value={selection.filters[filter.key] ?? ''} options={filter.options ?? []}
                  onChange={value => state.changeSelection({ ...selection, filters: { ...selection.filters, [filter.key]: value } })} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />)}
              <Button type="submit" variant="contained" disabled={!canGenerate}>Gerar prévia</Button>
              <Button disabled={busy} onClick={state.clearFilters}>Limpar filtros</Button>
            </FilterBar>
          </Box>
          <ReportColumnsSelector columns={report.columns} selected={selection.columns} disabled={busy} onChange={columns => state.changeSelection({ ...selection, columns })} />
        </>}
      </>}
    {state.warning && <StateFeedback kind="partial" title={state.warning} />}
    {state.notice && <Typography role="status" aria-live="polite">{state.notice}</Typography>}
    {state.exporting && <StateFeedback kind="loading" title="Preparando exportação do relatório..." />}
    {state.error && <StateFeedback kind="error" title={state.error} actionLabel="Tentar novamente" onAction={() => void state.generate(preview?.page ?? 1)} />}
    {totals}
    {(preview || state.loading) && <DataTable caption={`${report?.title ?? 'Relatório'} — ${selection.from || 'todos os registros'}${selection.to ? ` a ${selection.to}` : ''}`}
      columns={(preview?.columns ?? report?.columns.filter(column => selection.columns.includes(column.key)) ?? []).map(column => ({ key: column.key, header: column.label, align: column.align,
        render: (item: { index: number; row: Record<string, string | number | boolean | null> }) => column.type === 'status'
          ? <StatusChip label={formatReportCell(item.row[column.key], column)} tone="neutral" /> : formatReportCell(item.row[column.key], column) }))}
      rows={(preview?.rows ?? []).map((row, index) => ({ row, index }))} rowKey={item => String(item.index)} busy={state.loading}
      footerValues={preview && Object.keys(preview.totals).length ? preview.columns.map((column, index) => preview.totals[column.key] !== undefined ? formatReportCell(preview.totals[column.key], column) : index === 0 ? 'TOTAL' : '') : undefined}
      loadingContent={<StateFeedback kind="loading" title="Carregando dados do relatório..." />}
      emptyContent={<StateFeedback kind="empty" title="Nenhum registro encontrado para o período e os filtros selecionados." description="Amplie o intervalo de datas ou limpe os filtros para tentar novamente." actionLabel="Limpar filtros" onAction={state.clearFilters} />} />}
    {preview && <><Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Button disabled={busy || preview.page <= 1} aria-label="Página anterior" onClick={() => void state.generate(preview.page - 1)}>Página anterior</Button>
      <Typography>Página {preview.page} de {Math.max(1, preview.totalPages)}</Typography>
      <Button disabled={busy || preview.page >= preview.totalPages} aria-label="Próxima página" onClick={() => void state.generate(preview.page + 1)}>Próxima página</Button>
    </Stack>{totals}</>}
    {state.printData && <ReportPrintView data={state.printData} />}
  </Box>
}
