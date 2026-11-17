import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useId } from 'react'
import type { SvoOrderDetail } from '../../svo/svoOrderTypes'
import { formatDateTime, MISSING_DISPATCH, MISSING_RECORD, SVO_ORDER_LABELS } from '../../svo/svoOrderPresentation'
import StateFeedback from '../ui/StateFeedback'

/** Detalhe sob demanda; separa o contexto imutável do despacho do cadastro atual. */
interface SvoOrderDetailsProps {
  id: string
  order: SvoOrderDetail | null
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
}

export default function SvoOrderDetails({ id, order, loading, error, onRetry, onClose }: SvoOrderDetailsProps) {
  const titleId = useId()
  const occurrence = order?.occurrenceSnapshot
  const hasClosingInfo = Boolean(
    order && (order.result !== null || order.closedAt !== null || order.status === 'COMPLETED'
      || order.status === 'NOT_PERFORMED' || order.failureReason !== null || order.notes !== null || order.closedBy !== null),
  )
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}
    sx={{ '& :focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 } }}>
    <DialogTitle id={titleId}>Detalhes da ordem #{id}</DialogTitle>
    <DialogContent sx={{ overflowWrap: 'anywhere' }} aria-busy={loading}>
      {loading ? <StateFeedback kind="loading" title="Carregando detalhe..." />
        : error ? <StateFeedback kind="error" title="Não foi possível consultar o detalhe." description={error} actionLabel="Tentar detalhe novamente" onAction={onRetry} />
          : order && <>
            <Typography component="h2" variant="h6">Contexto do despacho</Typography>
            <Typography>Local: {order.dispatch.location ?? MISSING_DISPATCH}</Typography>
            <Typography>Equipe: {order.dispatch.teamName ?? MISSING_DISPATCH}</Typography>
            <Typography>Veículo: {order.dispatch.vehicleLicensePlate ?? MISSING_DISPATCH}</Typography>
            {occurrence ? <Box sx={{ mt: 2 }}>
              <Typography>Solicitante: {occurrence.requesterName}</Typography>
              <Typography>Contato: {occurrence.requesterPhone}</Typography>
              <Typography>Descrição: {occurrence.description}</Typography>
              {occurrence.notes && <Typography>Observações: {occurrence.notes}</Typography>}
              <Typography>Recebida em: {formatDateTime(occurrence.receivedAt)}</Typography>
              {occurrence.evidenceDescription && <Typography>Evidência do chamado: {occurrence.evidenceDescription}</Typography>}
            </Box> : <StateFeedback kind="partial" title="Não registrado no despacho" description="O contexto histórico deste chamado não está disponível." />}
            <Typography component="h2" variant="h6" sx={{ mt: 2 }}>Cadastro atual</Typography>
            <Typography>Local atual: {order.current.location}</Typography>
            <Typography>Equipe atual: {order.current.teamName}</Typography>
            <Typography>Veículo atual: {order.current.vehicleLicensePlate}</Typography>
            <Typography component="h2" variant="h6" sx={{ mt: 2 }}>Andamento e resultado</Typography>
            <Typography>Situação: {SVO_ORDER_LABELS[order.status]}</Typography>
            <Typography>Aberta em: {formatDateTime(order.openedAt)}</Typography>
            <Typography>Saída: {order.departedAt ? formatDateTime(order.departedAt) : MISSING_RECORD}</Typography>
            <Typography>Chegada: {order.arrivedAt ? formatDateTime(order.arrivedAt) : MISSING_RECORD}</Typography>
            <Typography>Coleta: {order.collectedAt ? formatDateTime(order.collectedAt) : MISSING_RECORD}</Typography>
            <Typography>Encerrada em: {order.closedAt ? formatDateTime(order.closedAt) : MISSING_RECORD}</Typography>
            {hasClosingInfo && <>
              <Typography>Resultado: {order.result ? SVO_ORDER_LABELS[order.result] : MISSING_RECORD}</Typography>
              {(order.result === 'NOT_PERFORMED' || order.status === 'NOT_PERFORMED' || order.failureReason !== null) && (
                <Typography>Motivo da não realização: {order.failureReason ?? MISSING_RECORD}</Typography>
              )}
              <Typography>Observações do atendimento: {order.notes ?? MISSING_RECORD}</Typography>
              <Typography>Encerrada por: {order.closedBy ? `Usuário #${order.closedBy}` : MISSING_RECORD}</Typography>
            </>}
          </>}
    </DialogContent>
    <DialogActions><Button onClick={onClose} color="inherit">Fechar detalhes</Button></DialogActions>
  </Dialog>
}
