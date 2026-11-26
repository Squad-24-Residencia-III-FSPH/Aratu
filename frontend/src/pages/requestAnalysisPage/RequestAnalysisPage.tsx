import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TablePagination, Typography } from '@mui/material'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import RequestDetailsPanel from '../../components/RequestDetailsPanel'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import { decideRequest, listRequests } from '../../services/requestsService'
import type { PaginatedRequests, RequestListFilters, RequestSummary } from '../../requests/requestTypes'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { TRIP_SCHEDULING_PATH } from '../../trips/tripSchedulingAccess'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { formatCalendarDate } from '../../utils/dates'

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const SCHEDULABLE_STATUSES = ['PENDING', 'APPROVED'] as const
const EMPTY_FILTERS: RequestListFilters = { statuses: [...SCHEDULABLE_STATUSES], page: 1, pageSize: 20 }

type DialogAction = { request: RequestSummary; decision: 'reject' | 'return' } | null

/** Lista solicitações pendentes e abre os detalhes da linha selecionada em um diálogo. */
export default function RequestAnalysisPage() {
  const detailsTitleId = useId()
  const { api, session } = useAuth()
  const navigate = useNavigate()
  const canApprove = hasPermission(session, 'requests:approve-and-schedule')
  const canReturn = hasPermission(session, 'requests:return')
  const canReject = hasPermission(session, 'requests:reject')
  const canDecide = canApprove || canReturn || canReject
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
  const noticeRef = useRef<HTMLDivElement>(null)
  const queryKey = JSON.stringify({ filters, page, pageSize, reload })

  useEffect(() => {
    let current = true
    void listRequests(api, { ...filters, statuses: [...SCHEDULABLE_STATUSES], page: page + 1, pageSize })
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
      statuses: [...SCHEDULABLE_STATUSES],
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

  function openDecision(request: RequestSummary, decision: 'reject' | 'return') {
    setSelectedId(null)
    setDialogAction({ request, decision })
    setReason('')
    setDecisionError('')
    setNotice('')
  }

  async function submitDecision() {
    if (!dialogAction) return
    setDecisionBusy(true)
    setDecisionError('')
    try {
      await decideRequest(api, dialogAction.request.id, dialogAction.decision,
        reason.trim(), dialogAction.request.revision)
      setNotice(dialogAction.decision === 'return'
          ? `Solicitação #${dialogAction.request.id} devolvida para correção.`
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

  function beginScheduling(request: RequestSummary) {
    navigate(`${TRIP_SCHEDULING_PATH}?requestId=${encodeURIComponent(request.id)}`)
  }

  const columns = [
    { key: 'requester', header: 'Solicitante', render: (request: RequestSummary) => (
      <Button variant="text" aria-label={`Ver detalhes da solicitação ${request.id}, de ${request.requesterName}`}
        onClick={event => { event.stopPropagation(); setSelectedId(request.id) }}
        sx={{ minHeight: 44, px: 0, justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }}>
        {request.requesterName}
      </Button>
    ) },
    { key: 'service', header: 'Tipo de serviço', render: (request: RequestSummary) => request.serviceName ?? 'A definir no agendamento' },
    { key: 'date', header: 'Data e horário', render: (request: RequestSummary) => `${formatCalendarDate(request.requestedDate)} às ${request.requestedTime}` },
    { key: 'route', header: 'Trajeto', render: (request: RequestSummary) => `${request.origin} → ${request.destination}` },
    { key: 'status', header: 'Situação', render: (request: RequestSummary) => <StatusChip label={REQUEST_STATUS_LABELS[request.status]} tone={REQUEST_STATUS_TONES[request.status]} /> },
  ] as const

  return (
    <Box sx={{ minWidth: 0, ...accessibleControls }}>
      <PageHeader title="Solicitações" description={canApprove
        ? 'Revise os pedidos e conclua a aprovação junto com o agendamento.'
        : 'Consulta de pedidos de viagem pendentes de atendimento.'} />
      {!canDecide && <Alert severity="info" role="note" sx={{ mb: 2 }}>
        A consulta está disponível para manutenção e supervisão. Decisões operacionais são registradas pelo Gestor.
      </Alert>}

      <FilterBar label="Filtros das solicitações pendentes">
        <FormField label="Data inicial" type="date" value={draftFilters.from} onChange={from => setDraftFilters(current => ({ ...current, from }))} sx={{ flex: 1, minWidth: { xs: 0, sm: 180 } }} />
        <FormField label="Data final" type="date" value={draftFilters.to} onChange={to => setDraftFilters(current => ({ ...current, to }))} sx={{ flex: 1, minWidth: { xs: 0, sm: 180 } }} />
        <FormField label="Solicitante" value={draftFilters.requester} onChange={requester => setDraftFilters(current => ({ ...current, requester }))} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
        <FormField label="Tipo de serviço" value={draftFilters.service} onChange={service => setDraftFilters(current => ({ ...current, service }))} sx={{ flex: 1, minWidth: { xs: 0, sm: 200 } }} />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', minWidth: 0 }}>
          <Button variant="contained" onClick={applyFilters} sx={{ minHeight: 44 }}>Aplicar filtros</Button>
          <Button variant="outlined" onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar</Button>
        </Stack>
      </FilterBar>

      {notice && <Alert ref={noticeRef} tabIndex={-1} severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <StateFeedback kind={notice ? 'partial' : 'error'}
        title={notice ? 'A decisão foi registrada, mas a lista pode estar desatualizada.' : 'Não foi possível carregar as solicitações pendentes.'}
        description={error}
        actionLabel="Tentar novamente" onAction={() => setReload(value => value + 1)} />}

      {!error && <>
        <DataTable
          caption="Solicitações aguardando análise e agendamento"
          columns={columns}
          rows={rows}
          rowKey={request => request.id}
          onRowClick={request => setSelectedId(request.id)}
          busy={loading}
          minWidth={820}
          loadingContent={<StateFeedback kind="loading" title="Carregando solicitações pendentes..." />}
          emptyContent={<StateFeedback kind="empty" title="Nenhuma solicitação pendente encontrada." description="Ajuste os filtros ou volte mais tarde." centered />}
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
      </>}

      <Dialog open={selectedId !== null} onClose={() => setSelectedId(null)} fullWidth maxWidth="md"
        aria-labelledby={detailsTitleId}>
        <DialogTitle id={detailsTitleId}>
          {selectedRequest ? `Detalhes da solicitação #${selectedRequest.id}` : 'Detalhes da solicitação'}
        </DialogTitle>
        <DialogContent dividers>
          <RequestDetailsPanel requestId={selectedId} api={api} />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
            {(canApprove || canReturn || canReject) && selectedRequest && (selectedRequest.status === 'PENDING' || selectedRequest.status === 'APPROVED') && <>
              {canApprove && <Button variant="contained" color="success" onClick={() => beginScheduling(selectedRequest)} sx={{ minHeight: 44 }}>
                Aprovar e agendar
              </Button>}
              {selectedRequest.status === 'PENDING' && <>
                {canReturn && <Button variant="outlined" onClick={() => openDecision(selectedRequest, 'return')} sx={{ minHeight: 44 }}>
                  Devolver para correção
                </Button>}
                {canReject && <Button variant="outlined" color="error" onClick={() => openDecision(selectedRequest, 'reject')} sx={{ minHeight: 44 }}>
                  Recusar definitivamente
                </Button>}
              </>}
            </>}
          </Box>
          <Button onClick={() => setSelectedId(null)} color="inherit" sx={{ minHeight: 44 }}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        sx={accessibleControls}
        open={dialogAction !== null}
        title={dialogAction?.decision === 'reject' ? 'Recusar definitivamente' : 'Devolver para correção'}
        description={dialogAction?.decision === 'return'
            ? `Informe o que o Solicitante precisa corrigir antes de uma nova análise.`
            : `Informe por que a solicitação para ${dialogAction?.request.destination} está sendo recusada definitivamente.`}
        confirmLabel={dialogAction?.decision === 'reject' ? 'Recusar definitivamente' : 'Devolver para correção'}
        danger={dialogAction?.decision === 'reject'}
        loading={decisionBusy}
        confirmDisabled={dialogAction !== null && reason.trim().length === 0}
        onConfirm={() => { void submitDecision() }}
        onCancel={() => {
          if (!decisionBusy) {
            if (dialogAction) setSelectedId(dialogAction.request.id)
            setDialogAction(null)
          }
        }}
        // A linha decidida sai da lista levando o botão que abriu o diálogo; sem
        // isso o foco cairia no body e o teclado perderia o lugar do fluxo.
        onExited={() => noticeRef.current?.focus()}
      >
        {dialogAction && (
          <FormField label={dialogAction.decision === 'return' ? 'Observação para correção' : 'Justificativa da recusa definitiva'} value={reason} onChange={setReason}
            required multiline minRows={3} maxLength={500} sx={{ mt: 2 }} />
        )}
        {decisionError && <Typography role="alert" color="error" sx={{ mt: 1 }}>{decisionError}</Typography>}
      </ConfirmDialog>
    </Box>
  )
}
