import { useEffect, useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  ArrowForward,
  Build,
  CheckCircle,
  DirectionsCar,
  EventAvailable,
  LocalShipping,
  WarningAmber,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { GESTOR_DASHBOARD_PATH, resolveProfile } from '../../../auth/profiles.ts'
import { useAuth } from '../../../auth/useAuth.ts'
import { accessibleControls } from '../../../components/ui/accessibleControls.ts'
import DataTable from '../../../components/ui/DataTable.tsx'
import PageHeader from '../../../components/ui/PageHeader.tsx'
import StateFeedback from '../../../components/ui/StateFeedback.tsx'
import StatCard from '../../../components/ui/StatCard.tsx'
import { useGestorHome } from '../../../hooks/useDashboard.ts'
import { REQUEST_ANALYSIS_PATH } from '../../../requests/requestAccess.ts'
import { TRIP_CONFIRMATION_PATH } from '../../../trips/tripConfirmationTypes.ts'
import { OPERATIONAL_TIME_ZONE } from '../../../utils/dates.ts'
import { VEHICLES_PATH } from '../../../vehicles/vehicleAccess.ts'
import {
  FLEET_STATUS_SEGMENTS,
  TRIP_AGENDA_ROUTE_PATH,
  buildDocumentsAlertPath,
  formatDocumentsAlertCopy,
  formatNumber,
  formatSafeCalendarDate,
} from './gestorDashboardData.ts'
import { TRIP_AGENDA_COLUMNS } from './tripAgendaColumns.tsx'

const PAGE_CONTROLS_SX = {
  ...accessibleControls,
  '& a:focus-visible, & button:focus-visible': {
    outline: '3px solid',
    outlineColor: 'primary.dark',
    outlineOffset: 2,
  },
  '& .MuiInputBase-root': { minHeight: 44 },
} as const

const PENDING_TONES = {
  warning: { background: '#fff7ed', foreground: '#9a3412' },
  danger: { background: '#fef2f2', foreground: '#b91c1c' },
  info: { background: '#eff6ff', foreground: '#1d4ed8' },
} as const

function currentGreeting(): string {
  const hourText = new Intl.DateTimeFormat('pt-BR', {
    timeZone: OPERATIONAL_TIME_ZONE,
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  const hour = Number(hourText)
  if (!Number.isFinite(hour)) return 'Olá'
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function currentDateLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: OPERATIONAL_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())
}

/** Início operacional do Gestor integrado às APIs de resumo, agenda e pendências. */
export default function GestorPage() {
  const { api, session } = useAuth()
  const allowed = session !== null && resolveProfile(session.perfil) === 'GESTOR'
  const home = useGestorHome(api, allowed)
  const firstName = session?.nome.trim().split(/\s+/)[0] || 'Gestor'

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Início — Aratu'
    return () => { document.title = previousTitle }
  }, [])

  const summary = home.summary
  const fleet = summary?.fleet

  const summaryCards = [
    {
      title: 'Veículos disponíveis',
      value: fleet?.available ?? 0,
      icon: <DirectionsCar />,
      description: 'Prontos para alocação',
    },
    {
      title: 'Em manutenção',
      value: fleet?.inMaintenance ?? 0,
      icon: <Build />,
      description: 'Fora de operação',
    },
    {
      title: 'Solicitações pendentes',
      value: summary?.pendingRequests ?? 0,
      icon: <EventAvailable />,
      description: 'Aguardando sua análise',
    },
    {
      title: 'Viagens hoje',
      value: home.tripsError ? '—' : home.todayTrips.length,
      icon: <LocalShipping />,
      description: `Programadas para ${formatSafeCalendarDate(home.today)}`,
    },
  ]

  const pendingActions = useMemo(() => {
    if (!summary) return []
    const documentsCopy = formatDocumentsAlertCopy(summary.documents)
    const todayRequestsDetail = home.todayPendingRequests === null
      ? 'Aguardando análise e aprovação'
      : home.todayPendingRequests === 0
        ? 'Nenhuma com data para hoje'
        : `${home.todayPendingRequests} ${home.todayPendingRequests === 1 ? 'é para viagem hoje' : 'são para viagens ainda hoje'}`
    const requestsPath = home.todayPendingRequests !== null && home.todayPendingRequests > 0
      ? `${REQUEST_ANALYSIS_PATH}?from=${home.today}&to=${home.today}`
      : REQUEST_ANALYSIS_PATH

    return [
      {
        id: 'requests' as const,
        count: summary.pendingRequests,
        title: summary.pendingRequests === 1 ? 'solicitação aguardando aprovação' : 'solicitações aguardando aprovação',
        detail: todayRequestsDetail,
        action: 'Ver solicitações',
        path: requestsPath,
        tone: 'warning' as const,
        icon: WarningAmber,
      },
      {
        id: 'documents' as const,
        count: documentsCopy.headlineCount,
        title: documentsCopy.title,
        detail: documentsCopy.detail,
        action: 'Ver documentos',
        path: buildDocumentsAlertPath(summary.documents),
        tone: 'danger' as const,
        icon: Build,
      },
      {
        id: 'trips' as const,
        count: summary.tripsToConfirm,
        title: summary.tripsToConfirm === 1 ? 'viagem aguardando confirmação' : 'viagens aguardando confirmação',
        detail: 'Execuções finalizadas pelo motorista',
        action: 'Ver viagens',
        path: TRIP_CONFIRMATION_PATH,
        tone: 'info' as const,
        icon: CheckCircle,
      },
    ]
  }, [home.today, home.todayPendingRequests, summary])

  const fleetSegments = useMemo(() => {
    const total = fleet?.total ?? 0
    return FLEET_STATUS_SEGMENTS.map((segment) => {
      const count = fleet ? fleet[segment.key] : 0
      return {
        ...segment,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }
    })
  }, [fleet])

  const fleetAriaLabel = fleet
    ? `Distribuição da frota: ${fleet.available} disponíveis, ${fleet.inMaintenance} em manutenção e ${fleet.inactive} inativos, total de ${fleet.total} veículos.`
    : 'Distribuição atual da frota indisponível.'

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', ...PAGE_CONTROLS_SX }}>
      <PageHeader
        eyebrow={currentDateLabel()}
        title={`${currentGreeting()}, ${firstName}`}
        titleVariant="h4"
        description="Acompanhe a operação real da frota e resolva o que precisa de atenção."
        actions={(
          <Button
            component={RouterLink}
            to={GESTOR_DASHBOARD_PATH}
            variant="outlined"
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            Abrir dashboard
          </Button>
        )}
      />

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Esta tela inicial é exclusiva do perfil Gestor de Frota."
        />
      )}

      {allowed && home.error && (
        <StateFeedback
          kind="error"
          title="Não foi possível carregar o resumo operacional."
          description={home.error}
          actionLabel="Tentar novamente"
          onAction={home.refresh}
        />
      )}

      {allowed && !home.error && home.partialWarnings.length > 0 && (
        <StateFeedback
          kind="partial"
          title="Parte das informações operacionais não pôde ser atualizada."
          description={`Não foi possível consultar: ${home.partialWarnings.join(' e ')}. Os demais indicadores refletem a base atual.`}
          actionLabel="Tentar novamente"
          onAction={home.refresh}
        />
      )}

      {allowed && !home.error && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {summaryCards.map((card) => (
              <Grid key={card.title} size={{ xs: 12, sm: 6, xl: 3 }}>
                <StatCard {...card} loading={home.loading} />
              </Grid>
            ))}
          </Grid>

          <Box component="section" aria-labelledby="pending-actions-title" sx={{ mb: 3 }}>
            <Typography id="pending-actions-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              Ações pendentes
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Itens que precisam da sua decisão
            </Typography>
            {home.loading ? (
              <StateFeedback kind="loading" title="Carregando ações pendentes..." />
            ) : (
              <Grid container spacing={2}>
                {pendingActions.map((item) => {
                  const Icon = item.icon
                  const tone = PENDING_TONES[item.tone]
                  return (
                    <Grid key={item.id} size={{ xs: 12, md: 4 }}>
                      <Paper variant="outlined" sx={{ height: '100%', p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                          <Box
                            aria-hidden="true"
                            sx={{
                              minWidth: 44,
                              minHeight: 44,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: 1.5,
                              bgcolor: tone.background,
                              color: tone.foreground,
                            }}
                          >
                            <Icon />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600 }}>{item.count} {item.title}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.detail}</Typography>
                          </Box>
                        </Stack>
                        <Button
                          component={RouterLink}
                          to={item.path}
                          endIcon={<ArrowForward />}
                          sx={{ alignSelf: 'flex-start', minHeight: 44, minWidth: 44, mt: 'auto', pt: 1.5 }}
                        >
                          {item.action}
                        </Button>
                      </Paper>
                    </Grid>
                  )
                })}
              </Grid>
            )}
          </Box>

          <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <Paper component="section" aria-labelledby="today-agenda-title" variant="outlined" sx={{ height: '100%', p: 2, borderRadius: 2 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
                >
                  <Box>
                    <Typography id="today-agenda-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                      Agenda de hoje
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {home.loading
                        ? 'Consultando viagens programadas...'
                        : home.tripsError
                          ? 'Agenda indisponível no momento'
                          : `${home.todayTrips.length} ${home.todayTrips.length === 1 ? 'viagem programada' : 'viagens programadas'} (${formatSafeCalendarDate(home.today)})`}
                    </Typography>
                  </Box>
                  <Button
                    component={RouterLink}
                    to={`${TRIP_AGENDA_ROUTE_PATH}?from=${home.today}&to=${home.today}`}
                    variant="outlined"
                    sx={{ minHeight: 44, minWidth: 44 }}
                  >
                    Ver agenda completa
                  </Button>
                </Stack>

                {home.tripsError ? (
                  <StateFeedback
                    kind="error"
                    title="Não foi possível carregar a agenda de hoje."
                    description={home.tripsError}
                    actionLabel="Tentar novamente"
                    onAction={home.refresh}
                  />
                ) : (
                  <DataTable
                    caption={`Agenda operacional de viagens em ${formatSafeCalendarDate(home.today)}`}
                    columns={TRIP_AGENDA_COLUMNS}
                    rows={home.todayTrips}
                    rowKey={(trip) => trip.id}
                    busy={home.loading}
                    minWidth={720}
                    loadingContent={<StateFeedback kind="loading" title="Carregando agenda de hoje..." />}
                    emptyContent={(
                      <StateFeedback
                        kind="empty"
                        title="Nenhuma viagem programada para hoje."
                        description="Quando novas viagens forem agendadas para a data atual, elas serão exibidas aqui."
                        centered
                      />
                    )}
                    paperSx={{ border: 0, boxShadow: 'none' }}
                  />
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper component="section" aria-labelledby="fleet-status-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                <Typography id="fleet-status-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Status da frota
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {home.loading
                    ? 'Carregando distribuição da frota...'
                    : `${fleet?.total ?? 0} ${fleet?.total === 1 ? 'veículo cadastrado' : 'veículos cadastrados'}`}
                </Typography>

                {home.loading ? (
                  <StateFeedback kind="loading" title="Carregando situação da frota..." />
                ) : fleet && fleet.total === 0 ? (
                  <StateFeedback
                    kind="empty"
                    title="Nenhum veículo cadastrado"
                    description="Cadastre os veículos da frota para acompanhar a disponibilidade."
                    centered
                  />
                ) : (
                  <>
                    <Box
                      role="img"
                      aria-label={fleetAriaLabel}
                      sx={{ display: 'flex', overflow: 'hidden', width: '100%', height: 12, borderRadius: 6, mb: 2, bgcolor: '#e2e8f0' }}
                    >
                      {fleetSegments.map((segment) => (
                        <Box key={segment.key} sx={{ width: `${segment.percent}%`, bgcolor: segment.color }} />
                      ))}
                    </Box>
                    <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
                      {fleetSegments.map((segment) => (
                        <Box component="li" key={segment.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: segment.color, flexShrink: 0 }} />
                          <Typography variant="body2" sx={{ flex: 1 }}>{segment.label}</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{segment.count}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </>
                )}

                {summary?.svo && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: '#f8fafc' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Operação SVO agora</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {summary.svo.ordersInProgress} {summary.svo.ordersInProgress === 1 ? 'ordem em andamento' : 'ordens em andamento'} ·{' '}
                      {summary.svo.vehicles.busy}/{summary.svo.vehicles.total} viaturas ocupadas
                      {summary.svo.vehicles.occupancyRate !== null
                        ? ` (${formatNumber(summary.svo.vehicles.occupancyRate, 1)}%)`
                        : ''}
                    </Typography>
                  </Paper>
                )}

                <Button
                  component={RouterLink}
                  to={VEHICLES_PATH}
                  variant="outlined"
                  sx={{ minHeight: 44, minWidth: 44, mt: 2 }}
                >
                  Ver todos os veículos
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  )
}
