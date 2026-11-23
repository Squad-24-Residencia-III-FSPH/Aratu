import { useEffect } from 'react'
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
import { Box, Button, Grid, Paper, Stack, Typography } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import DataTable from '../../../components/ui/DataTable'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatCard from '../../../components/ui/StatCard'
import StatusChip from '../../../components/ui/StatusChip'
import { TRIP_CONFIRMATION_PATH } from '../../../trips/tripConfirmationTypes'
import { VEHICLES_PATH } from '../../../vehicles/vehicleAccess'
import { DEMO_FLEET_STATUS, DEMO_PENDING_ACTIONS, DEMO_TODAY_TRIPS } from './gestorDashboardData'
import { GESTOR_DASHBOARD_PATH } from '../../../auth/profiles'

const AGENDA_COLUMNS = [
  { key: 'time', header: 'Horário', width: 90, render: (trip: typeof DEMO_TODAY_TRIPS[number]) => trip.time },
  { key: 'service', header: 'Viagem', render: (trip: typeof DEMO_TODAY_TRIPS[number]) => trip.service },
  { key: 'origin', header: 'Origem', render: (trip: typeof DEMO_TODAY_TRIPS[number]) => trip.origin },
  { key: 'destination', header: 'Destino', render: (trip: typeof DEMO_TODAY_TRIPS[number]) => trip.destination },
  { key: 'vehicle', header: 'Veículo', render: (trip: typeof DEMO_TODAY_TRIPS[number]) => trip.vehicle },
  {
    key: 'status', header: 'Status', render: (trip: typeof DEMO_TODAY_TRIPS[number]) => (
      <StatusChip label={trip.status} tone={trip.status === 'Em andamento' ? 'info' : 'neutral'} />
    ),
  },
] as const

const PENDING_ICONS = {
  requests: WarningAmber,
  documents: Build,
  trips: CheckCircle,
} as const

const PENDING_TONES = {
  warning: { background: '#fff7ed', foreground: '#9a3412' },
  danger: { background: '#fef2f2', foreground: '#b91c1c' },
  info: { background: '#eff6ff', foreground: '#1d4ed8' },
} as const

function currentGreeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function currentDateLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date())
}

/** Início operacional do Gestor com resumo e atalhos demonstrativos da frota. */
export default function GestorPage() {
  const { session } = useAuth()
  const firstName = session?.nome.trim().split(/\s+/)[0] || 'Gestor'
  const availableVehicles = DEMO_FLEET_STATUS.find(({ key }) => key === 'available')?.count ?? 0
  const vehiclesInMaintenance = DEMO_FLEET_STATUS.find(({ key }) => key === 'maintenance')?.count ?? 0

  useEffect(() => {
    document.title = 'Início — Aratu'
  }, [])

  const summaryCards = [
    { title: 'Veículos disponíveis', value: availableVehicles, icon: <DirectionsCar />, description: 'Disponíveis para alocação' },
    { title: 'Em manutenção', value: vehiclesInMaintenance, icon: <Build />, description: 'Fora de operação' },
    { title: 'Solicitações pendentes', value: 5, icon: <EventAvailable />, description: 'Aguardando sua análise' },
    { title: 'Viagens hoje', value: 8, icon: <LocalShipping />, description: 'Programadas para hoje' },
  ]

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        eyebrow={currentDateLabel()}
        title={`${currentGreeting()}, ${firstName}`}
        description="Acompanhe a operação e resolva o que precisa de atenção."
        actions={(
          <Button component={RouterLink} to={GESTOR_DASHBOARD_PATH} variant="outlined" sx={{ minHeight: 44 }}>
            Abrir dashboard
          </Button>
        )}
      />

      <StateFeedback
        kind="partial"
        title="Resumo de demonstração"
        description="Os dados desta página são fictícios até a integração das APIs operacionais."
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {summaryCards.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, xl: 3 }}>
            <StatCard {...card} />
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
        <Grid container spacing={2}>
          {DEMO_PENDING_ACTIONS.map((item) => {
            const Icon = PENDING_ICONS[item.id]
            const tone = PENDING_TONES[item.tone]
            return (
              <Grid key={item.id} size={{ xs: 12, md: 4 }}>
                <Paper variant="outlined" sx={{ height: '100%', p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <Box aria-hidden="true" sx={{ minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: tone.background, color: tone.foreground }}>
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
                    sx={{ alignSelf: 'flex-start', minHeight: 44, mt: 'auto', pt: 1.5 }}
                  >
                    {item.action}
                  </Button>
                </Paper>
              </Grid>
            )
          })}
        </Grid>
      </Box>

      <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper component="section" aria-labelledby="today-agenda-title" variant="outlined" sx={{ height: '100%', p: 2, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
              <Box>
                <Typography id="today-agenda-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Agenda de hoje</Typography>
                <Typography variant="body2" color="text.secondary">8 viagens programadas</Typography>
              </Box>
              <Button component={RouterLink} to={TRIP_CONFIRMATION_PATH} sx={{ minHeight: 44 }}>Ver agenda completa</Button>
            </Stack>
            <DataTable
              caption="Agenda demonstrativa de viagens para hoje"
              columns={AGENDA_COLUMNS}
              rows={DEMO_TODAY_TRIPS}
              rowKey={(trip) => trip.id}
              minWidth={720}
              paperSx={{ border: 0, boxShadow: 'none' }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper component="section" aria-labelledby="fleet-status-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="fleet-status-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Status da frota</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              22 veículos cadastrados
            </Typography>
            <Box
              role="img"
              aria-label="Distribuição da frota: 12 disponíveis, 5 em viagem, 3 em manutenção e 2 indisponíveis."
              sx={{ display: 'flex', overflow: 'hidden', width: '100%', height: 12, borderRadius: 6, mb: 2 }}
            >
              {DEMO_FLEET_STATUS.map((status) => (
                <Box key={status.key} sx={{ width: `${(status.count / 22) * 100}%`, bgcolor: status.color }} />
              ))}
            </Box>
            <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
              {DEMO_FLEET_STATUS.map((status) => (
                <Box component="li" key={status.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: status.color, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1 }}>{status.label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{status.count}</Typography>
                </Box>
              ))}
            </Stack>
            <Button component={RouterLink} to={VEHICLES_PATH} variant="outlined" sx={{ minHeight: 44, mt: 2 }}>
              Ver todos os veículos
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
