import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useInRouterContext, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Stack,
  TablePagination,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import { EntityCard } from '../../components/ui/EntityCard'
import FilterBar from '../../components/ui/FilterBar'
import { FormField } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { canAnalyzeRequests } from '../../requests/requestAccess'
import { listRequests, getRequest } from '../../services/requestsService'
import type { RequestDetailView } from '../../services/requestsService'
import type {
  PaginatedRequests,
  RequestListFilters,
  RequestSummary,
} from '../../requests/requestTypes'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { TRIP_SCHEDULING_PATH } from '../../trips/tripSchedulingAccess'
import { formatCalendarDate } from '../../utils/dates'
import RequestAnalysisDetails from './RequestAnalysisDetails'
import {
  buildRequestAnalysisSearchParams,
  canDecideLoadedRequest,
  decideRequestWithStatus,
  EMPTY_REQUEST_FILTER_DRAFT,
  formatPaginationRowsLabel,
  getPaginationItemAriaLabel,
  parseRequestAnalysisSearchParams,
  toPendingRequestApiFilters,
  validateRejectionReason,
  validateRequestAnalysisFilters,
} from './requestAnalysisHelpers'
import type {
  RequestAnalysisFilterDraft,
  RequestAnalysisFilterErrors,
} from './requestAnalysisHelpers'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

type DialogAction = { request: RequestDetailView; decision: 'approve' | 'reject' } | null

function readBrowserSearch(): string {
  if (typeof window === 'undefined') return ''
  const hashQueryIndex = window.location.hash.indexOf('?')
  if (hashQueryIndex >= 0) return window.location.hash.slice(hashQueryIndex + 1)
  return window.location.search.replace(/^\?/, '')
}

/** Lista solicitações pendentes e mantém detalhes e decisão na mesma página. */
export default function RequestAnalysisPage() {
  const inRouter = useInRouterContext()
  if (inRouter) {
    return <RequestAnalysisWithRouter />
  }
  return <RequestAnalysisContent initialSearch={readBrowserSearch()} />
}

function RequestAnalysisWithRouter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const serialized = searchParams.toString()

  return (
    <RequestAnalysisContent
      initialSearch={serialized}
      onSyncSearch={(next) => {
        setSearchParams(next, { replace: true })
      }}
    />
  )
}

interface RequestAnalysisContentProps {
  initialSearch: string
  onSyncSearch?: (next: URLSearchParams) => void
}

