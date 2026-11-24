import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  AssignmentLate,
  Build,
  Description,
  DirectionsCar,
  EventAvailable,
  LocalGasStation,
  LocalShipping,
  MedicalServices,
  Route,
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
import {
  DASHBOARD_MAX_PERIOD_DAYS,
  PENDING_VALIDATION_INDICATORS,
  canAccessDashboard,
  type DashboardPeriodPreset,
  type VehicleIndicators,
} from '../../../types/dashboard.ts'
import {
  FLEET_STATUS_SEGMENTS,
  buildDocumentsAlertPath,
  formatCurrency,
  formatDocumentsAlertCopy,
  formatInclusivePeriodLabel,
  formatNullableMeasure,
  formatNumber,
  formatSafeCalendarDate,
} from './gestorDashboardData.ts'

const BarChart = lazy(() => import('@mui/x-charts/BarChart').then(({ BarChart: chart }) => ({ default: chart })))
const PieChart = lazy(() => import('@mui/x-charts/PieChart').then(({ PieChart: chart }) => ({ default: chart })))

const QUICK_PERIODS: readonly { id: Exclude<DashboardPeriodPreset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: '7days', label: '7 dias' },
  { id: '30days', label: '30 dias' },
  { id: '6months', label: '6 meses' },
]

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

const VEHICLE_INDICATORS_COLUMNS: readonly DataTableColumn<VehicleIndicators>[] = [
  { key: 'plate', header: 'Veículo', render: (row) => row.licensePlate },
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
  { key: 'maintenance', header: 'Manutenção', align: 'right', render: (row) => formatCurrency(row.maintenanceCost) },
]

/** Dashboard analítico gerencial integrado às APIs de resumo e indicadores do PostgreSQL. */
export default function DashboardPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessDashboard(profile)
  const dashboard = useDashboard(api, allowed)
  const [statusAnnouncement, setStatusAnnouncement] = useState('')
  const sevenDaysButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Dashboard da frota — Aratu'
    return () => { document.title = previousTitle }
  }, [])

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

  const documentsCopy = summary ? formatDocumentsAlertCopy(summary.documents) : null

  const situationCards = [
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
      icon: <LocalGasStation />,
      pending: consumptionPending,
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
        formatCurrency(totals.maintenanceCost),
      ]
    : undefined

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', ...DASHBOARD_CONTROLS_SX }}>
      <PageHeader
        breadcrumbs={['Início', 'Gestão', 'Dashboard']}
        title="Dashboard"
        titleVariant="h4"
        description="Situação atual da frota e indicadores operacionais por período."
        actions={(
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
            {dashboard.period === 'custom' && (
              <>
                <FormField
                  label="Data inicial (inclusiva)"
                  type="date"
                  value={dashboard.from}
                  onChange={dashboard.setFrom}
                  error={!dashboard.validation.valid ? dashboard.validation.fromError : undefined}
                  helperText="Fuso America/Maceio (AAAA-MM-DD)"
                  sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
                />
                <FormField
                  label="Data final (inclusiva)"
                  type="date"
                  value={dashboard.to}
                  onChange={dashboard.setTo}
                  error={!dashboard.validation.valid ? dashboard.validation.toError : undefined}
                  helperText={`Máximo de ${DASHBOARD_MAX_PERIOD_DAYS} dias no intervalo`}
                  sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
                />
              </>
            )}
            <FormSelect
              label="Veículo"
              value={dashboard.vehicleId}
              onChange={dashboard.setVehicleId}
              options={vehicleOptions}
              emptyLabel="Todos os veículos"
              displayEmpty
              disabled={dashboard.vehiclesLoading}
              helperText={dashboard.vehiclesLoading ? 'Carregando veículos cadastrados...' : undefined}
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 } }}
            />
          </FilterBar>

          {dashboard.vehiclesError && (
            <StateFeedback
              kind="partial"
              title="Lista de veículos indisponível para o seletor."
              description={dashboard.vehiclesError}
              actionLabel="Tentar novamente"
              onAction={dashboard.refresh}
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

          <Box component="section" aria-labelledby="fleet-availability-title" sx={{ mb: 3 }}>
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
                onAction={dashboard.refresh}
              />
            ) : (
              <Grid container spacing={2}>
                {situationCards.map((card) => (
                  <Grid key={card.id} size={{ xs: 12, sm: 6, lg: 4 }}>
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
            )}
          </Box>

          {dashboard.validation.valid && (
            <Box component="section" aria-labelledby="fleet-indicators-title" sx={{ mb: 3 }}>
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
                  onAction={dashboard.indicatorsErrorStatus === 404 ? () => dashboard.setVehicleId('') : dashboard.refresh}
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
                      <Grid key={card.id} size={{ xs: 12, sm: 6, xl: 4 }}>
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

                  <Grid container spacing={2} sx={{ mb: 2 }}>
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

                    <Grid size={{ xs: 12, lg: 7 }}>
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
                  </Grid>

                  <Paper component="section" aria-labelledby="vehicle-indicators-table-title" variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
                    <Typography id="vehicle-indicators-table-title" component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Uso, consumo e custo por veículo
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Detalhamento consolidado no período ({formattedPeriodLabel})
                    </Typography>

                    {!dashboard.indicatorsLoading && hasTripActivity && indicators && (
                      <Box
                        role="img"
                        aria-label="Gráfico de viagens concluídas por veículo; todos os valores detalhados estão na tabela logo abaixo."
                        sx={{ width: '100%', minWidth: 0, overflowX: 'auto', mb: 2 }}
                      >
                        <Suspense fallback={<StateFeedback kind="loading" title="Carregando gráfico de viagens..." />}>
                          <BarChart
                            layout="horizontal"
                            height={Math.max(220, indicators.vehicles.length * 36)}
                            xAxis={[{ label: 'Viagens concluídas' }]}
                            yAxis={[{ data: indicators.vehicles.map((v) => v.licensePlate), scaleType: 'band', label: 'Placa' }]}
                            series={[{
                              data: indicators.vehicles.map((v) => v.tripsCount),
                              label: 'Viagens',
                              color: '#b94700',
                              valueFormatter: (value) => `${value ?? 0} viagens`,
                            }]}
                            margin={{ left: 96, right: 20, top: 20, bottom: 38 }}
                          />
                        </Suspense>
                      </Box>
                    )}

                    <DataTable
                      caption="Indicadores operacionais por veículo no período selecionado"
                      columns={VEHICLE_INDICATORS_COLUMNS}
                      rows={indicators?.vehicles ?? []}
                      rowKey={(row) => row.vehicleId}
                      busy={dashboard.indicatorsLoading}
                      minWidth={780}
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
            <Box component="section" aria-labelledby="svo-summary-title" sx={{ mt: 2 }}>
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
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                      <StatCard
                        title="Ordens SVO em andamento"
                        value={summary.svo.ordersInProgress}
                        description="Retrato atual da operação SVO"
                        icon={<MedicalServices />}
                        loading={dashboard.summaryLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
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
                    <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                      <StatCard
                        title="Ordens SVO abertas"
                        value={indicators.svo.ordersOpened}
                        description={`No período (${formattedPeriodLabel})`}
                        icon={<MedicalServices />}
                        loading={dashboard.indicatorsLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
                      <StatCard
                        title="Ordens SVO coletadas"
                        value={indicators.svo.ordersCollected}
                        description="Com coleta registrada no período"
                        icon={<LocalShipping />}
                        loading={dashboard.indicatorsLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, lg: 6 }}>
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
        </>
      )}
    </Box>
  )
}
