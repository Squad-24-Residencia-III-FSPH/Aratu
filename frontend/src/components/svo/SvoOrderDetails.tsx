import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useId } from 'react'
import type { SvoOrderDetail } from '../../svo/svoOrderTypes'
import { formatDateTime, MISSING_DISPATCH } from '../../svo/svoOrderPresentation'
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
          </>}
    </DialogContent>
    <DialogActions><Button onClick={onClose} color="inherit">Fechar detalhes</Button></DialogActions>
  </Dialog>
}
