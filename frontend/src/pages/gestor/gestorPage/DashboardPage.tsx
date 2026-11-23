import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Assignment,
  Build,
  CheckCircle,
  Description,
  DirectionsCar,
  LocalGasStation,
  LocalShipping,
  MedicalServices,
  People,
  Speed,
} from '@mui/icons-material'
import { Alert, Box, Button, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import FilterBar from '../../../components/ui/FilterBar'
import PageHeader from '../../../components/ui/PageHeader'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import StateFeedback from '../../../components/ui/StateFeedback'
import StatCard from '../../../components/ui/StatCard'
import { getDashboardIndicators, getDashboardSummary, listScheduledTrips } from '../../../services/dashboardService'
import type { DashboardVehicleIndicators, ScheduledTripSummary } from '../../../services/dashboardService'
import { listMaintenance } from '../../../services/maintenanceService'
import type { MaintenanceOrder } from '../../../maintenance/maintenanceTypes'
import { listVehicles } from '../../../services/vehiclesService'
import type { Vehicle } from '../../../vehicles/vehicleTypes'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const QUICK_PERIODS = [
  { id: 'today', label: 'Hoje', days: 1 },
  { id: '7days', label: '7 dias', days: 7 },
  { id: '30days', label: '30 dias', days: 30 },
  { id: '90days', label: '90 dias', days: 90 },
  { id: '6months', label: '6 meses', months: 6 },
  { id: '12months', label: '12 meses', months: 12 },
] as const
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
const BarChart = lazy(() => import('@mui/x-charts/BarChart').then(({ BarChart: chart }) => ({ default: chart })))
const PieChart = lazy(() => import('@mui/x-charts/PieChart').then(({ PieChart: chart }) => ({ default: chart })))

interface DashboardFilters {
  from: string
  to: string
  vehicleId: string
}

interface UpcomingMaintenanceRow {
  id: string
  vehicle: string
  type: string
  expectedDate: string
  status: string
}

function toLocalDate(date: Date): string {
  const values = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => values.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return toLocalDate(date)
}

function periodStart(end: string, period: typeof QUICK_PERIODS[number]): string {
  const [year, month, day] = end.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if ('months' in period) {
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() - period.months)
    const lastDayOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  } else {
    date.setUTCDate(date.getUTCDate() - period.days + 1)
  }
  return toLocalDate(date)
}

function inclusiveDays(from: string, to: string): number {
  if (!from || !to || from > to) return 0
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_IN_MS) + 1
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Maceio' }).format(new Date(value))
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
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
  '@media (prefers-reduced-motion: reduce)': { '& > .MuiCard-root': { transition: 'none' }, '& > .MuiCard-root:hover': { transform: 'none' } },
}

