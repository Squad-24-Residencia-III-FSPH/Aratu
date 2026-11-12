import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../api/client'
import StateFeedback from './ui/StateFeedback'
import StatusChip from './ui/StatusChip'
import { getRequest } from '../services/requestsService'
import type { RequestDetail, RequestStatus } from '../requests/requestTypes'

interface RequestDetailsPanelProps {
  /** ID selecionado na lista de análise; `null` limpa o painel. */
  requestId: string | null
  /** Cliente autenticado usado para consultar a API do Aratu. */
  api: ApiRequest
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  SCHEDULED: 'Agendada',
  CANCELED: 'Cancelada',
}

const STATUS_TONES: Record<RequestStatus, 'warning' | 'success' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  SCHEDULED: 'info',
  CANCELED: 'neutral',
}

/** Mostra os dados da solicitação selecionada sem navegar para outra tela. */
export default function RequestDetailsPanel({ requestId, api }: RequestDetailsPanelProps) {
  const titleId = useId()
  const [selection, setSelection] = useState<{
    id: string
    api: ApiRequest
    reload: number
    request?: RequestDetail
    error?: string
  } | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!requestId) return
    let current = true
    void getRequest(api, requestId).then(result => {
      if (current) setSelection({ id: requestId, api, reload, request: result })
    }).catch((failure: unknown) => {
      if (current) setSelection({ id: requestId, api, reload,
        error: failure instanceof Error ? failure.message : 'Não foi possível carregar a solicitação.' })
    })
    return () => { current = false }
  }, [api, requestId, reload])

  if (!requestId) return <StateFeedback kind="empty" title="Selecione uma solicitação para consultar os detalhes." />
  const currentSelection = selection?.id === requestId && selection.api === api && selection.reload === reload
  if (!currentSelection) return <StateFeedback kind="loading" title="Carregando dados da solicitação..." />
  if (selection.error) return <StateFeedback kind="error" title="Não foi possível carregar a solicitação." description={selection.error}
    actionLabel="Tentar novamente" onAction={() => setReload(value => value + 1)} />
  const request = selection.request
  if (!request) return null

  const decisionName = request.decidedByName ?? request.decidedBy ?? 'Não informado'
  const decisionAt = request.decidedAt ? formatDateTime(request.decidedAt) : 'Não informado'

  return (
    <Paper component="section" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2.5}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography id={titleId} component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Detalhes da solicitação
          </Typography>
          <StatusChip label={STATUS_LABELS[request.status]} tone={STATUS_TONES[request.status]} />
        </Box>

        <DetailsGrid>
          <Detail label="Solicitante" value={request.requesterName} />
          <Detail label="Setor" value="Não informado" />
          <Detail label="Data" value={formatDate(request.requestedDate)} />
          <Detail label="Horário" value={request.requestedTime} />
          <Detail label="Origem" value={request.origin} />
          <Detail label="Destino" value={request.destination} />
          <Detail label="Finalidade" value={request.purpose} />
          <Detail label="Tipo de serviço" value={request.serviceName} />
          <Detail label="Passageiros" value={String(request.passengers)} />
        </DetailsGrid>

        <Box>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Histórico da decisão
          </Typography>
          {request.decidedAt || request.decidedBy || request.decisionReason ? (
            <DetailsGrid>
              <Detail label="Responsável" value={decisionName} />
              <Detail label="Data e horário" value={decisionAt} />
              <Detail label="Justificativa" value={request.decisionReason || 'Não informada'} />
            </DetailsGrid>
          ) : <Typography color="text.secondary">Nenhuma decisão registrada.</Typography>}
        </Box>
      </Stack>
    </Paper>
  )
}

function DetailsGrid({ children }: { children: ReactNode }) {
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {children}
    </Box>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(date)
}
