import { useState } from 'react'
import type { FormEvent } from 'react'
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
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useAuth } from '../auth/useAuth'
import { hasPermission } from '../auth/access'
import { useSvoOccurrences } from '../hooks/useSvoOccurrences'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import { FormField, FormSelect } from '../components/ui/FormField'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import type { DataTableColumn } from '../components/ui/DataTable'
import {
  formatSvoOccurrenceDateTime,
  SVO_OCCURRENCE_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_TONES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../svo/svoOccurrencePresentation'
import { SVO_OCCURRENCE_STATUSES, SVO_REQUESTER_TYPES } from '../svo/svoOccurrenceTypes'
import type { CreateSvoOccurrenceInput, SvoOccurrenceFilters, SvoOccurrenceSummary } from '../svo/svoOccurrenceTypes'
import SvoOccurrenceWorkflowDialog from './svoOccurrencesPage/SvoOccurrenceWorkflowDialog'

interface OccurrenceFormValues {
  requesterName: string
  requesterPhone: string
  requesterType: string
  location: string
  description: string
  evidenceDescription: string
  notes: string
  receivedAt: string
}

const EMPTY_FORM: OccurrenceFormValues = {
  requesterName: '', requesterPhone: '', requesterType: '', location: '',
  description: '', evidenceDescription: '', notes: '', receivedAt: '',
}

const STATUS_OPTIONS = SVO_OCCURRENCE_STATUSES.map((value) => ({ value, label: SVO_OCCURRENCE_STATUS_LABELS[value] }))
const REQUESTER_TYPE_OPTIONS = SVO_REQUESTER_TYPES.map((value) => ({ value, label: SVO_REQUESTER_TYPE_LABELS[value] }))
const EMPTY_FILTERS: SvoOccurrenceFilters = { status: '', from: '', to: '' }

function occurrenceColumns(onView: (occurrence: SvoOccurrenceSummary) => void): readonly DataTableColumn<SvoOccurrenceSummary>[] {
  return [
    { key: 'id', header: 'Nº da solicitação', width: 155, render: (occurrence) => `#${occurrence.id}` },
    { key: 'requesterType', header: 'Tipo de solicitante', render: (occurrence) => SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType] },
    { key: 'location', header: 'Local', render: (occurrence) => occurrence.location },
    { key: 'receivedAt', header: 'Recebida em', width: 160, render: (occurrence) => formatSvoOccurrenceDateTime(occurrence.receivedAt) },
    {
      key: 'status', header: 'Situação', width: 145,
      render: (occurrence) => (
        <StatusChip label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]} tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]} />
      ),
    },
    {
      key: 'details', header: 'Detalhes', align: 'right', width: 150,
      render: (occurrence) => (
        <Button
          variant="text"
          onClick={() => onView(occurrence)}
          aria-label={`Ver detalhes da solicitação ${occurrence.id}`}
          sx={{ minHeight: 44 }}
        >
          Ver detalhes
        </Button>
      ),
    },
  ]
}

function dispatchColumns(
  onView: (occurrence: SvoOccurrenceSummary) => void,
  onRetry: (occurrence: SvoOccurrenceSummary) => void,
  retryingId: string | null,
): readonly DataTableColumn<SvoOccurrenceSummary>[] {
  return [
    { key: 'id', header: 'Solicitação', width: 130, render: (occurrence) => `#${occurrence.id}` },
    { key: 'location', header: 'Local', render: (occurrence) => occurrence.location },
    { key: 'waitingReason', header: 'Aguardando', width: 220, render: (occurrence) => occurrence.dispatchWaitReason === 'NO_TEAM' ? 'Equipe sem plantão elegível' : 'Viatura sem vaga elegível' },
    {
      key: 'actions', header: 'Ações', align: 'right', width: 270,
      render: (occurrence) => (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => onView(occurrence)} sx={{ minHeight: 44 }}>Detalhes</Button>
          <Button variant="contained" onClick={() => onRetry(occurrence)} disabled={retryingId !== null} sx={{ minHeight: 44 }}>
            {retryingId === occurrence.id ? 'Avaliando...' : 'Tentar despacho'}
          </Button>
        </Stack>
      ),
    },
  ]
}

