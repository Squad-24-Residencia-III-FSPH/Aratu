import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Assignment, Build, CheckCircle, Description, DirectionsCar, EventAvailable,
  LocalShipping, WarningAmber,
} from '@mui/icons-material'
import { Box, Button, Grid, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { GESTOR_DASHBOARD_PATH } from '../../../auth/profiles'
import { EntityCard } from '../../../components/ui/EntityCard'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatCard from '../../../components/ui/StatCard'
import StatusChip from '../../../components/ui/StatusChip'
import { getDashboardSummary } from '../../../services/dashboardService'
import type { DashboardSummary } from '../../../services/dashboardService'
import { listTripAgenda } from '../../../services/tripAgendaService'
import type { TripAgendaItem } from '../../../trips/tripAgendaTypes'
import { TRIP_AGENDA_PATH, TRIP_AGENDA_STATUS_LABELS, TRIP_AGENDA_STATUS_TONES } from '../../../trips/tripAgendaTypes'
import { TRIP_CONFIRMATION_PATH } from '../../../trips/tripConfirmationTypes'
import { REQUEST_ANALYSIS_PATH } from '../../../requests/requestAccess'
import { VEHICLE_DOCUMENTS_PATH } from '../../../vehicleDocuments/vehicleDocumentTypes'
import { FINES_PATH } from '../../../fines/fineTypes'
import { operationalDateTimeInput } from '../../../time/operationalTime'
import { formatDateTime } from '../../../utils/dates'
import { VEHICLES_PATH } from '../../../vehicles/vehicleAccess'

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

function todayInOperationalZone(): string {
  return operationalDateTimeInput(new Date().toISOString()).slice(0, 10)
}

function currentGreeting(): string {
  const hour = Number(operationalDateTimeInput(new Date().toISOString()).slice(11, 13))
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function currentDateLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Maceio',
  }).format(new Date())
}

