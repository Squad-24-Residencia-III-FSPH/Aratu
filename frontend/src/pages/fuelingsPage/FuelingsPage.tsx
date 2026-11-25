import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditOutlined from '@mui/icons-material/EditOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import { accessibleControls } from '../../components/ui/accessibleControls'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import { canAccessFuelings } from '../../fuelings/fuelingAccess'
import { FUEL_TYPE_LABELS } from '../../fuelings/fuelingTypes'
import type { FuelingFilters, FuelingList, FuelingVersion } from '../../fuelings/fuelingTypes'
import { listDrivers } from '../../services/driversService'
import { getFuelingDetail, listFuelings } from '../../services/fuelingsService'
import { listVehicles } from '../../services/vehiclesService'
import type { Driver } from '../../drivers/driverTypes'
import { VEHICLES_PATH } from '../../vehicles/vehicleAccess'
import type { Vehicle } from '../../vehicles/vehicleTypes'
import { formatCalendarDate, formatDateTime } from '../../utils/dates'
import FuelingFormDialog from './FuelingFormDialog'
import type { FuelingDetail } from '../../fuelings/fuelingTypes'
import { formatOperationalDateTime, operationalDayEndExclusive, operationalDayStart } from '../../time/operationalTime'

const PAGE_SIZE = 20
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

function formatDate(value: string): string {
  return formatOperationalDateTime(value)
}

function snapshotPlate(fueling: FuelingVersion): string {
  const plate = fueling.vehicleSnapshot?.licensePlate
  return typeof plate === 'string' && plate ? plate : `Veículo #${fueling.vehicleId}`
}

