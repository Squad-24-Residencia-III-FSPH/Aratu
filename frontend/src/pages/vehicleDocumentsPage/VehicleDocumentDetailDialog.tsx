import { useId } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { profileLabel } from '../../auth/profiles.ts'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import StateFeedback from '../../components/ui/StateFeedback.tsx'
import StatusChip from '../../components/ui/StatusChip.tsx'
import type { DocumentSelectionState } from '../../hooks/useVehicleDocuments.ts'
import {
  formatDaysUntilExpiration,
  VEHICLE_DOCUMENT_EVENT_LABELS,
  VEHICLE_DOCUMENT_EVENT_TONES,
  VEHICLE_DOCUMENT_STATUS_LABELS,
  VEHICLE_DOCUMENT_STATUS_TONES,
  VEHICLE_DOCUMENT_TYPE_LABELS,
} from '../../types/vehicleDocument.ts'
import type {
  VehicleDocument,
  VehicleDocumentTimelineEntry,
} from '../../types/vehicleDocument.ts'
import { formatCalendarDate, formatDateTime } from '../../utils/dates.ts'
import { VEHICLE_STATUS_LABELS } from '../../vehicles/vehicleTypes.ts'

export interface VehicleDocumentDetailDialogProps {
  selection: DocumentSelectionState
  canWrite: boolean
  referenceDate?: string
  onClose: () => void
  onRetry: () => void
  onSelectDocument: (id: string) => void
  onEdit: (document: VehicleDocument) => void
  onRenew: (document: VehicleDocument) => void
  onAnnul: (document: VehicleDocument) => void
}

function summarizeChanges(entry: VehicleDocumentTimelineEntry): string[] {
  if (!entry.before) return []
  const changes: string[] = []
  if (entry.before.documentNumber !== entry.after.documentNumber) {
    changes.push(
      `Número: ${entry.before.documentNumber ?? 'não informado'} → ${entry.after.documentNumber ?? 'não informado'}`,
    )
  }
  if (entry.before.issuedAt !== entry.after.issuedAt) {
    changes.push(
      `Emissão: ${entry.before.issuedAt ? formatCalendarDate(entry.before.issuedAt) : 'não informada'} → ${entry.after.issuedAt ? formatCalendarDate(entry.after.issuedAt) : 'não informada'}`,
    )
  }
  if (entry.before.expiresAt !== entry.after.expiresAt) {
    changes.push(
      `Vencimento: ${formatCalendarDate(entry.before.expiresAt)} → ${formatCalendarDate(entry.after.expiresAt)}`,
    )
  }
  if (entry.before.notes !== entry.after.notes) {
    changes.push('Observações atualizadas')
  }
  if (!entry.before.isAnnulled && entry.after.isAnnulled) {
    changes.push('Documento marcado como anulado')
  }
  return changes
}

