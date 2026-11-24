import { useId } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from '@mui/material'
import { accessibleControls } from '../../components/ui/accessibleControls'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import type { OccurrenceDetailState } from '../../hooks/useSvoOccurrences'
import {
  SVO_DISPATCH_ORDER_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_TONES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../../types/svoOccurrence'
import type { SvoDispatchOrderRef, SvoOccurrenceSummary } from '../../types/svoOccurrence'
import { formatDateTime } from '../../utils/dates'

/** Propriedades do diálogo de detalhes da solicitação SVO. */
export interface SvoOccurrenceDetailsDialogProps {
  /** Estado de carregamento e dados completos da solicitação. */
  detail: OccurrenceDetailState
  /** Ordem vinculada à solicitação quando já gerada. */
  linkedOrder: SvoDispatchOrderRef | undefined
  /** Indica se o perfil atual pode confirmar triagem ou gerar ordem. */
  canWrite: boolean
  /** Recarrega o detalhe em caso de falha transitória. */
  onRetry: () => void
  /** Fecha o diálogo e devolve foco ao acionador. */
  onClose: () => void
  /** Inicia o fluxo de confirmação de triagem para solicitação pendente. */
  onConfirmOccurrence: (occurrence: SvoOccurrenceSummary) => void
  /** Inicia o fluxo de despacho para solicitação confirmada sem ordem vinculada. */
  onDispatchOrder: (occurrence: SvoOccurrenceSummary) => void
}

/**
 * Exibe os dados completos de triagem e histórico de recebimento da solicitação SVO
 * carregados sob demanda, preservando sigilo na listagem principal.
 */
export default function SvoOccurrenceDetailsDialog({
  detail,
  linkedOrder,
  canWrite,
  onRetry,
  onClose,
  onConfirmOccurrence,
  onDispatchOrder,
}: SvoOccurrenceDetailsDialogProps) {
  const titleId = useId()
  const occurrence = detail.data

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby={titleId}
      sx={accessibleControls}
    >
      <DialogTitle id={titleId}>Detalhes da solicitação #{detail.id}</DialogTitle>
      <DialogContent dividers sx={{ overflowWrap: 'anywhere' }} aria-busy={detail.loading}>
        {detail.loading ? (
          <StateFeedback kind="loading" title="Carregando detalhes da solicitação..." />
        ) : detail.error ? (
          <StateFeedback
            kind="error"
            title="Não foi possível carregar os detalhes da solicitação."
            description={detail.error}
            actionLabel="Tentar novamente"
            onAction={onRetry}
          />
        ) : (
          occurrence && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <StatusChip
                  label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]}
                  tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]}
                />
                <Typography variant="body2" color="text.secondary">
                  Revisão {occurrence.revision}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
                Dados do chamado e triagem
              </Typography>
              <Typography>Solicitante: {occurrence.requesterName}</Typography>
              <Typography>Telefone: {occurrence.requesterPhone}</Typography>
              <Typography>Tipo: {SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType]}</Typography>
              <Typography>Local: {occurrence.location}</Typography>
              <Typography>Descrição: {occurrence.description}</Typography>
              <Typography>Observações: {occurrence.notes ?? 'Não informadas'}</Typography>
              {occurrence.evidenceDescription ? (
                <Typography>Canal de recebimento: {occurrence.evidenceDescription}</Typography>
              ) : (
                <StateFeedback
                  kind="partial"
                  title="Canal de recebimento não registrado"
                  description="Registro histórico sem evento inicial de evidência."
                  sx={{ my: 1 }}
                />
              )}
              <Divider sx={{ my: 1 }} />
              <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
                Rastreabilidade temporal
              </Typography>
              <Typography>Recebida em: {formatDateTime(occurrence.receivedAt)}</Typography>
              <Typography>Cadastrada em: {formatDateTime(occurrence.createdAt)}</Typography>
              <Typography>Atendente responsável: Usuário #{occurrence.attendantId}</Typography>
              <Typography>
                Confirmada em: {occurrence.triagedAt ? formatDateTime(occurrence.triagedAt) : 'Aguardando confirmação'}
              </Typography>
              {occurrence.triagedBy && (
                <Typography>Triagem confirmada por: Usuário #{occurrence.triagedBy}</Typography>
              )}
              {linkedOrder && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Ordem de execução vinculada
                  </Typography>
                  <Typography>
                    Ordem #{linkedOrder.id} · {SVO_DISPATCH_ORDER_STATUS_LABELS[linkedOrder.status] ?? linkedOrder.status}
                  </Typography>
                  <Typography>Equipe: {linkedOrder.teamName}</Typography>
                  <Typography>Viatura: {linkedOrder.vehicleLicensePlate}</Typography>
                </>
              )}
            </Box>
          )
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button type="button" color="inherit" onClick={onClose}>
          Fechar detalhes
        </Button>
        {canWrite && occurrence && occurrence.status === 'PENDING' && (
          <Button
            type="button"
            variant="contained"
            onClick={() => onConfirmOccurrence(occurrence)}
          >
            Confirmar triagem
          </Button>
        )}
        {canWrite && occurrence && occurrence.status === 'CONFIRMED' && !linkedOrder && (
          <Button
            type="button"
            variant="contained"
            onClick={() => onDispatchOrder(occurrence)}
          >
            Gerar ordem
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
