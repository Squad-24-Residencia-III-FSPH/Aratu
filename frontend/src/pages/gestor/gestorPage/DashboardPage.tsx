import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Block,
  Build,
  DirectionsCar,
  LocalGasStation,
  LocalShipping,
  Speed,
  SwapHoriz,
} from '@mui/icons-material'
import {
  Box,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import FilterBar from '../../../components/ui/FilterBar'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatCard from '../../../components/ui/StatCard'
import DataTable from '../../../components/ui/DataTable'
import { DEMO_FLEET_STATUS, DEMO_DASHBOARD_METRICS, DEMO_UPCOMING_MAINTENANCE, formatDemoCurrency, formatDemoDate } from './gestorDashboardData'

const BarChart = lazy(() => import('@mui/x-charts/BarChart').then(({ BarChart: chart }) => ({ default: chart })))
const PieChart = lazy(() => import('@mui/x-charts/PieChart').then(({ PieChart: chart }) => ({ default: chart })))

const SVO_READ_PROFILES = ['GESTOR', 'ADMINISTRADOR', 'ATENDENTE_SVO', 'EQUIPE_SVO']
const DAY_IN_MS = 24 * 60 * 60 * 1000
const QUICK_PERIODS = [
  { id: 'today', label: 'Hoje', days: 1 },
  { id: '7days', label: '7 dias', days: 7 },
  { id: '30days', label: '30 dias', days: 30 },
  { id: '6months', label: '6 meses', months: 6 },
] as const
const LOADING_IDS = ['available', 'inTrip', 'maintenance', 'unavailable', 'utilization', 'trips', 'kilometers', 'fuelCost', 'maintenanceCount', 'consumption', 'dailyTrips', 'fleetStatus', 'vehicleTrips', 'maintenanceTable', 'fuelChart', 'svoInProgress', 'svoCompleted'] as const
type LoadingId = typeof LOADING_IDS[number]

const DEMO_VEHICLES = Array.from({ length: 22 }, (_, index) => ({
  id: `vehicle-${String(index + 1).padStart(2, '0')}`,
  label: `Veículo ${String(index + 1).padStart(2, '0')}`,
  status: index < 12 ? 'available' : index < 17 ? 'inTrip' : index < 20 ? 'maintenance' : 'unavailable',
}))
const VEHICLE_OPTIONS = [
  { value: '', label: 'Todos os veículos' },
  ...DEMO_VEHICLES.map(({ id, label }) => ({ value: id, label })),
]

const MAINTENANCE_COLUMNS = [
  { key: 'vehicle', header: 'Veículo', render: (row: typeof DEMO_UPCOMING_MAINTENANCE[number]) => row.vehicle },
  { key: 'kind', header: 'Tipo', render: (row: typeof DEMO_UPCOMING_MAINTENANCE[number]) => row.kind },
  { key: 'date', header: 'Data', render: (row: typeof DEMO_UPCOMING_MAINTENANCE[number]) => formatDemoDate(row.date) },
] as const

function toLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetween(from: string, to: string): number {
  if (!from || !to || from > to) return 0
  return Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / DAY_IN_MS) + 1
}

function setDateDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toLocalDate(date)
}

function makeBucketRows(totalDays: number, totalTrips: number) {
  if (totalDays <= 0) return []
  const bucketCount = Math.min(6, totalDays)
  return Array.from({ length: bucketCount }, (_, index) => {
    const firstDay = Math.floor(index * totalDays / bucketCount)
    const lastDay = Math.floor((index + 1) * totalDays / bucketCount) - 1
    const bucketDays = lastDay - firstDay + 1
    const start = Math.round(totalTrips * firstDay / totalDays)
    const end = Math.round(totalTrips * (lastDay + 1) / totalDays)
    return { label: totalDays <= 7 ? `Dia ${index + 1}` : `${firstDay + 1}–${lastDay + 1}`, trips: end - start, days: bucketDays, startDay: firstDay }
  })
}

