import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { Alert, Box, Paper, Stack, Typography } from '@mui/material'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import type { RequestDetailView } from '../../services/requestsService'
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from '../../requests/requestPresentation'
import { formatCalendarDate, formatDateTime } from '../../utils/dates'
import { resolveRequesterSector } from './requestAnalysisHelpers'

/** Propriedades do painel de detalhe controlado pela página de análise. */
export interface RequestAnalysisDetailsProps {
  /** Identificador selecionado na fila; `null` exibe o estado vazio de seleção. */
  selectedId: string | null
  /** Detalhe vigente retornado por `GET /requests/:id` para `selectedId`. */
  detail: RequestDetailView | null
  /** Indica consulta em andamento para impedir decisões sobre dados desatualizados. */
  loading: boolean
  /** Mensagem de erro do carregamento do detalhe, quando existir. */
  error: string
  /** Ação de recuperação para repetir `GET /requests/:id` mantendo o item selecionado. */
  onRetry: () => void
  /** Referência opcional ao título do painel para retorno seguro de foco por teclado. */
  headingRef?: Ref<HTMLHeadingElement>
}

/** Exibe o detalhe vigente da solicitação selecionada na análise, garantindo leitura antes da decisão. */
export default function RequestAnalysisDetails({
  selectedId,
  detail,
  loading,
  error,
  onRetry,
  headingRef,
}: RequestAnalysisDetailsProps) {
  const titleId = useId()

  if (!selectedId) {
    return <StateFeedback kind="empty" title="Selecione uma solicitação para consultar os detalhes." />
  }
  if (loading) {
    return <StateFeedback kind="loading" title="Carregando dados da solicitação..." />
  }
  if (error) {
    return (
      <StateFeedback
        kind="error"
        title="Não foi possível carregar a solicitação."
        description={error}
        actionLabel="Tentar novamente"
        onAction={onRetry}
      />
    )
  }
  if (!detail || detail.id !== selectedId) {
    return <StateFeedback kind="loading" title="Carregando dados da solicitação..." />
  }

  const decisionName = detail.decidedByName ?? detail.decidedBy ?? 'Não informado'
  const decisionAt = detail.decidedAt ? formatDateTime(detail.decidedAt) : 'Não informado'
  const statusLabel = REQUEST_STATUS_LABELS[detail.status]

  return (
    <Paper component="section" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2.5}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            ref={headingRef}
            id={titleId}
            component="h2"
            variant="h6"
            tabIndex={-1}
            sx={{ fontWeight: 700 }}
          >
            Detalhes da solicitação #{detail.id}
          </Typography>
          <StatusChip label={statusLabel} tone={REQUEST_STATUS_TONES[detail.status]} />
        </Box>

        {detail.status !== 'PENDING' && (
          <Alert severity="info" role="status">
            Esta solicitação já está com situação {statusLabel.toLowerCase()} e não aceita nova decisão.
          </Alert>
        )}

        <DetailsGrid>
          <Detail label="Solicitante" value={detail.requesterName} />
          <Detail label="Setor do solicitante" value={resolveRequesterSector(detail)} />
          <Detail label="Data" value={formatCalendarDate(detail.requestedDate)} />
          <Detail label="Horário" value={detail.requestedTime} />
          <Detail label="Origem" value={detail.origin} />
          <Detail label="Destino" value={detail.destination} />
          <Detail label="Finalidade" value={detail.purpose} />
          <Detail label="Tipo de serviço" value={detail.serviceName} />
          <Detail label="Passageiros" value={String(detail.passengers)} />
          <Detail label="Necessidades especiais" value={detail.specialRequirements || 'Não informadas'} />
          <Detail label="Observações" value={detail.notes || 'Nenhuma'} />
        </DetailsGrid>

        <Box>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Histórico da decisão
          </Typography>
          {detail.decidedAt || detail.decidedBy || detail.decisionReason ? (
            <DetailsGrid>
              <Detail label="Responsável" value={decisionName} />
              <Detail label="Data e horário" value={decisionAt} />
              <Detail label="Justificativa" value={detail.decisionReason || 'Não informada'} />
            </DetailsGrid>
          ) : (
            <Typography color="text.secondary">Nenhuma decisão registrada.</Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  )
}

function DetailsGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      component="dl"
      sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
    >
      {children}
    </Box>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}
