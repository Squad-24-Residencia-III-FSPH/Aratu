import { Alert, Box, Button, Typography } from '@mui/material'
import { accessibleControls } from '../../components/ui/accessibleControls'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import StateFeedback from '../../components/ui/StateFeedback'
import type { ConfirmOccurrenceState } from '../../hooks/useSvoOccurrences'
import { SVO_REQUESTER_TYPE_LABELS } from '../../types/svoOccurrence'
import { formatDateTime } from '../../utils/dates'

/** Propriedades do diálogo de confirmação da triagem de uma solicitação SVO. */
export interface SvoOccurrenceConfirmDialogProps {
  /** Estado atual da conferência e envio da confirmação. */
  state: ConfirmOccurrenceState
  /** Indica submissão em curso. */
  submitting: boolean
  /** Indica consulta de reconciliação após resultado incerto. */
  reconciling: boolean
  /** Dispara `POST /svo/occurrences/:id/confirm`. */
  onConfirm: () => void
  /** Reconsulta o estado real da ocorrência após falha incerta. */
  onReconcile: () => void
  /** Fecha o diálogo devolvendo o foco ao acionador. */
  onCancel: () => void
}

/**
 * Apresenta os campos obrigatórios armazenados para conferência explícita do operador
 * antes de concluir a transição `PENDING -> CONFIRMED`.
 */
export default function SvoOccurrenceConfirmDialog({
  state,
  submitting,
  reconciling,
  onConfirm,
  onReconcile,
  onCancel,
}: SvoOccurrenceConfirmDialogProps) {
  const busy = submitting || reconciling
  const detail = state.detail

  return (
    <ConfirmDialog
      open
      title={`Confirmar triagem da solicitação #${state.id}`}
      sx={accessibleControls}
      description={
        state.loadingDetail ? (
          <StateFeedback kind="loading" title="Carregando campos de triagem para conferência..." />
        ) : state.detailError ? (
          <StateFeedback kind="error" title="Não foi possível carregar os dados para confirmação." description={state.detailError} />
        ) : (
          detail && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, overflowWrap: 'anywhere' }}>
              <Typography>
                Confira os dados armazenados antes de confirmar a triagem desta solicitação SVO:
              </Typography>
              <Typography variant="body2">Solicitante: {detail.requesterName}</Typography>
              <Typography variant="body2">Telefone: {detail.requesterPhone}</Typography>
              <Typography variant="body2">Tipo: {SVO_REQUESTER_TYPE_LABELS[detail.requesterType]}</Typography>
              <Typography variant="body2">Local: {detail.location}</Typography>
              <Typography variant="body2">Descrição: {detail.description}</Typography>
              <Typography variant="body2">
                Canal: {detail.evidenceDescription ?? 'Não registrado'}
              </Typography>
              <Typography variant="body2">Recebida em: {formatDateTime(detail.receivedAt)}</Typography>
            </Box>
          )
        )
      }
      confirmLabel="Confirmar triagem"
      cancelLabel="Voltar"
      loadingLabel="Confirmando..."
      loading={submitting}
      confirmDisabled={state.loadingDetail || state.blocked || state.uncertain || Boolean(state.detailError) || busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
      autoFocusCancel
    >
      {state.error && (
        <Alert severity={state.uncertain ? 'warning' : 'error'} role="alert" sx={{ mt: 2 }}>
          {state.error}
        </Alert>
      )}
      {state.uncertain && (
        <Button
          type="button"
          color="inherit"
          disabled={busy}
          onClick={onReconcile}
          sx={{ mt: 1, minHeight: 44 }}
        >
          {reconciling ? 'Consultando...' : 'Consultar situação'}
        </Button>
      )}
    </ConfirmDialog>
  )
}
