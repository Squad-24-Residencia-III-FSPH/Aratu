import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TablePagination,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditNoteIcon from '@mui/icons-material/EditNote'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { FormField } from '../../components/ui/FormField'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import {
  createRequest,
  getRequest,
  listRequests,
  resubmitRequest,
} from '../../services/requestsService'
import type {
  PaginatedRequests,
  RequestDetail,
  RequestStatus,
  RequestSubmission,
  RequestSummary,
} from '../../requests/requestTypes'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { formatCalendarDate } from '../../utils/dates'

const PAGE_SIZE = 10
const EMPTY_FORM: RequestSubmission = {
  requestedDate: '', requestedTime: '', origin: '', destination: '', purpose: '',
  passengers: 1, specialRequirements: null, notes: null,
}

interface FormValues extends RequestSubmission {
  specialRequirements: string
  notes: string
}

function formValues(request?: RequestDetail | null): FormValues {
  if (!request) return { ...EMPTY_FORM, specialRequirements: '', notes: '' }
  return {
    requestedDate: request.requestedDate,
    requestedTime: request.requestedTime,
    origin: request.origin,
    destination: request.destination,
    purpose: request.purpose,
    passengers: request.passengers,
    specialRequirements: request.specialRequirements ?? '',
    notes: request.notes ?? '',
  }
}

function submission(values: FormValues): RequestSubmission {
  return {
    ...values,
    specialRequirements: values.specialRequirements.trim() || null,
    notes: values.notes.trim() || null,
  }
}

function isOpenNewRequestState(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && 'openNewRequest' in value && value.openNewRequest === true
}

