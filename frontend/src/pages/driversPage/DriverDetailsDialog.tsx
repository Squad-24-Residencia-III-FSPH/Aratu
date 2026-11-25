import { useId } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Typography } from '@mui/material'
import { accessibleControls } from '../../components/ui/accessibleControls'
import StatusChip from '../../components/ui/StatusChip'
import StateFeedback from '../../components/ui/StateFeedback'
import { cnhValidity, formatIsoDate, maskCpf } from '../../drivers/driverForm'
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_TONES } from '../../drivers/driverStatus'
import type { DriverDetails, DriverHistoryEventType } from '../../services/driversService'
import { formatDateTimePtBr } from './driverFormHelper'

interface DriverDetailsDialogProps {
  driver: DriverDetails
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
}

const EVENT_TYPE_LABELS: Readonly<Record<DriverHistoryEventType, string>> = {
  CREATED: 'Cadastro inicial',
  UPDATED: 'Atualização cadastral',
  STATUS_CHANGED: 'Alteração de situação',
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
  const hasEvents = Array.isArray(driver.events)

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      aria-labelledby={titleId}
      sx={accessibleControls}
      slotProps={{
        paper: {
          sx: {
            m: { xs: 1, sm: 3 },
            width: { xs: 'calc(100% - 16px)', sm: '100%' },
            maxHeight: { xs: 'calc(100dvh - 16px)', sm: 'calc(100dvh - 48px)' },
          },
        },
      }}
    >
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
            <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              <Typography variant="body2" color="text.secondary">Situação</Typography>
              <StatusChip
                label={DRIVER_STATUS_LABELS[driver.status]}
                tone={DRIVER_STATUS_TONES[driver.status]}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Detail label="Revisão atual" value={String(driver.revision)} />
              <Detail label="Cadastrado em" value={formatDateTimePtBr(driver.createdAt)} />
              <Detail label="Última atualização" value={formatDateTimePtBr(driver.updatedAt)} />
            </Stack>
            <Divider />
            <Stack spacing={1.25}>
              <Typography component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
                Histórico de alterações
              </Typography>
              {hasEvents && driver.events!.length > 0 && (
                <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                  {driver.events!.map((item) => (
                    <Paper
                      component="li"
                      key={item.id}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 1.5 }}
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {EVENT_TYPE_LABELS[item.eventType]} · {formatDateTimePtBr(item.occurredAt)}
                        </Typography>
                        <Typography variant="body2">{item.reason}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Informado por: {item.reportedBy}
                          {item.actorName ? ` · Registrado por: ${item.actorName}` : ''}
                          {item.actorRole ? ` (${item.actorRole})` : ''}
                        </Typography>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
              {hasEvents && driver.events!.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Nenhum evento histórico retornado para este motorista.
                </Typography>
              )}
              {!hasEvents && (
                <Alert severity="info">
                  Os eventos de cadastro, edição e mudança de situação são preservados na trilha do servidor, mas o endpoint atual de consulta não expõe a linha do tempo detalhada.
                </Alert>
              )}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ wordBreak: 'break-word' }}>{value}</Typography>
    </Stack>
  )
}