/** Exibe os dados do documento, vínculo de renovação e linha do tempo cronológica sem e-mail (LGPD). */
export default function VehicleDocumentDetailDialog({
  selection,
  canWrite,
  referenceDate,
  onClose,
  onRetry,
  onSelectDocument,
  onEdit,
  onRenew,
  onAnnul,
}: VehicleDocumentDetailDialogProps) {
  const titleId = useId()
  const detail = selection.detail

  const canEdit = Boolean(detail && canWrite && !detail.isAnnulled)
  const canRenewOrAnnul = Boolean(
    detail && canWrite && !detail.isAnnulled && detail.supersededById === null,
  )

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby={titleId}
      sx={accessibleControls}
    >
      <DialogTitle id={titleId}>
        {detail
          ? `Documento #${detail.id} — ${VEHICLE_DOCUMENT_TYPE_LABELS[detail.documentType]} (${detail.vehicle.licensePlate})`
          : `Detalhes do documento #${selection.id}`}
      </DialogTitle>

      <DialogContent dividers>
        {selection.loading && (
          <StateFeedback kind="loading" title="Carregando detalhes e histórico do documento..." />
        )}

        {!selection.loading && selection.error && (
          <StateFeedback
            kind="error"
            title="Não foi possível consultar o documento."
            description={selection.error}
            actionLabel="Tentar novamente"
            onAction={onRetry}
          />
        )}

        {!selection.loading && !selection.error && detail && (
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusChip
                  label={VEHICLE_DOCUMENT_STATUS_LABELS[detail.status]}
                  tone={VEHICLE_DOCUMENT_STATUS_TONES[detail.status]}
                />
                <Typography
                  variant="body2"
                  color={detail.status === 'EXPIRED' ? 'error.main' : 'text.secondary'}
                  sx={{ fontWeight: detail.status === 'EXPIRED' ? 700 : 500 }}
                >
                  {formatDaysUntilExpiration(detail.daysUntilExpiration, detail.status)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Revisão {detail.revision}
                {referenceDate ? ` · Referência: ${formatCalendarDate(referenceDate)}` : ''}
              </Typography>
            </Stack>

            {detail.isAnnulled && detail.annulmentReason && (
              <Alert severity="warning">
                Documento anulado. Motivo registrado: {detail.annulmentReason}
              </Alert>
            )}

            {(detail.supersedesId || detail.supersededById) && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Vínculo histórico de renovação
                </Typography>
                <Stack spacing={1}>
                  {detail.supersedesId && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                      <Typography variant="body2">
                        Este documento substitui o documento anterior #{detail.supersedesId}.
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onSelectDocument(detail.supersedesId!)}
                        sx={{ minHeight: 44 }}
                      >
                        Abrir anterior #{detail.supersedesId}
                      </Button>
                    </Stack>
                  )}
                  {detail.supersededById && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                      <Typography variant="body2">
                        Este documento foi renovado pelo documento #{detail.supersededById}.
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onSelectDocument(detail.supersededById!)}
                        sx={{ minHeight: 44 }}
                      >
                        Abrir renovação #{detail.supersededById}
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <DetailItem
                label="Veículo atual"
                value={`${detail.vehicle.licensePlate}${detail.vehicle.model ? ` — ${detail.vehicle.model}` : ''} (${VEHICLE_STATUS_LABELS[detail.vehicle.status]})`}
              />
              <DetailItem
                label="Tipo de documento"
                value={VEHICLE_DOCUMENT_TYPE_LABELS[detail.documentType]}
              />
              <DetailItem
                label="Número do documento"
                value={detail.documentNumber ?? 'Não informado'}
              />
              <DetailItem
                label="Data de emissão"
                value={detail.issuedAt ? formatCalendarDate(detail.issuedAt) : 'Não informada'}
              />
              <DetailItem
                label="Data de vencimento"
                value={formatCalendarDate(detail.expiresAt)}
              />
              <DetailItem
                label="Observações"
                value={detail.notes ?? 'Nenhuma observação registrada'}
              />
            </Box>

            {detail.vehicleSnapshot && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Veículo no momento do cadastro (snapshot)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Placa {detail.vehicleSnapshot.licensePlate}
                  {detail.vehicleSnapshot.model ? ` · ${detail.vehicleSnapshot.model}` : ''} ·{' '}
                  Situação na época: {VEHICLE_STATUS_LABELS[detail.vehicleSnapshot.status]}
                </Typography>
              </Paper>
            )}

            <Divider />

            <Box>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Linha do tempo de eventos ({detail.events.length})
              </Typography>
              {detail.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nenhum evento registrado para este documento.
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {detail.events.map((entry) => {
                    const changes = summarizeChanges(entry)
                    return (
                      <Paper key={entry.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1 }}
                        >
                          <StatusChip
                            label={VEHICLE_DOCUMENT_EVENT_LABELS[entry.eventType]}
                            tone={VEHICLE_DOCUMENT_EVENT_TONES[entry.eventType]}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Registrado em {formatDateTime(entry.occurredAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2">
                          <strong>Operador:</strong> {entry.actor.name} ({profileLabel(entry.actor.role)})
                        </Typography>
                        <Typography variant="body2">
                          <strong>Origem:</strong> {entry.reportedBy}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Justificativa:</strong> {entry.reason}
                        </Typography>
                        {changes.length > 0 && (
                          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
                            {changes.map((change) => (
                              <Typography key={change} component="li" variant="body2" color="text.secondary">
                                {change}
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Paper>
                    )
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        {canRenewOrAnnul && detail && (
          <Button
            color="error"
            variant="outlined"
            onClick={() => onAnnul(detail)}
            sx={{ minHeight: 44 }}
          >
            Anular documento
          </Button>
        )}
        {canEdit && detail && (
          <Button
            variant="outlined"
            onClick={() => onEdit(detail)}
            sx={{ minHeight: 44 }}
          >
            Corrigir
          </Button>
        )}
        {canRenewOrAnnul && detail && (
          <Button
            variant="contained"
            onClick={() => onRenew(detail)}
            sx={{ minHeight: 44 }}
          >
            Renovar
          </Button>
        )}
        <Button onClick={onClose} color="inherit" sx={{ minHeight: 44 }}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}
