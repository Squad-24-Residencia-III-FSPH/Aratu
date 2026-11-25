import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Assignment,
  AssignmentLate,
  Build,
  CheckCircle,
  Description,
  DirectionsCar,
  EventAvailable,
  LocalGasStation,
  LocalShipping,
  MedicalServices,
  People,
  Route,
  Speed,
  WarningAmber,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
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
import { resolveProfile } from '../../../auth/profiles.ts'
import { useAuth } from '../../../auth/useAuth.ts'
import { accessibleControls } from '../../../components/ui/accessibleControls.ts'
import DataTable, { type DataTableColumn } from '../../../components/ui/DataTable.tsx'
import FilterBar from '../../../components/ui/FilterBar.tsx'
import { FormField, FormSelect } from '../../../components/ui/FormField.tsx'
import PageHeader from '../../../components/ui/PageHeader.tsx'
import StateFeedback from '../../../components/ui/StateFeedback.tsx'
import StatCard from '../../../components/ui/StatCard.tsx'
import StatusChip from '../../../components/ui/StatusChip.tsx'
import { useDashboard } from '../../../hooks/useDashboard.ts'
import type { MaintenanceOrder } from '../../../maintenance/maintenanceTypes.ts'
import { listScheduledTrips } from '../../../services/dashboardService.ts'
import { listMaintenance } from '../../../services/maintenanceService.ts'
import {
  DASHBOARD_MAX_PERIOD_DAYS,
  PENDING_VALIDATION_INDICATORS,
  canAccessDashboard,
  type DashboardPeriodPreset,
  type ScheduledTripSummary,
  type VehicleIndicators,
} from '../../../types/dashboard.ts'
import {
  FLEET_STATUS_SEGMENTS,
  addCivilDays,
  buildDocumentsAlertPath,
  chartPeriods,
  formatCurrency,
  formatDocumentsAlertCopy,
  formatInclusivePeriodLabel,
  formatNullableMeasure,
  formatNumber,
  formatSafeCalendarDate,
  formatSafeDateTimeInMaceio,
} from './gestorDashboardData.ts'

const BarChart = lazy(() => import('@mui/x-charts/BarChart').then(({ BarChart: chart }) => ({ default: chart })))
const PieChart = lazy(() => import('@mui/x-charts/PieChart').then(({ PieChart: chart }) => ({ default: chart })))

const QUICK_PERIODS: readonly { id: Exclude<DashboardPeriodPreset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: '7days', label: '7 dias' },
  { id: '30days', label: '30 dias' },
  { id: '90days', label: '90 dias' },
  { id: '6months', label: '6 meses' },
  { id: '12months', label: '12 meses' },
]

const FUTURE_PERIODS = [7, 30, 90] as const

const DASHBOARD_SECTIONS = [
  { id: 'dashboard-overview', label: 'Visão geral' },
  { id: 'dashboard-charts', label: 'Gráficos principais' },
  { id: 'dashboard-history', label: 'Histórico' },
  { id: 'dashboard-comparison', label: 'Comparações' },
  { id: 'dashboard-vehicles', label: 'Veículos' },
  { id: 'dashboard-maintenance', label: 'Manutenção' },
  { id: 'dashboard-schedule', label: 'Agenda futura' },
] as const

const DASHBOARD_CONTROLS_SX = {
  ...accessibleControls,
  '& .MuiInputBase-root': { minHeight: 44 },
  '& a:focus-visible, & button:focus-visible': {
    outline: '3px solid',
    outlineColor: 'primary.dark',
    outlineOffset: 2,
  },
  '& .MuiToggleButton-root': {
    minHeight: 44,
    minWidth: 44,
    px: 1.5,
    textTransform: 'none',
    color: '#334155',
    borderColor: '#94a3b8',
  },
  '& .MuiToggleButton-root.Mui-selected': {
    bgcolor: '#fff1e6',
    color: '#9a3412',
    borderColor: 'primary.dark',
    fontWeight: 700,
  },
  '& .MuiToggleButton-root.Mui-selected:hover': {
    bgcolor: '#ffe4cc',
  },
  '& .MuiToggleButton-root:focus-visible, & .MuiToggleButton-root.Mui-focusVisible': {
    outline: '3px solid',
    outlineColor: 'primary.dark',
    outlineOffset: 2,
    zIndex: 1,
  },
} as const

interface UpcomingMaintenanceRow {
  id: string
  vehicle: string
  type: string
  expectedDate: string
  status: string
}

