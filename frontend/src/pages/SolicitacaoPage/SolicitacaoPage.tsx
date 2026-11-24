import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TablePagination,
} from '@mui/material'
import { resolveProfile } from '../../auth/profiles'
import { useSessionDraft } from '../../auth/sessionDrafts'
import { useAuth } from '../../auth/useAuth'
import { accessibleControls } from '../../components/ui/accessibleControls'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { REQUEST_STATUSES } from '../../requests/requestTypes'
import type { PaginatedRequests, RequestSummary } from '../../requests/requestTypes'
import { listRequests } from '../../services/requestsService'
import type { CreatedRequestResult, RequestDetailView, ResubmitRequestResult } from '../../services/requestsService'
import { formatCalendarDate } from '../../utils/dates'
import NewRequestDialog from './NewRequestDialog'
import RequestDetailDialog from './RequestDetailDialog'
import { EMPTY_REQUEST_FORM } from './requestFormValidation'
import type { RequestFormValues, ResubmitTarget } from './requestFormValidation'
import {
  areRequestFiltersEqual,
  buildRequestSearchParams,
  EMPTY_REQUEST_FILTERS,
  hasActiveRequestFilters,
  parseRequestUrlState,
  REQUEST_PAGE_SIZE_OPTIONS,
  toApiRequestFilters,
  validateFilterDateRange,
} from './requestListFilters'
import type { RequestFilterValues } from './requestListFilters'

const DOCUMENT_TITLE = 'Minhas solicitações — Aratu'
const DEFAULT_LOAD_ERROR = 'Não foi possível carregar suas solicitações.'

const STATUS_OPTIONS = REQUEST_STATUSES.map((value) => ({
  value,
  label: REQUEST_STATUS_LABELS[value],
}))