function ChartDataTable({
  title,
  headers,
  rows,
}: {
  title: string
  headers: readonly string[]
  rows: readonly (readonly (string | number)[])[]
}) {
  return (
    <TableContainer sx={{ mt: 1, maxHeight: 190 }}>
      <Table size="small" aria-label={title}>
        <TableHead>
          <TableRow>{headers.map((header) => <TableCell key={header} component="th" scope="col">{header}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => <TableRow key={String(row[0])}>{row.map((cell, index) => <TableCell key={`${row[0]}-${index}`}>{cell}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

/** Dashboard analítico do Gestor com dados sintéticos até a API de indicadores estar disponível. */
export default function DashboardPage() {
  const { session } = useAuth()
  const today = toLocalDate(new Date())
  const [period, setPeriod] = useState<string>('30days')
  const [from, setFrom] = useState(setDateDaysAgo(29))
  const [to, setTo] = useState(today)
  const [vehicleId, setVehicleId] = useState('')
  const [loadingCards, setLoadingCards] = useState<ReadonlySet<LoadingId>>(() => new Set(LOADING_IDS))
  const canReadSvo = Boolean(session && SVO_READ_PROFILES.includes(session.perfil))
  const duration = daysBetween(from, to)
  const validPeriod = duration > 0

  useEffect(() => {
    document.title = 'Dashboard da frota — Aratu'
  }, [])

  useEffect(() => {
    let cancelled = false
    const timers = LOADING_IDS.map((id, index) => window.setTimeout(() => {
      if (cancelled) return
      setLoadingCards((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, 160 + index * 70))
    return () => { cancelled = true; timers.forEach(window.clearTimeout) }
  }, [])

  const selectedVehicles = useMemo(() => DEMO_VEHICLES.filter(({ id }) => !vehicleId || id === vehicleId), [vehicleId])
  const selectedTotalTrips = Math.round(146 * duration / 30 * selectedVehicles.length / DEMO_VEHICLES.length)
  const bucketRows = useMemo(() => makeBucketRows(duration, selectedTotalTrips), [duration, selectedTotalTrips])
  const tripVehicleRows = useMemo(() => selectedVehicles.map((vehicle, index) => ({
    label: vehicle.label,
    trips: selectedTotalTrips === 0 ? 0 : Math.floor(selectedTotalTrips / selectedVehicles.length) + (index < selectedTotalTrips % selectedVehicles.length ? 1 : 0),
  })), [selectedVehicles, selectedTotalTrips])
  const fleetStatusRows = useMemo(() => DEMO_FLEET_STATUS.map((status) => ({
    ...status,
    count: selectedVehicles.filter(({ status: vehicleStatus }) => vehicleStatus === status.key).length,
  })), [selectedVehicles])
  const fleetTotal = fleetStatusRows.reduce((total, status) => total + status.count, 0)
  const relativeFactor = duration / 30 * selectedVehicles.length / DEMO_VEHICLES.length
  const selectedFuelCost = Math.round(DEMO_DASHBOARD_METRICS.fuelCost * relativeFactor)
  const fuelPeriodRows = bucketRows.map((row) => ({
    label: row.label,
    cost: Math.round(selectedFuelCost * (row.startDay + row.days) / duration) - Math.round(selectedFuelCost * row.startDay / duration),
  }))
  const formattedDateLabel = `${formatDemoDate(from)} a ${formatDemoDate(to)}`
  const vehicleLabel = vehicleId ? selectedVehicles[0]?.label ?? 'Veículo selecionado' : 'Todos os veículos'
  const hasMetrics = validPeriod && selectedTotalTrips > 0

  function selectPeriod(value: string | null) {
    if (!value) return
    setPeriod(value)
    const quickPeriod = QUICK_PERIODS.find((item) => item.id === value)
    if (quickPeriod) {
      const start = new Date()
      if ('months' in quickPeriod) start.setMonth(start.getMonth() - quickPeriod.months)
      else start.setDate(start.getDate() - quickPeriod.days + 1)
      setFrom(toLocalDate(start))
      setTo(today)
    }
  }

  const availabilityCards = [
    { id: 'available' as const, title: 'Veículos disponíveis', value: fleetStatusRows.find(({ key }) => key === 'available')?.count ?? 0, icon: <DirectionsCar />, description: 'Prontos para alocação' },
    { id: 'inTrip' as const, title: 'Em viagem', value: fleetStatusRows.find(({ key }) => key === 'inTrip')?.count ?? 0, icon: <SwapHoriz />, description: 'Em operação agora' },
    { id: 'maintenance' as const, title: 'Em manutenção', value: fleetStatusRows.find(({ key }) => key === 'maintenance')?.count ?? 0, icon: <Build />, description: 'Fora de operação' },
    { id: 'unavailable' as const, title: 'Indisponíveis', value: fleetStatusRows.find(({ key }) => key === 'unavailable')?.count ?? 0, icon: <Block />, description: 'Status atual da frota' },
  ]

  const utilization = DEMO_DASHBOARD_METRICS.utilization
  const metricCards = [
    { id: 'utilization' as const, title: 'Taxa de utilização', value: `${utilization}%`, description: DEMO_DASHBOARD_METRICS.utilizationChange, icon: <Speed /> },
    { id: 'trips' as const, title: 'Viagens realizadas', value: selectedTotalTrips, description: 'Total no período', icon: <LocalShipping /> },
    { id: 'kilometers' as const, title: 'Quilometragem', value: `${Math.round(DEMO_DASHBOARD_METRICS.kilometers * relativeFactor).toLocaleString('pt-BR')} km`, description: DEMO_DASHBOARD_METRICS.kilometersChange, icon: <DirectionsCar /> },
    { id: 'fuelCost' as const, title: 'Custo com combustível', value: formatDemoCurrency(DEMO_DASHBOARD_METRICS.fuelCost * relativeFactor), description: DEMO_DASHBOARD_METRICS.fuelCostChange, icon: <LocalGasStation /> },
    { id: 'maintenanceCount' as const, title: 'Manutenções', value: Math.round(DEMO_DASHBOARD_METRICS.maintenance * relativeFactor), description: `${DEMO_DASHBOARD_METRICS.preventiveMaintenance} preventivas · ${DEMO_DASHBOARD_METRICS.correctiveMaintenance} corretivas`, icon: <Build /> },
    { id: 'consumption' as const, title: 'Consumo médio', value: `${DEMO_DASHBOARD_METRICS.averageConsumption.toLocaleString('pt-BR')} km/L`, description: DEMO_DASHBOARD_METRICS.consumptionChange, icon: <LocalGasStation /> },
  ]

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        breadcrumbs={['Início', 'Gestão', 'Dashboard']}
        title="Dashboard"
        titleVariant="h4"
        description="Desempenho consolidado da frota."
        actions={(
          <ToggleButtonGroup
            exclusive
            value={period}
            onChange={(_event, value: string | null) => selectPeriod(value)}
            aria-label="Período dos indicadores"
            sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, px: 1.5, textTransform: 'none' } }}
          >
            {QUICK_PERIODS.map((item) => <ToggleButton key={item.id} value={item.id}>{item.label}</ToggleButton>)}
            <ToggleButton value="custom">Personalizado</ToggleButton>
          </ToggleButtonGroup>
        )}
      />

      <StateFeedback
        kind="partial"
        title="Dados de demonstração"
        description="Os indicadores são fictícios até a API de dashboard estar disponível. Não use estes números para decisões operacionais."
      />

      <FilterBar label="Filtros do painel" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        {period === 'custom' && <>
          <FormField label="Data inicial" type="date" value={from} onChange={setFrom} sx={{ flex: 1, minWidth: { xs: 0, sm: 180 } }} />
          <FormField label="Data final" type="date" value={to} onChange={setTo} sx={{ flex: 1, minWidth: { xs: 0, sm: 180 } }} />
        </>}
        <FormSelect label="Veículo" value={vehicleId} onChange={setVehicleId} options={VEHICLE_OPTIONS} sx={{ flex: 1, minWidth: { xs: 0, sm: 220 } }} />
      </FilterBar>

      {!validPeriod && (
        <StateFeedback kind="error" title="O período selecionado é inválido." description="A data final precisa ser igual ou posterior à data inicial." actionLabel="Usar últimos 7 dias" onAction={() => selectPeriod('7days')} />
      )}
      {validPeriod && !hasMetrics && (
        <StateFeedback kind="empty" title="Nenhum indicador no período selecionado" description="Ajuste o período ou escolha outro veículo para consultar os dados demonstrativos." actionLabel="Usar últimos 7 dias" onAction={() => selectPeriod('7days')} />
      )}

      <Box component="section" aria-labelledby="fleet-availability-title" sx={{ mb: 3 }}>
        <Typography id="fleet-availability-title" component="h2" variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
          Situação da frota
        </Typography>
        <Grid container spacing={2}>
          {availabilityCards.map((card) => <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 3 }}><StatCard {...card} loading={loadingCards.has(card.id)} /></Grid>)}
        </Grid>
      </Box>

      <Box component="section" aria-labelledby="fleet-indicators-title" sx={{ mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
          <Typography id="fleet-indicators-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Indicadores da frota</Typography>
          <Typography variant="body2" color="text.secondary">{formattedDateLabel} · {vehicleLabel}</Typography>
        </Stack>
        <Grid container spacing={2}>
          {metricCards.map((card) => <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 4 }}><StatCard {...card} loading={loadingCards.has(card.id)} /></Grid>)}
        </Grid>
      </Box>

      {hasMetrics && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper component="section" aria-labelledby="trips-period-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                <Typography id="trips-period-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Viagens por período</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Quantidade de viagens realizadas · {formattedDateLabel}</Typography>
                {loadingCards.has('dailyTrips') ? <StateFeedback kind="loading" title="Carregando viagens por período..." /> : <>
                  <Box role="img" aria-label="Gráfico de viagens por período; os valores também estão na tabela abaixo.">
                    <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de viagens..." />}>
                      <BarChart
                        height={250}
                        xAxis={[{ data: bucketRows.map(({ label }) => label), scaleType: 'band', label: 'Período' }]}
                        yAxis={[{ label: 'Viagens' }]}
                        series={[{ data: bucketRows.map(({ trips }) => trips), label: 'Viagens', color: '#FF6B00', valueFormatter: (value) => `${value ?? 0} viagens` }]}
                        margin={{ left: 52, right: 18, top: 24, bottom: 48 }}
                      />
                    </Suspense>
                  </Box>
                  <ChartDataTable title="Dados do gráfico de viagens por período" headers={['Faixa do período', 'Dias', 'Viagens']} rows={bucketRows.map((row) => [row.label, row.days, row.trips])} />
                </>}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper component="section" aria-labelledby="fleet-distribution-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                <Typography id="fleet-distribution-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Situação da frota</Typography>
                <Typography variant="body2" color="text.secondary">Distribuição atual dos veículos</Typography>
                {loadingCards.has('fleetStatus') ? <StateFeedback kind="loading" title="Carregando situação da frota..." /> : <>
                  <Box sx={{ position: 'relative', width: 240, maxWidth: '100%', mx: 'auto' }}>
                    <Box role="img" aria-label={`Gráfico de situação da frota: ${fleetStatusRows.map(({ label, count }) => `${count} ${label.toLowerCase()}`).join(', ')}.`}>
                      <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de situação..." />}>
                        <PieChart
                          height={230}
                          series={[{ data: fleetStatusRows.map((row) => ({ id: row.key, value: row.count, label: row.label, color: row.color })), innerRadius: 58, outerRadius: 88, paddingAngle: 2, cornerRadius: 3, valueFormatter: (item) => `${item.value} veículos` }]}
                          hideLegend
                        />
                      </Suspense>
                    </Box>
                    <Stack aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{fleetTotal}</Typography>
                      <Typography variant="caption" color="text.secondary">veículos</Typography>
                    </Stack>
                  </Box>
                  <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
                    {fleetStatusRows.map((row) => <Box component="li" key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box aria-hidden="true" sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: row.color }} />
                      <Typography variant="body2" sx={{ flex: 1 }}>{row.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.count}</Typography>
                    </Box>)}
                  </Stack>
                </>}
              </Paper>
            </Grid>

          <Grid size={{ xs: 12 }}>
            <Paper component="section" aria-labelledby="trips-vehicle-title" variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography id="trips-vehicle-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Viagens por veículo</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Comparação no período selecionado.</Typography>
              {loadingCards.has('vehicleTrips') ? <StateFeedback kind="loading" title="Carregando indicadores por veículo..." /> : <>
                <Box role="img" aria-label="Gráfico de viagens por veículo; os mesmos valores estão disponíveis na tabela logo abaixo.">
                  <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico por veículo..." />}>
                    <BarChart
                      layout="horizontal"
                      height={Math.max(260, tripVehicleRows.length * 22)}
                      xAxis={[{ label: 'Viagens' }]}
                      yAxis={[{ data: tripVehicleRows.map(({ label }) => label), scaleType: 'band', label: 'Veículo' }]}
                      series={[{ data: tripVehicleRows.map(({ trips }) => trips), label: 'Viagens', color: '#b94700', valueFormatter: (value) => `${value ?? 0} viagens` }]}
                      margin={{ left: 110, right: 22, top: 20, bottom: 38 }}
                    />
                  </Suspense>
                </Box>
                <ChartDataTable title="Dados do gráfico de viagens por veículo" headers={['Veículo', 'Viagens']} rows={tripVehicleRows.map(({ label, trips }) => [label, trips])} />
              </>}
            </Paper>
          </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Paper component="section" aria-labelledby="maintenance-summary-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 0.5, justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography id="maintenance-summary-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Manutenções</Typography>
                  <Typography variant="caption" sx={{ px: 1.25, py: 0.5, borderRadius: 5, bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>{Math.round(DEMO_DASHBOARD_METRICS.maintenance * relativeFactor)} registros</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Preventivas e corretivas no período</Typography>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  <Grid size={{ xs: 6 }}><Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f0fdf4', borderColor: '#dcfce7' }}><Typography variant="h6" sx={{ color: '#166534', fontWeight: 700 }}>{Math.round(DEMO_DASHBOARD_METRICS.preventiveMaintenance * relativeFactor)}</Typography><Typography variant="body2" sx={{ color: '#166534' }}>Preventivas</Typography></Paper></Grid>
                  <Grid size={{ xs: 6 }}><Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fffbeb', borderColor: '#fef3c7' }}><Typography variant="h6" sx={{ color: '#92400e', fontWeight: 700 }}>{Math.round(DEMO_DASHBOARD_METRICS.correctiveMaintenance * relativeFactor)}</Typography><Typography variant="body2" sx={{ color: '#92400e' }}>Corretivas</Typography></Paper></Grid>
                </Grid>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Próximas manutenções</Typography>
                {loadingCards.has('maintenanceTable') ? <StateFeedback kind="loading" title="Carregando manutenções..." /> : <DataTable
                  caption="Próximas manutenções demonstrativas"
                  columns={MAINTENANCE_COLUMNS}
                  rows={DEMO_UPCOMING_MAINTENANCE}
                  rowKey={(row) => row.id}
                  minWidth={420}
                  paperSx={{ border: 0, boxShadow: 'none' }}
                />}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }}>
              <Paper component="section" aria-labelledby="fuel-summary-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                <Typography id="fuel-summary-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Combustível</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Gasto, volume e consumo médio</Typography>
                <Grid container spacing={1} sx={{ mb: 1 }}>
                  <Grid size={{ xs: 4 }}><Typography sx={{ fontWeight: 700 }}>{formatDemoCurrency(selectedFuelCost)}</Typography><Typography variant="caption" color="text.secondary">Valor gasto</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography sx={{ fontWeight: 700 }}>{Math.round(DEMO_DASHBOARD_METRICS.fuelVolume * relativeFactor).toLocaleString('pt-BR')} L</Typography><Typography variant="caption" color="text.secondary">Abastecidos</Typography></Grid>
                  <Grid size={{ xs: 4 }}><Typography sx={{ fontWeight: 700 }}>{DEMO_DASHBOARD_METRICS.averageConsumption.toLocaleString('pt-BR')} km/L</Typography><Typography variant="caption" color="text.secondary">Consumo médio</Typography></Grid>
                </Grid>
                {loadingCards.has('fuelChart') ? <StateFeedback kind="loading" title="Carregando histórico de combustível..." /> : <>
                  <Box role="img" aria-label="Gráfico do gasto mensal com combustível; os valores estão na tabela abaixo.">
                    <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de combustível..." />}>
                      <BarChart
                        height={180}
                        xAxis={[{ data: fuelPeriodRows.map(({ label }) => label), scaleType: 'band', label: 'Faixa do período' }]}
                        yAxis={[{ label: 'Reais' }]}
                        series={[{ data: fuelPeriodRows.map(({ cost }) => cost), label: 'Gasto (R$)', color: '#ff9b54', valueFormatter: (value) => formatDemoCurrency(value ?? 0) }]}
                        margin={{ left: 58, right: 16, top: 20, bottom: 42 }}
                      />
                    </Suspense>
                  </Box>
                  <ChartDataTable title="Dados do gráfico de combustível por período" headers={['Faixa do período', 'Gasto']} rows={fuelPeriodRows.map(({ label, cost }) => [label, formatDemoCurrency(cost)])} />
                </>}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {canReadSvo && (
        <Box component="section" aria-labelledby="svo-summary-title" sx={{ mt: 2 }}>
          <Typography id="svo-summary-title" component="h2" variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Indicadores do SVO</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}><StatCard title="Ordens em andamento" value={1} description="Na data final do período · demonstrativo" loading={loadingCards.has('svoInProgress')} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><StatCard title="Ordens concluídas no período" value={8} description="Total demonstrativo" loading={loadingCards.has('svoCompleted')} /></Grid>
          </Grid>
        </Box>
      )}
    </Box>
  )
}
