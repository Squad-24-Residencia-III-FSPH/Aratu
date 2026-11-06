import { useId } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import StatusChip from '../../components/ui/StatusChip'
import StateFeedback from '../../components/ui/StateFeedback'
import { cnhValidity, formatIsoDate, maskCpf } from '../../drivers/driverForm'
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_TONES } from '../../drivers/driverStatus'
import type { Driver } from '../../drivers/driverTypes'

interface DriverDetailsDialogProps {
  driver: Driver
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
}

/**
 * Exibe os dados atuais do motorista devolvidos por `GET /drivers/:id`.
 *
 * Enquanto a consulta corre ou falha, apenas o estado correspondente é mostrado,
 * evitando apresentar dados antigos como se fossem os atuais.
 */
export default function DriverDetailsDialog({ driver, loading, error, onRetry, onClose }: DriverDetailsDialogProps) {
  const titleId = useId()
  const validity = cnhValidity(driver.cnhExpiresAt)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Detalhes do motorista</DialogTitle>
      <DialogContent dividers>
        {loading && <StateFeedback kind="loading" title="Atualizando detalhes do motorista..." />}
        {!loading && error && (
          <StateFeedback
            kind="error"
            title={error}
            actionLabel="Tentar novamente"
            onAction={onRetry}
          />
        )}
        {!loading && !error && (
          <Stack spacing={2}>
            <Detail label="Nome" value={driver.name} />
            <Detail label="CPF" value={maskCpf(driver.cpf)} />
            <Detail label="CNH" value={driver.cnhNumber} />
            <Detail label="Categoria" value={driver.cnhCategory} />
            <Detail label="Validade da CNH" value={formatIsoDate(driver.cnhExpiresAt)} />
            {validity !== 'valid' && (
              <Typography color={validity === 'expired' ? 'error' : 'warning.dark'} sx={{ fontWeight: 700 }} role="status">
                {validity === 'expired' ? 'CNH vencida' : 'CNH vence em até 30 dias'}
              </Typography>
            )}
            <Detail label="Telefone" value={driver.phone || 'Não informado'} />
            <Detail label="Conta vinculada" value={driver.userId || 'Nenhuma'} />
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">Situação</Typography>
              <StatusChip
                label={DRIVER_STATUS_LABELS[driver.status]}
                tone={DRIVER_STATUS_TONES[driver.status]}
              />
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography>{value}</Typography>
    </Stack>
  )
}