/** Lista e registra solicitações reais, com correção disponível após devolução do Gestor. */
export default function SolicitacaoPage() {
  const { api, session } = useAuth()
  const canCreate = hasPermission(session, 'requests:create')
  const canResubmit = hasPermission(session, 'requests:resubmit:own')
  const theme = useTheme()
  const mobileViewport = useMediaQuery(theme.breakpoints.down('sm'))
  const location = useLocation()
  const navigate = useNavigate()
  const routeRequestsNewForm = isOpenNewRequestState(location.state)
  const [listState, setListState] = useState<{ key: string; data?: PaginatedRequests; error?: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('')
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<RequestDetail | null>(null)
  const [values, setValues] = useState<FormValues>(() => formValues())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<{ id: string; request?: RequestDetail; error?: string } | null>(null)
  const [detailReload, setDetailReload] = useState(0)

  const filters = useMemo(() => ({
    ...(statusFilter ? { status: statusFilter } : {}), page: page + 1, pageSize: PAGE_SIZE,
  }), [page, statusFilter])
  const queryKey = JSON.stringify({ filters, reload })
  const currentList = listState?.key === queryKey ? listState : null
  const rows = currentList?.data?.requests ?? []
  const dialogOpen = createOpen || editingRequest !== null || routeRequestsNewForm
  useEffect(() => {
    let current = true
    void listRequests(api, filters)
      .then(data => { if (current) setListState({ key: queryKey, data }) })
      .catch((failure: unknown) => {
        if (current) setListState({ key: queryKey,
          error: failure instanceof Error ? failure.message : 'Não foi possível carregar suas solicitações.' })
      })
    return () => { current = false }
  }, [api, filters, queryKey])

  useEffect(() => {
    if (!selectedId) return
    let current = true
    void getRequest(api, selectedId).then(request => {
      if (current) setDetailState({ id: selectedId, request })
    }).catch((failure: unknown) => {
      if (current) setDetailState({ id: selectedId,
        error: failure instanceof Error ? failure.message : 'Não foi possível carregar os detalhes.' })
    })
    return () => { current = false }
  }, [api, selectedId, detailReload])

  function clearRouteAction() {
    if (routeRequestsNewForm) navigate(location.pathname, { replace: true, state: null })
  }

  function openCreate() {
    setFormError('')
    setValues(formValues())
    setEditingRequest(null)
    setCreateOpen(true)
    setNotice('')
  }

  function closeForm() {
    if (saving) return
    setCreateOpen(false)
    setEditingRequest(null)
    setFormError('')
    clearRouteAction()
  }

  function editReturnedRequest(request: RequestDetail) {
    setSelectedId(null)
    setEditingRequest(request)
    setCreateOpen(false)
    setValues(formValues(request))
    setFormError('')
    setNotice('')
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFormError('')
    try {
      if (editingRequest) {
        await resubmitRequest(api, editingRequest.id, editingRequest.revision, submission(values))
        setNotice(`Solicitação #${editingRequest.id} reenviada para análise.`)
      } else {
        const created = await createRequest(api, submission(values))
        setNotice(`Solicitação #${created.id} enviada para análise.`)
      }
      setCreateOpen(false)
      setEditingRequest(null)
      clearRouteAction()
      setPage(0)
      setStatusFilter('')
      setReload(value => value + 1)
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : 'Não foi possível enviar a solicitação.')
    } finally {
      setSaving(false)
    }
  }

  function openDetails(request: RequestSummary) {
    setDetailState(null)
    setSelectedId(request.id)
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [key]: value }))
  }

  const detail = detailState?.id === selectedId ? detailState : null
  const isLoadingList = !currentList

  return (
    <Box sx={{ minWidth: 0 }} component="section" aria-label="Minhas solicitações">
      <PageHeader
        title="Minhas solicitações"
        description="Acompanhe seus pedidos e atualize os dados quando o Gestor solicitar correções."
        actions={canCreate ? <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ minHeight: 48 }}>
          Nova solicitação
        </Button> : undefined}
      />

      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {currentList?.error && <StateFeedback kind={notice ? 'partial' : 'error'}
        title={notice ? 'A solicitação foi gravada, mas a lista pode estar desatualizada.' : 'Não foi possível carregar suas solicitações.'}
        description={currentList.error} actionLabel="Tentar novamente" onAction={() => setReload(value => value + 1)} />}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField select label="Filtrar por situação" value={statusFilter}
          onChange={event => { setStatusFilter(event.target.value as RequestStatus | ''); setPage(0) }}
          sx={{ width: { xs: '100%', sm: 280 } }}>
          <MenuItem value="">Todas as situações</MenuItem>
          {Object.entries(REQUEST_STATUS_LABELS).map(([status, label]) => <MenuItem key={status} value={status}>{label}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={() => setReload(value => value + 1)} sx={{ minHeight: 48, alignSelf: { sm: 'flex-start' } }}>
          Atualizar lista
        </Button>
      </Stack>

      {!currentList?.error && (isLoadingList
        ? <StateFeedback kind="loading" title="Carregando suas solicitações..." />
        : rows.length === 0
          ? <StateFeedback kind="empty" title="Nenhuma solicitação encontrada."
            description="Crie uma solicitação para iniciar o atendimento." centered />
          : <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              {rows.map(request => <RequestCard key={request.id} request={request}
                onDetails={() => openDetails(request)} />)}
            </Box>
            <TablePagination
              component="div" count={currentList?.data?.total ?? 0} page={page}
              onPageChange={(_event, nextPage) => setPage(nextPage)} rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]} labelRowsPerPage="Solicitações por página:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </>)}

      <Dialog open={dialogOpen} onClose={closeForm} fullWidth maxWidth="sm" fullScreen={mobileViewport}
        sx={{ '& .MuiDialog-paper': { m: { xs: 0, sm: 3 }, width: { xs: '100%', sm: undefined }, maxHeight: { xs: '100dvh', sm: 'calc(100% - 64px)' }, borderRadius: { xs: 0, sm: 2 } } }}>
        <Box component="form" onSubmit={event => { void submitRequest(event) }}>
          <DialogTitle>{editingRequest ? 'Corrigir solicitação' : 'Nova solicitação'}</DialogTitle>
          <DialogContent dividers>
            {editingRequest?.decisionReason && <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Observação do Gestor:</strong> {editingRequest.decisionReason}
            </Alert>}
            {formError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{formError}</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <FormField label="Data da viagem" type="date" value={values.requestedDate}
                onChange={value => update('requestedDate', value)} required />
              <FormField label="Horário" type="time" value={values.requestedTime}
                onChange={value => update('requestedTime', value)} required />
              <FormField label="Passageiros" type="number" inputMode="numeric" value={String(values.passengers)}
                onChange={value => update('passengers', Number(value))} required />
              <FormField label="Origem" value={values.origin} onChange={value => update('origin', value)} required />
              <FormField label="Destino" value={values.destination} onChange={value => update('destination', value)} required />
              <FormField label="Finalidade" value={values.purpose} onChange={value => update('purpose', value)} required sx={{ gridColumn: { sm: '1 / -1' } }} />
              <FormField label="Necessidades especiais" value={values.specialRequirements}
                onChange={value => update('specialRequirements', value)} multiline minRows={2}
                helperText="Descreva adaptações ou apoio necessários para a viagem." sx={{ gridColumn: { sm: '1 / -1' } }} />
              <FormField label="Observações" value={values.notes} onChange={value => update('notes', value)}
                multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
            <Button onClick={closeForm} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving}
              aria-busy={saving} sx={{ minHeight: 48 }}>
              {saving ? 'Enviando…' : editingRequest ? 'Reenviar para análise' : 'Enviar solicitação'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={selectedId !== null} onClose={() => setSelectedId(null)} fullWidth maxWidth="sm" fullScreen={mobileViewport}
        sx={{ '& .MuiDialog-paper': { m: { xs: 0, sm: 3 }, width: { xs: '100%', sm: undefined }, maxHeight: { xs: '100dvh', sm: 'calc(100% - 64px)' }, borderRadius: { xs: 0, sm: 2 } } }}>
        <DialogTitle>Detalhes da solicitação</DialogTitle>
        <DialogContent dividers>
          {!detail && <StateFeedback kind="loading" title="Carregando detalhes..." />}
          {detail?.error && <StateFeedback kind="error" title="Não foi possível carregar os detalhes."
            description={detail.error} actionLabel="Tentar novamente" onAction={() => setDetailReload(value => value + 1)} />}
          {detail?.request && <RequestDetailContent request={detail.request} />}
          {canResubmit && detail?.request?.status === 'RETURNED' && (
            <Button variant="contained" startIcon={<EditNoteIcon />} onClick={() => editReturnedRequest(detail.request!)}
              sx={{ mt: 2, minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
              Corrigir e reenviar
            </Button>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pb: 'max(16px, env(safe-area-inset-bottom))' }}>
          <Button onClick={() => setSelectedId(null)} sx={{ minHeight: 48 }}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function RequestCard({ request, onDetails }: { request: RequestSummary; onDetails: () => void }) {
  return (
    <Card variant="outlined" component="article" sx={{ minWidth: 0 }}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Solicitação #{request.id}</Typography>
          <StatusChip label={REQUEST_STATUS_LABELS[request.status]} tone={REQUEST_STATUS_TONES[request.status]} />
        </Stack>
        <Typography variant="body2" color="text.secondary">{formatCalendarDate(request.requestedDate)} às {request.requestedTime}</Typography>
        <Typography sx={{ mt: 1, overflowWrap: 'anywhere' }}><strong>{request.origin}</strong> → <strong>{request.destination}</strong></Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {request.serviceName ?? 'Serviço a definir no agendamento'} · {request.passengers} passageiros
        </Typography>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, justifyContent: 'flex-end' }}>
        <Button onClick={onDetails} sx={{ minHeight: 44 }}>Ver detalhes</Button>
      </CardActions>
    </Card>
  )
}

function RequestDetailContent({ request }: { request: RequestDetail }) {
  return (
    <Stack spacing={2}>
      <StatusChip label={REQUEST_STATUS_LABELS[request.status]} tone={REQUEST_STATUS_TONES[request.status]} />
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Detail label="Tipo de serviço" value={request.serviceName ?? 'A definir no agendamento'} />
        <Detail label="Data e horário" value={`${formatCalendarDate(request.requestedDate)} às ${request.requestedTime}`} />
        <Detail label="Origem" value={request.origin} />
        <Detail label="Destino" value={request.destination} />
        <Detail label="Finalidade" value={request.purpose} />
        <Detail label="Passageiros" value={String(request.passengers)} />
        <Detail label="Necessidades especiais" value={request.specialRequirements || 'Não informadas'} />
        <Detail label="Observações" value={request.notes || 'Nenhuma'} />
      </Box>
      {request.decisionReason && <Alert severity={request.status === 'RETURNED' ? 'warning' : 'info'}>
        <strong>{request.status === 'RETURNED' ? 'Observação para correção:' : 'Motivo da decisão:'}</strong> {request.decisionReason}
      </Alert>}
    </Stack>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <Box><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography></Box>
}
