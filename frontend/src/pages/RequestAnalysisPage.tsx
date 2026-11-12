import { useEffect, useState } from 'react'
import { Alert, Box, Button, Stack, TablePagination, Typography } from '@mui/material'
import PageHeader from '../components/ui/PageHeader'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import { FormField } from '../components/ui/FormField'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import RequestDetailsPanel from '../components/RequestDetailsPanel'
import { useAuth } from '../auth/useAuth'
import { decideRequest, listRequests } from '../services/requestsService'
import type { PaginatedRequests, RequestListFilters, RequestSummary } from '../requests/requestTypes'

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const EMPTY_FILTERS: RequestListFilters = { status: 'PENDING', page: 1, pageSize: 20 }

type DialogAction = { request: RequestSummary; decision: 'approve' | 'reject' } | null

/** Lista solicitações pendentes e mantém detalhes e decisão na mesma página. */
export default function RequestAnalysisPage() {
  const { api } = useAuth()
  const [draftFilters, setDraftFilters] = useState({ from: '', to: '', requester: '', service: '' })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [listResult, setListResult] = useState<{ key: string; data?: PaginatedRequests; error?: string } | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [dialogAction, setDialogAction] = useState<DialogAction>(null)
  const [reason, setReason] = useState('')
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [notice, setNotice] = useState('')
  const queryKey = JSON.stringify({ filters, page, pageSize, reload })

  useEffect(() => {
    let current = true
    void listRequests(api, { ...filters, status: 'PENDING', page: page + 1, pageSize })
      .then(data => { if (current) setListResult({ key: queryKey, data }) })
      .catch((failure: unknown) => {
        if (current) setListResult({ key: queryKey,
          error: failure instanceof Error ? failure.message : 'Não foi possível carregar as solicitações.' })
      })
    return () => { current = false }
  }, [api, filters, page, pageSize, queryKey])

  const isCurrentResult = listResult?.key === queryKey
  const data = isCurrentResult ? listResult.data ?? null : null
  const error = isCurrentResult ? listResult.error ?? '' : ''
  const loading = !isCurrentResult
  const rows = data?.requests ?? []
  const selectedRequest = rows.find(request => request.id === selectedId) ?? null

  function applyFilters() {
    setSelectedId(null)
    setNotice('')
    setPage(0)
    setFilters({
      status: 'PENDING',
      ...(draftFilters.from ? { from: draftFilters.from } : {}),
      ...(draftFilters.to ? { to: draftFilters.to } : {}),
      ...(draftFilters.requester.trim() ? { requester: draftFilters.requester.trim() } : {}),
      ...(draftFilters.service.trim() ? { service: draftFilters.service.trim() } : {}),
    })
  }

  function clearFilters() {
    setDraftFilters({ from: '', to: '', requester: '', service: '' })
    setSelectedId(null)
    setPage(0)
    setFilters(EMPTY_FILTERS)
    setNotice('')
  }

  function openDecision(request: RequestSummary, decision: 'approve' | 'reject') {
    setDialogAction({ request, decision })
    setReason('')
    setDecisionError('')
  }

  async function submitDecision() {
    if (!dialogAction) return
    setDecisionBusy(true)
    setDecisionError('')
    try {
      await decideRequest(api, dialogAction.request.id, dialogAction.decision,
        dialogAction.decision === 'reject' ? reason.trim() : undefined)
      setNotice(dialogAction.decision === 'approve'
        ? `Solicitação #${dialogAction.request.id} aprovada.`
        : `Solicitação #${dialogAction.request.id} rejeitada.`)
      setDialogAction(null)
      setSelectedId(null)
      setReload(value => value + 1)
    } catch (failure) {
      setDecisionError(failure instanceof Error ? failure.message : 'Não foi possível registrar a decisão.')
    } finally {
      setDecisionBusy(false)
    }
  }

  const columns = [
    { key: 'requester', header: 'Solicitante', render: (request: RequestSummary) => request.requesterName },
    { key: 'service', header: 'Tipo de serviço', render: (request: RequestSummary) => request.serviceName },
    { key: 'date', header: 'Data e horário', render: (request: RequestSummary) => `${formatDate(request.requestedDate)} às ${request.requestedTime}` },
    { key: 'route', header: 'Trajeto', render: (request: RequestSummary) => `${request.origin} → ${request.destination}` },
    { key: 'status', header: 'Status', render: () => <StatusChip label="Pendente" tone="warning" /> },
  ] as const

  return (
    <Box component="main" sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 3 }, pb: 4 }}>
      <PageHeader title="Análise de solicitações" description="Revise os dados antes de aprovar ou rejeitar uma viagem." />

      <FilterBar label="Filtros das solicitações pendentes">
        <FormField label="Data inicial" type="date" value={draftFilters.from} onChange={from => setDraftFilters(current => ({ ...current, from }))} sx={{ flex: 1, minWidth: 180 }} />
        <FormField label="Data final" type="date" value={draftFilters.to} onChange={to => setDraftFilters(current => ({ ...current, to }))} sx={{ flex: 1, minWidth: 180 }} />
        <FormField label="Solicitante" value={draftFilters.requester} onChange={requester => setDraftFilters(current => ({ ...current, requester }))} sx={{ flex: 1, minWidth: 200 }} />
        <FormField label="Tipo de serviço" value={draftFilters.service} onChange={service => setDraftFilters(current => ({ ...current, service }))} sx={{ flex: 1, minWidth: 200 }} />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={applyFilters} sx={{ minHeight: 44 }}>Aplicar filtros</Button>
          <Button variant="outlined" onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar</Button>
        </Stack>
      </FilterBar>

      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <StateFeedback kind="error" title="Não foi possível carregar as solicitações pendentes." description={error}
        actionLabel="Tentar novamente" onAction={() => setReload(value => value + 1)} />}

      {!error && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.35fr) minmax(320px, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
          <Box>
            <DataTable
              caption="Solicitações pendentes"
              columns={columns}
              rows={rows}
              rowKey={request => request.id}
              busy={loading}
              minWidth={920}
              loadingContent={<StateFeedback kind="loading" title="Carregando solicitações pendentes..." />}
              emptyContent={<StateFeedback kind="empty" title="Nenhuma solicitação pendente encontrada." description="Ajuste os filtros ou volte mais tarde." centered />}
              renderActions={request => (
                <Button variant={selectedId === request.id ? 'contained' : 'outlined'} aria-pressed={selectedId === request.id}
                  aria-label={`${selectedId === request.id ? 'Solicitação selecionada' : 'Ver detalhes da solicitação'} ${request.id}`}
                  onClick={() => setSelectedId(request.id)} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
                  {selectedId === request.id ? 'Selecionada' : 'Ver detalhes'}
                </Button>
              )}
            />
            <TablePagination
              component="div"
              count={data?.total ?? 0}
              page={page}
              onPageChange={(_event, nextPage) => { setSelectedId(null); setPage(nextPage) }}
              rowsPerPage={pageSize}
              onRowsPerPageChange={event => { setSelectedId(null); setPageSize(Number(event.target.value)); setPage(0) }}
              rowsPerPageOptions={PAGE_SIZE_OPTIONS}
              labelRowsPerPage="Solicitações por página:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </Box>

          <Stack spacing={2}>
            <RequestDetailsPanel requestId={selectedId} api={api} />
            {selectedRequest && selectedRequest.status === 'PENDING' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="contained" color="success" onClick={() => openDecision(selectedRequest, 'approve')} sx={{ minHeight: 44, flex: 1 }}>
                  Aprovar solicitação
                </Button>
                <Button variant="outlined" color="error" onClick={() => openDecision(selectedRequest, 'reject')} sx={{ minHeight: 44, flex: 1 }}>
                  Rejeitar solicitação
                </Button>
              </Stack>
            )}
          </Stack>
        </Box>
      )}

      <ConfirmDialog
        open={dialogAction !== null}
        title={dialogAction?.decision === 'reject' ? 'Rejeitar solicitação' : 'Aprovar solicitação'}
        description={dialogAction?.decision === 'reject'
          ? `Informe por que a solicitação para ${dialogAction.request.destination} está sendo rejeitada.`
          : `Confirma a aprovação da solicitação para ${dialogAction?.request.destination}?`}
        confirmLabel={dialogAction?.decision === 'reject' ? 'Rejeitar solicitação' : 'Aprovar solicitação'}
        danger={dialogAction?.decision === 'reject'}
        confirmColor={dialogAction?.decision === 'approve' ? 'success' : undefined}
        loading={decisionBusy}
        confirmDisabled={dialogAction?.decision === 'reject' && reason.trim().length === 0}
        onConfirm={() => { void submitDecision() }}
        onCancel={() => { if (!decisionBusy) setDialogAction(null) }}
      >
        {dialogAction?.decision === 'reject' && (
          <FormField label="Justificativa da rejeição" value={reason} onChange={setReason}
            required multiline minRows={3} maxLength={500} sx={{ mt: 2 }} />
        )}
        {decisionError && <Typography role="alert" color="error" sx={{ mt: 1 }}>{decisionError}</Typography>}
      </ConfirmDialog>
    </Box>
  )
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