const REQUEST_COLUMNS: readonly DataTableColumn<RequestSummary>[] = [
  { key: 'id', header: 'Nº', width: 88, render: (request) => <strong>#{request.id}</strong> },
  { key: 'service', header: 'Tipo de serviço', render: (request) => request.serviceName },
  { key: 'destination', header: 'Destino', render: (request) => request.destination },
  {
    key: 'dateTime',
    header: 'Data e horário',
    render: (request) => `${formatCalendarDate(request.requestedDate)} às ${request.requestedTime}`,
  },
  { key: 'purpose', header: 'Finalidade', render: (request) => request.purpose },
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

interface ConfirmedSnapshot {
  filters: RequestFilterValues
  page: number
  pageSize: number
  data: PaginatedRequests
}

interface FetchState {
  completedKey: string | null
  confirmed: ConfirmedSnapshot | null
  errorKey: string | null
  errorMessage: string
}

const INITIAL_FETCH_STATE: FetchState = {
  completedKey: null,
  confirmed: null,
  errorKey: null,
  errorMessage: '',
}

/** Tela do Solicitante para criação (`POST /requests`) e acompanhamento (`GET /requests` e `/requests/:id`). */
export default function SolicitacaoPage() {
  const { session } = useAuth()
  return <SolicitacaoContent key={session?.token ?? 'anonymous'} />
}

function SolicitacaoContent() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = profile === 'SOLICITANTE'

  const [searchParams, setSearchParams] = useSearchParams()
  const urlState = useMemo(() => parseRequestUrlState(searchParams), [searchParams])
  const urlFilters = urlState.filters
  const urlPage = urlState.page
  const urlPageSize = urlState.pageSize

  const [draftOverride, setDraftOverride] = useState<{
    urlKey: string
    values: RequestFilterValues
    errors: { fromError?: string; toError?: string }
  } | null>(null)

  const [fetchState, setFetchState] = useState<FetchState>(INITIAL_FETCH_STATE)
  const [reloadCount, setReloadCount] = useState(0)

  const [newDialogLocalOpen, setNewDialogLocalOpen] = useState(false)
  const [newFormDraft, setNewFormDraft, clearNewFormDraft] = useSessionDraft<RequestFormValues>(
    'solicitacao:new-request-draft',
    EMPTY_REQUEST_FORM,
  )
  const [resubmitTarget, setResubmitTarget] = useState<ResubmitTarget | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<{ id: string; seq: number } | null>(null)
  const [notice, setNotice] = useState('')

  const newButtonRef = useRef<HTMLButtonElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const filterFromRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const filterToRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)
  const detailSeqRef = useRef(0)
  const pendingFocusNoticeRef = useRef(false)
  const pendingFocusTriggerRef = useRef(false)
  const pendingDetailIdRef = useRef<string | null>(null)
  const pendingResubmitDetailRef = useRef<RequestDetailView | null>(null)

  const urlFiltersKey = useMemo(
    () => `${urlFilters.status}|${urlFilters.from}|${urlFilters.to}|${urlFilters.service}`,
    [urlFilters],
  )
  const draftFilters = draftOverride?.urlKey === urlFiltersKey ? draftOverride.values : urlFilters
  const dateRangeErrors = draftOverride?.urlKey === urlFiltersKey ? draftOverride.errors : {}
  const newDialogOpen = newDialogLocalOpen || (allowed && urlState.openNewRequested)

  useEffect(() => {
    const previousTitle = document.title
    document.title = DOCUMENT_TITLE
    return () => {
      document.title = previousTitle
    }
  }, [])

  const apiFilters = useMemo(
    () => toApiRequestFilters(urlFilters, urlPage, urlPageSize),
    [urlFilters, urlPage, urlPageSize],
  )
  const requestKey = useMemo(
    () => JSON.stringify({ apiFilters, reloadCount }),
    [apiFilters, reloadCount],
  )

  useEffect(() => {
    if (!allowed) return
    let current = true
    void listRequests(api, apiFilters)
      .then((data) => {
        if (!current) return
        setFetchState({
          completedKey: requestKey,
          confirmed: { filters: urlFilters, page: urlPage, pageSize: urlPageSize, data },
          errorKey: null,
          errorMessage: '',
        })
      })
      .catch((error: unknown) => {
        if (!current) return
        setFetchState((previous) => ({
          completedKey: null,
          confirmed: previous.confirmed,
          errorKey: requestKey,
          errorMessage: error instanceof Error && error.message ? error.message : DEFAULT_LOAD_ERROR,
        }))
      })
    return () => {
      current = false
    }
  }, [allowed, api, apiFilters, requestKey, urlFilters, urlPage, urlPageSize])

  const refreshListAndReport = useCallback(async (): Promise<boolean> => {
    if (!allowed) return false
    try {
      const cleanFilters = EMPTY_REQUEST_FILTERS
      const cleanApiFilters = toApiRequestFilters(cleanFilters, 1, urlPageSize)
      const data = await listRequests(api, cleanApiFilters)
      const nextKey = JSON.stringify({ apiFilters: cleanApiFilters, reloadCount })
      setDraftOverride(null)
      if (urlPage !== 1 || hasActiveRequestFilters(urlFilters)) {
        if (urlState.openNewRequested) {
          setNewDialogLocalOpen(true)
        }
        setSearchParams(buildRequestSearchParams(cleanFilters, 1, urlPageSize), { replace: true })
      }
      setFetchState({
        completedKey: nextKey,
        confirmed: { filters: cleanFilters, page: 1, pageSize: urlPageSize, data },
        errorKey: null,
        errorMessage: '',
      })
      return true
    } catch {
      return false
    }
  }, [allowed, api, reloadCount, setSearchParams, urlFilters, urlPage, urlPageSize, urlState.openNewRequested])

  const loadError = fetchState.errorKey === requestKey ? fetchState.errorMessage : ''
  const loading = allowed && loadError === '' && fetchState.completedKey !== requestKey
  const confirmed = fetchState.confirmed
  const rows = confirmed?.data.requests ?? []
  const total = confirmed?.data.total ?? 0
  const isStale = confirmed !== null && (
    loading
    || loadError !== ''
    || !areRequestFiltersEqual(confirmed.filters, urlFilters)
    || confirmed.page !== urlPage
    || confirmed.pageSize !== urlPageSize
  )
  const hasFilters = hasActiveRequestFilters(urlFilters)

  function syncUrl(nextFilters: RequestFilterValues, nextPage: number, nextPageSize: number) {
    setSearchParams(buildRequestSearchParams(nextFilters, nextPage, nextPageSize))
  }

  function updateDraftFilters(
    nextValues: RequestFilterValues,
    nextErrors: { fromError?: string; toError?: string } = dateRangeErrors,
  ) {
    setDraftOverride({
      urlKey: urlFiltersKey,
      values: nextValues,
      errors: nextErrors,
    })
  }

  function handleApplyFilters(event: FormEvent) {
    event.preventDefault()
    const validation = validateFilterDateRange(draftFilters.from, draftFilters.to)
    updateDraftFilters(draftFilters, validation)
    if (validation.fromError) {
      filterFromRef.current?.focus()
      return
    }
    if (validation.toError) {
      filterToRef.current?.focus()
      return
    }

    const normalized: RequestFilterValues = {
      ...draftFilters,
      service: draftFilters.service.trim(),
    }
    setNotice('')
    setDraftOverride(null)
    syncUrl(normalized, 1, urlPageSize)
  }

  function handleClearFilters() {
    setDraftOverride(null)
    setNotice('')
    syncUrl(EMPTY_REQUEST_FILTERS, 1, urlPageSize)
    if (loadError !== '' && areRequestFiltersEqual(urlFilters, EMPTY_REQUEST_FILTERS)) {
      setReloadCount((count) => count + 1)
    }
  }

  function handleCloseNewDialog() {
    pendingFocusTriggerRef.current = true
    setNewDialogLocalOpen(false)
    if (urlState.openNewRequested) {
      setSearchParams(buildRequestSearchParams(urlFilters, urlPage, urlPageSize), { replace: true })
    }
  }

  function handleCreated(created: CreatedRequestResult) {
    pendingFocusNoticeRef.current = true
    setNewDialogLocalOpen(false)
    clearNewFormDraft()
    setNotice(
      `Solicitação #${created.id} enviada com sucesso e registrada como ${REQUEST_STATUS_LABELS[created.status]}. Acompanhe o andamento nesta lista.`,
    )
    if (urlPage !== 1 || hasFilters || urlState.openNewRequested) {
      syncUrl(EMPTY_REQUEST_FILTERS, 1, urlPageSize)
    } else {
      setReloadCount((count) => count + 1)
    }
  }

  function handleStartResubmit(detail: RequestDetailView) {
    pendingResubmitDetailRef.current = detail
    setSelectedRequest(null)
    setNotice('')
  }

  function handleDetailDialogExited() {
    const pendingDetail = pendingResubmitDetailRef.current
    if (pendingDetail) {
      pendingResubmitDetailRef.current = null
      setNewFormDraft({
        serviceId: pendingDetail.serviceId,
        requestedDate: pendingDetail.requestedDate,
        requestedTime: pendingDetail.requestedTime,
        origin: pendingDetail.origin,
        destination: pendingDetail.destination,
        passengers: String(pendingDetail.passengers),
        purpose: pendingDetail.purpose,
        notes: pendingDetail.notes ?? '',
      })
      setResubmitTarget({
        id: pendingDetail.id,
        revision: pendingDetail.revision ?? 1,
        rejectionReason: pendingDetail.decisionReason,
      })
      setNewDialogLocalOpen(true)
      return
    }
    detailTriggerRef.current?.focus()
  }

  function handleResubmitted(result: ResubmitRequestResult) {
    pendingFocusNoticeRef.current = true
    setNewDialogLocalOpen(false)
    clearNewFormDraft()
    setNotice(
      `Solicitação #${result.id} reenviada com sucesso (revisão ${result.revision}) e retornou para ${REQUEST_STATUS_LABELS[result.status]}.`,
    )
    if (urlPage !== 1 || hasFilters || urlState.openNewRequested) {
      syncUrl(EMPTY_REQUEST_FILTERS, 1, urlPageSize)
    } else {
      setReloadCount((count) => count + 1)
    }
  }

  function handleConflictRefresh(requestId: string) {
    pendingDetailIdRef.current = requestId
    setNewDialogLocalOpen(false)
    clearNewFormDraft()
    setReloadCount((count) => count + 1)
  }

  function handleNewDialogExited() {
    if (resubmitTarget) {
      setResubmitTarget(null)
      clearNewFormDraft()
    }
    const pendingDetailId = pendingDetailIdRef.current
    if (pendingDetailId) {
      pendingDetailIdRef.current = null
      detailSeqRef.current += 1
      setSelectedRequest({ id: pendingDetailId, seq: detailSeqRef.current })
      return
    }
    if (pendingFocusNoticeRef.current) {
      pendingFocusNoticeRef.current = false
      noticeRef.current?.focus()
      return
    }
    if (pendingFocusTriggerRef.current) {
      pendingFocusTriggerRef.current = false
      newButtonRef.current?.focus()
    }
  }

  if (!allowed) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', minWidth: 0, ...accessibleControls }}>
        <PageHeader title="Minhas Solicitações" breadcrumbs={['Início', 'Minhas Solicitações']} />
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Esta tela é exclusiva para o perfil Solicitante."
        />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', minWidth: 0, ...accessibleControls }}>
      <PageHeader
        title="Minhas Solicitações"
        breadcrumbs={['Início', 'Minhas Solicitações']}
        description="Acompanhe os seus pedidos de transporte institucional ou crie uma nova solicitação."
        actions={(
          <Button
            ref={newButtonRef}
            variant="contained"
            startIcon={<AddIcon aria-hidden="true" />}
            onClick={() => {
              setNotice('')
              setNewDialogLocalOpen(true)
            }}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            Nova Solicitação
          </Button>
        )}
      />

      <Box
        ref={noticeRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        sx={{ '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: 2 } }}
      >
        {notice && (
          <Alert severity="success" role="none" sx={{ mb: 2 }} onClose={() => setNotice('')}>
            {notice}
          </Alert>
        )}
      </Box>

      <Box component="form" noValidate onSubmit={handleApplyFilters}>
        <FilterBar label="Filtros das suas solicitações">
          <FormSelect
            label="Situação"
            value={draftFilters.status}
            onChange={(status) => updateDraftFilters({ ...draftFilters, status: status as RequestFilterValues['status'] })}
            options={STATUS_OPTIONS}
            emptyLabel="Todas as situações"
            displayEmpty
            sx={{ flex: 1, minWidth: { xs: 0, sm: 170 }, width: { xs: '100%', md: 'auto' } }}
          />
          <FormField
            label="Data inicial"
            type="date"
            value={draftFilters.from}
            onChange={(from) => updateDraftFilters({ ...draftFilters, from }, {})}
            error={dateRangeErrors.fromError}
            inputRef={filterFromRef}
            sx={{ flex: 1, minWidth: { xs: 0, sm: 165 }, width: { xs: '100%', md: 'auto' } }}
          />
          <FormField
            label="Data final"
            type="date"
            value={draftFilters.to}
            onChange={(to) => updateDraftFilters({ ...draftFilters, to }, {})}
            error={dateRangeErrors.toError}
            inputRef={filterToRef}
            sx={{ flex: 1, minWidth: { xs: 0, sm: 165 }, width: { xs: '100%', md: 'auto' } }}
          />
          <FormField
            label="Tipo de serviço"
            value={draftFilters.service}
            onChange={(service) => updateDraftFilters({ ...draftFilters, service })}
            placeholder="Filtrar por serviço"
            maxLength={120}
            sx={{ flex: 1, minWidth: { xs: 0, sm: 180 }, width: { xs: '100%', md: 'auto' } }}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', minWidth: 0 }}>
            <Button type="submit" variant="contained" sx={{ minHeight: 44, minWidth: 44 }}>
              Aplicar filtros
            </Button>
            <Button
              type="button"
              variant="outlined"
              onClick={handleClearFilters}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              Limpar
            </Button>
          </Stack>
        </FilterBar>
      </Box>

      {loadError && confirmed === null ? (
        <StateFeedback
          kind="error"
          title="Não foi possível carregar suas solicitações."
          description={loadError}
          actionLabel="Tentar novamente"
          onAction={() => setReloadCount((count) => count + 1)}
        />
      ) : (
        <>
          {loadError && isStale && (
            <StateFeedback
              kind="partial"
              title={notice ? 'A solicitação foi enviada, mas a lista pode estar desatualizada.' : 'A lista exibida pode estar desatualizada.'}
              description={loadError}
              actionLabel="Tentar novamente"
              onAction={() => setReloadCount((count) => count + 1)}
            />
          )}

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', maxWidth: '100%' }}>
            <DataTable
              caption="Solicitações de transporte institucional"
              columns={REQUEST_COLUMNS}
              rows={rows}
              rowKey={(request) => request.id}
              busy={loading}
              minWidth={760}
              paperSx={{ border: 0, boxShadow: 'none' }}
              loadingContent={<StateFeedback kind="loading" title="Carregando suas solicitações..." />}
              emptyContent={
                hasFilters ? (
                  <StateFeedback
                    kind="empty"
                    title="Nenhuma solicitação encontrada para os filtros atuais."
                    description="Ajuste os filtros de situação, período ou serviço para ampliar a busca."
                    actionLabel="Limpar filtros"
                    onAction={handleClearFilters}
                    centered
                  />
                ) : (
                    <StateFeedback
                    kind="empty"
                    title="Você ainda não enviou solicitações de viagem."
                    description="Clique em Nova Solicitação para pedir um transporte institucional."
                    actionLabel="Nova Solicitação"
                    onAction={() => {
                      setNotice('')
                      setNewDialogLocalOpen(true)
                    }}
                    centered
                  />
                )
              }
              renderActions={(request) => (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={(event) => {
                    detailTriggerRef.current = event.currentTarget
                    detailSeqRef.current += 1
                    setSelectedRequest({ id: request.id, seq: detailSeqRef.current })
                  }}
                  aria-label={`Ver detalhes da solicitação #${request.id} para ${request.destination}`}
                  sx={{ minHeight: 44, minWidth: 44, whiteSpace: 'nowrap' }}
                >
                  Ver detalhes
                </Button>
              )}
            />

            <TablePagination
              component="div"
              count={total}
              page={Math.max(0, urlPage - 1)}
              onPageChange={(_event, nextPage) => syncUrl(urlFilters, nextPage + 1, urlPageSize)}
              rowsPerPage={urlPageSize}
              onRowsPerPageChange={(event) => syncUrl(urlFilters, 1, Number(event.target.value))}
              rowsPerPageOptions={[...REQUEST_PAGE_SIZE_OPTIONS]}
              labelRowsPerPage="Solicitações por página:"
              labelDisplayedRows={({ from, to, count }) => (count === 0 ? '0 de 0' : `${from}–${to} de ${count}`)}
              getItemAriaLabel={(type) => (type === 'next' ? 'Ir para a próxima página' : 'Ir para a página anterior')}
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                '& .MuiTablePagination-toolbar': {
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                  gap: 1,
                  px: { xs: 1, sm: 2 },
                },
                '& .MuiTablePagination-spacer': {
                  display: 'none',
                },
                '& .MuiTablePagination-select': {
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                },
              }}
            />
          </Paper>
        </>
      )}

      <NewRequestDialog
        open={newDialogOpen}
        api={api}
        draft={newFormDraft}
        resubmitTarget={resubmitTarget}
        onChangeDraft={setNewFormDraft}
        onClose={handleCloseNewDialog}
        onExited={handleNewDialogExited}
        onCreated={handleCreated}
        onResubmitted={handleResubmitted}
        onConflictRefresh={handleConflictRefresh}
        onRefreshList={refreshListAndReport}
      />

      <RequestDetailDialog
        requestId={selectedRequest?.id ?? null}
        openSeq={selectedRequest?.seq ?? 0}
        api={api}
        onClose={() => setSelectedRequest(null)}
        onExited={handleDetailDialogExited}
        onResubmit={handleStartResubmit}
      />
    </Box>
  )
}