/** Cadastro, consulta e confirmação técnica das solicitações SVO. */
export default function SvoOccurrencesPage() {
  const { api, session } = useAuth()
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const workflow = useSvoOccurrences(api)
  const [formOpen, setFormOpen] = useState(false)
  const [formValues, setFormValues] = useState<OccurrenceFormValues>(EMPTY_FORM)
  const [formConversionError, setFormConversionError] = useState('')
  const [filterDraft, setFilterDraft] = useState<SvoOccurrenceFilters>(EMPTY_FILTERS)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)

  const canWrite = hasPermission(session, 'svo:occurrences:create')
  const canManageDispatch = hasPermission(session, 'svo:orders:manage')

  function updateForm(field: keyof OccurrenceFormValues, value: string): void {
    setFormValues((current) => ({ ...current, [field]: value }))
    setFormConversionError('')
    workflow.clearCreateError()
  }

  function openNewOccurrence(): void {
    setFormValues(EMPTY_FORM)
    setFormConversionError('')
    workflow.clearCreateError()
    setFormOpen(true)
  }

  async function submitNewOccurrence(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setFormConversionError('')
    let receivedAt: string | undefined
    if (formValues.receivedAt) {
      const receivedInstant = new Date(formValues.receivedAt)
      if (!Number.isFinite(receivedInstant.getTime())) {
        setFormConversionError('Informe uma data e hora de recebimento válidas.')
        return
      }
      receivedAt = receivedInstant.toISOString()
    }
    const input: CreateSvoOccurrenceInput = {
      requesterName: formValues.requesterName,
      requesterPhone: formValues.requesterPhone,
      requesterType: formValues.requesterType as CreateSvoOccurrenceInput['requesterType'],
      location: formValues.location,
      description: formValues.description,
      evidenceDescription: formValues.evidenceDescription,
      notes: formValues.notes,
      ...(receivedAt ? { receivedAt } : {}),
    }
    const result = await workflow.register(input)
    if (result) {
      setFormOpen(false)
      setFormValues(EMPTY_FORM)
    }
  }

  async function viewDetails(occurrence: SvoOccurrenceSummary): Promise<void> {
    setDetailDialogOpen(true)
    await workflow.openDetail(occurrence.id)
  }

  function closeDetails(): void {
    setDetailDialogOpen(false)
    workflow.closeDetail()
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    workflow.changeFilters(filterDraft)
  }

  function clearFilters(): void {
    setFilterDraft(EMPTY_FILTERS)
    workflow.changeFilters(EMPTY_FILTERS)
  }

  const columns = occurrenceColumns((occurrence) => { void viewDetails(occurrence) })
  const rows = workflow.occurrences ?? []
  const dispatchQueue = rows.filter((occurrence) => occurrence.status === 'CONFIRMED'
    && occurrence.dispatchRequestedAt && !occurrence.executionOrderId)
  const queueColumns = dispatchColumns(
    (occurrence) => { void viewDetails(occurrence) },
    (occurrence) => { void workflow.retryDispatch(occurrence) },
    workflow.dispatchingId,
  )

  return (
    <Box>
      <PageHeader
        title="Solicitações"
        description="Registre solicitações recebidas externamente, confira os dados e acompanhe a situação."
        actions={canWrite ? <Button variant="contained" onClick={openNewOccurrence} sx={{ minHeight: 44 }}>Nova solicitação</Button> : undefined}
      />

      {workflow.notice && (
        <Alert severity="success" role="status" aria-live="polite" sx={{ mb: 2 }}>
          {workflow.notice}
        </Alert>
      )}
      {workflow.dispatchError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{workflow.dispatchError}</Alert>}

      {workflow.permissionDenied ? (
        <StateFeedback
          kind="forbidden"
          title="Seu perfil não tem permissão para consultar solicitações SVO."
          description={workflow.listError || undefined}
          actionLabel="Tentar novamente"
          onAction={() => { void workflow.reload() }}
        />
      ) : (
        <>
          <Box component="form" onSubmit={applyFilters} noValidate>
            <FilterBar label="Filtros de solicitações SVO">
              <FormSelect
                label="Situação"
                value={filterDraft.status}
                onChange={(status) => setFilterDraft((current) => ({ ...current, status: status as SvoOccurrenceFilters['status'] }))}
                options={STATUS_OPTIONS}
                emptyLabel="Todas"
                sx={{ width: { xs: '100%', sm: 190 } }}
              />
              <FormField
                label="Recebida de"
                type="date"
                value={filterDraft.from}
                onChange={(from) => setFilterDraft((current) => ({ ...current, from }))}
                sx={{ width: { xs: '100%', sm: 190 } }}
              />
              <FormField
                label="Recebida até"
                type="date"
                value={filterDraft.to}
                onChange={(to) => setFilterDraft((current) => ({ ...current, to }))}
                sx={{ width: { xs: '100%', sm: 190 } }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>Aplicar filtros</Button>
                <Button type="button" onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar filtros</Button>
              </Stack>
            </FilterBar>
          </Box>

          {workflow.partialWarning && (
            <StateFeedback
              kind="partial"
              title={workflow.partialWarning}
              actionLabel="Atualizar lista"
              onAction={() => { void workflow.reload() }}
            />
          )}

          {canManageDispatch && (
            <Box component="section" aria-labelledby="svo-dispatch-queue-title" sx={{ mb: 3 }}>
              <Typography id="svo-dispatch-queue-title" component="h2" variant="h6" sx={{ mb: 1 }}>
                Aguardando despacho
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                A equipe e a viatura são selecionadas automaticamente após a triagem. Aqui você pode solicitar uma nova avaliação quando os recursos mudarem.
              </Typography>
              {dispatchQueue.length === 0 ? (
                <StateFeedback kind="empty" title="Nenhuma solicitação aguardando despacho." />
              ) : (
                <>
                  <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.5 }}>
                    {dispatchQueue.map((occurrence) => (
                      <Card key={occurrence.id} variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Solicitação #{occurrence.id}</Typography>
                          <Typography variant="body2">{occurrence.location}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {occurrence.dispatchWaitReason === 'NO_TEAM' ? 'Aguardando equipe em plantão elegível.' : 'Aguardando viatura com vaga elegível.'}
                          </Typography>
                        </CardContent>
                        <CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                          <Button onClick={() => { void viewDetails(occurrence) }} sx={{ minHeight: 48 }}>Detalhes</Button>
                          <Button variant="contained" onClick={() => { void workflow.retryDispatch(occurrence) }} disabled={workflow.dispatchingId !== null} sx={{ minHeight: 48 }}>
                            {workflow.dispatchingId === occurrence.id ? 'Avaliando...' : 'Tentar despacho'}
                          </Button>
                        </CardActions>
                      </Card>
                    ))}
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <DataTable caption="Fila de solicitações SVO aguardando despacho" columns={queueColumns} rows={dispatchQueue}
                      rowKey={(occurrence) => occurrence.id} busy={workflow.loading} minWidth={700} />
                  </Box>
                </>
              )}
            </Box>
          )}

          {workflow.listError && workflow.occurrences && (
            <StateFeedback
              kind="partial"
              title={workflow.listError}
              actionLabel="Tentar novamente"
              onAction={() => { void workflow.reload() }}
            />
          )}

          {!workflow.occurrences && workflow.loading ? (
            <StateFeedback kind="loading" title="Carregando solicitações SVO..." />
          ) : !workflow.occurrences && workflow.listError ? (
            <StateFeedback
              kind={workflow.listErrorKind === 'forbidden' ? 'forbidden' : 'error'}
              title={workflow.listError}
              actionLabel="Tentar novamente"
              onAction={() => { void workflow.reload() }}
            />
          ) : (
            <DataTable
              caption="Solicitações SVO registradas"
              columns={columns}
              rows={rows}
              rowKey={(occurrence) => occurrence.id}
              busy={workflow.loading}
              minWidth={820}
              loadingContent={<StateFeedback kind="loading" title="Atualizando solicitações..." sx={{ justifyContent: 'center' }} />}
              emptyContent={(
                <Stack spacing={1.5} sx={{ py: 2, alignItems: 'center' }}>
                  <Typography>
                    {workflow.filters.status || workflow.filters.from || workflow.filters.to
                      ? 'Nenhuma solicitação encontrada para os filtros selecionados.'
                      : 'Nenhuma solicitação SVO foi registrada.'}
                  </Typography>
                  {canWrite && <Button onClick={openNewOccurrence} sx={{ minHeight: 44 }}>Registrar solicitação</Button>}
                  {Boolean(workflow.filters.status || workflow.filters.from || workflow.filters.to)
                    && <Button onClick={clearFilters} sx={{ minHeight: 44 }}>Limpar filtros</Button>}
                </Stack>
              )}
            />
          )}
        </>
      )}

      <Dialog
        open={formOpen}
        onClose={workflow.creating ? undefined : () => setFormOpen(false)}
        fullScreen={isSmallScreen}
        fullWidth
        maxWidth="md"
        aria-labelledby="svo-occurrence-form-title"
      >
        <Box component="form" onSubmit={(event: FormEvent<HTMLFormElement>) => { void submitNewOccurrence(event) }}>
          <DialogTitle id="svo-occurrence-form-title">Nova solicitação SVO</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Informe os dados recebidos. Os campos obrigatórios correspondem ao contrato de registro da API.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <FormField label="Nome do solicitante" value={formValues.requesterName} onChange={(value) => updateForm('requesterName', value)} required autoFocus autoComplete="name" />
              <FormField label="Telefone do solicitante" value={formValues.requesterPhone} onChange={(value) => updateForm('requesterPhone', value)} required autoComplete="tel" />
              <FormSelect
                label="Tipo de solicitante"
                value={formValues.requesterType}
                onChange={(value) => updateForm('requesterType', value)}
                options={REQUESTER_TYPE_OPTIONS}
                emptyLabel="Selecione o tipo"
                required
              />
              <FormField label="Local da solicitação" value={formValues.location} onChange={(value) => updateForm('location', value)} required />
              <FormField
                label="Descrição da solicitação"
                value={formValues.description}
                onChange={(value) => updateForm('description', value)}
                required
                multiline
                minRows={2}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <FormField
                label="Canal ou meio de recebimento"
                value={formValues.evidenceDescription}
                onChange={(value) => updateForm('evidenceDescription', value)}
                required
                helperText="Descreva como a solicitação foi recebida."
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <FormField
                label="Data e hora do recebimento"
                type="datetime-local"
                value={formValues.receivedAt}
                onChange={(value) => updateForm('receivedAt', value)}
                helperText="Opcional. Deixe em branco para usar o horário atual do registro."
              />
              <FormField
                label="Observações"
                value={formValues.notes}
                onChange={(value) => updateForm('notes', value)}
                multiline
                minRows={2}
                helperText="Opcional."
              />
            </Box>
            {(workflow.createError || formConversionError) && (
              <Alert severity="error" role="alert" sx={{ mt: 1 }}>
                {formConversionError || workflow.createError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
            <Button onClick={() => setFormOpen(false)} disabled={workflow.creating} sx={{ minHeight: 44 }}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={workflow.creating} aria-busy={workflow.creating || undefined} sx={{ minHeight: 44 }}>
              {workflow.creating ? 'Registrando...' : 'Registrar solicitação'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <SvoOccurrenceWorkflowDialog
        key={workflow.detail?.id ?? 'closed'}
        open={detailDialogOpen}
        detail={workflow.detail}
        canWrite={canWrite}
        confirming={workflow.confirming}
        confirmationError={workflow.confirmationError}
        confirmationBlocked={workflow.confirmationBlocked}
        onClose={closeDetails}
        onRetry={() => { if (workflow.detail) void workflow.openDetail(workflow.detail.id) }}
        onConfirm={workflow.confirm}
        onClearConfirmationError={workflow.clearConfirmationError}
      />
    </Box>
  )
}