function chartPeriods(from: string, to: string, bucket: 'day' | 'month') {
  const result: { key: string; label: string; days: number }[] = []
  const [startYear, startMonth, startDay] = from.split('-').map(Number)
  const [endYear, endMonth, endDay] = to.split('-').map(Number)
  const cursor = bucket === 'day' ? new Date(Date.UTC(startYear, startMonth - 1, startDay, 12)) : new Date(Date.UTC(startYear, startMonth - 1, 1, 12))
  const end = bucket === 'day' ? new Date(Date.UTC(endYear, endMonth - 1, endDay, 12)) : new Date(Date.UTC(endYear, endMonth - 1, 1, 12))
  while (cursor <= end) {
    const key = bucket === 'day'
      ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
      : `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`
    const label = bucket === 'day'
      ? `${String(cursor.getUTCDate()).padStart(2, '0')}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
      : `${String(cursor.getUTCMonth() + 1).padStart(2, '0')}/${cursor.getUTCFullYear()}`
    const next = new Date(cursor)
    if (bucket === 'day') next.setUTCDate(next.getUTCDate() + 1)
    else next.setUTCMonth(next.getUTCMonth() + 1)
    result.push({ key, label, days: bucket === 'day' ? 1 : Math.round((next.getTime() - cursor.getTime()) / DAY_IN_MS) })
    cursor.setTime(next.getTime())
  }
  return result
}

function ChartDataTable({ title, headers, rows }: { title: string; headers: readonly string[]; rows: readonly (readonly (string | number)[])[] }) {
  return <TableContainer sx={{ mt: 1, maxHeight: 190 }}><Table size="small" aria-label={title}>
    <TableHead><TableRow>{headers.map((header) => <TableCell key={header} component="th" scope="col">{header}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map((row) => <TableRow key={String(row[0])}>{row.map((cell, index) => <TableCell key={`${row[0]}-${index}`}>{cell}</TableCell>)}</TableRow>)}</TableBody>
  </Table></TableContainer>
}

function TrendChart({ title, data, series }: {
  title: string
  data: { label: string }[]
  series: { label: string; color: string; values: number[] }[]
}) {
  const rows = data.map((period, index) => [period.label, ...series.map((item) => item.values[index] ?? 0)])
  return <Paper component="section" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
    <Box role="img" aria-label={`Gráfico de ${title.toLocaleLowerCase('pt-BR')}; os valores também estão na tabela abaixo.`}>
      <Suspense fallback={<StateFeedback kind="loading" title={`Carregando gráfico: ${title.toLocaleLowerCase('pt-BR')}...`} />}>
        <BarChart height={250} xAxis={[{ data: data.map((item) => item.label), scaleType: 'band', label: 'Período' }]} yAxis={[{ label: 'Registros' }]} series={series.map((item) => ({ data: item.values, label: item.label, color: item.color }))} margin={{ left: 52, right: 18, top: 24, bottom: 48 }} />
      </Suspense>
    </Box>
    <ChartDataTable title={`Dados do gráfico: ${title}`} headers={['Período', ...series.map((item) => item.label)]} rows={rows} />
  </Paper>
}

const VEHICLE_COLUMNS: readonly DataTableColumn<DashboardVehicleIndicators>[] = [
  { key: 'vehicle', header: 'Veículo', width: 160, render: (row) => row.licensePlate },
  { key: 'trips', header: 'Viagens concluídas', align: 'right', render: (row) => formatNumber(row.tripsCount) },
  { key: 'km', header: 'Km percorridos', align: 'right', render: (row) => `${formatNumber(row.kmDriven)} km` },
  { key: 'consumption', header: 'Consumo médio', align: 'right', render: (row) => row.averageConsumptionKmPerLiter === null ? '—' : `${formatNumber(row.averageConsumptionKmPerLiter, 2)} km/L` },
  { key: 'liters', header: 'Litros abastecidos', align: 'right', render: (row) => `${formatNumber(row.litersFueled, 1)} L` },
  { key: 'fuel', header: 'Gasto com combustível', align: 'right', render: (row) => formatCurrency(row.fuelCost) },
  { key: 'maintenance', header: 'Ordens de manutenção', align: 'right', render: (row) => formatNumber(row.maintenanceOrdersOpened) },
  { key: 'preventive', header: 'Ordens preventivas', align: 'right', render: (row) => formatNumber(row.preventiveMaintenanceOrdersOpened) },
  { key: 'corrective', header: 'Ordens corretivas', align: 'right', render: (row) => formatNumber(row.correctiveMaintenanceOrdersOpened) },
  { key: 'maintenanceCost', header: 'Custo de manutenção', align: 'right', render: (row) => formatCurrency(row.maintenanceCost) },
]

const SCHEDULED_TRIP_COLUMNS: readonly DataTableColumn<ScheduledTripSummary>[] = [
  { key: 'start', header: 'Início previsto', width: 170, render: (row) => formatDateTime(row.scheduledStart) },
  { key: 'vehicle', header: 'Veículo', width: 130, render: (row) => row.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', width: 200, render: (row) => row.driverName },
  { key: 'route', header: 'Origem → destino', render: (row) => `${row.origin} → ${row.destination}` },
]

const MAINTENANCE_COLUMNS: readonly DataTableColumn<UpcomingMaintenanceRow>[] = [
  { key: 'vehicle', header: 'Veículo', width: 140, render: (row) => row.vehicle },
  { key: 'type', header: 'Tipo', width: 140, render: (row) => row.type },
  { key: 'expectedDate', header: 'Previsão', width: 150, render: (row) => formatDate(row.expectedDate) },
  { key: 'status', header: 'Situação', width: 150, render: (row) => row.status },
]

/** Painel gerencial com indicadores lidos das APIs da frota e viagens. */
export default function DashboardPage() {
  const { api } = useAuth()
  const today = toLocalDate(new Date())
  const initialFrom = shiftDate(today, -29)
  const [period, setPeriod] = useState('30days')
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(today)
  const [vehicleId, setVehicleId] = useState('')
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>({ from: initialFrom, to: today, vehicleId: '' })
  const [futureDays, setFutureDays] = useState<number>(30)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getDashboardSummary>> | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [indicators, setIndicators] = useState<Awaited<ReturnType<typeof getDashboardIndicators>> | null>(null)
  const [comparisonIndicators, setComparisonIndicators] = useState<Awaited<ReturnType<typeof getDashboardIndicators>> | null>(null)
  const [scheduledTrips, setScheduledTrips] = useState<ScheduledTripSummary[]>([])
  const [maintenanceOrders, setMaintenanceOrders] = useState<MaintenanceOrder[]>([])
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [vehiclesLoading, setVehiclesLoading] = useState(true)
  const [indicatorsLoading, setIndicatorsLoading] = useState(true)
  const [scheduledLoading, setScheduledLoading] = useState(true)
  const [maintenanceLoading, setMaintenanceLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [vehiclesError, setVehiclesError] = useState('')
  const [indicatorsError, setIndicatorsError] = useState('')
  const [comparisonError, setComparisonError] = useState('')
  const [scheduledError, setScheduledError] = useState('')
  const [maintenanceError, setMaintenanceError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const validDraftPeriod = inclusiveDays(from, to) > 0 && inclusiveDays(from, to) <= 366
  const validAppliedPeriod = inclusiveDays(appliedFilters.from, appliedFilters.to) > 0

  useEffect(() => {
    document.title = 'Dashboard da frota — Aratu'
  }, [])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(async () => {
      if (!current) return
      setSummaryLoading(true)
      setSummaryError('')
      setSummary(null)
      try {
        const value = await getDashboardSummary(api, appliedFilters.vehicleId || undefined)
        if (current) setSummary(value)
      } catch (error: unknown) {
        if (current) setSummaryError(error instanceof Error ? error.message : 'Não foi possível carregar o resumo da frota.')
      } finally {
        if (current) setSummaryLoading(false)
      }
    })
    return () => { current = false }
  }, [api, appliedFilters.vehicleId, refreshVersion])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(async () => {
      if (!current) return
      setVehiclesLoading(true)
      setVehiclesError('')
      try {
        const value = await listVehicles(api)
        if (current) setVehicles(value)
      } catch (error: unknown) {
        if (current) setVehiclesError(error instanceof Error ? error.message : 'Não foi possível carregar a lista de veículos.')
      } finally {
        if (current) setVehiclesLoading(false)
      }
    })
    return () => { current = false }
  }, [api, refreshVersion])

  useEffect(() => {
    let current = true
    if (!validAppliedPeriod) {
      void Promise.resolve().then(() => {
        if (!current) return
        setIndicatorsLoading(false)
        setIndicatorsError('O período aplicado é inválido. Escolha no máximo 366 dias.')
      })
      return () => { current = false }
    }
    void Promise.resolve().then(async () => {
      if (!current) return
      setIndicatorsLoading(true)
      setIndicatorsError('')
      setComparisonError('')
      setIndicators(null)
      setComparisonIndicators(null)
      const currentPeriod = getDashboardIndicators(api, {
        from: appliedFilters.from,
        toExclusive: shiftDate(appliedFilters.to, 1),
        vehicleId: appliedFilters.vehicleId || undefined,
      })
      const periodDays = inclusiveDays(appliedFilters.from, appliedFilters.to)
      const previousPeriod = getDashboardIndicators(api, {
        from: shiftDate(appliedFilters.from, -periodDays),
        toExclusive: appliedFilters.from,
        vehicleId: appliedFilters.vehicleId || undefined,
      })
      try {
        const [value, previous] = await Promise.allSettled([currentPeriod, previousPeriod])
        if (!current) return
        if (value.status === 'fulfilled') {
          setIndicators(value.value)
        } else {
          setIndicatorsError(value.reason instanceof Error ? value.reason.message : 'Não foi possível carregar os indicadores do período.')
        }
        if (previous.status === 'fulfilled') {
          setComparisonIndicators(previous.value)
        } else {
          setComparisonError(previous.reason instanceof Error ? previous.reason.message : 'Não foi possível carregar o período anterior.')
        }
      } finally {
        if (current) setIndicatorsLoading(false)
      }
    })
    return () => { current = false }
  }, [api, appliedFilters, refreshVersion, validAppliedPeriod])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(async () => {
      if (!current) return
      setMaintenanceLoading(true)
      setMaintenanceError('')
      try {
        const [opened, inProgress] = await Promise.all([
          listMaintenance(api, { status: 'OPEN' }),
          listMaintenance(api, { status: 'IN_PROGRESS' }),
        ])
        if (current) setMaintenanceOrders([...opened.items, ...inProgress.items])
      } catch (error: unknown) {
        if (current) setMaintenanceError(error instanceof Error ? error.message : 'Não foi possível carregar as previsões de manutenção.')
      } finally {
        if (current) setMaintenanceLoading(false)
      }
    })
    return () => { current = false }
  }, [api, refreshVersion])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(async () => {
      if (!current) return
      setScheduledLoading(true)
      setScheduledError('')
      try {
        const value = await listScheduledTrips(api, {
          from: today,
          to: shiftDate(today, futureDays - 1),
        })
        if (current) setScheduledTrips([...value].sort((left, right) => left.scheduledStart.localeCompare(right.scheduledStart)))
      } catch (error: unknown) {
        if (current) setScheduledError(error instanceof Error ? error.message : 'Não foi possível carregar as viagens agendadas.')
      } finally {
        if (current) setScheduledLoading(false)
      }
    })
    return () => { current = false }
  }, [api, futureDays, refreshVersion, today])

  const vehicleOptions = useMemo(() => [
    { value: '', label: 'Todos os veículos' },
    ...vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.licensePlate })),
  ], [vehicles])
  const filteredScheduledTrips = useMemo(() => {
    if (!appliedFilters.vehicleId) return scheduledTrips
    const selectedPlate = vehicles.find((vehicle) => vehicle.id === appliedFilters.vehicleId)?.licensePlate
    return selectedPlate ? scheduledTrips.filter((trip) => trip.vehicleLicensePlate === selectedPlate) : []
  }, [appliedFilters.vehicleId, scheduledTrips, vehicles])
  const upcomingMaintenance = useMemo(() => maintenanceOrders
    .filter((order) => order.expectedCompletionDate && order.expectedCompletionDate >= today
      && (!appliedFilters.vehicleId || order.vehicleId === appliedFilters.vehicleId))
    .map((order): UpcomingMaintenanceRow => ({
      id: order.id,
      vehicle: vehicles.find((vehicle) => vehicle.id === order.vehicleId)?.licensePlate ?? order.vehicleSnapshot?.licensePlate ?? 'Veículo indisponível',
      type: order.type === 'PREVENTIVE' ? 'Preventiva' : 'Corretiva',
      expectedDate: order.expectedCompletionDate ?? '',
      status: order.status === 'OPEN' ? 'Em aberto' : 'Em andamento',
    }))
    .sort((left, right) => left.expectedDate.localeCompare(right.expectedDate)), [appliedFilters.vehicleId, maintenanceOrders, today, vehicles])
  const formattedAppliedPeriod = `${formatDate(appliedFilters.from)} a ${formatDate(appliedFilters.to)}`
  const formattedFuturePeriod = `${formatDate(today)} a ${formatDate(shiftDate(today, futureDays - 1))}`
  const activityMap = useMemo(() => new Map((indicators?.activitySeries ?? []).map((item) => [item.period, item])), [indicators?.activitySeries])
  const graphPeriods = useMemo(() => indicators ? chartPeriods(appliedFilters.from, appliedFilters.to, indicators.activityBucket) : [], [appliedFilters.from, appliedFilters.to, indicators])
  const tripPeriodRows = graphPeriods.map((period) => ({ ...period, trips: activityMap.get(period.key)?.tripsCount ?? 0 }))
  const fuelPeriodRows = graphPeriods.map((period) => ({ ...period, cost: activityMap.get(period.key)?.fuelCost ?? 0 }))
  const historyRows = graphPeriods.map((period) => ({
    ...period,
    ...(activityMap.get(period.key) ?? {
      maintenanceOpened: 0, maintenanceClosed: 0, requestsCreated: 0, requestsApproved: 0, requestsRejected: 0,
      requestsScheduled: 0, requestsCanceled: 0, finesRegistered: 0, finesPaid: 0, finesContested: 0,
      driversCreated: 0, driversStatusChanged: 0, documentsRegistered: 0, documentsRenewed: 0,
    }),
  }))
  const tripVehicleRows = [...(indicators?.vehicles ?? [])].sort((a, b) => b.tripsCount - a.tripsCount).map((vehicle) => ({ label: vehicle.licensePlate, trips: vehicle.tripsCount }))
  const fleetStatusRows = summary ? [
    { key: 'available', label: 'Disponível', count: summary.fleet.available, color: '#2e7d32' },
    { key: 'maintenance', label: 'Em manutenção', count: summary.fleet.inMaintenance, color: '#ed6c02' },
    { key: 'inactive', label: 'Inativo', count: summary.fleet.inactive, color: '#757575' },
  ] : []

  function selectPeriod(value: string | null) {
    if (!value) return
    setPeriod(value)
    const option = QUICK_PERIODS.find((item) => item.id === value)
    if (!option) return
    const proposedFrom = periodStart(today, option)
    const nextFrom = inclusiveDays(proposedFrom, today) > 366 ? shiftDate(proposedFrom, 1) : proposedFrom
    setFrom(nextFrom)
    setTo(today)
    setAppliedFilters({ from: nextFrom, to: today, vehicleId })
  }

  function applyFilters() {
    if (!validDraftPeriod) return
    setAppliedFilters({ from, to, vehicleId })
  }

  function clearFilters() {
    const nextFrom = shiftDate(today, -29)
    setPeriod('30days')
    setFrom(nextFrom)
    setTo(today)
    setVehicleId('')
    setAppliedFilters({ from: nextFrom, to: today, vehicleId: '' })
  }

  const summarySections = summary ? [
    { title: appliedFilters.vehicleId ? 'Veículo selecionado' : 'Frota', cards: [
      { id: 'fleet-total', title: 'Veículos cadastrados', value: summary.fleet.total, description: 'Situação atual da frota', icon: <DirectionsCar /> },
      { id: 'fleet-available', title: 'Veículos com status disponível', value: summary.fleet.available, description: 'Situação cadastrada', icon: <CheckCircle /> },
      { id: 'fleet-maintenance', title: 'Veículos em manutenção', value: summary.fleet.inMaintenance, description: 'Situação atual', icon: <Build /> },
      { id: 'fleet-inactive', title: 'Veículos inativos', value: summary.fleet.inactive, description: 'Situação atual', icon: <DirectionsCar /> },
    ] },
    { title: 'Motoristas · toda a frota', cards: [
      { id: 'drivers-total', title: 'Motoristas cadastrados', value: summary.drivers.total, description: 'Situação atual · total da frota', icon: <People /> },
      { id: 'drivers-active', title: 'Motoristas ativos', value: summary.drivers.active, description: 'Situação atual · total da frota', icon: <People /> },
      { id: 'drivers-away', title: 'Motoristas afastados', value: summary.drivers.away, description: 'Situação atual · total da frota', icon: <People /> },
      { id: 'drivers-inactive', title: 'Motoristas inativos', value: summary.drivers.inactive, description: 'Situação atual · total da frota', icon: <People /> },
      { id: 'cnh-expiring', title: 'CNHs a vencer', value: summary.drivers.cnhExpiring, description: 'Próximos 30 dias · total da frota', icon: <Description /> },
      { id: 'cnh-expired', title: 'CNHs vencidas', value: summary.drivers.cnhExpired, description: 'Validade anterior a hoje · total da frota', icon: <Description /> },
    ] },
    { title: 'Pendências operacionais', cards: [
      { id: 'requests', title: 'Solicitações pendentes', value: summary.pendingRequests, description: 'Aguardando análise · total da operação', icon: <Assignment /> },
      { id: 'trips-in-progress', title: 'Viagens em andamento', value: summary.tripsInProgress, description: 'Viagens em execução', icon: <LocalShipping /> },
      { id: 'vehicles-in-trip', title: 'Veículos em viagem', value: summary.vehiclesInTrip, description: 'Veículos distintos em execução', icon: <DirectionsCar /> },
      { id: 'to-confirm', title: 'Viagens a confirmar', value: summary.tripsToConfirm, description: 'Execuções finalizadas', icon: <LocalShipping /> },
      { id: 'documents-expiring', title: 'Documentos a vencer', value: summary.documents.expiring, description: `Próximos ${summary.documents.alertDays} dias`, icon: <Description /> },
      { id: 'documents-expired', title: 'Documentos vencidos', value: summary.documents.expired, description: 'Não anulados no cadastro', icon: <Description /> },
    ] },
    { title: 'Multas e infrações', cards: [
      { id: 'fines-pending', title: 'Multas pendentes', value: summary.fines.pending, description: 'Situação atual', icon: <Assignment /> },
      { id: 'fines-contested', title: 'Multas contestadas', value: summary.fines.contested, description: 'Situação atual', icon: <Assignment /> },
      { id: 'fines-paid', title: 'Multas pagas', value: summary.fines.paid, description: 'Situação atual', icon: <CheckCircle /> },
    ] },
    ...(summary.svo ? [{ title: 'SVO', cards: [
      { id: 'svo-open', title: 'Ordens em andamento', value: summary.svo.ordersInProgress, description: 'Situação atual', icon: <MedicalServices /> },
      { id: 'svo-vehicles', title: 'Veículos ocupados', value: `${summary.svo.vehicles.busy} de ${summary.svo.vehicles.total}`, description: summary.svo.vehicles.occupancyRate === null ? 'Sem veículos SVO ativos' : `${formatNumber(summary.svo.vehicles.occupancyRate, 1)}% dos veículos SVO`, icon: <LocalShipping /> },
    ] }] : []),
  ] : []

  const periodSections = indicators ? [
    { title: 'Viagens e abastecimentos', cards: [
      { id: 'trips', title: 'Viagens concluídas', value: indicators.totals.tripsCount, description: 'No período selecionado', icon: <LocalShipping /> },
      { id: 'distance', title: 'Quilometragem percorrida', value: `${formatNumber(indicators.totals.kmDriven)} km`, description: 'Viagens concluídas', icon: <Speed /> },
      { id: 'liters', title: 'Combustível abastecido', value: `${formatNumber(indicators.totals.litersFueled, 1)} L`, description: 'Abastecimentos vigentes', icon: <LocalGasStation /> },
      { id: 'fuel-cost', title: 'Gasto com combustível', value: formatCurrency(indicators.totals.fuelCost), description: 'Abastecimentos vigentes', icon: <LocalGasStation /> },
      { id: 'consumption', title: 'Consumo médio', value: indicators.totals.averageConsumptionKmPerLiter === null ? '—' : `${formatNumber(indicators.totals.averageConsumptionKmPerLiter, 2)} km/L`, description: 'Fórmula pendente de validação', icon: <Speed /> },
    ] },
    { title: 'Manutenção', cards: [
      { id: 'maintenance-orders', title: 'Ordens de manutenção', value: indicators.totals.maintenanceOrdersOpened, description: 'Registradas no período', icon: <Build /> },
      { id: 'preventive', title: 'Manutenções preventivas', value: indicators.totals.preventiveMaintenanceOrdersOpened, description: 'Ordens registradas no período', icon: <Build /> },
      { id: 'corrective', title: 'Manutenções corretivas', value: indicators.totals.correctiveMaintenanceOrdersOpened, description: 'Ordens registradas no período', icon: <Build /> },
      { id: 'corrective-vehicles', title: 'Veículos com ordem corretiva', value: indicators.totals.vehiclesWithCorrectiveMaintenance, description: 'Veículos distintos no período', icon: <DirectionsCar /> },
      { id: 'maintenance-cost', title: 'Custo de manutenção', value: formatCurrency(indicators.totals.maintenanceCost), description: 'Ordens encerradas no período', icon: <Build /> },
    ] },
    ...(indicators.svo ? [{ title: 'SVO', cards: [
      { id: 'svo-opened', title: 'Ordens abertas', value: indicators.svo.ordersOpened, description: 'Abertas no período', icon: <MedicalServices /> },
      { id: 'svo-collected', title: 'Coletas registradas', value: indicators.svo.ordersCollected, description: 'No período', icon: <MedicalServices /> },
      { id: 'svo-time', title: 'Tempo médio até coleta', value: indicators.svo.averageMinutesToCollection === null ? '—' : `${formatNumber(indicators.svo.averageMinutesToCollection, 1)} min`, description: 'Indicador em validação', icon: <Speed /> },
    ] }] : []),
  ] : []

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader
        breadcrumbs={['Início', 'Gestão', 'Dashboard']}
        title="Dashboard"
        description="Visão consolidada da frota, viagens, manutenção, abastecimentos, documentos e SVO."
        actions={<Button variant="outlined" onClick={() => setRefreshVersion((value) => value + 1)}>Atualizar dados</Button>}
      />

      <Box component="section" aria-label="Períodos rápidos" sx={{ mb: 1.5 }}>
        <ToggleButtonGroup
          exclusive
          value={period}
          onChange={(_event, value: string | null) => selectPeriod(value)}
          aria-label="Período dos indicadores realizados"
          sx={{ flexWrap: 'wrap', gap: 0.75, '& .MuiToggleButton-root': { minHeight: 44, px: 1.5, textTransform: 'none', borderRadius: 1.5 } }}
        >
          {QUICK_PERIODS.map((item) => <ToggleButton key={item.id} value={item.id}>{item.label}</ToggleButton>)}
          <ToggleButton value="custom" onClick={() => setPeriod('custom')}>Personalizado</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <FilterBar label="Filtros dos indicadores realizados">
        <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
          <FormField label="Data inicial" type="date" value={from} onChange={(value) => { setFrom(value); setPeriod('custom') }} />
        </Box>
        <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
          <FormField label="Data final" type="date" value={to} onChange={(value) => { setTo(value); setPeriod('custom') }} />
        </Box>
        <Box sx={{ flex: '1 1 220px', minWidth: { xs: '100%', sm: 220 } }}>
          <FormSelect label="Veículo" value={vehicleId} onChange={setVehicleId} options={vehicleOptions} disabled={vehiclesLoading || Boolean(vehiclesError)} />
        </Box>
        <Button variant="contained" onClick={applyFilters} disabled={!validDraftPeriod}>Aplicar filtros</Button>
        <Button variant="outlined" onClick={clearFilters}>Limpar filtros</Button>
      </FilterBar>
      {appliedFilters.vehicleId && <Alert severity="info" sx={{ mb: 2 }}>
        Os indicadores com vínculo ao veículo selecionado são filtrados. Solicitações ainda sem viagem atribuída e dados de motoristas continuam exibindo o total da operação.
      </Alert>}

      {!validDraftPeriod && <Alert severity="error" sx={{ mb: 2 }}>
        Informe um período válido de até 366 dias para aplicar os filtros.
      </Alert>}

      {vehiclesError && <StateFeedback kind="partial" title={vehiclesError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
      {indicatorsError && <StateFeedback kind="error" title={indicatorsError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
      {indicators?.pendingValidation.length ? <Alert severity="warning" sx={{ mb: 2 }}>
        Consumo médio e tempo médio até coleta são indicadores pendentes de validação da regra de cálculo.
      </Alert> : null}

      <Stack component="nav" aria-label="Acesso rápido às seções do dashboard" direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 3, ...sectionEntrance(40) }}>
        {DASHBOARD_SECTIONS.map((section) => <Button
          key={section.id}
          size="small"
          variant="outlined"
          disabled={section.id === 'dashboard-comparison' && !indicators}
          aria-controls={section.id}
          onClick={() => navigateToDashboardSection(section.id)}
          sx={{ minHeight: 44, px: 2, borderRadius: 6, bgcolor: 'background.paper', '&:hover': { bgcolor: '#fff1e6' } }}
        >{section.label}</Button>)}
      </Stack>

      <Box component="section" id="dashboard-overview" aria-labelledby="current-status-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(0) }}>
        <Typography id="current-status-title" component="h2" variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>Situação atual e pendências</Typography>
        {summaryError && <StateFeedback kind="error" title={summaryError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
        {summarySections.map((section) => <Box key={section.title} component="section" aria-label={`Indicadores de ${section.title}`} sx={{ mb: 2 }}>
          <Typography component="h3" variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>{section.title}</Typography>
          <Grid container spacing={2}>
            {section.cards.map((card) => <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}><StatCard {...card} loading={summaryLoading} /></Grid>)}
          </Grid>
        </Box>)}
        {summaryLoading && !summarySections.length && <Grid container spacing={2}>
          {[1, 2, 3, 4].map((index) => <Grid key={index} size={{ xs: 12, sm: 6, xl: 3 }}><StatCard title="Carregando indicador" value="—" loading /></Grid>)}
        </Grid>}
        {summary && <Typography variant="caption" color="text.secondary">Atualizado em {formatDateTime(summary.generatedAt)}.</Typography>}
      </Box>

      <Box component="section" aria-labelledby="period-indicators-title" sx={{ mb: 3, ...sectionEntrance(70) }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.5, mb: 1.5 }}>
          <Typography id="period-indicators-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Indicadores realizados</Typography>
          <Typography variant="body2" color="text.secondary">{formattedAppliedPeriod} · {vehicleOptions.find((option) => option.value === appliedFilters.vehicleId)?.label ?? 'Veículo selecionado'}</Typography>
        </Stack>
        {periodSections.map((section) => <Box key={section.title} component="section" aria-label={`Indicadores de ${section.title}`} sx={{ mb: 2 }}>
          <Typography component="h3" variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>{section.title}</Typography>
          <Grid container spacing={2}>
            {section.cards.map((card) => <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}><StatCard {...card} loading={indicatorsLoading} /></Grid>)}
          </Grid>
        </Box>)}
        {indicatorsLoading && !periodSections.length && <Grid container spacing={2}>
          {[1, 2, 3, 4].map((index) => <Grid key={index} size={{ xs: 12, sm: 6, xl: 3 }}><StatCard title="Carregando indicador" value="—" loading /></Grid>)}
        </Grid>}
      </Box>

      <Grid component="section" id="dashboard-charts" aria-label="Gráficos principais" tabIndex={-1} container spacing={2} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(100) }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper component="section" aria-labelledby="trips-period-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="trips-period-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Viagens por período</Typography>
            <Typography variant="body2" color="text.secondary">Viagens concluídas · {formattedAppliedPeriod}</Typography>
            {indicatorsLoading ? <StateFeedback kind="loading" title="Carregando viagens por período..." /> : indicatorsError ? null : <>
              <Box role="img" aria-label="Gráfico de viagens concluídas por período; os valores também estão na tabela abaixo.">
                <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de viagens..." />}>
                  <BarChart height={250} xAxis={[{ data: tripPeriodRows.map((row) => row.label), scaleType: 'band', label: indicators?.activityBucket === 'day' ? 'Dia' : 'Mês' }]} yAxis={[{ label: 'Viagens' }]} series={[{ data: tripPeriodRows.map((row) => row.trips), label: 'Viagens', color: '#FF6B00', valueFormatter: (value) => `${value ?? 0} viagens` }]} margin={{ left: 52, right: 18, top: 24, bottom: 48 }} />
                </Suspense>
              </Box>
              <ChartDataTable title="Dados do gráfico de viagens por período" headers={['Período', 'Dias', 'Viagens']} rows={tripPeriodRows.map((row) => [row.label, row.days, row.trips])} />
            </>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper component="section" aria-labelledby="fleet-distribution-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="fleet-distribution-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Situação da frota</Typography>
            <Typography variant="body2" color="text.secondary">Distribuição atual dos veículos</Typography>
            {summaryLoading ? <StateFeedback kind="loading" title="Carregando situação da frota..." /> : summaryError ? null : <>
              <Box sx={{ position: 'relative', width: 240, maxWidth: '100%', mx: 'auto' }}>
                <Box role="img" aria-label={`Gráfico de situação da frota: ${fleetStatusRows.map(({ label, count }) => `${count} ${label.toLowerCase()}`).join(', ')}.`}>
                  <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de situação..." />}><PieChart height={230} series={[{ data: fleetStatusRows.map((row) => ({ id: row.key, value: row.count, label: row.label, color: row.color })), innerRadius: 58, outerRadius: 88, paddingAngle: 2, cornerRadius: 3, valueFormatter: (item) => `${item.value} veículos` }]} hideLegend /></Suspense>
                </Box>
                <Stack aria-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', alignItems: 'center', justifyContent: 'center' }}><Typography variant="h5" sx={{ fontWeight: 700 }}>{summary?.fleet.total ?? 0}</Typography><Typography variant="caption" color="text.secondary">veículos</Typography></Stack>
              </Box>
              <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>{fleetStatusRows.map((row) => <Box component="li" key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box aria-hidden="true" sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: row.color }} /><Typography variant="body2" sx={{ flex: 1 }}>{row.label}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{row.count}</Typography></Box>)}</Stack>
            </>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Paper component="section" aria-labelledby="trips-vehicle-title" variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography id="trips-vehicle-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Viagens por veículo</Typography>
            <Typography variant="body2" color="text.secondary">Comparação no período selecionado.</Typography>
            {indicatorsLoading ? <StateFeedback kind="loading" title="Carregando indicadores por veículo..." /> : indicatorsError ? null : <>
              <Box role="img" aria-label="Gráfico de viagens por veículo; os mesmos valores estão disponíveis na tabela logo abaixo."><Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico por veículo..." />}><BarChart layout="horizontal" height={Math.max(260, tripVehicleRows.length * 22)} xAxis={[{ label: 'Viagens' }]} yAxis={[{ data: tripVehicleRows.map((row) => row.label), scaleType: 'band', label: 'Veículo' }]} series={[{ data: tripVehicleRows.map((row) => row.trips), label: 'Viagens', color: '#b94700', valueFormatter: (value) => `${value ?? 0} viagens` }]} margin={{ left: 110, right: 22, top: 20, bottom: 38 }} /></Suspense></Box>
              <ChartDataTable title="Dados do gráfico de viagens por veículo" headers={['Veículo', 'Viagens']} rows={tripVehicleRows.map((row) => [row.label, row.trips])} />
            </>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper component="section" aria-labelledby="fuel-chart-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="fuel-chart-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Combustível</Typography>
            <Typography variant="body2" color="text.secondary">Gasto com abastecimentos vigentes · {formattedAppliedPeriod}</Typography>
            {indicatorsLoading ? <StateFeedback kind="loading" title="Carregando histórico de combustível..." /> : indicatorsError ? null : <>
              <Box role="img" aria-label="Gráfico do gasto com combustível por período; os valores estão na tabela abaixo."><Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de combustível..." />}><BarChart height={210} xAxis={[{ data: fuelPeriodRows.map((row) => row.label), scaleType: 'band', label: indicators?.activityBucket === 'day' ? 'Dia' : 'Mês' }]} yAxis={[{ label: 'Reais' }]} series={[{ data: fuelPeriodRows.map((row) => row.cost), label: 'Gasto (R$)', color: '#ff9b54', valueFormatter: (value) => formatCurrency(value ?? 0) }]} margin={{ left: 58, right: 16, top: 20, bottom: 42 }} /></Suspense></Box>
              <ChartDataTable title="Dados do gráfico de combustível por período" headers={['Período', 'Gasto']} rows={fuelPeriodRows.map((row) => [row.label, formatCurrency(row.cost)])} />
            </>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper component="section" aria-labelledby="maintenance-chart-title" variant="outlined" sx={{ height: '100%', p: 2.5, borderRadius: 2 }}>
            <Typography id="maintenance-chart-title" component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>Manutenções</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Ordens registradas no período selecionado</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6 }}><Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f0fdf4', borderColor: '#dcfce7' }}><Typography variant="h6" sx={{ color: '#166534', fontWeight: 700 }}>{indicatorsLoading ? '—' : formatNumber(indicators?.totals.preventiveMaintenanceOrdersOpened ?? 0)}</Typography><Typography variant="body2" sx={{ color: '#166534' }}>Preventivas</Typography></Paper></Grid>
              <Grid size={{ xs: 6 }}><Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fffbeb', borderColor: '#fef3c7' }}><Typography variant="h6" sx={{ color: '#92400e', fontWeight: 700 }}>{indicatorsLoading ? '—' : formatNumber(indicators?.totals.correctiveMaintenanceOrdersOpened ?? 0)}</Typography><Typography variant="body2" sx={{ color: '#92400e' }}>Corretivas</Typography></Paper></Grid>
            </Grid>
            {indicatorsError && <Typography variant="body2" color="error" sx={{ mt: 1 }}>{indicatorsError}</Typography>}
          </Paper>
        </Grid>
      </Grid>

      <Box component="section" id="dashboard-history" aria-labelledby="history-indicators-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(140) }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.5, mb: 1.5 }}>
          <Typography id="history-indicators-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Histórico da operação</Typography>
          <Typography variant="body2" color="text.secondary">Eventos registrados no período · {formattedAppliedPeriod}</Typography>
        </Stack>
        {indicatorsError && <StateFeedback kind="error" title={indicatorsError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
        {indicatorsLoading ? <StateFeedback kind="loading" title="Carregando histórico da operação..." /> : indicators && <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}><TrendChart title="Manutenções abertas e concluídas" data={historyRows} series={[
            { label: 'Abertas', color: '#FF6B00', values: historyRows.map((row) => row.maintenanceOpened) },
            { label: 'Concluídas', color: '#2e7d32', values: historyRows.map((row) => row.maintenanceClosed) },
          ]} /></Grid>
          <Grid size={{ xs: 12, lg: 6 }}><TrendChart title="Solicitações de viagem" data={historyRows} series={[
            { label: 'Criadas', color: '#FF6B00', values: historyRows.map((row) => row.requestsCreated) },
            { label: 'Aprovadas', color: '#2e7d32', values: historyRows.map((row) => row.requestsApproved) },
            { label: 'Rejeitadas', color: '#d32f2f', values: historyRows.map((row) => row.requestsRejected) },
            { label: 'Agendadas', color: '#1976d2', values: historyRows.map((row) => row.requestsScheduled) },
            { label: 'Canceladas', color: '#757575', values: historyRows.map((row) => row.requestsCanceled) },
          ]} /></Grid>
          <Grid size={{ xs: 12, lg: 6 }}><TrendChart title="Eventos de multas" data={historyRows} series={[
            { label: 'Registradas', color: '#FF6B00', values: historyRows.map((row) => row.finesRegistered) },
            { label: 'Pagas', color: '#2e7d32', values: historyRows.map((row) => row.finesPaid) },
            { label: 'Contestadas', color: '#ed6c02', values: historyRows.map((row) => row.finesContested) },
          ]} /></Grid>
          <Grid size={{ xs: 12, lg: 6 }}><TrendChart title={appliedFilters.vehicleId ? 'Atividade de motoristas · toda a frota' : 'Atividade de motoristas'} data={historyRows} series={[
            { label: 'Cadastros', color: '#FF6B00', values: historyRows.map((row) => row.driversCreated) },
            { label: 'Mudanças de situação', color: '#1976d2', values: historyRows.map((row) => row.driversStatusChanged) },
          ]} /></Grid>
          <Grid size={{ xs: 12, lg: 6 }}><TrendChart title="Documentos de veículos" data={historyRows} series={[
            { label: 'Registrados', color: '#FF6B00', values: historyRows.map((row) => row.documentsRegistered) },
            { label: 'Renovados', color: '#2e7d32', values: historyRows.map((row) => row.documentsRenewed) },
          ]} /></Grid>
        </Grid>}
      </Box>

      {indicators && <Box component="section" id="dashboard-comparison" aria-labelledby="comparison-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(180) }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 0.5, mb: 1.5 }}>
          <Typography id="comparison-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Comparação com o período anterior</Typography>
          {comparisonIndicators && <Typography variant="body2" color="text.secondary">Intervalo anterior com a mesma duração: {formatDate(comparisonIndicators.period.from)} a {formatDate(shiftDate(comparisonIndicators.period.to, -1))}</Typography>}
        </Stack>
        {comparisonError ? (
          <StateFeedback
            kind="error"
            title="Não foi possível carregar a comparação"
            description={comparisonError}
            actionLabel="Tentar novamente"
            onAction={() => setRefreshVersion((value) => value + 1)}
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
            const description = item.currency ? `${delta > 0 ? '+' : ''}${formatCurrency(delta)} em relação ao período anterior` : `${delta > 0 ? '+' : ''}${formatNumber(delta)}${item.suffix ?? ''} em relação ao período anterior`
            const value = item.currency ? formatCurrency(item.current) : `${formatNumber(item.current)}${item.suffix ?? ''}`
            return <Grid key={item.id} size={{ xs: 12, sm: 6, xl: 3 }} sx={dashboardCardMotion}><StatCard title={item.title} value={value} description={description} /></Grid>
          })}
        </Grid>
        ) : null}
      </Box>}

      <Box component="section" id="dashboard-vehicles" aria-labelledby="vehicle-indicators-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(220) }}>
        <Typography id="vehicle-indicators-title" component="h2" variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>Detalhamento por veículo</Typography>
        <DataTable
          caption="Indicadores realizados por veículo no período selecionado"
          columns={VEHICLE_COLUMNS}
          rows={indicators?.vehicles ?? []}
          rowKey={(row) => row.vehicleId}
          minWidth={1500}
          busy={indicatorsLoading}
          loadingContent={<StateFeedback kind="loading" title="Carregando indicadores por veículo..." />}
          emptyContent="Nenhum veículo com movimento no período selecionado."
        />
      </Box>

      <Box component="section" id="dashboard-maintenance" aria-labelledby="upcoming-maintenance-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(260) }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography id="upcoming-maintenance-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Próximas manutenções</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Ordens abertas ou em andamento com previsão registrada.</Typography>
          {maintenanceError && <StateFeedback kind="error" title={maintenanceError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
          {!maintenanceError && <DataTable caption="Próximas manutenções previstas" columns={MAINTENANCE_COLUMNS} rows={upcomingMaintenance} rowKey={(row) => row.id} minWidth={520} busy={maintenanceLoading} loadingContent={<StateFeedback kind="loading" title="Carregando próximas manutenções..." />} emptyContent="Não há ordens abertas com previsão futura registrada." />}
        </Paper>
      </Box>

      <Box component="section" id="dashboard-schedule" aria-labelledby="future-trips-title" tabIndex={-1} sx={{ mb: 3, scrollMarginTop: 10, ...sectionEntrance(300) }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1, mb: 1.5 }}>
          <Box>
            <Typography id="future-trips-title" component="h2" variant="h6" sx={{ fontWeight: 700 }}>Viagens agendadas</Typography>
            <Typography variant="body2" color="text.secondary">Agenda registrada para {formattedFuturePeriod}; não é uma estimativa de viagens ou custos. O filtro de veículo acima também se aplica aqui.</Typography>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle2" color="primary.dark" sx={{ fontWeight: 700 }} aria-live="polite">
              {scheduledLoading ? 'Consultando agenda...' : `${filteredScheduledTrips.length} ${filteredScheduledTrips.length === 1 ? 'viagem agendada' : 'viagens agendadas'}`}
            </Typography>
            <ToggleButtonGroup exclusive value={futureDays} onChange={(_event, value: number | null) => { if (value) setFutureDays(value) }} aria-label="Período das viagens futuras">
              {FUTURE_PERIODS.map((days) => <ToggleButton key={days} value={days} sx={{ minHeight: 44 }}>{days} dias</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
        </Stack>
        {scheduledError && <StateFeedback kind="error" title={scheduledError} actionLabel="Tentar novamente" onAction={() => setRefreshVersion((value) => value + 1)} />}
        {!scheduledError && <DataTable
          caption="Viagens agendadas no período futuro"
          columns={SCHEDULED_TRIP_COLUMNS}
          rows={filteredScheduledTrips}
          rowKey={(row) => row.id}
          minWidth={820}
          busy={scheduledLoading}
          loadingContent={<StateFeedback kind="loading" title="Carregando viagens agendadas..." />}
          emptyContent="Não há viagens agendadas nesse período e para esse veículo."
        />}
      </Box>

    </Box>
  )
}