function RequestAnalysisContent({ initialSearch, onSyncSearch }: RequestAnalysisContentProps) {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = profile !== null && canAnalyzeRequests(profile)
  const isCompactView = useMediaQuery('(max-width:899.95px)')

  const initialDraft = parseRequestAnalysisSearchParams(initialSearch)
  const [draftFilters, setDraftFilters] = useState<RequestAnalysisFilterDraft>(initialDraft)
  const [filters, setFilters] = useState<RequestListFilters>(() => toPendingRequestApiFilters(initialDraft))
  const [filterErrors, setFilterErrors] = useState<RequestAnalysisFilterErrors>({})
  const [syncedSearch, setSyncedSearch] = useState(initialSearch)

  const [listResult, setListResult] = useState<{ key: string; data?: PaginatedRequests; error?: string } | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [detailResult, setDetailResult] = useState<{ key: string; detail?: RequestDetailView; error?: string } | null>(null)
  const [detailReload, setDetailReload] = useState(0)

  const [dialogAction, setDialogAction] = useState<DialogAction>(null)
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [reasonServerError, setReasonServerError] = useState('')
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [decisionConflict, setDecisionConflict] = useState(false)
  const [conflictedRequestId, setConflictedRequestId] = useState<string | null>(null)

  const [notice, setNotice] = useState('')
  const [conflictNotice, setConflictNotice] = useState('')
  const [approvedRequestId, setApprovedRequestId] = useState<string | null>(null)

  const noticeRef = useRef<HTMLDivElement>(null)
  const conflictNoticeRef = useRef<HTMLDivElement>(null)
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null)
  const detailsSectionRef = useRef<HTMLDivElement>(null)
  const fromInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const toInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reasonInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const lastExitFocusTarget = useRef<'notice' | 'conflict' | 'trigger'>('trigger')

  if (initialSearch !== syncedSearch) {
    const parsedFromUrl = parseRequestAnalysisSearchParams(initialSearch)
    setSyncedSearch(initialSearch)
    setDraftFilters(parsedFromUrl)
    setFilters(toPendingRequestApiFilters(parsedFromUrl))
    setFilterErrors({})
    setPage(0)
    setSelectedId(null)
  }

  const queryKey = JSON.stringify({ filters, page, pageSize, reload })
  const detailKey = selectedId ? `${selectedId}:${detailReload}` : ''

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Análise de solicitações — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listRequests(api, { ...filters, status: 'PENDING', page: page + 1, pageSize })
      .then((data) => {
        if (!current) return
        setListResult({ key: queryKey, data })
        if (data.requests.length === 0 && data.total > 0 && page > 0) {
          setPage(Math.max(0, data.totalPages - 1))
        }
      })
      .catch((failure: unknown) => {
        if (current) {
          setListResult({
            key: queryKey,
            error: failure instanceof Error ? failure.message : 'Não foi possível carregar as solicitações.',
          })
        }
      })
    return () => {
      current = false
    }
  }, [allowed, api, filters, page, pageSize, queryKey])

  useEffect(() => {
    if (!allowed || !selectedId) return
    let current = true
    void getRequest(api, selectedId)
      .then((detail) => {
        if (current) setDetailResult({ key: detailKey, detail })
      })
      .catch((failure: unknown) => {
        if (current) {
          setDetailResult({
            key: detailKey,
            error: failure instanceof Error ? failure.message : 'Não foi possível carregar a solicitação.',
          })
        }
      })
    return () => {
      current = false
    }
  }, [allowed, api, detailKey, selectedId])

  const isCurrentResult = listResult?.key === queryKey
  const data = isCurrentResult ? listResult.data ?? null : null
  const error = isCurrentResult ? listResult.error ?? '' : ''
  const loading = allowed && !isCurrentResult
  const rows = data?.requests ?? []

  const isCurrentDetail = Boolean(selectedId) && detailResult?.key === detailKey
  const detailLoading = Boolean(selectedId) && !isCurrentDetail
  const currentDetail = isCurrentDetail ? detailResult?.detail ?? null : null
  const detailError = isCurrentDetail ? detailResult?.error ?? '' : ''

  const canDecide = canDecideLoadedRequest({
    selectedId,
    detail: currentDetail,
    detailLoading,
    detailError,
    conflictedRequestId,
  })

  const hasActiveFilters = Boolean(
    filters.from || filters.to || filters.requester || filters.service,
  )

  function updateDraftField<K extends keyof RequestAnalysisFilterDraft>(
    field: K,
    value: RequestAnalysisFilterDraft[K],
  ) {
    setDraftFilters((current) => ({ ...current, [field]: value }))
    if (field === 'from' || field === 'to') {
      const errorKey: keyof RequestAnalysisFilterErrors = field
      setFilterErrors((current) => {
        if (!current.from && !current.to) return current
        const next = { ...current }
        delete next[errorKey]
        if (errorKey === 'from') delete next.to
        return next
      })
    }
  }

  function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const validationErrors = validateRequestAnalysisFilters(draftFilters)
    setFilterErrors(validationErrors)
    if (validationErrors.from) {
      fromInputRef.current?.focus()
      return
    }
    if (validationErrors.to) {
      toInputRef.current?.focus()
      return
    }

    const nextParams = buildRequestAnalysisSearchParams(draftFilters)
    setSyncedSearch(nextParams.toString())
    onSyncSearch?.(nextParams)
    setSelectedId(null)
    setConflictedRequestId(null)
    setNotice('')
    setConflictNotice('')
    setApprovedRequestId(null)
    setPage(0)
    setFilters(toPendingRequestApiFilters(draftFilters))
  }

  function clearFilters() {
    setDraftFilters(EMPTY_REQUEST_FILTER_DRAFT)
    setFilterErrors({})
    setSyncedSearch('')
    onSyncSearch?.(new URLSearchParams())
    setSelectedId(null)
    setConflictedRequestId(null)
    setPage(0)
    setFilters({ status: 'PENDING', page: 1, pageSize: 20 })
    setNotice('')
    setConflictNotice('')
    setApprovedRequestId(null)
    setReload((value) => value + 1)
  }

  function selectRequest(id: string) {
    setSelectedId(id)
    setConflictedRequestId((current) => (current === id ? current : null))
    setConflictNotice('')
    if (isCompactView) {
      detailsSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }
  }

  function openDecision(request: RequestDetailView, decision: 'approve' | 'reject') {
    setDialogAction({ request, decision })
    setReason('')
    setReasonTouched(false)
    setReasonServerError('')
    setDecisionError('')
    setDecisionConflict(false)
    setNotice('')
    setConflictNotice('')
    setApprovedRequestId(null)
    lastExitFocusTarget.current = 'trigger'
  }

  function handleReasonChange(value: string) {
    setReason(value)
    if (reasonServerError) setReasonServerError('')
    if (value.length > 0 && value.trim().length === 0) {
      setReasonTouched(true)
    }
  }

  const localReasonError = dialogAction?.decision === 'reject' && reasonTouched
    ? validateRejectionReason(reason)
    : undefined
  const activeReasonError = reasonServerError || localReasonError

  async function submitDecision() {
    if (!dialogAction || decisionConflict) return
    if (dialogAction.decision === 'reject') {
      const reasonValidation = validateRejectionReason(reason)
      if (reasonValidation) {
        setReasonTouched(true)
        setReasonServerError(reasonValidation)
        reasonInputRef.current?.focus()
        return
      }
    }

    setDecisionBusy(true)
    setDecisionError('')
    const result = await decideRequestWithStatus(
      api,
      dialogAction.request.id,
      dialogAction.decision,
      dialogAction.decision === 'reject' ? reason.trim() : undefined,
    )
    setDecisionBusy(false)

    if (result.ok) {
      lastExitFocusTarget.current = 'notice'
      setNotice(
        dialogAction.decision === 'approve'
          ? `Solicitação #${dialogAction.request.id} aprovada.`
          : `Solicitação #${dialogAction.request.id} rejeitada.`,
      )
      setApprovedRequestId(dialogAction.decision === 'approve' ? dialogAction.request.id : null)
      setDialogAction(null)
      setSelectedId(null)
      setConflictedRequestId(null)
      setReload((value) => value + 1)
      return
    }

    if (result.status === 409) {
      lastExitFocusTarget.current = 'conflict'
      setDecisionConflict(true)
      setConflictedRequestId(dialogAction.request.id)
      setDecisionError(
        `${result.message} A fila e o detalhe estão sendo atualizados. Feche este diálogo para continuar.`,
      )
      setConflictNotice(
        `A solicitação #${dialogAction.request.id} já recebeu decisão e os dados exibidos foram atualizados.`,
      )
      setDetailReload((value) => value + 1)
      setReload((value) => value + 1)
      return
    }

    if (result.status === 400 && dialogAction.decision === 'reject') {
      setReasonTouched(true)
      setReasonServerError(result.message)
      reasonInputRef.current?.focus()
      return
    }

    setDecisionError(result.message)
  }

  function handleDialogExited() {
    if (lastExitFocusTarget.current === 'notice') {
      noticeRef.current?.focus()
      return
    }
    if (lastExitFocusTarget.current === 'conflict') {
      if (conflictNoticeRef.current) {
        conflictNoticeRef.current.focus()
      } else {
        detailsHeadingRef.current?.focus()
      }
    }
  }

  const columns: readonly DataTableColumn<RequestSummary>[] = [
    {
      key: 'requester',
      header: 'Solicitante e serviço',
      render: (request) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {request.requesterName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {request.serviceName}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'scheduleRoute',
      header: 'Data e trajeto',
      render: (request) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {`${formatCalendarDate(request.requestedDate)} às ${request.requestedTime}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {`${request.origin} → ${request.destination}`}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (request) => (
        <StatusChip
          label={REQUEST_STATUS_LABELS[request.status]}
          tone={REQUEST_STATUS_TONES[request.status]}
        />
      ),
    },
  ]

  function renderSelectButton(request: RequestSummary, fullWidth = false) {
    const selected = selectedId === request.id
    return (
      <Button
        variant={selected ? 'contained' : 'outlined'}
        aria-pressed={selected}
        aria-label={`${selected ? 'Solicitação selecionada' : 'Ver detalhes da solicitação'} ${request.id}`}
        onClick={() => selectRequest(request.id)}
        sx={{
          minHeight: 44,
          minWidth: 44,
          whiteSpace: 'nowrap',
          ...(fullWidth ? { width: '100%' } : {}),
        }}
      >
        {selected ? 'Selecionada' : 'Ver detalhes'}
      </Button>
    )
  }

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, sm: 3 }, pb: 4, ...accessibleControls }}>
      <PageHeader
        title="Análise de solicitações"
        description="Revise os dados antes de aprovar ou rejeitar uma viagem."
      />

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Somente o perfil Gestor de Frota pode analisar solicitações de viagem."
        />
      )}

      {allowed && (
        <>
          <Box component="form" onSubmit={applyFilters} noValidate>
            <FilterBar label="Filtros das solicitações pendentes">
              <FormField
                label="Data inicial"
                type="date"
                value={draftFilters.from}
                onChange={(value) => updateDraftField('from', value)}
                error={filterErrors.from}
                inputRef={fromInputRef}
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 } }}
              />
              <FormField
                label="Data final"
                type="date"
                value={draftFilters.to}
                onChange={(value) => updateDraftField('to', value)}
                error={filterErrors.to}
                inputRef={toInputRef}
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 180 } }}
              />
              <FormField
                label="Solicitante"
                value={draftFilters.requester}
                onChange={(value) => updateDraftField('requester', value)}
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
              />
              <FormField
                label="Tipo de serviço"
                value={draftFilters.service}
                onChange={(value) => updateDraftField('service', value)}
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
              />
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', minWidth: 0 }}>
                <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>
                  Aplicar filtros
                </Button>
                <Button type="button" variant="outlined" onClick={clearFilters} sx={{ minHeight: 44 }}>
                  Limpar
                </Button>
              </Stack>
            </FilterBar>
          </Box>

          {notice && (
            <Alert
              ref={noticeRef}
              tabIndex={-1}
              severity="success"
              role="status"
              sx={{ mb: 2 }}
              action={approvedRequestId ? (
                <Button
                  component="a"
                  href={`#${TRIP_SCHEDULING_PATH}?requestId=${encodeURIComponent(approvedRequestId)}`}
                  color="inherit"
                  sx={{ minHeight: 44 }}
                >
                  Agendar viagem
                </Button>
              ) : undefined}
            >
              {notice}
            </Alert>
          )}

          {conflictNotice && (
            <Alert
              ref={conflictNoticeRef}
              tabIndex={-1}
              severity="warning"
              role="status"
              sx={{ mb: 2 }}
            >
              {conflictNotice}
            </Alert>
          )}

          {error && (
            <StateFeedback
              kind={notice || conflictNotice ? 'partial' : 'error'}
              title={
                notice
                  ? 'A decisão foi registrada, mas a lista pode estar desatualizada.'
                  : conflictNotice
                    ? 'A solicitação já foi decidida por outro gestor, mas a fila pode estar desatualizada.'
                    : 'Não foi possível carregar as solicitações pendentes.'
              }
              description={error}
              actionLabel="Tentar novamente"
              onAction={() => setReload((value) => value + 1)}
            />
          )}

          {!error && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(320px, 1fr)' },
                gap: 2.5,
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                {isCompactView ? (
                  loading ? (
                    <StateFeedback kind="loading" title="Carregando solicitações pendentes..." />
                  ) : rows.length === 0 ? (
                    <StateFeedback
                      kind="empty"
                      title="Nenhuma solicitação pendente encontrada."
                      description={hasActiveFilters
                        ? 'Ajuste ou limpe os filtros para consultar outras pendências.'
                        : 'Ajuste os filtros ou volte mais tarde.'}
                      actionLabel={hasActiveFilters ? 'Limpar' : undefined}
                      onAction={hasActiveFilters ? clearFilters : undefined}
                      centered
                    />
                  ) : (
                    <Stack component="ul" spacing={1.5} aria-label="Solicitações pendentes" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                      {rows.map((request) => (
                        <Box component="li" key={request.id}>
                          <EntityCard>
                            <EntityCard.Header title={`Solicitação #${request.id} · ${request.requesterName}`}>
                              <EntityCard.Status>
                                <StatusChip
                                  label={REQUEST_STATUS_LABELS[request.status]}
                                  tone={REQUEST_STATUS_TONES[request.status]}
                                />
                              </EntityCard.Status>
                            </EntityCard.Header>
                            <EntityCard.Body>
                              <Stack spacing={0.5}>
                                <Typography variant="body2">
                                  <strong>Serviço:</strong> {request.serviceName}
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Data e horário:</strong>{' '}
                                  {`${formatCalendarDate(request.requestedDate)} às ${request.requestedTime}`}
                                </Typography>
                                <Typography variant="body2">
                                  <strong>Trajeto:</strong> {`${request.origin} → ${request.destination}`}
                                </Typography>
                              </Stack>
                            </EntityCard.Body>
                            <EntityCard.Actions>
                              {renderSelectButton(request, true)}
                            </EntityCard.Actions>
                          </EntityCard>
                        </Box>
                      ))}
                    </Stack>
                  )
                ) : (
                  <DataTable
                    caption="Solicitações pendentes"
                    columns={columns}
                    rows={rows}
                    rowKey={(request) => request.id}
                    busy={loading}
                    minWidth={0}
                    headerCellSx={{ whiteSpace: 'normal' }}
                    cellSx={{ overflowWrap: 'anywhere' }}
                    loadingContent={<StateFeedback kind="loading" title="Carregando solicitações pendentes..." />}
                    emptyContent={(
                      <StateFeedback
                        kind="empty"
                        title="Nenhuma solicitação pendente encontrada."
                        description="Ajuste os filtros ou volte mais tarde."
                        centered
                      />
                    )}
                    renderActions={(request) => renderSelectButton(request)}
                  />
                )}

                <TablePagination
                  component="div"
                  count={data?.total ?? 0}
                  page={page}
                  onPageChange={(_event, nextPage) => {
                    setSelectedId(null)
                    setConflictedRequestId(null)
                    setPage(nextPage)
                  }}
                  rowsPerPage={pageSize}
                  onRowsPerPageChange={(event) => {
                    setSelectedId(null)
                    setConflictedRequestId(null)
                    setPageSize(Number(event.target.value))
                    setPage(0)
                  }}
                  rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                  labelRowsPerPage="Solicitações por página:"
                  labelDisplayedRows={formatPaginationRowsLabel}
                  getItemAriaLabel={getPaginationItemAriaLabel}
                  slotProps={{
                    actions: {
                      previousButton: {
                        title: 'Página anterior',
                        sx: { minWidth: 44, minHeight: 44 },
                      },
                      nextButton: {
                        title: 'Próxima página',
                        sx: { minWidth: 44, minHeight: 44 },
                      },
                    },
                    select: {
                      'aria-label': 'Solicitações por página',
                    },
                  }}
                  sx={{
                    '& .MuiTablePagination-toolbar': {
                      flexWrap: 'wrap',
                      gap: 1,
                      px: 1,
                    },
                  }}
                />
              </Box>

              <Stack ref={detailsSectionRef} spacing={2} sx={{ minWidth: 0 }}>
                <RequestAnalysisDetails
                  selectedId={selectedId}
                  detail={currentDetail}
                  loading={detailLoading}
                  error={detailError}
                  onRetry={() => setDetailReload((value) => value + 1)}
                  headingRef={detailsHeadingRef}
                />

                {selectedId && (
                  <Stack spacing={1}>
                    {detailError && (
                      <Typography variant="body2" color="text.secondary">
                        Carregue o detalhe vigente da solicitação para habilitar a decisão.
                      </Typography>
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={!canDecide}
                        onClick={() => {
                          if (currentDetail && canDecide) openDecision(currentDetail, 'approve')
                        }}
                        sx={{ minHeight: 44, flex: 1 }}
                      >
                        Aprovar solicitação
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        disabled={!canDecide}
                        onClick={() => {
                          if (currentDetail && canDecide) openDecision(currentDetail, 'reject')
                        }}
                        sx={{ minHeight: 44, flex: 1 }}
                      >
                        Rejeitar solicitação
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Box>
          )}

          <ConfirmDialog
            sx={accessibleControls}
            open={dialogAction !== null}
            title={dialogAction?.decision === 'reject' ? 'Rejeitar solicitação' : 'Aprovar solicitação'}
            description={
              dialogAction?.decision === 'reject'
                ? `Informe por que a solicitação para ${dialogAction.request.destination} está sendo rejeitada.`
                : `Confirma a aprovação da solicitação para ${dialogAction?.request.destination}?`
            }
            confirmLabel={dialogAction?.decision === 'reject' ? 'Rejeitar solicitação' : 'Aprovar solicitação'}
            cancelLabel={decisionConflict ? 'Fechar' : 'Cancelar'}
            danger={dialogAction?.decision === 'reject'}
            confirmColor={dialogAction?.decision === 'approve' ? 'success' : undefined}
            loading={decisionBusy}
            confirmDisabled={
              decisionConflict
              || (dialogAction?.decision === 'reject' && reason.trim().length === 0)
            }
            onConfirm={() => {
              void submitDecision()
            }}
            onCancel={() => {
              if (!decisionBusy) setDialogAction(null)
            }}
            onEntered={() => {
              if (dialogAction?.decision === 'reject') {
                reasonInputRef.current?.focus()
              }
            }}
            onExited={handleDialogExited}
          >
            {dialogAction?.decision === 'reject' && (
              <FormField
                label="Justificativa da rejeição"
                value={reason}
                onChange={handleReasonChange}
                error={activeReasonError}
                required
                disabled={decisionBusy || decisionConflict}
                multiline
                minRows={3}
                maxLength={500}
                inputRef={reasonInputRef}
                sx={{ mt: 2 }}
              />
            )}
            {decisionError && (
              <Typography role="alert" color="error" sx={{ mt: 1 }}>
                {decisionError}
              </Typography>
            )}
          </ConfirmDialog>
        </>
      )}
    </Box>
  )
}
