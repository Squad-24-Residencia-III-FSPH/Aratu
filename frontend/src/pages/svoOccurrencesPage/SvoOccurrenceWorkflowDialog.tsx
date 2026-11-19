import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircle'
import DeleteOutlineIcon from '@mui/icons-material/Delete'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Paper, Stack, Step, StepLabel, Stepper, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import {
  formatSvoOccurrenceDateTime, SVO_OCCURRENCE_STATUS_LABELS, SVO_OCCURRENCE_STATUS_TONES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../../svo/svoOccurrencePresentation'
import type {
  SaveSvoOccurrenceTriageInput, SvoOccurrenceDetail, SvoOccurrenceTriage,
} from '../../svo/svoOccurrenceTypes'

interface OccurrenceDetailState {
  id: string
  data: SvoOccurrenceDetail | null
  loading: boolean
  error: string
  triage: SvoOccurrenceTriage | null
  triageLoading: boolean
  triageLoadError: string
  triageError: string
}

interface TriageFormValues {
  deceasedName: string
  estimatedAge: string
  responsiblePhysician: string
  crm: string
  preliminaryCauseOfDeath: string
  availableDocuments: string[]
  referral: string
  triageNotes: string
  reason: string
}

interface SvoOccurrenceWorkflowDialogProps {
  presentation?: 'dialog' | 'page'
  open: boolean
  detail: OccurrenceDetailState | null
  canWrite: boolean
  savingTriage: boolean
  confirming: boolean
  confirmationError: string
  confirmationBlocked: boolean
  onClose: () => void
  onRetry: () => void
  onSaveTriage: (input: SaveSvoOccurrenceTriageInput) => Promise<SvoOccurrenceTriage | null>
  onConfirm: (occurrence: SvoOccurrenceDetail) => Promise<unknown>
  onClearConfirmationError: () => void
}

const STEPS = ['Dados Recebidos', 'Triagem', 'Confirmação', 'Gerar Ordem']

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value || 'Não informado'}</Typography>
    </Box>
  )
}

function triageFormValues(triage: SvoOccurrenceTriage | null): TriageFormValues {
  return {
    deceasedName: triage?.deceasedName ?? '', estimatedAge: triage?.estimatedAge ?? '',
    responsiblePhysician: triage?.responsiblePhysician ?? '', crm: triage?.crm ?? '',
    preliminaryCauseOfDeath: triage?.preliminaryCauseOfDeath ?? '',
    availableDocuments: triage?.availableDocuments ?? [], referral: triage?.referral ?? '',
    triageNotes: triage?.triageNotes ?? '', reason: '',
  }
}