function describeScope(
  vehicleId: string,
  driverId: string,
  from: string,
  to: string,
  vehicles: readonly Vehicle[],
  drivers: readonly Driver[],
): string {
  const parts: string[] = []
  if (vehicleId) {
    const vehicle = vehicles.find((item) => item.id === vehicleId)
    parts.push(`Veículo ${vehicle ? vehicle.licensePlate : `#${vehicleId}`}`)
  } else {
    parts.push('Todos os veículos')
  }
  if (driverId) {
    const driver = drivers.find((item) => item.id === driverId)
    parts.push(`Motorista ${driver ? driver.name : `#${driverId}`}`)
  } else {
    parts.push('Todos os motoristas')
  }
  if (from && to) {
    parts.push(from === to ? `Em ${formatCalendarDate(from)}` : `De ${formatCalendarDate(from)} até ${formatCalendarDate(to)}`)
  } else if (from) {
    parts.push(`A partir de ${formatCalendarDate(from)}`)
  } else if (to) {
    parts.push(`Até ${formatCalendarDate(to)}`)
  } else {
    parts.push('Todo o período')
  }
  return parts.join(' · ')
}

const COLUMNS: readonly DataTableColumn<FuelingVersion>[] = [
  { key: 'vehicle', header: 'Veículo', width: 150, render: snapshotPlate },
  { key: 'driver', header: 'Motorista', width: 180, render: (fueling) => fueling.driverSnapshot?.name ?? 'Não informado' },
  { key: 'date', header: 'Data', width: 170, render: (fueling) => formatDateTime(fueling.fueledAt) },
  { key: 'fuel', header: 'Combustível', width: 145, render: (fueling) => FUEL_TYPE_LABELS[fueling.fuelType] },
  { key: 'liters', header: 'Litros', align: 'right', width: 110, render: (fueling) => `${NUMBER.format(Number(fueling.liters))} L` },
  { key: 'value', header: 'Valor', align: 'right', width: 130, render: (fueling) => CURRENCY.format(Number(fueling.totalValue)) },
  { key: 'odometer', header: 'Quilometragem', align: 'right', width: 140, render: (fueling) => `${NUMBER.format(fueling.odometerKm)} km` },
  { key: 'station', header: 'Posto', width: 180, render: (fueling) => fueling.station ?? 'Não informado' },
]

interface ConfirmedFuelingSnapshot {
  scopeLabel: string
  data: FuelingList
}

function RouterEmptyVehiclesFeedback() {
  const navigate = useNavigate()
  return (
    <StateFeedback
      kind="empty"
      title="Nenhum veículo disponível"
      description="Cadastre um veículo antes de registrar um abastecimento."
      actionLabel="Ir para Veículos"
      onAction={() => navigate(VEHICLES_PATH)}
    />
  )
}

function EmptyVehiclesFeedback() {
  const inRouter = useInRouterContext()
  if (inRouter) return <RouterEmptyVehiclesFeedback />
  return (
    <StateFeedback
      kind="empty"
      title="Nenhum veículo disponível"
      description="Cadastre um veículo antes de registrar um abastecimento."
      actionLabel="Ir para Veículos"
      onAction={() => { window.location.hash = `#${VEHICLES_PATH}` }}
    />
  )
}

/** Lista e registra abastecimentos conforme os contratos da API FROTA-64. */
export default function FuelingsPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessFuelings(profile)
  const theme = useTheme()
  const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(allowed)
  const [vehiclesError, setVehiclesError] = useState('')
  const [vehiclesRefreshToken, setVehiclesRefreshToken] = useState(0)

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [driversLoading, setDriversLoading] = useState(allowed)
  const [driversError, setDriversError] = useState('')
  const [driversRefreshToken, setDriversRefreshToken] = useState(0)

  const [confirmed, setConfirmed] = useState<ConfirmedFuelingSnapshot | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(allowed)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState<FuelingVersion | null>(null)
  const [details, setDetails] = useState<{ detail: FuelingDetail | null; error: string; loading: boolean } | null>(null)
  const [notice, setNotice] = useState('')

  const listSequenceRef = useRef(0)
  const vehiclesSequenceRef = useRef(0)
  const driversSequenceRef = useRef(0)
  const registerButtonRef = useRef<HTMLButtonElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Abastecimentos — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}`,
  })), [vehicles])
  const driverOptions = useMemo(() => drivers.map((driver) => ({ value: driver.id, label: driver.name })), [drivers])

  const dateRangeError = useMemo(() => {
    if (from && to && from > to) {
      return 'A data inicial (De) não pode ser posterior à data final (Até).'
    }
    return ''
  }, [from, to])

  const currentScopeLabel = useMemo(
    () => describeScope(vehicleId, driverId, from, to, vehicles, drivers),
    [driverId, drivers, from, to, vehicleId, vehicles],
  )

  useEffect(() => {
    if (!allowed) return
    const sequence = ++vehiclesSequenceRef.current
    let current = true
    listVehicles(api)
      .then((vehicleList) => {
        if (!current || vehiclesSequenceRef.current !== sequence) return
        setVehicles(vehicleList)
        setVehiclesError('')
      })
      .catch((loadError: unknown) => {
        if (!current || vehiclesSequenceRef.current !== sequence) return
        setVehiclesError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os veículos.')
      })
      .finally(() => {
        if (current && vehiclesSequenceRef.current === sequence) {
          setVehiclesLoading(false)
        }
      })
    return () => { current = false }
  }, [allowed, api, vehiclesRefreshToken])

  useEffect(() => {
    if (!allowed) return
    const sequence = ++driversSequenceRef.current
    let current = true
    listDrivers(api)
      .then((driverList) => {
        if (!current || driversSequenceRef.current !== sequence) return
        setDrivers(driverList)
        setDriversError('')
      })
      .catch((loadError: unknown) => {
        if (!current || driversSequenceRef.current !== sequence) return
        setDriversError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os motoristas.')
      })
      .finally(() => {
        if (current && driversSequenceRef.current === sequence) {
          setDriversLoading(false)
        }
      })
    return () => { current = false }
  }, [allowed, api, driversRefreshToken])

  const reloadVehicles = useCallback(() => {
    setVehiclesLoading(true)
    setVehiclesError('')
    setVehiclesRefreshToken((current) => current + 1)
  }, [])

  const reloadDrivers = useCallback(() => {
    setDriversLoading(true)
    setDriversError('')
    setDriversRefreshToken((current) => current + 1)
  }, [])

  const reloadList = useCallback(() => {
    setLoading(true)
    setError('')
    setRefreshToken((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!allowed || dateRangeError) return
    const sequence = ++listSequenceRef.current
    const controller = new AbortController()
    let current = true

    const filters: FuelingFilters = {
      ...(vehicleId ? { vehicleId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(from ? { from: operationalDayStart(from) } : {}),
      ...(to ? { to: operationalDayEndExclusive(to) } : {}),
      page,
      pageSize: PAGE_SIZE,
    }

    listFuelings(api, filters, controller.signal)
      .then((result) => {
        if (!current || listSequenceRef.current !== sequence) return
        setError('')
        setConfirmed({ scopeLabel: currentScopeLabel, data: result })
        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
        }
      })
      .catch((requestError: unknown) => {
        if (!current || controller.signal.aborted || listSequenceRef.current !== sequence) return
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os abastecimentos.')
      })
      .finally(() => {
        if (current && !controller.signal.aborted && listSequenceRef.current === sequence) {
          setLoading(false)
        }
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [allowed, api, currentScopeLabel, dateRangeError, driverId, from, page, refreshToken, to, vehicleId])

  function changeFilter(setter: (value: string) => void, value: string) {
    setError('')
    setLoading(true)
    setter(value)
    setPage(1)
  }

  function changePage(value: number) {
    setError('')
    setLoading(true)
    setPage(value)
  }

  function clearFilters() {
    setError('')
    setLoading(true)
    setVehicleId('')
    setDriverId('')
    setFrom('')
    setTo('')
    setPage(1)
    setRefreshToken((current) => current + 1)
  }

  function handleSaved(saved: FuelingVersion, customMessage?: string) {
    const wasCorrection = correctionTarget !== null
    setFormOpen(false)
    setCorrectionTarget(null)
    setNotice(
      customMessage ?? (
        wasCorrection
          ? 'Correção registrada. As versões anteriores foram preservadas.'
          : `Abastecimento #${saved.id} registrado com sucesso.`
      ),
    )
    setPage(1)
    setError('')
    setLoading(true)
    setRefreshToken((current) => current + 1)
    requestAnimationFrame(() => noticeRef.current?.focus())
  }

  function handleCancelForm() {
    setFormOpen(false)
    setCorrectionTarget(null)
    requestAnimationFrame(() => registerButtonRef.current?.focus())
  }

  async function openDetails(fueling: FuelingVersion): Promise<void> {
    setDetails({ detail: null, error: '', loading: true })
    try { setDetails({ detail: await getFuelingDetail(api, fueling.id), error: '', loading: false }) }
    catch (requestError) { setDetails({ detail: null, error: requestError instanceof Error ? requestError.message : 'Não foi possível carregar o histórico.', loading: false }) }
  }

  const filtersActive = Boolean(vehicleId || driverId || from || to)
  const effectiveLoading = loading && !dateRangeError
  const queryError = dateRangeError || error
  const totalsAvailable = !effectiveLoading && !queryError && confirmed !== null

  const catalogFailureBanner = useMemo(() => {
    if (vehiclesError && driversError) {
      return {
        title: 'Não foi possível carregar os catálogos de veículos e motoristas.',
        description: `${vehiclesError} ${driversError}`,
        onAction: () => {
          reloadVehicles()
          reloadDrivers()
        },
      }
    }
    if (vehiclesError) {
      return {
        title: 'Não foi possível carregar o catálogo de veículos.',
        description: `${vehiclesError} O filtro por motorista e o histórico permanecem disponíveis.`,
        onAction: reloadVehicles,
      }
    }
    if (driversError) {
      return {
        title: 'Não foi possível carregar o catálogo de motoristas.',
        description: `${driversError} O filtro por veículo e o registro sem motorista seguem disponíveis.`,
        onAction: reloadDrivers,
      }
    }
    return null
  }, [driversError, reloadDrivers, reloadVehicles, vehiclesError])

  const totalSpentDisplay = effectiveLoading
    ? '—'
    : totalsAvailable
      ? CURRENCY.format(Number(confirmed.data.totalValue))
      : 'Indisponível'

  const totalLitersDisplay = effectiveLoading
    ? '—'
    : totalsAvailable
      ? `${NUMBER.format(Number(confirmed.data.totalLiters))} L`
      : 'Indisponível'

  const totalsScopeHelper = effectiveLoading
    ? `Consultando: ${currentScopeLabel}`
    : totalsAvailable
      ? `Recorte confirmado: ${confirmed.scopeLabel}`
      : 'Totais indisponíveis para o filtro atual até resposta válida.'

  return (
    <Box sx={{ minWidth: 0, ...accessibleControls }}>
      <PageHeader
        title="Abastecimentos"
        breadcrumbs={['Início', 'Abastecimentos']}
        sx={{ mb: 3, minWidth: 0 }}
        titleSx={{ fontSize: { xs: '1.35rem', sm: '1.75rem' }, overflowWrap: 'anywhere' }}
        actions={allowed ? (
          <Button
            ref={registerButtonRef}
            type="button"
            variant="contained"
            startIcon={<AddIcon aria-hidden="true" />}
            onClick={() => {
              setCorrectionTarget(null)
              setFormOpen(true)
            }}
            disabled={vehiclesLoading || Boolean(vehiclesError) || vehicles.length === 0}
            sx={{ minHeight: 44 }}
          >
            Registrar Abastecimento
          </Button>
        ) : undefined}
      />

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Seu perfil não tem permissão para consultar abastecimentos."
        />
      )}

      {allowed && (
        <>
          <Box ref={noticeRef} tabIndex={-1} role="status" aria-live="polite">
            {notice && (
              <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>
                {notice}
              </Alert>
            )}
          </Box>

          {catalogFailureBanner && (
            <StateFeedback
              kind="partial"
              title={catalogFailureBanner.title}
              description={catalogFailureBanner.description}
              actionLabel="Tentar novamente"
              onAction={catalogFailureBanner.onAction}
            />
          )}

          {!vehiclesLoading && !vehiclesError && vehicles.length === 0 && (
            <EmptyVehiclesFeedback />
          )}

          <Box component="section" aria-label="Indicadores do período filtrado" aria-busy={effectiveLoading ? 'true' : undefined} sx={{ mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Total gasto no período filtrado</Typography>
                  <Typography component="p" variant="h5" sx={{ mt: 0.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {totalSpentDisplay}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {totalsScopeHelper}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">Total de litros no período filtrado</Typography>
                  <Typography component="p" variant="h5" sx={{ mt: 0.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {totalLitersDisplay}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {totalsScopeHelper}
                  </Typography>
                </CardContent>
              </Card>
            </Stack>
          </Box>

          <FilterBar label="Filtros de abastecimentos">
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 190px' }, width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
              <FormSelect
                label="Veículo"
                value={vehicleId}
                onChange={(value) => changeFilter(setVehicleId, value)}
                options={vehicleOptions}
                emptyLabel="Todos os veículos"
                disabled={Boolean(vehiclesError)}
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 190px' }, width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
              <FormSelect
                label="Motorista"
                value={driverId}
                onChange={(value) => changeFilter(setDriverId, value)}
                options={driverOptions}
                emptyLabel="Todos os motoristas"
                disabled={Boolean(driversError)}
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 170px' }, width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
              <FormField
                label="De"
                type="date"
                value={from}
                error={dateRangeError ? 'Revise a data inicial.' : undefined}
                onChange={(value) => changeFilter(setFrom, value)}
              />
            </Box>
            <Box sx={{ flex: { xs: '0 0 auto', md: '1 1 170px' }, width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
              <FormField
                label="Até"
                type="date"
                value={to}
                error={dateRangeError ? 'Revise a data final.' : undefined}
                onChange={(value) => changeFilter(setTo, value)}
              />
            </Box>
            <Button type="button" variant="outlined" onClick={clearFilters} disabled={!filtersActive} sx={{ minHeight: 44 }}>
              Limpar filtros
            </Button>
          </FilterBar>

          {queryError && (
            <StateFeedback
              kind="error"
              title={dateRangeError ? 'Período de filtro inválido.' : 'Não foi possível carregar os abastecimentos.'}
              description={queryError}
              actionLabel={dateRangeError ? 'Limpar filtros' : 'Tentar novamente'}
              onAction={dateRangeError ? clearFilters : reloadList}
            />
          )}

          {!queryError && (
            <>
              {smallScreen ? (
                <Stack spacing={1.5}>
                  {effectiveLoading ? (
                    <StateFeedback kind="loading" title="Carregando abastecimentos..." />
                  ) : (confirmed?.data.items.length ?? 0) > 0 ? (
                    (confirmed?.data.items ?? []).map((fueling) => (
                      <Card key={fueling.id} variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {snapshotPlate(fueling)} · {CURRENCY.format(Number(fueling.totalValue))}
                          </Typography>
                          <Typography variant="body2">
                            {FUEL_TYPE_LABELS[fueling.fuelType]} · {NUMBER.format(Number(fueling.liters))} L · {formatDate(fueling.fueledAt)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {fueling.driverSnapshot?.name ?? 'Motorista não informado'} · {NUMBER.format(fueling.odometerKm)} km
                          </Typography>
                        </CardContent>
                        <CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                          <Button
                            onClick={() => { void openDetails(fueling) }}
                            startIcon={<HistoryOutlined aria-hidden="true" />}
                            sx={{ minHeight: 48 }}
                          >
                            Histórico
                          </Button>
                          <Button
                            onClick={() => {
                              setCorrectionTarget(fueling)
                              setFormOpen(true)
                            }}
                            disabled={fueling.isAnnulled || !fueling.revision}
                            startIcon={<EditOutlined aria-hidden="true" />}
                            sx={{ minHeight: 48 }}
                          >
                            Corrigir
                          </Button>
                        </CardActions>
                      </Card>
                    ))
                  ) : (
                    <StateFeedback
                      kind="empty"
                      title={filtersActive ? 'Nenhum abastecimento encontrado' : 'Nenhum abastecimento registrado'}
                      description={filtersActive
                        ? 'Ajuste os filtros ou limpe a busca para ver outros registros.'
                        : 'Registre o primeiro abastecimento para acompanhar os gastos da frota.'}
                      actionLabel={filtersActive ? 'Limpar filtros' : undefined}
                      onAction={filtersActive ? clearFilters : undefined}
                      centered
                    />
                  )}
                </Stack>
              ) : (
                <DataTable
                  caption="Abastecimentos registrados"
                  columns={COLUMNS}
                  rows={confirmed?.data.items ?? []}
                  rowKey={(fueling) => fueling.id}
                  busy={effectiveLoading}
                  minWidth={1200}
                  loadingContent={<StateFeedback kind="loading" title="Carregando abastecimentos..." />}
                  emptyContent={(
                    <StateFeedback
                      kind="empty"
                      title={filtersActive ? 'Nenhum abastecimento encontrado' : 'Nenhum abastecimento registrado'}
                      description={filtersActive
                        ? 'Ajuste os filtros ou limpe a busca para ver outros registros.'
                        : 'Registre o primeiro abastecimento para acompanhar os gastos da frota.'}
                      actionLabel={filtersActive ? 'Limpar filtros' : undefined}
                      onAction={filtersActive ? clearFilters : undefined}
                      centered
                    />
                  )}
                  renderActions={(fueling) => (
                    <Stack direction="row" spacing={0.5}>
                      <Button onClick={() => { void openDetails(fueling) }} sx={{ minHeight: 44 }}>
                        Histórico
                      </Button>
                      <Button
                        onClick={() => {
                          setCorrectionTarget(fueling)
                          setFormOpen(true)
                        }}
                        disabled={fueling.isAnnulled || !fueling.revision}
                        sx={{ minHeight: 44 }}
                      >
                        Corrigir
                      </Button>
                    </Stack>
                  )}
                />
              )}
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {confirmed ? `${confirmed.data.total} registro(s) encontrado(s)` : '0 registro(s) encontrado(s)'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    type="button"
                    onClick={() => changePage(Math.max(1, page - 1))}
                    disabled={page <= 1 || effectiveLoading}
                    sx={{ minHeight: 44 }}
                  >
                    Anterior
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Página {page} de {Math.max(1, confirmed?.data.totalPages ?? 1)}
                  </Typography>
                  <Button
                    type="button"
                    onClick={() => changePage(Math.min(confirmed?.data.totalPages ?? 1, page + 1))}
                    disabled={page >= (confirmed?.data.totalPages ?? 1) || effectiveLoading}
                    sx={{ minHeight: 44 }}
                  >
                    Próxima
                  </Button>
                </Box>
              </Box>
            </>
          )}

          {formOpen && (
            <FuelingFormDialog
              api={api}
              reportedBy={session?.nome ?? ''}
              vehicles={vehicleOptions}
              drivers={driverOptions}
              driversLoading={driversLoading}
              driversError={driversError}
              onRetryDrivers={reloadDrivers}
              onSaved={handleSaved}
              onReconcileList={reloadList}
              onCancel={handleCancelForm}
              {...(correctionTarget ? { fueling: correctionTarget } : {})}
            />
          )}
        </>
      )}
      <Dialog open={Boolean(details)} onClose={() => setDetails(null)} fullScreen={smallScreen} fullWidth maxWidth="md" aria-labelledby="fueling-history-title">
        <DialogTitle id="fueling-history-title">Histórico do abastecimento</DialogTitle><DialogContent>
          {details?.loading && <StateFeedback kind="loading" title="Carregando histórico..." />}
          {details?.error && <Alert severity="error">{details.error}</Alert>}
          {details?.detail && <Stack spacing={1.5}>
            <Typography variant="h6">{snapshotPlate(details.detail.fueling)} · {FUEL_TYPE_LABELS[details.detail.fueling.fuelType]}</Typography>
            <Typography variant="body2">{formatDate(details.detail.fueling.fueledAt)} · {NUMBER.format(Number(details.detail.fueling.liters))} L · {CURRENCY.format(Number(details.detail.fueling.totalValue))} · {NUMBER.format(details.detail.fueling.odometerKm)} km</Typography>
            <Typography variant="body2" color="text.secondary">Versão atual: #{details.detail.currentId}. Versões registradas: {details.detail.versions.length}.</Typography>
            {details.detail.events.map((event) => <Card key={event.id} variant="outlined"><CardContent>
              <Typography sx={{ fontWeight: 700 }}>{event.eventType === 'RECORDED' ? 'Registrado' : event.eventType === 'RECTIFIED' ? 'Retificado' : event.eventType === 'ANNULLED' ? 'Anulado' : 'Atualizado'} · {formatDate(event.occurredAt)}</Typography>
              <Typography variant="body2" color="text.secondary">Registro {formatDate(event.registeredAt)} · {event.reportedBy}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{event.reason}</Typography>
              {event.evidenceDescription && <Typography variant="body2">Evidência: {event.evidenceDescription}</Typography>}
            </CardContent></Card>)}
          </Stack>}
        </DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setDetails(null)} sx={{ minHeight: 48 }}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
