import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { SVO_ORDERS_PATH } from '../../svo/svoOrderTypes'
import {
  formatSvoOccurrenceDateTime, SVO_OCCURRENCE_STATUS_LABELS, SVO_OCCURRENCE_STATUS_TONES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../../svo/svoOccurrencePresentation'
import type { SvoOccurrenceDetail } from '../../svo/svoOccurrenceTypes'

interface OccurrenceDetailState {
  id: string
  data: SvoOccurrenceDetail | null
  loading: boolean
  error: string
}

interface SvoOccurrenceWorkflowDialogProps {
  open: boolean
  detail: OccurrenceDetailState | null
  canWrite: boolean
  confirming: boolean
  confirmationError: string
  confirmationBlocked: boolean
  onClose: () => void
  onRetry: () => void
  onConfirm: (occurrence: SvoOccurrenceDetail) => Promise<unknown>
  onClearConfirmationError: () => void
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{children || 'Não informado'}</Typography>
    </Box>
  )
}

/** Exibe os dados retornados da ocorrência mesmo depois da confirmação técnica. */
export default function SvoOccurrenceWorkflowDialog({
  open, detail, canWrite, confirming, confirmationError, confirmationBlocked,
  onClose, onRetry, onConfirm, onClearConfirmationError,
}: SvoOccurrenceWorkflowDialogProps) {
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const occurrence = detail?.data ?? null
  const isPending = occurrence?.status === 'PENDING'

  async function confirmOccurrence(): Promise<void> {
    if (!occurrence || !isPending) return
    if (await onConfirm(occurrence)) setConfirmOpen(false)
  }

  function closeConfirmation(): void {
    if (confirming) return
    setConfirmOpen(false)
    onClearConfirmationError()
  }

  return (
    <>
      <Dialog
        open={open && Boolean(detail)}
        onClose={confirming ? undefined : onClose}
        fullScreen={isSmallScreen}
        fullWidth
        maxWidth="md"
        aria-labelledby="svo-occurrence-detail-title"
      >
        <DialogTitle id="svo-occurrence-detail-title">
          {occurrence ? `Solicitação #${occurrence.id}` : 'Detalhes da solicitação'}
        </DialogTitle>
        <DialogContent aria-busy={detail?.loading || undefined}>
          {detail?.loading && <StateFeedback kind="loading" title="Carregando dados da solicitação..." />}
          {detail?.error && <StateFeedback kind="error" title={detail.error} actionLabel="Tentar novamente" onAction={onRetry} />}
          {detail && occurrence && !detail.loading && !detail.error && (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography component="span" variant="body2" color="text.secondary">Situação</Typography>
                <StatusChip label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]} tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]} />
              </Box>
              {occurrence.status === 'CONFIRMED' && (
                <Alert severity="info" role="note">
            Os dados recebidos foram conferidos pelo atendente. O encaminhamento é informacional e não registra uma triagem clínica.
                </Alert>
              )}
              {occurrence.executionOrderId && (
                <Alert severity="success" role="status">
                  Ordem #{occurrence.executionOrderId} criada pela seleção automática de equipe e viatura. Acompanhe em <Link to={SVO_ORDERS_PATH}>ordens SVO</Link>.
                </Alert>
              )}
              {occurrence.dispatchWaitReason && (
                <Alert severity="warning" role="status">
                  A solicitação está aguardando despacho: {occurrence.dispatchWaitReason === 'NO_TEAM'
                    ? 'não há equipe elegível no plantão atual.'
                    : 'não há viatura elegível com vaga disponível.'} O gestor de frota pode solicitar uma nova avaliação quando os recursos mudarem.
                </Alert>
              )}
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, m: 0 }}>
                <DetailField label="Solicitante">{occurrence.requesterName}</DetailField>
                <DetailField label="Telefone">{occurrence.requesterPhone}</DetailField>
                <DetailField label="Tipo de solicitante">{SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType]}</DetailField>
                <DetailField label="Local">{occurrence.location}</DetailField>
                <DetailField label="Recebida em">{formatSvoOccurrenceDateTime(occurrence.receivedAt)}</DetailField>
                <DetailField label="Descrição da solicitação">{occurrence.description}</DetailField>
                <DetailField label="Canal ou meio de recebimento">{occurrence.evidenceDescription}</DetailField>
                <DetailField label="Observações">{occurrence.notes}</DetailField>
              </Box>
              {confirmationError && !confirmOpen && <Alert severity="error" role="alert">{confirmationError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
          <Button onClick={onClose} disabled={confirming} sx={{ minHeight: 44 }}>Fechar</Button>
          {isPending && canWrite && detail?.data && (
            <Button
              variant="contained"
              onClick={() => { onClearConfirmationError(); setConfirmOpen(true) }}
              disabled={confirming}
              sx={{ minHeight: 44 }}
            >
              Confirmar dados recebidos
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen && Boolean(occurrence && isPending)}
        title="Confirmar os dados recebidos?"
        description={(
          <>
            <Typography component="p" variant="body2">
              A solicitação #{occurrence?.id} passará para CONFIRMED após a conferência dos dados recebidos.
            </Typography>
            {confirmationError && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{confirmationError}</Alert>}
          </>
        )}
        confirmLabel="Confirmar solicitação"
        loadingLabel="Confirmando..."
        cancelLabel="Voltar aos detalhes"
        loading={confirming}
        confirmDisabled={confirmationBlocked || !isPending}
        onConfirm={() => { void confirmOccurrence() }}
        onCancel={closeConfirmation}
      />
    </>
  )
}