const AGENDA_COLUMNS: readonly DataTableColumn<TripAgendaItem>[] = [
  { key: 'start', header: 'Horário', width: 150, render: (trip) => formatDateTime(trip.scheduledStart) },
  { key: 'route', header: 'Viagem', render: (trip) => `${trip.origin} → ${trip.destination}` },
  { key: 'vehicle', header: 'Veículo', width: 125, render: (trip) => trip.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', width: 180, render: (trip) => trip.driverName },
  { key: 'status', header: 'Situação', width: 190, render: (trip) => <StatusChip label={TRIP_AGENDA_STATUS_LABELS[trip.status]} tone={TRIP_AGENDA_STATUS_TONES[trip.status]} /> },
]

interface HomeState {
  summary: DashboardSummary | null
  trips: TripAgendaItem[] | null
  summaryError: string
  tripsError: string
  loading: boolean
}

const INITIAL_STATE: HomeState = { summary: null, trips: null, summaryError: '', tripsError: '', loading: true }

function AgendaCard({ trip }: { trip: TripAgendaItem }) {
  return (
    <EntityCard>
      <EntityCard.Header title={`${trip.origin} → ${trip.destination}`}>
        <EntityCard.Status><StatusChip label={TRIP_AGENDA_STATUS_LABELS[trip.status]} tone={TRIP_AGENDA_STATUS_TONES[trip.status]} /></EntityCard.Status>
      </EntityCard.Header>
      <EntityCard.Body>
        <Typography variant="body2">{formatDateTime(trip.scheduledStart)}</Typography>
        <Typography variant="body2">Veículo: {trip.vehicleLicensePlate}</Typography>
        <Typography variant="body2">Motorista: {trip.driverName}</Typography>
      </EntityCard.Body>
      {trip.status === 'FINISHED' && <EntityCard.Actions>
        <Button component={RouterLink} to={TRIP_CONFIRMATION_PATH} sx={{ minHeight: 48, width: '100%' }}>Abrir conferência</Button>
      </EntityCard.Actions>}
    </EntityCard>
  )
}

/** Início operacional do Gestor com indicadores e agenda consultados nas APIs. */
export default function GestorPage() {
  const { api, session } = useAuth()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('sm'))
  const firstName = session?.nome.trim().split(/\s+/)[0] || 'Gestor'
  const [state, setState] = useState<HomeState>(INITIAL_STATE)

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, summaryError: '', tripsError: '' }))
    const today = todayInOperationalZone()
    const [summaryResult, tripsResult] = await Promise.allSettled([
      getDashboardSummary(api),
      listTripAgenda(api, { from: today, to: today }),
    ])
    setState((current) => ({
      summary: summaryResult.status === 'fulfilled' ? summaryResult.value : current.summary,
      trips: tripsResult.status === 'fulfilled' ? tripsResult.value : current.trips,
      summaryError: summaryResult.status === 'rejected'
        ? (summaryResult.reason instanceof Error ? summaryResult.reason.message : 'Não foi possível carregar os indicadores da frota.')
        : '',
      tripsError: tripsResult.status === 'rejected'
        ? (tripsResult.reason instanceof Error ? tripsResult.reason.message : 'Não foi possível carregar a agenda de hoje.')
        : '',
      loading: false,
    }))
  }, [api])

  useEffect(() => {
    document.title = 'Início — Aratu'
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const summary = state.summary
  const trips = state.trips
  const firstTrips = trips?.slice(0, 6) ?? []
  const loading = state.loading && !summary && !trips
  const summaryCards = summary ? [
    { title: 'Veículos disponíveis', value: summary.fleet.available, icon: <DirectionsCar />, description: `de ${summary.fleet.total} cadastrados` },
    { title: 'Em manutenção', value: summary.fleet.inMaintenance, icon: <Build />, description: 'Fora da operação' },
    { title: 'Solicitações pendentes', value: summary.pendingRequests, icon: <EventAvailable />, description: 'Aguardando sua análise' },
    { title: 'Viagens em andamento', value: summary.tripsInProgress, icon: <LocalShipping />, description: `${summary.tripsToConfirm} aguardam conferência` },
  ] : []
  const pendingActions = summary ? [
    { id: 'requests', title: 'solicitações aguardando análise', count: summary.pendingRequests, description: 'Revise os pedidos e defina os próximos passos.', path: REQUEST_ANALYSIS_PATH, label: 'Analisar solicitações', icon: Assignment, color: '#9a3412', background: '#fff7ed' },
    { id: 'documents', title: 'documentos vencidos ou a vencer', count: summary.documents.expired + summary.documents.expiring, description: `${summary.documents.expired} vencidos · ${summary.documents.expiring} a vencer`, path: VEHICLE_DOCUMENTS_PATH, label: 'Ver documentos', icon: Description, color: '#b91c1c', background: '#fef2f2' },
    { id: 'confirmations', title: 'viagens aguardando conferência', count: summary.tripsToConfirm, description: 'Execuções finalizadas pelos motoristas.', path: TRIP_CONFIRMATION_PATH, label: 'Conferir viagens', icon: CheckCircle, color: '#1d4ed8', background: '#eff6ff' },
  ] : []
  const fleetSegments = summary ? [
    { key: 'available', label: 'Disponíveis', value: summary.fleet.available, color: '#15803d' },
    { key: 'maintenance', label: 'Em manutenção', value: summary.fleet.inMaintenance, color: '#b45309' },
    { key: 'inactive', label: 'Inativos', value: summary.fleet.inactive, color: '#64748b' },
  ] : []
  const fleetTotal = fleetSegments.reduce((total, segment) => total + segment.value, 0)

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow={currentDateLabel()}
        title={`${currentGreeting()}, ${firstName}`}
        description="Acompanhe a operação e resolva o que precisa de atenção."
        actions={(
          <Button component={RouterLink} to={GESTOR_DASHBOARD_PATH} variant="outlined" sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
            Abrir dashboard
          </Button>
        )}
      />

      {state.summaryError && summary && <StateFeedback kind="partial" title="Os indicadores podem estar desatualizados." description={state.summaryError} actionLabel="Atualizar" onAction={() => { void refresh() }} />}
      {state.summaryError && !summary && <StateFeedback kind="error" title="Não foi possível carregar os indicadores." description={state.summaryError} actionLabel="Tentar novamente" onAction={() => { void refresh() }} />}
      {loading && <StateFeedback kind="loading" title="Carregando o resumo da operação..." />}

      {summary && <Grid container spacing={2} sx={{ mb: 3 }}>
        {summaryCards.map((card) => <Grid key={card.title} size={{ xs: 12, sm: 6, xl: 3 }}><StatCard {...card} loading={state.loading} /></Grid>)}
      </Grid>}

      {summary && <Box component="section" aria-labelledby="pending-actions-title" sx={{ mb: 3 }}>
        <Typography id="pending-actions-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Ações pendentes</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Itens que precisam da sua decisão</Typography>
        <Grid container spacing={2}>
          {pendingActions.map((item) => {
            const Icon = item.icon
            return <Grid key={item.id} size={{ xs: 12, md: 4 }}>
              <Paper variant="outlined" sx={{ height: '100%', p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box aria-hidden="true" sx={{ minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: item.background, color: item.color }}><Icon /></Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{item.count} {item.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.description}</Typography>
                  </Box>
                </Stack>
                <Button component={RouterLink} to={item.path} sx={{ alignSelf: 'flex-start', minHeight: 48, mt: 'auto', pt: 1.5 }}>{item.label}</Button>
              </Paper>
            </Grid>
          })}
        </Grid>
      </Box>}

      {state.tripsError && trips && <StateFeedback kind="partial" title="A agenda pode estar desatualizada." description={state.tripsError} actionLabel="Atualizar" onAction={() => { void refresh() }} />}
      {state.tripsError && !trips && <StateFeedback kind="error" title="Não foi possível carregar a agenda de hoje." description={state.tripsError} actionLabel="Tentar novamente" onAction={() => { void refresh() }} />}

      <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper component="section" aria-labelledby="today-agenda-title" variant="outlined" sx={{ height: '100%', p: { xs: 1.5, sm: 2 }, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}>
              <Box>
                <Typography id="today-agenda-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Agenda de hoje</Typography>
                <Typography variant="body2" color="text.secondary">
                  {trips === null ? 'Consultando viagens...' : `${trips.length} ${trips.length === 1 ? 'viagem em todos os estados' : 'viagens em todos os estados'}`}
                </Typography>
              </Box>
              <Button component={RouterLink} to={TRIP_AGENDA_PATH} variant="outlined" sx={{ minHeight: 48 }}>Abrir agenda completa</Button>
            </Stack>
            {state.loading && !trips && <StateFeedback kind="loading" title="Carregando a agenda..." />}
            {trips && firstTrips.length === 0 && <StateFeedback kind="empty" title="Nenhuma viagem prevista para hoje." description="Viagens de outros dias e situações podem ser consultadas na agenda completa." />}
            {trips && firstTrips.length > 0 && (compact
              ? <Stack spacing={1.5}>{firstTrips.map((trip) => <AgendaCard key={trip.id} trip={trip} />)}</Stack>
              : <DataTable caption="Agenda de viagens de hoje" columns={AGENDA_COLUMNS} rows={firstTrips} rowKey={(trip) => trip.id} minWidth={780} />)}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper component="section" aria-labelledby="fleet-status-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="fleet-status-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Status da frota</Typography>
            {summary
              ? <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{summary.fleet.total} veículos cadastrados</Typography>
              : <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Aguardando dados da frota</Typography>}
            {summary && fleetTotal > 0 && <Box role="img" aria-label={`Distribuição da frota: ${fleetSegments.map((segment) => `${segment.value} ${segment.label.toLocaleLowerCase('pt-BR')}`).join(', ')}.`} sx={{ display: 'flex', overflow: 'hidden', width: '100%', height: 12, borderRadius: 6, mb: 2 }}>
              {fleetSegments.map((segment) => segment.value > 0 && <Box key={segment.key} sx={{ width: `${(segment.value / fleetTotal) * 100}%`, bgcolor: segment.color }} />)}
            </Box>}
            {summary && <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
              {fleetSegments.map((segment) => <Box component="li" key={segment.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: segment.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{segment.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{NUMBER_FORMAT.format(segment.value)}</Typography>
              </Box>)}
            </Stack>}
            {summary && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Veículos atualmente em viagem: {NUMBER_FORMAT.format(summary.vehiclesInTrip)}
            </Typography>}
            {!summary && state.summaryError && <StateFeedback kind="error" title="Dados da frota indisponíveis." description={state.summaryError} />}
            <Button component={RouterLink} to={VEHICLES_PATH} variant="outlined" sx={{ minHeight: 48, mt: 2, width: { xs: '100%', sm: 'auto' } }}>
              Ver todos os veículos
            </Button>
            {summary && summary.fines.pending > 0 && <Button component={RouterLink} to={FINES_PATH} startIcon={<WarningAmber />} sx={{ minHeight: 48, mt: 1, width: { xs: '100%', sm: 'auto' } }}>
              {summary.fines.pending} multas pendentes
            </Button>}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
