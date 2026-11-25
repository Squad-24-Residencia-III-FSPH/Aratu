import { useId } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import StateFeedback from '../../components/ui/StateFeedback.tsx'
import StatusChip from '../../components/ui/StatusChip.tsx'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import {
  FINE_EVENT_LABELS,
  FINE_STATUS_LABELS,
  FINE_STATUS_TONES,
  FINE_TRANSITION_ACTION_LABELS,
  FINE_TRANSITIONS,
  formatFineMoney,
  isFineClosed,
  SNAPSHOT_SOURCE_LABELS,
  TRIP_STATUS_LABELS,
} from '../../types/fine.ts'
import type { Fine, FineDetail, FineStatus, FineTimelineEntry } from '../../types/fine.ts'
import { formatCalendarDate, formatDateTime } from '../../utils/dates.ts'
import styles from './FinesPage.module.css'

interface FineDetailDialogProps {
  fine: FineDetail | null
  loading: boolean
  error: string
  onRetry: () => void
  onClose: () => void
  onEdit: (fine: FineDetail) => void
  onRequestStatusChange: (fine: FineDetail, nextStatus: FineStatus) => void
}

/** Exibe o detalhe completo, retratos históricos preservados e trilha imutável de eventos da multa. */
export default function FineDetailDialog({
  fine,
  loading,
  error,
  onRetry,
  onClose,
  onEdit,
  onRequestStatusChange,
}: FineDetailDialogProps) {
  const baseId = useId()
  const allowedTransitions = fine ? FINE_TRANSITIONS[fine.status] : []

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby={`${baseId}-title`}
      sx={accessibleControls}
    >
      <DialogTitle id={`${baseId}-title`}>
        {fine ? `Multa #${fine.id} — ${fine.infractionCode}` : 'Consultar multa'}
      </DialogTitle>
      <DialogContent dividers>
        {loading && !fine && (
          <StateFeedback kind="loading" title="Carregando detalhe da multa..." />
        )}

        {!loading && error && !fine && (
          <StateFeedback
            kind="error"
            title={error}
            actionLabel="Tentar novamente"
            onAction={onRetry}
            sx={{ mb: 0 }}
          />
        )}

        {fine && (
          <Stack spacing={2.5}>
            {loading && (
              <StateFeedback
                kind="loading"
                title="Atualizando dados da multa..."
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
              />
            )}
            {error && (
              <StateFeedback
                kind="partial"
                title="Não foi possível atualizar o detalhe."
                description={error}
                actionLabel="Tentar novamente"
                onAction={onRetry}
                sx={{ mb: 0 }}
              />
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={FINE_STATUS_TONES[fine.status]} />
                <Typography variant="body2" color="text.secondary">
                  Revisão {fine.revision} · Registrada em {formatDateTime(fine.createdAt)}
                </Typography>
              </Box>
              <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
                {formatFineMoney(fine.amount)}
              </Typography>
            </Box>

            <Stack spacing={1}>
              <Typography variant="body1">
                <strong>Descrição:</strong> {fine.description}
              </Typography>
              <Typography variant="body2">
                <strong>Data e hora da infração:</strong> {formatDateTime(fine.infractionAt)} ·{' '}
                <strong>Vencimento:</strong> {fine.dueAt ? formatCalendarDate(fine.dueAt) : 'Não informado'}
              </Typography>
              <Typography variant="body2">
                <strong>Local:</strong> {fine.location ?? 'Não informado'} ·{' '}
                <strong>Observações:</strong> {fine.notes ?? 'Nenhuma'}
              </Typography>
              {fine.paidAt && (
                <Typography variant="body2">
                  <strong>Pagamento registrado em:</strong> {formatDateTime(fine.paidAt)}
                </Typography>
              )}
              {fine.cancellationReason && (
                <Typography variant="body2">
                  <strong>Motivo do cancelamento:</strong> {fine.cancellationReason}
                </Typography>
              )}
            </Stack>

            {isFineClosed(fine) && (
              <Alert severity="info">
                Multas com situação Paga ou Cancelada ficam bloqueadas para retificação de dados. Caso precise corrigir algum campo, reabra a multa antes.
              </Alert>
            )}

            <Divider />

            <Stack spacing={1.25}>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                Retratos históricos preservados
              </Typography>
              <Box className={styles.snapshotGrid}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    VEÍCULO NA ÉPOCA / REGISTRO
                  </Typography>
                  {fine.vehicleSnapshot ? (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fine.vehicleSnapshot.licensePlate}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {fine.vehicleSnapshot.model ?? 'Modelo não informado'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Fonte: {SNAPSHOT_SOURCE_LABELS[fine.vehicleSnapshot.source]} · Capturado em {formatDateTime(fine.vehicleSnapshot.capturedAt)}
                      </Typography>
                    </Stack>
                  ) : (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fine.vehicle.licensePlate}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Registro legado sem snapshot congelado. Cadastro atual exibido apenas para referência.
                      </Typography>
                    </Stack>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    MOTORISTA VINCULADO
                  </Typography>
                  {fine.driverSnapshot ? (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fine.driverSnapshot.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Fonte: {SNAPSHOT_SOURCE_LABELS[fine.driverSnapshot.source]} · Capturado em {formatDateTime(fine.driverSnapshot.capturedAt)}
                      </Typography>
                    </Stack>
                  ) : fine.driver ? (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fine.driver.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Registro legado sem snapshot congelado.
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Nenhum motorista vinculado.
                    </Typography>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    VIAGEM VINCULADA
                  </Typography>
                  {fine.tripSnapshot ? (
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Viagem #{fine.tripSnapshot.id} · {TRIP_STATUS_LABELS[fine.tripSnapshot.status] ?? fine.tripSnapshot.status}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Início: {fine.tripSnapshot.startedAt ? formatDateTime(fine.tripSnapshot.startedAt) : 'Não informado'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Fim: {fine.tripSnapshot.finishedAt ? formatDateTime(fine.tripSnapshot.finishedAt) : 'Em andamento'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Capturado em {formatDateTime(fine.tripSnapshot.capturedAt)}
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Nenhuma viagem vinculada.
                    </Typography>
                  )}
                </Paper>
              </Box>
            </Stack>

            <Divider />

            <Stack spacing={1.25}>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                Trilha imutável de eventos ({fine.events.length})
              </Typography>
              {fine.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nenhum evento registrado para esta multa.
                </Typography>
              ) : (
                <Box component="ol" className={styles.timelineList}>
                  {fine.events.map((entry) => {
                    const changes = describeTimelineChanges(entry)
                    const safeUrl = sanitizeAttachmentUrl(entry.attachmentUrl)
                    return (
                      <Paper key={entry.id} component="li" variant="outlined" sx={{ p: 1.75 }}>
                        <Stack spacing={0.75}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                #{entry.id} · {FINE_EVENT_LABELS[entry.eventType] ?? entry.eventType}
                              </Typography>
                              {entry.supersedesId && (
                                <Chip size="small" label={`Retifica evento #${entry.supersedesId}`} variant="outlined" />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              Registrado em {formatDateTime(entry.registeredAt)} · Ocorrido em {formatDateTime(entry.occurredAt)}
                            </Typography>
                          </Box>

                          <Typography variant="body2">
                            <strong>Responsável:</strong> {entry.actor.name} ({entry.actor.role}) ·{' '}
                            <strong>Origem:</strong> {entry.reportedBy}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Justificativa:</strong> {entry.reason}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Evidência:</strong> {entry.evidenceDescription ?? 'Não informada'}
                          </Typography>
                          {safeUrl && (
                            <Typography variant="body2">
                              <strong>Anexo informado:</strong>{' '}
                              <Link href={safeUrl} target="_blank" rel="noopener noreferrer">
                                {safeUrl}
                              </Link>
                            </Typography>
                          )}

                          {changes.length > 0 && (
                            <Box sx={{ mt: 0.5, pt: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.25 }}>
                                Alterações registradas neste evento:
                              </Typography>
                              {changes.map((line) => (
                                <Typography key={line} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  • {line}
                                </Typography>
                              ))}
                            </Box>
                          )}
                        </Stack>
                      </Paper>
                    )
                  })}
                </Box>
              )}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
        <Button type="button" color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>
          Fechar
        </Button>
        {fine && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {!isFineClosed(fine) && (
              <Button type="button" variant="outlined" onClick={() => onEdit(fine)} sx={{ minHeight: 44 }}>
                Retificar multa
              </Button>
            )}
            {allowedTransitions.map((nextStatus) => (
              <Button
                key={nextStatus}
                type="button"
                variant={nextStatus === 'CANCELED' ? 'outlined' : 'contained'}
                color={nextStatus === 'CANCELED' ? 'error' : 'primary'}
                onClick={() => onRequestStatusChange(fine, nextStatus)}
                sx={{ minHeight: 44 }}
              >
                {FINE_TRANSITION_ACTION_LABELS[nextStatus]}
              </Button>
            ))}
          </Box>
        )}
      </DialogActions>
    </Dialog>
  )
}

function sanitizeAttachmentUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function describeTimelineChanges(entry: FineTimelineEntry): string[] {
  const { before, after } = entry
  if (!before) {
    const initial: string[] = []
    if (after.status) initial.push(`Situação inicial: ${FINE_STATUS_LABELS[after.status] ?? after.status}`)
    if (after.amount) initial.push(`Valor: ${formatFineMoney(after.amount)}`)
    const driverName = after.driverSnapshot?.name ?? after.driver?.name
    initial.push(`Motorista: ${driverName ?? 'Sem motorista vinculado'}`)
    if (after.tripId) initial.push(`Viagem vinculada: #${after.tripId}`)
    return initial
  }

  const lines: string[] = []
  const compare = <K extends keyof Fine>(key: K, label: string, format: (value: Fine[K] | undefined) => string) => {
    const prev = format(before[key])
    const next = format(after[key])
    if (prev !== next) lines.push(`${label}: ${prev} → ${next}`)
  }

  compare('status', 'Situação', (v) => (v ? FINE_STATUS_LABELS[v] ?? v : '—'))
  compare('vehicleId', 'Veículo', (v) => (v ? before.vehicleSnapshot?.licensePlate ?? before.vehicle?.licensePlate ?? `#${v}` : '—'))
  if ((before.vehicleSnapshot?.licensePlate ?? before.vehicleId) !== (after.vehicleSnapshot?.licensePlate ?? after.vehicleId)) {
    const prevPlate = before.vehicleSnapshot?.licensePlate ?? before.vehicle?.licensePlate ?? `#${before.vehicleId ?? ''}`
    const nextPlate = after.vehicleSnapshot?.licensePlate ?? after.vehicle?.licensePlate ?? `#${after.vehicleId ?? ''}`
    if (prevPlate !== nextPlate && !lines.some((line) => line.startsWith('Veículo:'))) {
      lines.push(`Veículo: ${prevPlate} → ${nextPlate}`)
    }
  }
  const prevDriver = before.driverSnapshot?.name ?? before.driver?.name ?? (before.driverId ? `#${before.driverId}` : 'Sem motorista')
  const nextDriver = after.driverSnapshot?.name ?? after.driver?.name ?? (after.driverId ? `#${after.driverId}` : 'Sem motorista')
  if (prevDriver !== nextDriver) lines.push(`Motorista: ${prevDriver} → ${nextDriver}`)

  compare('tripId', 'Viagem', (v) => (v ? `#${v}` : 'Sem viagem'))
  compare('infractionAt', 'Data da infração', (v) => (v ? formatDateTime(v) : '—'))
  compare('infractionCode', 'Código', (v) => v ?? '—')
  compare('amount', 'Valor', (v) => (v !== undefined ? formatFineMoney(v) : '—'))
  compare('dueAt', 'Vencimento', (v) => (v ? formatCalendarDate(v) : 'Não informado'))
  compare('description', 'Descrição', (v) => v ?? '—')
  compare('location', 'Local', (v) => v ?? 'Não informado')
  compare('notes', 'Observações', (v) => v ?? 'Nenhuma')
  compare('paidAt', 'Pagamento', (v) => (v ? formatDateTime(v) : 'Não pago'))
  compare('cancellationReason', 'Motivo de cancelamento', (v) => v ?? 'Nenhum')

  return lines
}