/** Fluxo compartilhado entre o detalhe modal de solicitações e a página de triagens. */
export default function SvoOccurrenceWorkflowDialog({
  presentation = 'dialog', open, detail, canWrite, savingTriage, confirming,
  confirmationError, confirmationBlocked, onClose, onRetry, onSaveTriage, onConfirm,
  onClearConfirmationError,
}: SvoOccurrenceWorkflowDialogProps) {
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const [valuesOverride, setValuesOverride] = useState<TriageFormValues | null>(null)
  const [newDocument, setNewDocument] = useState('')
  const [reasonError, setReasonError] = useState('')
  const triageFormRef = useRef<HTMLFormElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const occurrence = detail?.data ?? null
  const savedTriage = detail?.triage ?? null
  const activeStep = selectedStep ?? (occurrence?.status === 'CONFIRMED' ? 3 : 0)
  const values = valuesOverride ?? triageFormValues(savedTriage)
  const pending = occurrence?.status === 'PENDING'
  const canEditTriage = Boolean(pending && canWrite)
  const formId = `svo-triage-form-${occurrence?.id ?? 'pending'}`
  const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, m: 0 }

  function update(field: keyof Omit<TriageFormValues, 'availableDocuments'>, value: string): void {
    setValuesOverride((current) => ({ ...(current ?? triageFormValues(savedTriage)), [field]: value }))
    if (field === 'reason') setReasonError('')
  }

  function addDocument(): void {
    const document = newDocument.trim()
    if (!document) return
    setValuesOverride((current) => ({
      ...(current ?? triageFormValues(savedTriage)),
      availableDocuments: [...(current ?? triageFormValues(savedTriage)).availableDocuments, document],
    }))
    setNewDocument('')
  }

  function submitFormFromKeyboard(): void {
    triageFormRef.current?.requestSubmit()
  }

  async function submitTriage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!occurrence || (savedTriage && !values.reason.trim())) {
      if (savedTriage) setReasonError('Informe a justificativa para retificar a triagem.')
      return
    }
    const saved = await onSaveTriage({
      deceasedName: values.deceasedName, estimatedAge: values.estimatedAge,
      responsiblePhysician: values.responsiblePhysician, crm: values.crm,
      preliminaryCauseOfDeath: values.preliminaryCauseOfDeath,
      availableDocuments: values.availableDocuments, referral: values.referral,
      triageNotes: values.triageNotes, ...(savedTriage ? { reason: values.reason } : {}),
    })
    if (saved) {
      setValuesOverride(triageFormValues(saved))
      setSelectedStep(2)
    }
  }

  async function confirmOccurrence(): Promise<void> {
    if (!occurrence || !savedTriage || occurrence.status !== 'PENDING') return
    if (await onConfirm(occurrence)) {
      setConfirmOpen(false)
      setSelectedStep(3)
    }
  }

  function closeConfirm(): void {
    if (confirming) return
    setConfirmOpen(false)
    onClearConfirmationError()
  }

  const stepper = (
    <Stepper activeStep={activeStep} orientation={isSmallScreen ? 'vertical' : 'horizontal'} sx={{ maxWidth: 760, mb: 3 }}>
      {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
    </Stepper>
  )

  const workflowBody = (
    <>
      {detail?.loading && <StateFeedback kind="loading" title="Carregando dados recebidos..." />}
      {detail?.error && <StateFeedback kind="error" title={detail.error} actionLabel="Tentar novamente" onAction={onRetry} />}
      {detail?.triageLoadError && !detail.loading && <StateFeedback kind="error" title={detail.triageLoadError} actionLabel="Consultar triagem" onAction={onRetry} />}
      {detail?.triageLoading && !detail.loading && <StateFeedback kind="loading" title="Consultando triagem existente..." />}
      {detail && occurrence && !detail.loading && !detail.triageLoading && !detail.triageLoadError && (
        <>
          {activeStep === 0 && (
            <Stack spacing={2}>
              <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Dados Recebidos — Solicitação #{occurrence.id}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography component="span" variant="body2" color="text.secondary">Situação</Typography>
                <StatusChip label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]} tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]} />
              </Box>
              <Box component="dl" sx={detailGrid}>
                <DetailField label="Solicitante" value={occurrence.requesterName} />
                <DetailField label="Telefone" value={occurrence.requesterPhone} />
                <DetailField label="Tipo" value={SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType]} />
                <DetailField label="Local" value={occurrence.location} />
                <DetailField label="Recebida em" value={formatSvoOccurrenceDateTime(occurrence.receivedAt)} />
                <DetailField label="Descrição da solicitação" value={occurrence.description} />
              </Box>
              {occurrence.status === 'CONFIRMED' && <Alert severity="info" role="note">Os dados recebidos foram conferidos. A confirmação técnica não representa conclusão da triagem clínica.</Alert>}
            </Stack>
          )}

          {activeStep === 1 && (
            <Box component="form" id={formId} ref={triageFormRef} onSubmit={(event: FormEvent<HTMLFormElement>) => { void submitTriage(event) }} noValidate>
              <Typography component="h2" variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>Triagem</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <FormField label="Nome do Falecido" value={values.deceasedName} onChange={(value) => update('deceasedName', value)} onEnter={submitFormFromKeyboard} autoFocus />
                <FormField label="Idade Estimada" value={values.estimatedAge} onChange={(value) => update('estimatedAge', value)} onEnter={submitFormFromKeyboard} />
                <FormField label="Médico Responsável" value={values.responsiblePhysician} onChange={(value) => update('responsiblePhysician', value)} onEnter={submitFormFromKeyboard} />
                <FormField label="CRM" value={values.crm} onChange={(value) => update('crm', value)} onEnter={submitFormFromKeyboard} />
                <FormField label="Causa Mortis (preliminar)" value={values.preliminaryCauseOfDeath} onChange={(value) => update('preliminaryCauseOfDeath', value)} multiline minRows={2} />
                <Box>
                  <FormField label="Documentos Disponíveis" value={newDocument} onChange={setNewDocument} onEnter={addDocument} helperText="Informe cada documento disponível; não há catálogo de opções definido." />
                  <Button type="button" onClick={addDocument} disabled={!newDocument.trim()} sx={{ minHeight: 44 }}>Adicionar documento</Button>
                  {values.availableDocuments.length > 0 ? (
                    <Stack component="ul" spacing={1} sx={{ pl: 2, mt: 1 }} aria-label="Documentos selecionados">
                      {values.availableDocuments.map((document, index) => (
                        <Box component="li" key={`${document}-${index}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography sx={{ overflowWrap: 'anywhere' }}>{document}</Typography>
                          <IconButton type="button" aria-label={`Remover documento ${document}`} onClick={() => setValuesOverride((current) => ({
                            ...(current ?? triageFormValues(savedTriage)),
                            availableDocuments: (current ?? triageFormValues(savedTriage)).availableDocuments.filter((_, itemIndex) => itemIndex !== index),
                          }))} sx={{ minWidth: 44, minHeight: 44 }}><DeleteOutlineIcon /></IconButton>
                        </Box>
                      ))}
                    </Stack>
                  ) : <Typography variant="body2" color="text.secondary">Nenhum documento selecionado.</Typography>}
                </Box>
                <FormField label="Encaminhamento" value={values.referral} onChange={(value) => update('referral', value)} onEnter={submitFormFromKeyboard} helperText="Texto livre; as opções ainda não foram definidas." />
                <FormField label="Observações de Triagem" value={values.triageNotes} onChange={(value) => update('triageNotes', value)} multiline minRows={2} />
                {savedTriage && <FormField label="Justificativa da retificação" value={values.reason} onChange={(value) => update('reason', value)} onEnter={submitFormFromKeyboard} required error={reasonError} helperText="Obrigatória para registrar uma nova versão da triagem." />}
              </Box>
              {detail.triageError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{detail.triageError}</Alert>}
            </Box>
          )}

          {activeStep === 2 && savedTriage && (
            <Stack spacing={2}>
              <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>Confirmação da Solicitação</Typography>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 120px) 1fr', gap: 1, p: 2, bgcolor: 'grey.50', border: 1, borderColor: 'divider', borderRadius: 1, m: 0 }}>
                <DetailField label="Nº" value={`#${occurrence.id}`} />
                <DetailField label="Tipo" value={SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType]} />
                <DetailField label="Local" value={occurrence.location} />
                <DetailField label="Encaminhamento" value={savedTriage.referral ?? ''} />
              </Box>
              <Alert severity="warning">Ao confirmar, os dados recebidos serão conferidos e o status passará para CONFIRMED. Isso não conclui a triagem clínica nem gera uma ordem.</Alert>
              <Typography component="h3" variant="subtitle2">Triagem clínica · versão {savedTriage.revision}</Typography>
              <Box component="dl" sx={detailGrid}>
                <DetailField label="Nome do falecido" value={savedTriage.deceasedName ?? ''} />
                <DetailField label="Idade estimada" value={savedTriage.estimatedAge ?? ''} />
                <DetailField label="Médico responsável" value={savedTriage.responsiblePhysician ?? ''} />
                <DetailField label="CRM" value={savedTriage.crm ?? ''} />
                <DetailField label="Causa mortis preliminar" value={savedTriage.preliminaryCauseOfDeath ?? ''} />
                <DetailField label="Documentos disponíveis" value={savedTriage.availableDocuments?.join(', ') ?? ''} />
                <DetailField label="Observações de triagem" value={savedTriage.triageNotes ?? ''} />
              </Box>
            </Stack>
          )}

          {activeStep === 3 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2, py: { xs: 3, sm: 6 } }}>
              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56 }} aria-hidden="true" />
              <Typography component="h2" variant="h5">Solicitação confirmada</Typography>
              <Typography>Nº da solicitação: <strong>#{occurrence.id}</strong></Typography>
              <StatusChip label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]} tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]} />
              <Typography color="text.secondary" sx={{ maxWidth: 560 }}>A solicitação foi confirmada e está disponível para a US18. A ordem ainda não foi gerada nesta etapa.</Typography>
            </Box>
          )}
        </>
      )}
    </>
  )

  const workflowActions = (
    <>
      {activeStep === 0 && <Button onClick={onClose} disabled={savingTriage || confirming} sx={{ minHeight: 44 }}>{presentation === 'page' ? 'Voltar' : 'Cancelar'}</Button>}
      {activeStep === 1 && <Button onClick={() => setSelectedStep(0)} disabled={savingTriage} sx={{ minHeight: 44 }}>Voltar</Button>}
      {activeStep === 2 && <Button onClick={() => setSelectedStep(1)} disabled={confirming} sx={{ minHeight: 44 }}>Voltar</Button>}
      {activeStep === 3 && <Button onClick={onClose} sx={{ minHeight: 44 }}>{presentation === 'page' ? 'Voltar às triagens' : 'Fechar'}</Button>}
      {activeStep === 0 && occurrence?.status === 'PENDING' && canWrite && !detail?.loading && !detail?.triageLoading && !detail?.triageLoadError && <Button variant="contained" onClick={() => setSelectedStep(1)} sx={{ minHeight: 44 }}>{presentation === 'page' ? 'Continuar' : 'Continuar para triagem'}</Button>}
      {activeStep === 1 && <Button type="submit" form={formId} variant="contained" disabled={!canEditTriage || savingTriage} aria-busy={savingTriage || undefined} sx={{ minHeight: 44 }}>{savingTriage ? 'Salvando triagem...' : savedTriage ? 'Salvar retificação e continuar' : 'Continuar'}</Button>}
      {activeStep === 2 && <Button variant="contained" onClick={() => { onClearConfirmationError(); setConfirmOpen(true) }} disabled={!canWrite || !pending || !savedTriage} sx={{ minHeight: 44 }}>{presentation === 'page' ? 'Confirmar' : 'Confirmar dados recebidos'}</Button>}
    </>
  )

  return (
    <>
      {presentation === 'page' && <PageHeader title={occurrence ? `Triagem — Solicitação #${occurrence.id}` : 'Triagem'} breadcrumbs={['Início', 'SVO — Atendimento', 'Triagens', ...(occurrence ? [`Solicitação #${occurrence.id}`] : [])]} description="Confira os dados recebidos e registre a triagem clínica." sx={{ mb: 2 }} />}
      {presentation === 'page' && detail?.data && !detail.loading && !detail.triageLoading && !detail.triageLoadError && stepper}
      {presentation === 'page' ? (
        <>
          <Paper variant="outlined" sx={{ maxWidth: 1000, p: { xs: 2, sm: 2.5 }, borderRadius: 2, borderColor: 'divider', boxShadow: '0 1px 3px rgba(16, 24, 40, 0.12)' }}>
            <DialogContent aria-busy={detail?.loading || detail?.triageLoading || undefined} sx={{ p: 0, overflow: 'visible' }}>{workflowBody}</DialogContent>
          </Paper>
          {detail?.data && !detail.loading && !detail.triageLoading && !detail.triageLoadError && <DialogActions sx={{ maxWidth: 1000, px: 0, pt: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>{workflowActions}</DialogActions>}
        </>
      ) : (
        <Dialog open={open && Boolean(detail)} onClose={savingTriage || confirming ? undefined : onClose} fullScreen={isSmallScreen} fullWidth maxWidth="md" aria-labelledby="svo-occurrence-workflow-title">
          <DialogTitle id="svo-occurrence-workflow-title">{occurrence ? `Solicitação #${occurrence.id}` : 'Detalhes da solicitação'}</DialogTitle>
          <DialogContent aria-busy={detail?.loading || detail?.triageLoading || undefined}>{stepper}{workflowBody}</DialogContent>
          <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>{workflowActions}</DialogActions>
        </Dialog>
      )}
      <ConfirmDialog
        open={confirmOpen && Boolean(occurrence && savedTriage)}
        title="Confirmar os dados recebidos?"
        description={(
          <>
            <Typography component="p" variant="body2">
              A solicitação #{occurrence?.id} passará para CONFIRMED após a conferência dos dados recebidos. Isso não conclui a triagem clínica nem gera uma ordem.
            </Typography>
            {confirmationError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{confirmationError}</Alert>}
          </>
        )}
        confirmLabel="Confirmar solicitação"
        loadingLabel="Confirmando..."
        cancelLabel="Voltar ao resumo"
        loading={confirming}
        confirmDisabled={confirmationBlocked || !savedTriage || !pending}
        onConfirm={() => { void confirmOccurrence() }}
        onCancel={closeConfirm}
      />
    </>
  )
}
