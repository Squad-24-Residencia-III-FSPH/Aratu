import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { accessibleControls } from '../../components/ui/accessibleControls'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { getRequest } from '../../services/requestsService'
import type { RequestDetailView } from '../../services/requestsService'
import { formatCalendarDate, formatDateTime } from '../../utils/dates'
import {
  buildRequestTimeline,
  describeTripStage,
  formatTripVehicle,
  TRIP_DETAIL_STATUS_LABELS,
  TRIP_DETAIL_STATUS_TONES,
} from './requestFormValidation'

interface RequestDetailDialogProps {
  requestId: string | null
  openSeq: number
  api: ApiRequest
  onClose: () => void
  onExited?: () => void
  onResubmit?: (detail: RequestDetailView) => void
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}

function DetailGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
        gap: 2,
      }}
    >
      {children}
    </Box>
  )
}

/** Diálogo de acompanhamento autorizado da solicitação (`GET /requests/:id`) e da viagem vinculada. */
export default function RequestDetailDialog({
  requestId,
  openSeq,
  api,
  onClose,
  onExited,
  onResubmit,
}: RequestDetailDialogProps) {
  const titleId = useId()
  const [reload, setReload] = useState(0)
  const [fetchState, setFetchState] = useState<{
    key: string
    detail?: RequestDetailView
    error?: string
  } | null>(null)

  const queryKey = requestId ? `${openSeq}:${requestId}:${reload}` : ''

  useEffect(() => {
    if (!requestId) return
    let current = true
    void getRequest(api, requestId)
      .then((detail) => {
        if (current) setFetchState({ key: queryKey, detail })
      })
      .catch((error: unknown) => {
        if (current) {
          setFetchState({
            key: queryKey,
            error: error instanceof Error && error.message
              ? error.message
              : 'Não foi possível carregar os detalhes da solicitação.',
          })
        }
      })

    return () => {
      current = false
    }
  }, [api, queryKey, requestId])

  const open = requestId !== null
  const isCurrent = open && fetchState?.key === queryKey
  const loading = open && !isCurrent
  const error = isCurrent ? fetchState.error ?? '' : ''
  const detail = isCurrent ? fetchState.detail ?? null : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby={titleId}
      sx={accessibleControls}
      slotProps={{
        transition: {
          ...(onExited ? { onExited } : {}),
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        <span>{requestId ? `Detalhes da Solicitação #${requestId}` : 'Detalhes da Solicitação'}</span>
        {detail && (
          <StatusChip
            label={REQUEST_STATUS_LABELS[detail.status]}
            tone={REQUEST_STATUS_TONES[detail.status]}
          />
        )}
      </DialogTitle>
      <DialogContent dividers>
        {loading && <StateFeedback kind="loading" title="Carregando detalhes da solicitação..." />}
        {error && (
          <StateFeedback
            kind="error"
            title="Não foi possível carregar a solicitação."
            description={error}
            actionLabel="Tentar novamente"
            onAction={() => setReload((count) => count + 1)}
            sx={{ mb: 0 }}
          />
        )}
        {detail && (
          <Stack spacing={3}>
            {detail.status === 'REJECTED' && (
              <Alert severity="error" role="alert">
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Solicitação recusada pelo Gestor de Frota
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  <strong>Motivo:</strong> {detail.decisionReason || 'Nenhum motivo especificado.'}
                </Typography>
              </Alert>
            )}

            {detail.status === 'PENDING' && detail.events?.some((event) => event.eventType === 'REJECTED') && (
              <Alert severity="info">
                Solicitação reenviada após recusa anterior. O histórico da recusa permanece registrado abaixo em Andamento.
              </Alert>
            )}

            <Box component="section" aria-label="Dados da solicitação">
              <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Dados da solicitação
              </Typography>
              <DetailGrid>
                <DetailField label="Tipo de serviço" value={detail.serviceName} />
                <DetailField
                  label="Data e horário solicitados"
                  value={`${formatCalendarDate(detail.requestedDate)} às ${detail.requestedTime}`}
                />
                <DetailField label="Origem" value={detail.origin} />
                <DetailField label="Destino" value={detail.destination} />
                <DetailField label="Finalidade" value={detail.purpose} />
                <DetailField label="Passageiros" value={String(detail.passengers)} />
                <DetailField label="Observações" value={detail.notes || 'Nenhuma observação informada.'} />
                {detail.revision !== undefined && (
                  <DetailField label="Revisão" value={`v${detail.revision}`} />
                )}
              </DetailGrid>
            </Box>

            <Box component="section" aria-label="Decisão da gestão de frota">
              <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Decisão
              </Typography>
              {detail.decidedAt || detail.decidedBy || detail.decisionReason ? (
                <DetailGrid>
                  <DetailField label="Responsável" value={detail.decidedByName ?? detail.decidedBy ?? 'Não informado'} />
                  <DetailField label="Data e horário" value={detail.decidedAt ? formatDateTime(detail.decidedAt) : 'Não informado'} />
                  {detail.decisionReason && <DetailField label="Justificativa" value={detail.decisionReason} />}
                </DetailGrid>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Aguardando análise do Gestor de Frota.
                </Typography>
              )}
            </Box>

            <Paper component="section" aria-label="Viagem vinculada" variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Viagem vinculada
                </Typography>
                {detail.trip && (
                  <StatusChip
                    label={TRIP_DETAIL_STATUS_LABELS[detail.trip.status] ?? detail.trip.status}
                    tone={TRIP_DETAIL_STATUS_TONES[detail.trip.status] ?? 'neutral'}
                  />
                )}
              </Box>
              {detail.trip ? (
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    {describeTripStage(detail.trip)}
                  </Typography>
                  <DetailGrid>
                    <DetailField label="Viagem" value={`#${detail.trip.id}`} />
                    <DetailField
                      label="Período agendado"
                      value={`${formatDateTime(detail.trip.scheduledStart)} – ${formatDateTime(detail.trip.scheduledEnd)}`}
                    />
                    <DetailField label="Veículo" value={formatTripVehicle(detail.trip.vehicle)} />
                    <DetailField label="Motorista" value={detail.trip.driver.name} />
                  </DetailGrid>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {detail.status === 'SCHEDULED'
                    ? 'Solicitação agendada, mas os dados da viagem vinculada ainda não estão disponíveis.'
                    : 'Nenhuma viagem vinculada até o momento.'}
                </Typography>
              )}
            </Paper>

            <Box component="section" aria-label="Andamento da solicitação">
              <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Andamento
              </Typography>
              <Stack component="ol" spacing={1.5} sx={{ m: 0, pl: 2.5 }}>
                {buildRequestTimeline(detail).map((step) => (
                  <Box component="li" key={step.key}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: step.state === 'pending' ? 500 : 700,
                        color: step.state === 'rejected' ? 'error.main' : 'text.primary',
                      }}
                    >
                      {step.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {step.subtitle}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
        {detail && detail.status === 'REJECTED' && onResubmit && typeof detail.revision === 'number' && (
          <Button
            variant="outlined"
            onClick={() => onResubmit(detail)}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            Reenviar solicitação
          </Button>
        )}
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44, minWidth: 44 }}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