function sectionEntrance(delay = 0) {
  return {
    animation: `dashboardEntrance 420ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delay}ms both`,
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
    '@keyframes dashboardEntrance': {
      from: { opacity: 0, transform: 'translateY(10px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  }
}

function navigateToDashboardSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

const dashboardCardMotion = {
  '& > .MuiCard-root': { transition: 'transform 180ms ease, box-shadow 180ms ease' },
  '& > .MuiCard-root:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(69, 35, 8, 0.12)' },
  '@media (prefers-reduced-motion: reduce)': {
    '& > .MuiCard-root': { transition: 'none' },
    '& > .MuiCard-root:hover': { transform: 'none' },
  },
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
    <TableContainer
      role="region"
      aria-label={`${title}. Use a rolagem horizontal se necessário.`}
      tabIndex={0}
      sx={{
        mt: 1.5,
        maxHeight: 220,
        overflowX: 'auto',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: -2 },
      }}
    >
      <Table size="small" aria-label={title}>
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableCell key={header} component="th" scope="col" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`${String(row[0])}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <TableCell key={`${rowIndex}-${cellIndex}`}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function TrendChart({
  title,
  data,
  series,
}: {
  title: string
  data: { label: string }[]
  series: { label: string; color: string; values: number[] }[]
}) {
  const rows = data.map((period, index) => [period.label, ...series.map((item) => item.values[index] ?? 0)])
  return (
    <Paper component="section" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
      <Box role="img" aria-label={`Gráfico de ${title.toLocaleLowerCase('pt-BR')}; os valores também estão na tabela abaixo.`}>
        <Suspense fallback={<StateFeedback kind="loading" title={`Carregando gráfico: ${title.toLocaleLowerCase('pt-BR')}...`} />}>
          <BarChart
            height={250}
            xAxis={[{ data: data.map((item) => item.label), scaleType: 'band', label: 'Período' }]}
            yAxis={[{ label: 'Registros' }]}
            series={series.map((item) => ({ data: item.values, label: item.label, color: item.color }))}
            margin={{ left: 52, right: 18, top: 24, bottom: 48 }}
          />
        </Suspense>
      </Box>
      <ChartDataTable
        title={`Dados do gráfico: ${title}`}
        headers={['Período', ...series.map((item) => item.label)]}
        rows={rows}
      />
    </Paper>
  )
}

const VEHICLE_INDICATORS_COLUMNS: readonly DataTableColumn<VehicleIndicators>[] = [
  { key: 'plate', header: 'Veículo', width: 140, render: (row) => row.licensePlate },
  { key: 'trips', header: 'Viagens', align: 'right', render: (row) => formatNumber(row.tripsCount, 0) },
  { key: 'km', header: 'Km percorrido', align: 'right', render: (row) => `${formatNumber(row.kmDriven, 1)} km` },
  { key: 'liters', header: 'Litros', align: 'right', render: (row) => `${formatNumber(row.litersFueled, 3)} L` },
  { key: 'fuelCost', header: 'Combustível', align: 'right', render: (row) => formatCurrency(row.fuelCost) },
  {
    key: 'consumption',
    header: 'Consumo médio*',
    align: 'right',
    render: (row) => formatNullableMeasure(row.averageConsumptionKmPerLiter, 'km/L', '—'),
  },
  { key: 'maintenanceOrders', header: 'Ordens manut.', align: 'right', render: (row) => formatNumber(row.maintenanceOrdersOpened, 0) },
  { key: 'preventive', header: 'Preventivas', align: 'right', render: (row) => formatNumber(row.preventiveMaintenanceOrdersOpened, 0) },
  { key: 'corrective', header: 'Corretivas', align: 'right', render: (row) => formatNumber(row.correctiveMaintenanceOrdersOpened, 0) },
  { key: 'maintenance', header: 'Manutenção', align: 'right', render: (row) => formatCurrency(row.maintenanceCost) },
]

const SCHEDULED_TRIP_COLUMNS: readonly DataTableColumn<ScheduledTripSummary>[] = [
  { key: 'start', header: 'Início previsto', width: 170, render: (row) => formatSafeDateTimeInMaceio(row.scheduledStart) },
  { key: 'vehicle', header: 'Veículo', width: 130, render: (row) => row.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', width: 200, render: (row) => row.driverName },
  { key: 'route', header: 'Origem → destino', render: (row) => `${row.origin} → ${row.destination}` },
]

const MAINTENANCE_COLUMNS: readonly DataTableColumn<UpcomingMaintenanceRow>[] = [
  { key: 'vehicle', header: 'Veículo', width: 140, render: (row) => row.vehicle },
  { key: 'type', header: 'Tipo', width: 140, render: (row) => row.type },
  { key: 'expectedDate', header: 'Previsão', width: 150, render: (row) => formatSafeCalendarDate(row.expectedDate) },
  { key: 'status', header: 'Situação', width: 150, render: (row) => row.status },
]

/** Dashboard analítico gerencial integrado às APIs de resumo e indicadores do PostgreSQL. */
export default function DashboardPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessDashboard(profile)
  const dashboard = useDashboard(api, allowed)
  const [statusAnnouncement, setStatusAnnouncement] = useState('')
  const [futureDays, setFutureDays] = useState<number>(30)
  const [extraRefresh, setExtraRefresh] = useState(0)
  const [scheduledTrips, setScheduledTrips] = useState<ScheduledTripSummary[]>([])
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(allowed)
  const [maintenanceLoading, setMaintenanceLoading] = useState(allowed)
  const [scheduledError, setScheduledError] = useState('')
  const [maintenanceError, setMaintenanceError] = useState('')
  const sevenDaysButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Dashboard da frota — Aratu'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!allowed) return
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setMaintenanceLoading(true)
      setMaintenanceError('')
      try {
        const [opened, inProgress] = await Promise.all([
          listMaintenance(api, { status: 'OPEN' }),
          listMaintenance(api, { status: 'IN_PROGRESS' }),
        ])
        if (active) setMaintenanceOrders([...opened.items, ...inProgress.items])
      } catch (error: unknown) {
        if (active) setMaintenanceError(error instanceof Error ? error.message : 'Não foi possível carregar as previsões de manutenção.')
      } finally {
        if (active) setMaintenanceLoading(false)
      }
    })
    return () => { active = false }
  }, [allowed, api, extraRefresh])

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setScheduledLoading(true)
      setScheduledError('')
      try {
        const value = await listScheduledTrips(api, {
          from: dashboard.today,
          to: addCivilDays(dashboard.today, futureDays - 1),
        }, controller.signal)
        if (active && !controller.signal.aborted) {
          setScheduledTrips([...value].sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart)))
        }
      } catch (error: unknown) {
        if (active && !controller.signal.aborted) {
          setScheduledError(error instanceof Error ? error.message : 'Não foi possível carregar as viagens agendadas.')
        }
      } finally {
        if (active && !controller.signal.aborted) setScheduledLoading(false)
      }
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [allowed, api, dashboard.today, extraRefresh, futureDays])

  const vehicleOptions = useMemo(() => {
    const options = [...dashboard.vehicles]
      .sort((first, second) => first.licensePlate.localeCompare(second.licensePlate, 'pt-BR'))
      .map((vehicle) => ({
        value: vehicle.id,
        label: [vehicle.licensePlate, vehicle.model ?? vehicle.brand].filter(Boolean).join(' · '),
      }))
    if (dashboard.vehicleId && !options.some((option) => option.value === dashboard.vehicleId)) {
      options.unshift({
        value: dashboard.vehicleId,
        label: `Veículo #${dashboard.vehicleId}`,
      })
    }
    return options
  }, [dashboard.vehicleId, dashboard.vehicles])

  const selectedVehicleLabel = useMemo(() => {
    if (!dashboard.vehicleId) return 'Todos os veículos'
    const matched = vehicleOptions.find((option) => option.value === dashboard.vehicleId)
    if (matched) return matched.label
    const fromIndicators = dashboard.indicators?.vehicles.find((row) => row.vehicleId === dashboard.vehicleId)
    return fromIndicators ? fromIndicators.licensePlate : `Veículo #${dashboard.vehicleId}`
  }, [dashboard.indicators?.vehicles, dashboard.vehicleId, vehicleOptions])

  const formattedPeriodLabel = useMemo(
    () => formatInclusivePeriodLabel(dashboard.from, dashboard.to),
    [dashboard.from, dashboard.to],
  )

  function handleRefreshAll() {
    dashboard.refresh()
    setExtraRefresh((value) => value + 1)
  }

  function handleResetToSevenDays() {
    dashboard.selectPeriod('7days')
    setStatusAnnouncement('Período redefinido para os últimos 7 dias.')
    window.requestAnimationFrame(() => {
      sevenDaysButtonRef.current?.focus()
    })
  }

  function handlePeriodChange(_event: React.MouseEvent<HTMLElement>, value: string | null) {
    if (!value) return
    dashboard.selectPeriod(value as DashboardPeriodPreset)
    setStatusAnnouncement('')
  }

  const summary = dashboard.summary
  const indicators = dashboard.indicators
  const comparisonIndicators = dashboard.comparisonIndicators
  const pendingValidation = indicators?.pendingValidation ?? []
  const consumptionPending = pendingValidation.includes(PENDING_VALIDATION_INDICATORS.averageConsumption)
  const svoTimePending = pendingValidation.includes(PENDING_VALIDATION_INDICATORS.svoTimeToCollection)

  const fleetDistribution = useMemo(() => {
    const fleet = summary?.fleet
    return FLEET_STATUS_SEGMENTS.map((segment) => ({
      ...segment,
      count: fleet ? fleet[segment.key] : 0,
    }))
  }, [summary?.fleet])

  const hasPeriodActivity = useMemo(() => {
    if (!indicators) return false
    const { totals, svo } = indicators
    return (
      totals.tripsCount > 0
      || totals.litersFueled > 0
      || totals.fuelCost > 0
      || totals.maintenanceOrdersOpened > 0
      || totals.maintenanceCost > 0
      || (svo ? svo.ordersOpened > 0 || svo.ordersCollected > 0 : false)
    )
  }, [indicators])

  const hasTripActivity = useMemo(
    () => Boolean(indicators && indicators.vehicles.some((row) => row.tripsCount > 0 || row.kmDriven > 0)),
    [indicators],
  )

  const hasCostActivity = useMemo(
    () => Boolean(indicators && indicators.vehicles.some((row) => row.fuelCost > 0 || row.maintenanceCost > 0)),
    [indicators],
  )

  const filteredScheduledTrips = useMemo(() => {
    if (!dashboard.vehicleId) return scheduledTrips
    const selectedPlate = dashboard.vehicles.find((vehicle) => vehicle.id === dashboard.vehicleId)?.licensePlate
    return selectedPlate ? scheduledTrips.filter((trip) => trip.vehicleLicensePlate === selectedPlate) : []
  }, [dashboard.vehicleId, dashboard.vehicles, scheduledTrips])

  const upcomingMaintenance = useMemo(() => maintenanceOrders
    .filter((order) => order.expectedCompletionDate && order.expectedCompletionDate >= dashboard.today
      && (!dashboard.vehicleId || order.vehicleId === dashboard.vehicleId))
    .map((order): UpcomingMaintenanceRow => ({
      id: order.id,
      vehicle: dashboard.vehicles.find((vehicle) => vehicle.id === order.vehicleId)?.licensePlate
        ?? order.vehicleSnapshot?.licensePlate
        ?? 'Veículo indisponível',
      type: order.type === 'PREVENTIVE' ? 'Preventiva' : 'Corretiva',
      expectedDate: order.expectedCompletionDate ?? '',
      status: order.status === 'OPEN' ? 'Em aberto' : 'Em andamento',
    }))
    .sort((left, right) => left.expectedDate.localeCompare(right.expectedDate)), [dashboard.today, dashboard.vehicleId, dashboard.vehicles, maintenanceOrders])

  const activityMap = useMemo(
    () => new Map((indicators?.activitySeries ?? []).map((item) => [item.period, item])),
    [indicators?.activitySeries],
  )
  const graphPeriods = useMemo(
    () => (dashboard.validation.valid && indicators ? chartPeriods(dashboard.from, dashboard.to, indicators.activityBucket) : []),
    [dashboard.from, dashboard.to, dashboard.validation.valid, indicators],
  )
  const tripPeriodRows = graphPeriods.map((period) => ({ ...period, trips: activityMap.get(period.key)?.tripsCount ?? 0 }))
  const fuelPeriodRows = graphPeriods.map((period) => ({ ...period, cost: activityMap.get(period.key)?.fuelCost ?? 0 }))
  const historyRows = graphPeriods.map((period) => ({
    ...period,
    ...(activityMap.get(period.key) ?? {
      maintenanceOpened: 0,
      maintenanceClosed: 0,
      requestsCreated: 0,
      requestsApproved: 0,
      requestsRejected: 0,
      requestsScheduled: 0,
      requestsCanceled: 0,
      finesRegistered: 0,
      finesPaid: 0,
      finesContested: 0,
      driversCreated: 0,
      driversStatusChanged: 0,
      documentsRegistered: 0,
      documentsRenewed: 0,
    }),
  }))
  const tripVehicleRows = [...(indicators?.vehicles ?? [])]
    .sort((a, b) => b.tripsCount - a.tripsCount)
    .map((vehicle) => ({ label: vehicle.licensePlate, trips: vehicle.tripsCount }))

  const documentsCopy = summary ? formatDocumentsAlertCopy(summary.documents) : null

  const situationSections = [
    {
      title: 'Frota e pendências operacionais',
      cards: [
        {
          id: 'available',
          title: 'Veículos disponíveis',
          value: summary?.fleet.available ?? 0,
          description: `De ${summary?.fleet.total ?? 0} cadastrados`,
          icon: <DirectionsCar />,
        },
        {
          id: 'maintenance',
          title: 'Em manutenção',
          value: summary?.fleet.inMaintenance ?? 0,
          description: 'Fora de operação no momento',
          icon: <Build />,
        },
        {
          id: 'inactive',
          title: 'Veículos inativos',
          value: summary?.fleet.inactive ?? 0,
          description: 'Desativados do serviço ativo',
          icon: <WarningAmber />,
        },
        {
          id: 'pendingRequests',
          title: 'Solicitações pendentes',
          value: summary?.pendingRequests ?? 0,
          description: 'Aguardando análise do gestor',
          icon: <EventAvailable />,
        },
        {
          id: 'trips-in-progress',
          title: 'Viagens em andamento',
          value: summary?.tripsInProgress ?? 0,
          description: `${summary?.vehiclesInTrip ?? 0} veículos em execução`,
          icon: <LocalShipping />,
        },
        {
          id: 'tripsToConfirm',
          title: 'Viagens a confirmar',
          value: summary?.tripsToConfirm ?? 0,
          description: 'Finalizadas aguardando conferência',
          icon: <AssignmentLate />,
        },
        {
          id: 'documents',
          title: summary ? `Documentos (janela ${summary.documents.alertDays}d)` : 'Documentos a vencer',
          value: summary ? `${summary.documents.expiring} / ${summary.documents.expired}` : '0 / 0',
          description: documentsCopy ? `${documentsCopy.headlineCount} ${documentsCopy.title} (${documentsCopy.detail})` : 'A vencer / vencidos',
          icon: <Description />,
        },
      ],
    },
    {
      title: 'Motoristas e multas',
      cards: [
        {
          id: 'drivers-total',
          title: 'Motoristas cadastrados',
          value: summary?.drivers.total ?? 0,
          description: `${summary?.drivers.active ?? 0} ativos · ${summary?.drivers.away ?? 0} afastados`,
          icon: <People />,
        },
        {
          id: 'cnh-alert',
          title: 'CNHs a vencer / vencidas',
          value: summary ? `${summary.drivers.cnhExpiring} / ${summary.drivers.cnhExpired}` : '0 / 0',
          description: 'Próximos 30 dias / vencidas · total da frota',
          icon: <Description />,
        },
        {
          id: 'fines-pending',
          title: 'Multas pendentes',
          value: summary?.fines.pending ?? 0,
          description: `${summary?.fines.contested ?? 0} contestadas`,
          icon: <Assignment />,
        },
        {
          id: 'fines-paid',
          title: 'Multas pagas',
          value: summary?.fines.paid ?? 0,
          description: 'Situação atual',
          icon: <CheckCircle />,
        },
      ],
    },
  ]

  const totals = indicators?.totals
  const indicatorCards = [
    {
      id: 'trips',
      title: 'Viagens concluídas',
      value: totals ? formatNumber(totals.tripsCount, 0) : 0,
      description: 'Finalizadas ou confirmadas pelo término',
      icon: <LocalShipping />,
      pending: false,
    },
    {
      id: 'kilometers',
      title: 'Km percorrido',
      value: totals ? `${formatNumber(totals.kmDriven, 1)} km` : '0 km',
      description: 'Soma das viagens concluídas no período',
      icon: <Route />,
      pending: false,
    },
    {
      id: 'liters',
      title: 'Litros abastecidos',
      value: totals ? `${formatNumber(totals.litersFueled, 3)} L` : '0 L',
      description: 'Abastecimentos vigentes no período',
      icon: <LocalGasStation />,
      pending: false,
    },
    {
      id: 'fuelCost',
      title: 'Gasto com combustível',
      value: totals ? formatCurrency(totals.fuelCost) : formatCurrency(0),
      description: 'Valor vigente no período',
      icon: <LocalGasStation />,
      pending: false,
    },
    {
      id: 'consumption',
      title: 'Consumo médio',
      value: totals ? formatNullableMeasure(totals.averageConsumptionKmPerLiter, 'km/L') : 'Sem base no período',
      description: consumptionPending ? 'Proposta em validação · km ÷ litros' : 'Km percorrido ÷ litros',
      icon: <Speed />,
      pending: consumptionPending,
    },
    {
      id: 'maintenanceOrders',
      title: 'Ordens de manutenção',
      value: totals ? formatNumber(totals.maintenanceOrdersOpened, 0) : 0,
      description: totals
        ? `${formatNumber(totals.preventiveMaintenanceOrdersOpened, 0)} preventivas · ${formatNumber(totals.correctiveMaintenanceOrdersOpened, 0)} corretivas`
        : 'Registradas no período',
      icon: <Build />,
      pending: false,
    },
    {
      id: 'maintenanceCost',
      title: 'Gasto com manutenção',
      value: totals ? formatCurrency(totals.maintenanceCost) : formatCurrency(0),
      description: 'Ordens concluídas fechadas no período',
      icon: <Build />,
      pending: false,
    },
  ]

  const vehicleFooterValues = totals
    ? [
        'Total do período',
        formatNumber(totals.tripsCount, 0),
        `${formatNumber(totals.kmDriven, 1)} km`,
        `${formatNumber(totals.litersFueled, 3)} L`,
        formatCurrency(totals.fuelCost),
        formatNullableMeasure(totals.averageConsumptionKmPerLiter, 'km/L', '—'),
        formatNumber(totals.maintenanceOrdersOpened, 0),
        formatNumber(totals.preventiveMaintenanceOrdersOpened, 0),
        formatNumber(totals.correctiveMaintenanceOrdersOpened, 0),
        formatCurrency(totals.maintenanceCost),
      ]
    : undefined

  const formattedFuturePeriod = `${formatSafeCalendarDate(dashboard.today)} a ${formatSafeCalendarDate(addCivilDays(dashboard.today, futureDays - 1))}`

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', minWidth: 0, ...DASHBOARD_CONTROLS_SX }}>
      <PageHeader
        breadcrumbs={['Início', 'Dashboard']}
        title="Dashboard"
        titleVariant="h4"
        description="Situação atual da frota e indicadores operacionais por período."
        actions={(
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <ToggleButtonGroup
              exclusive
              value={dashboard.period}
              onChange={handlePeriodChange}
              aria-label="Período dos indicadores"
              sx={{ flexWrap: 'wrap', gap: 0.5 }}
            >
              {QUICK_PERIODS.map((item) => (
                <ToggleButton
                  key={item.id}
                  value={item.id}
                  ref={item.id === '7days' ? sevenDaysButtonRef : undefined}
                >
                  {item.label}
                </ToggleButton>
              ))}
              <ToggleButton value="custom">Personalizado</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="outlined" onClick={handleRefreshAll} sx={{ minHeight: 44, minWidth: 44 }}>
              Atualizar dados
            </Button>
          </Stack>
        )}
      />

      <Box role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {statusAnnouncement}
      </Box>

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Seu perfil não tem permissão para consultar este painel."
        />
      )}

      {allowed && (
        <>
          <FilterBar label="Filtros do painel" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <FormField
              label="Data inicial (inclusiva)"
              type="date"
              value={dashboard.from}
              onChange={dashboard.setFrom}
              error={!dashboard.validation.valid ? dashboard.validation.fromError : undefined}
              helperText="Fuso America/Maceio (AAAA-MM-DD)"
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 190 } }}
            />
            <FormField
              label="Data final (inclusiva)"
              type="date"
              value={dashboard.to}
              onChange={dashboard.setTo}
              error={!dashboard.validation.valid ? dashboard.validation.toError : undefined}
              helperText={`Máximo de ${DASHBOARD_MAX_PERIOD_DAYS} dias no intervalo`}
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 190 } }}
            />
            <FormSelect
              label="Veículo"
              value={dashboard.vehicleId}
              onChange={dashboard.setVehicleId}
              options={vehicleOptions}
              emptyLabel="Todos os veículos"
              displayEmpty
              disabled={dashboard.vehiclesLoading}
              helperText={dashboard.vehiclesLoading ? 'Carregando veículos cadastrados...' : undefined}
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 220 } }}
            />
          </FilterBar>

          {dashboard.vehicleId && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Os indicadores com vínculo ao veículo selecionado são filtrados. Solicitações ainda sem viagem atribuída e dados de motoristas continuam exibindo o total da operação.
            </Alert>
          )}

          {dashboard.vehiclesError && (
            <StateFeedback
              kind="partial"
              title="Lista de veículos indisponível para o seletor."
              description={dashboard.vehiclesError}
              actionLabel="Tentar novamente"
              onAction={handleRefreshAll}
            />
          )}

          {!dashboard.validation.valid && (
            <StateFeedback
              kind="error"
              title={dashboard.validation.summaryTitle}
              description={dashboard.validation.summaryDescription}
              actionLabel="Usar últimos 7 dias"
              onAction={handleResetToSevenDays}
            />
          )}

          <Stack component="nav" aria-label="Acesso rápido às seções do dashboard" direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 3, ...sectionEntrance(40) }}>
            {DASHBOARD_SECTIONS.map((section) => (
              <Button
                key={section.id}
                size="small"
                variant="outlined"
                disabled={section.id === 'dashboard-comparison' && !indicators}
                aria-controls={section.id}
                onClick={() => navigateToDashboardSection(section.id)}
                sx={{ minHeight: 44, px: 2, borderRadius: 6, bgcolor: 'background.paper', '&:hover': { bgcolor: '#fff1e6' } }}
              >
                {section.label}
              </Button>
            ))}
          </Stack>

          <Box component="section" id="dashboard-overview" aria-labelledby="fleet-availability-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(0) }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
            >
              <Box>
                <Typography id="fleet-availability-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Situação atual da frota e pendências
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Retrato do momento (não depende do filtro de período ou veículo)
                </Typography>
              </Box>
              {summary && (
                <Button
                  component={RouterLink}
                  to={buildDocumentsAlertPath(summary.documents)}
                  variant="outlined"
                  sx={{ minHeight: 44, minWidth: 44 }}
                >
                  Ver documentos ({summary.documents.expiring + summary.documents.expired})
                </Button>
              )}
            </Stack>

            {dashboard.summaryError ? (
              <StateFeedback
                kind="error"
                title="Não foi possível carregar o retrato atual da frota."
                description={dashboard.summaryError}
                actionLabel="Tentar novamente"
                onAction={handleRefreshAll}
              />
            ) : (
              <>
                {situationSections.map((section) => (
                  <Box key={section.title} component="section" aria-label={`Indicadores de ${section.title}`} sx={{ mb: 2 }}>
                    <Typography component="h3" variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>{section.title}</Typography>
                    <Grid container spacing={2}>
                      {section.cards.map((card) => (
                        <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}>
                          <StatCard
                            title={card.title}
                            value={card.value}
                            description={card.description}
                            icon={card.icon}
                            loading={dashboard.summaryLoading}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                ))}
                {summary && (
                  <Typography variant="caption" color="text.secondary">
                    Atualizado em {formatSafeDateTimeInMaceio(summary.generatedAt)}.
                  </Typography>
                )}
              </>
            )}
          </Box>

          {dashboard.validation.valid && (
            <Box component="section" aria-labelledby="fleet-indicators-title" sx={{ mb: 3, ...sectionEntrance(70) }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
              >
                <Box>
                  <Typography id="fleet-indicators-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                    Indicadores da frota no período
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formattedPeriodLabel} ({dashboard.validation.inclusiveDays}{' '}
                    {dashboard.validation.inclusiveDays === 1 ? 'dia civil' : 'dias civis'} · consulta [{formatSafeCalendarDate(dashboard.validation.apiPeriod.from)},{' '}
                    {formatSafeCalendarDate(dashboard.validation.apiPeriod.to)}) em America/Maceio) · {selectedVehicleLabel}
                  </Typography>
                </Box>
                {pendingValidation.length > 0 && (
                  <StatusChip label="Contém fórmulas em validação" tone="warning" />
                )}
              </Stack>

              {dashboard.indicatorsError ? (
                <StateFeedback
                  kind="error"
                  title="Não foi possível carregar os indicadores do período."
                  description={dashboard.indicatorsError}
                  actionLabel={dashboard.indicatorsErrorStatus === 404 ? 'Mostrar todos os veículos' : 'Tentar novamente'}
                  onAction={dashboard.indicatorsErrorStatus === 404 ? () => dashboard.setVehicleId('') : handleRefreshAll}
                />
              ) : (
                <>
                  {!dashboard.indicatorsLoading && indicators && !hasPeriodActivity && (
                    <StateFeedback
                      kind="empty"
                      title="Nenhum movimento operacional no período selecionado"
                      description="Não há viagens concluídas, abastecimentos vigentes, manutenções fechadas ou ordens SVO para este recorte."
                      actionLabel="Usar últimos 7 dias"
                      onAction={handleResetToSevenDays}
                    />
                  )}

                  {!dashboard.indicatorsLoading && pendingValidation.length > 0 && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Indicadores sinalizados com <strong>Proposta em validação</strong> ({pendingValidation.join(', ')}) usam fórmulas preliminares aguardando confirmação do cliente. Valores sem base de cálculo são exibidos como <em>Sem base no período</em>.
                    </Alert>
                  )}

                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {indicatorCards.map((card) => (
                      <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}>
                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                          <StatCard
                            title={card.title}
                            value={card.value}
                            description={card.description}
                            icon={card.icon}
                            loading={dashboard.indicatorsLoading}
                          />
                          {card.pending && !dashboard.indicatorsLoading && (
                            <Box sx={{ px: 0.5 }}>
                              <StatusChip label="Proposta em validação" tone="warning" />
                            </Box>
                          )}
                        </Box>
                      </Grid>
                    ))}
                  </Grid>

                  <Grid component="section" id="dashboard-charts" aria-label="Gráficos principais" tabIndex={-1} container spacing={2} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(100) }}>
                    <Grid size={{ xs: 12, lg: 7 }}>
                      <Paper component="section" aria-labelledby="trips-period-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="trips-period-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Viagens por período
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Viagens concluídas · {formattedPeriodLabel}
                        </Typography>
                        {dashboard.indicatorsLoading ? (
                          <StateFeedback kind="loading" title="Carregando viagens por período..." />
                        ) : (
                          <>
                            <Box role="img" aria-label="Gráfico de viagens concluídas por período; os valores também estão na tabela abaixo.">
                              <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de viagens..." />}>
                                <BarChart
                                  height={250}
                                  xAxis={[{ data: tripPeriodRows.map((row) => row.label), scaleType: 'band', label: indicators?.activityBucket === 'day' ? 'Dia' : 'Mês' }]}
                                  yAxis={[{ label: 'Viagens' }]}
                                  series={[{ data: tripPeriodRows.map((row) => row.trips), label: 'Viagens', color: '#FF6B00', valueFormatter: (value) => `${value ?? 0} viagens` }]}
                                  margin={{ left: 52, right: 18, top: 24, bottom: 48 }}
                                />
                              </Suspense>
                            </Box>
                            <ChartDataTable
                              title="Dados do gráfico de viagens por período"
                              headers={['Período', 'Dias', 'Viagens']}
                              rows={tripPeriodRows.map((row) => [row.label, row.days, row.trips])}
                            />
                          </>
                        )}
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 5 }}>
                      <Paper component="section" aria-labelledby="fleet-distribution-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="fleet-distribution-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Distribuição atual da frota
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                          Composição por situação cadastral
                        </Typography>
                        {dashboard.summaryLoading ? (
                          <StateFeedback kind="loading" title="Carregando distribuição da frota..." />
                        ) : dashboard.summaryError || !summary ? (
                          <StateFeedback kind="empty" title="Resumo da frota indisponível" description="Tente atualizar o painel." centered />
                        ) : summary.fleet.total === 0 ? (
                          <StateFeedback kind="empty" title="Nenhum veículo cadastrado" centered />
                        ) : (
                          <>
                            <Box sx={{ position: 'relative', width: 240, maxWidth: '100%', mx: 'auto' }}>
                              <Box
                                role="img"
                                aria-label={`Gráfico de situação da frota: ${fleetDistribution.map(({ label, count }) => `${count} ${label.toLowerCase()}`).join(', ')}.`}
                              >
                                <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de situação..." />}>
                                  <PieChart
                                    height={220}
                                    series={[{
                                      data: fleetDistribution.map((row) => ({
                                        id: row.key,
                                        value: row.count,
                                        label: row.label,
                                        color: row.color,
                                      })),
                                      innerRadius: 56,
                                      outerRadius: 84,
                                      paddingAngle: 2,
                                      cornerRadius: 3,
                                      valueFormatter: (item) => `${item.value} veículos`,
                                    }]}
                                    hideLegend
                                  />
                                </Suspense>
                              </Box>
                              <Stack aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' }}>
                                <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.fleet.total}</Typography>
                                <Typography variant="caption" color="text.secondary">veículos</Typography>
                              </Stack>
                            </Box>
                            <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
                              {fleetDistribution.map((row) => (
                                <Box component="li" key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box aria-hidden="true" sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: row.color }} />
                                  <Typography variant="body2" sx={{ flex: 1 }}>{row.label}</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.count}</Typography>
                                </Box>
                              ))}
                            </Stack>
                          </>
                        )}
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 6 }}>
                      <Paper component="section" aria-labelledby="costs-vehicle-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="costs-vehicle-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Custos por veículo no período
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                          Combustível e manutenção fechada · {formattedPeriodLabel}
                        </Typography>
                        {dashboard.indicatorsLoading ? (
                          <StateFeedback kind="loading" title="Carregando custos por veículo..." />
                        ) : !indicators || indicators.vehicles.length === 0 ? (
                          <StateFeedback
                            kind="empty"
                            title="Nenhum veículo retornado para este recorte"
                            description="Veículos inativos só aparecem quando possuem movimentação no período."
                            centered
                          />
                        ) : (
                          <>
                            {hasCostActivity ? (
                              <Box
                                role="img"
                                aria-label="Gráfico comparativo de gastos com combustível e manutenção por veículo; os valores exatos constam na tabela abaixo."
                                sx={{ width: '100%', minWidth: 0, overflowX: 'auto' }}
                              >
                                <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de custos..." />}>
                                  <BarChart
                                    height={240}
                                    xAxis={[{ data: indicators.vehicles.map((v) => v.licensePlate), scaleType: 'band', label: 'Placa' }]}
                                    yAxis={[{ label: 'Reais (R$)' }]}
                                    series={[
                                      {
                                        data: indicators.vehicles.map((v) => v.fuelCost),
                                        label: 'Combustível',
                                        color: '#b94700',
                                        valueFormatter: (value) => formatCurrency(value ?? 0),
                                      },
                                      {
                                        data: indicators.vehicles.map((v) => v.maintenanceCost),
                                        label: 'Manutenção',
                                        color: '#1d4ed8',
                                        valueFormatter: (value) => formatCurrency(value ?? 0),
                                      },
                                    ]}
                                    margin={{ left: 60, right: 18, top: 24, bottom: 44 }}
                                  />
                                </Suspense>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                Sem gastos de combustível ou manutenção registrados neste período.
                              </Typography>
                            )}
                            <ChartDataTable
                              title="Dados do gráfico de custos por veículo"
                              headers={['Veículo', 'Combustível', 'Manutenção', 'Total']}
                              rows={indicators.vehicles.map((v) => [
                                v.licensePlate,
                                formatCurrency(v.fuelCost),
                                formatCurrency(v.maintenanceCost),
                                formatCurrency(v.fuelCost + v.maintenanceCost),
                              ])}
                            />
                          </>
                        )}
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 6 }}>
                      <Paper component="section" aria-labelledby="fuel-chart-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="fuel-chart-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Combustível por período
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Gasto com abastecimentos vigentes · {formattedPeriodLabel}
                        </Typography>
                        {dashboard.indicatorsLoading ? (
                          <StateFeedback kind="loading" title="Carregando histórico de combustível..." />
                        ) : (
                          <>
                            <Box role="img" aria-label="Gráfico do gasto com combustível por período; os valores estão na tabela abaixo.">
                              <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de combustível..." />}>
                                <BarChart
                                  height={210}
                                  xAxis={[{ data: fuelPeriodRows.map((row) => row.label), scaleType: 'band', label: indicators?.activityBucket === 'day' ? 'Dia' : 'Mês' }]}
                                  yAxis={[{ label: 'Reais' }]}
                                  series={[{ data: fuelPeriodRows.map((row) => row.cost), label: 'Gasto (R$)', color: '#ff9b54', valueFormatter: (value) => formatCurrency(value ?? 0) }]}
                                  margin={{ left: 58, right: 16, top: 20, bottom: 42 }}
                                />
                              </Suspense>
                            </Box>
                            <ChartDataTable
                              title="Dados do gráfico de combustível por período"
                              headers={['Período', 'Gasto']}
                              rows={fuelPeriodRows.map((row) => [row.label, formatCurrency(row.cost)])}
                            />
                          </>
                        )}
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 7 }}>
                      <Paper component="section" aria-labelledby="trips-vehicle-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="trips-vehicle-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Viagens por veículo
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                          Comparação no período selecionado.
                        </Typography>
                        {dashboard.indicatorsLoading ? (
                          <StateFeedback kind="loading" title="Carregando indicadores por veículo..." />
                        ) : !indicators || !hasTripActivity ? (
                          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                            Sem viagens concluídas no período selecionado.
                          </Typography>
                        ) : (
                          <>
                            <Box role="img" aria-label="Gráfico de viagens por veículo; os mesmos valores estão disponíveis na tabela abaixo.">
                              <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico por veículo..." />}>
                                <BarChart
                                  layout="horizontal"
                                  height={Math.max(220, tripVehicleRows.length * 36)}
                                  xAxis={[{ label: 'Viagens' }]}
                                  yAxis={[{ data: tripVehicleRows.map((row) => row.label), scaleType: 'band', label: 'Veículo' }]}
                                  series={[{ data: tripVehicleRows.map((row) => row.trips), label: 'Viagens', color: '#b94700', valueFormatter: (value) => `${value ?? 0} viagens` }]}
                                  margin={{ left: 100, right: 22, top: 20, bottom: 38 }}
                                />
                              </Suspense>
                            </Box>
                            <ChartDataTable
                              title="Dados do gráfico de viagens por veículo"
                              headers={['Veículo', 'Viagens']}
                              rows={tripVehicleRows.map((row) => [row.label, row.trips])}
                            />
                          </>
                        )}
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, lg: 5 }}>
                      <Paper component="section" aria-labelledby="maintenance-chart-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
                        <Typography id="maintenance-chart-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Manutenções no período
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Ordens registradas no período selecionado
                        </Typography>
                        <Grid container spacing={1.5}>
                          <Grid size={{ xs: 6 }}>
                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f0fdf4', borderColor: '#dcfce7' }}>
                              <Typography variant="h6" sx={{ color: '#166534', fontWeight: 700 }}>
                                {dashboard.indicatorsLoading ? '—' : formatNumber(indicators?.totals.preventiveMaintenanceOrdersOpened ?? 0, 0)}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#166534' }}>Preventivas</Typography>
                            </Paper>
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fffbeb', borderColor: '#fef3c7' }}>
                              <Typography variant="h6" sx={{ color: '#92400e', fontWeight: 700 }}>
                                {dashboard.indicatorsLoading ? '—' : formatNumber(indicators?.totals.correctiveMaintenanceOrdersOpened ?? 0, 0)}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#92400e' }}>Corretivas</Typography>
                            </Paper>
                          </Grid>
                        </Grid>
                        {indicators && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                            Veículos com ordem corretiva: {formatNumber(indicators.totals.vehiclesWithCorrectiveMaintenance, 0)}
                          </Typography>
                        )}
                      </Paper>
                    </Grid>
                  </Grid>

                  {historyRows.length > 0 && indicators && indicators.activitySeries.length > 0 && (
                    <Box component="section" id="dashboard-history" aria-labelledby="history-indicators-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(140) }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.5, mb: 1.5 }}>
                        <Typography id="history-indicators-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                          Histórico da operação
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Eventos registrados no período · {formattedPeriodLabel}
                        </Typography>
                      </Stack>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, lg: 6 }}>
                          <TrendChart
                            title="Manutenções abertas e concluídas"
                            data={historyRows}
                            series={[
                              { label: 'Abertas', color: '#FF6B00', values: historyRows.map((row) => row.maintenanceOpened) },
                              { label: 'Concluídas', color: '#2e7d32', values: historyRows.map((row) => row.maintenanceClosed) },
                            ]}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, lg: 6 }}>
                          <TrendChart
                            title="Solicitações de viagem"
                            data={historyRows}
                            series={[
                              { label: 'Criadas', color: '#FF6B00', values: historyRows.map((row) => row.requestsCreated) },
                              { label: 'Aprovadas', color: '#2e7d32', values: historyRows.map((row) => row.requestsApproved) },
                              { label: 'Rejeitadas', color: '#d32f2f', values: historyRows.map((row) => row.requestsRejected) },
                              { label: 'Agendadas', color: '#1976d2', values: historyRows.map((row) => row.requestsScheduled) },
                              { label: 'Canceladas', color: '#757575', values: historyRows.map((row) => row.requestsCanceled) },
                            ]}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, lg: 6 }}>
                          <TrendChart
                            title="Eventos de multas"
                            data={historyRows}
                            series={[
                              { label: 'Registradas', color: '#FF6B00', values: historyRows.map((row) => row.finesRegistered) },
                              { label: 'Pagas', color: '#2e7d32', values: historyRows.map((row) => row.finesPaid) },
                              { label: 'Contestadas', color: '#ed6c02', values: historyRows.map((row) => row.finesContested) },
                            ]}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, lg: 6 }}>
                          <TrendChart
                            title={dashboard.vehicleId ? 'Atividade de motoristas · toda a frota' : 'Atividade de motoristas'}
                            data={historyRows}
                            series={[
                              { label: 'Cadastros', color: '#FF6B00', values: historyRows.map((row) => row.driversCreated) },
                              { label: 'Mudanças de situação', color: '#1976d2', values: historyRows.map((row) => row.driversStatusChanged) },
                            ]}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, lg: 6 }}>
                          <TrendChart
                            title="Documentos de veículos"
                            data={historyRows}
                            series={[
                              { label: 'Registrados', color: '#FF6B00', values: historyRows.map((row) => row.documentsRegistered) },
                              { label: 'Renovados', color: '#2e7d32', values: historyRows.map((row) => row.documentsRenewed) },
                            ]}
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {indicators && (
                    <Box component="section" id="dashboard-comparison" aria-labelledby="comparison-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(180) }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.5, mb: 1.5 }}>
                        <Typography id="comparison-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                          Comparação com o período anterior
                        </Typography>
                        {comparisonIndicators && (
                          <Typography variant="body2" color="text.secondary">
                            Intervalo anterior com a mesma duração: {formatSafeCalendarDate(comparisonIndicators.period.from)} a{' '}
                            {formatSafeCalendarDate(addCivilDays(comparisonIndicators.period.to, -1))}
                          </Typography>
                        )}
                      </Stack>
                      {dashboard.comparisonError ? (
                        <StateFeedback
                          kind="partial"
                          title="Não foi possível carregar a comparação"
                          description={dashboard.comparisonError}
                          actionLabel="Tentar novamente"
                          onAction={handleRefreshAll}
                        />
                      ) : comparisonIndicators ? (
                        <Grid container spacing={2}>
                          {[
                            { id: 'comparison-trips', title: 'Viagens concluídas', current: indicators.totals.tripsCount, previous: comparisonIndicators.totals.tripsCount },
                            { id: 'comparison-distance', title: 'Quilometragem percorrida', current: indicators.totals.kmDriven, previous: comparisonIndicators.totals.kmDriven, suffix: ' km' },
                            { id: 'comparison-fuel', title: 'Gasto com combustível', current: indicators.totals.fuelCost, previous: comparisonIndicators.totals.fuelCost, currency: true },
                            { id: 'comparison-maintenance', title: 'Ordens de manutenção', current: indicators.totals.maintenanceOrdersOpened, previous: comparisonIndicators.totals.maintenanceOrdersOpened },
                            { id: 'comparison-maintenance-cost', title: 'Custo de manutenção', current: indicators.totals.maintenanceCost, previous: comparisonIndicators.totals.maintenanceCost, currency: true },
                            { id: 'comparison-requests', title: 'Solicitações criadas', current: indicators.activitySeries.reduce((sum, row) => sum + row.requestsCreated, 0), previous: comparisonIndicators.activitySeries.reduce((sum, row) => sum + row.requestsCreated, 0) },
                            { id: 'comparison-fines', title: 'Multas registradas', current: indicators.activitySeries.reduce((sum, row) => sum + row.finesRegistered, 0), previous: comparisonIndicators.activitySeries.reduce((sum, row) => sum + row.finesRegistered, 0) },
                            { id: 'comparison-drivers', title: 'Mudanças de situação de motoristas', current: indicators.activitySeries.reduce((sum, row) => sum + row.driversStatusChanged, 0), previous: comparisonIndicators.activitySeries.reduce((sum, row) => sum + row.driversStatusChanged, 0) },
                            { id: 'comparison-documents', title: 'Documentos renovados', current: indicators.activitySeries.reduce((sum, row) => sum + row.documentsRenewed, 0), previous: comparisonIndicators.activitySeries.reduce((sum, row) => sum + row.documentsRenewed, 0) },
                          ].map((item) => {
                            const delta = item.current - item.previous
                            const description = item.currency
                              ? `${delta > 0 ? '+' : ''}${formatCurrency(delta)} em relação ao período anterior`
                              : `${delta > 0 ? '+' : ''}${formatNumber(delta)}${item.suffix ?? ''} em relação ao período anterior`
                            const value = item.currency ? formatCurrency(item.current) : `${formatNumber(item.current)}${item.suffix ?? ''}`
                            return (
                              <Grid key={item.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}>
                                <StatCard title={item.title} value={value} description={description} />
                              </Grid>
                            )
                          })}
                        </Grid>
                      ) : null}
                    </Box>
                  )}

                  <Paper component="section" id="dashboard-vehicles" aria-labelledby="vehicle-indicators-table-title" tabIndex={-1} variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3, scrollMarginTop: 10, ...sectionEntrance(220) }}>
                    <Typography id="vehicle-indicators-table-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Uso, consumo e custo por veículo
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Detalhamento consolidado no período ({formattedPeriodLabel})
                    </Typography>

                    <DataTable
                      caption="Indicadores operacionais por veículo no período selecionado"
                      columns={VEHICLE_INDICATORS_COLUMNS}
                      rows={indicators?.vehicles ?? []}
                      rowKey={(row) => row.vehicleId}
                      busy={dashboard.indicatorsLoading}
                      minWidth={980}
                      footerValues={vehicleFooterValues}
                      loadingContent={<StateFeedback kind="loading" title="Carregando indicadores por veículo..." />}
                      emptyContent={(
                        <StateFeedback
                          kind="empty"
                          title="Nenhum veículo com registros no recorte"
                          description="Ajuste o período ou selecione Todos os veículos."
                          centered
                        />
                      )}
                      paperSx={{ border: 0, boxShadow: 'none' }}
                    />
                    {consumptionPending && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        * Consumo médio (km/L): fórmula proposta ainda em validação pelo cliente (`pendingValidation`).
                      </Typography>
                    )}
                  </Paper>
                </>
              )}
            </Box>
          )}

          {(summary?.svo || indicators?.svo) && (
            <Box component="section" aria-labelledby="svo-summary-title" sx={{ mb: 3 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
              >
                <Typography id="svo-summary-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Indicadores do SVO
                </Typography>
                {svoTimePending && <StatusChip label="Tempo até coleta em validação" tone="warning" />}
              </Stack>
              <Grid container spacing={2}>
                {summary?.svo && (
                  <>
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }} sx={dashboardCardMotion}>
                      <StatCard
                        title="Ordens SVO em andamento"
                        value={summary.svo.ordersInProgress}
                        description="Retrato atual da operação SVO"
                        icon={<MedicalServices />}
                        loading={dashboard.summaryLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }} sx={dashboardCardMotion}>
                      <StatCard
                        title="Ocupação das viaturas SVO"
                        value={summary.svo.vehicles.occupancyRate !== null
                          ? `${formatNumber(summary.svo.vehicles.occupancyRate, 1)}%`
                          : 'Sem viaturas ativas'}
                        description={`${summary.svo.vehicles.busy} de ${summary.svo.vehicles.total} viaturas em atendimento`}
                        icon={<DirectionsCar />}
                        loading={dashboard.summaryLoading}
                      />
                    </Grid>
                  </>
                )}
                {dashboard.validation.valid && indicators?.svo && (
                  <>
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }} sx={dashboardCardMotion}>
                      <StatCard
                        title="Ordens SVO abertas"
                        value={indicators.svo.ordersOpened}
                        description={`No período (${formattedPeriodLabel})`}
                        icon={<MedicalServices />}
                        loading={dashboard.indicatorsLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 6 }} sx={dashboardCardMotion}>
                      <StatCard
                        title="Ordens SVO coletadas"
                        value={indicators.svo.ordersCollected}
                        description="Com coleta registrada no período"
                        icon={<LocalShipping />}
                        loading={dashboard.indicatorsLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 6 }} sx={dashboardCardMotion}>
                      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <StatCard
                          title="Tempo médio até a coleta"
                          value={formatNullableMeasure(indicators.svo.averageMinutesToCollection, 'min', 'Sem coleta no período', 1)}
                          description={svoTimePending ? 'Proposta em validação · chamado até coleta' : 'Do recebimento do chamado até a coleta'}
                          icon={<Route />}
                          loading={dashboard.indicatorsLoading}
                        />
                        {svoTimePending && !dashboard.indicatorsLoading && (
                          <Box sx={{ px: 0.5 }}>
                            <StatusChip label="Proposta em validação" tone="warning" />
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  </>
                )}
              </Grid>
            </Box>
          )}

          <Box component="section" id="dashboard-maintenance" aria-labelledby="upcoming-maintenance-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(260) }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography id="upcoming-maintenance-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                Próximas manutenções
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Ordens abertas ou em andamento com previsão registrada.
              </Typography>
              {maintenanceError && (
                <StateFeedback kind="error" title={maintenanceError} actionLabel="Tentar novamente" onAction={handleRefreshAll} />
              )}
              {!maintenanceError && (
                <DataTable
                  caption="Próximas manutenções previstas"
                  columns={MAINTENANCE_COLUMNS}
                  rows={upcomingMaintenance}
                  rowKey={(row) => row.id}
                  minWidth={520}
                  busy={maintenanceLoading}
                  loadingContent={<StateFeedback kind="loading" title="Carregando próximas manutenções..." />}
                  emptyContent="Não há ordens abertas com previsão futura registrada."
                />
              )}
            </Paper>
          </Box>

          <Box component="section" id="dashboard-schedule" aria-labelledby="future-trips-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(300) }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, mb: 1.5 }}>
              <Box>
                <Typography id="future-trips-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Viagens agendadas
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Agenda registrada para {formattedFuturePeriod}; não é uma estimativa de viagens ou custos. O filtro de veículo acima também se aplica aqui.
                </Typography>
              </Box>
              <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" color="primary.dark" sx={{ fontWeight: 700 }} aria-live="polite">
                  {scheduledLoading ? 'Consultando agenda...' : `${filteredScheduledTrips.length} ${filteredScheduledTrips.length === 1 ? 'viagem agendada' : 'viagens agendadas'}`}
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  value={futureDays}
                  onChange={(_event, value: number | null) => { if (value) setFutureDays(value) }}
                  aria-label="Período das viagens futuras"
                >
                  {FUTURE_PERIODS.map((days) => (
                    <ToggleButton key={days} value={days} sx={{ minHeight: 44 }}>{days} dias</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Stack>
            </Stack>
            {scheduledError && (
              <StateFeedback kind="error" title={scheduledError} actionLabel="Tentar novamente" onAction={handleRefreshAll} />
            )}
            {!scheduledError && (
              <DataTable
                caption="Viagens agendadas no período futuro"
                columns={SCHEDULED_TRIP_COLUMNS}
                rows={filteredScheduledTrips}
                rowKey={(row) => row.id}
                minWidth={820}
                busy={scheduledLoading}
                loadingContent={<StateFeedback kind="loading" title="Carregando viagens agendadas..." />}
                emptyContent="Não há viagens agendadas nesse período e para esse veículo."
              />
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
