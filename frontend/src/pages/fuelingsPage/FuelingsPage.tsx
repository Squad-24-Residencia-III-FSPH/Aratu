import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import { canAccessFuelings } from '../../fuelings/fuelingAccess'
import { FUEL_TYPE_LABELS } from '../../fuelings/fuelingTypes'
import type { FuelingFilters, FuelingVersion } from '../../fuelings/fuelingTypes'
import { listDrivers } from '../../services/driversService'
import { getFuelingDetail, listFuelings } from '../../services/fuelingsService'
import { listVehicles } from '../../services/vehiclesService'
import type { Driver } from '../../drivers/driverTypes'
import type { Vehicle } from '../../vehicles/vehicleTypes'
import FuelingFormDialog from './FuelingFormDialog'
import type { FuelingDetail } from '../../fuelings/fuelingTypes'
import { formatOperationalDateTime, operationalDayEndExclusive, operationalDayStart } from '../../time/operationalTime'

const PAGE_SIZE = 20
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const NUMBER = new Intl.NumberFormat('pt-BR')

function formatDate(value: string): string {
  return formatOperationalDateTime(value)
}

function snapshotPlate(fueling: FuelingVersion): string {
  const plate = fueling.vehicleSnapshot?.licensePlate
  return typeof plate === 'string' && plate ? plate : `Veículo #${fueling.vehicleId}`
}

const COLUMNS: readonly DataTableColumn<FuelingVersion>[] = [
  { key: 'vehicle', header: 'Veículo', width: 150, render: snapshotPlate },
  { key: 'driver', header: 'Motorista', width: 180, render: (fueling) => fueling.driverSnapshot?.name ?? 'Não informado' },
  { key: 'date', header: 'Data', width: 170, render: (fueling) => formatDate(fueling.fueledAt) },
  { key: 'fuel', header: 'Combustível', width: 145, render: (fueling) => FUEL_TYPE_LABELS[fueling.fuelType] },
  { key: 'liters', header: 'Litros', align: 'right', width: 110, render: (fueling) => `${NUMBER.format(Number(fueling.liters))} L` },
  { key: 'value', header: 'Valor', align: 'right', width: 130, render: (fueling) => CURRENCY.format(Number(fueling.totalValue)) },
  { key: 'odometer', header: 'Quilometragem', align: 'right', width: 140, render: (fueling) => `${NUMBER.format(fueling.odometerKm)} km` },
  { key: 'station', header: 'Posto', width: 180, render: (fueling) => fueling.station ?? 'Não informado' },
]

/** Lista e registra abastecimentos conforme os contratos da API FROTA-64. */
export default function FuelingsPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessFuelings(profile)
  const theme = useTheme()
  const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [vehiclesError, setVehiclesError] = useState('')
  const [driversError, setDriversError] = useState('')
  const [items, setItems] = useState<FuelingVersion[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalLiters, setTotalLiters] = useState('0.000')
  const [totalValue, setTotalValue] = useState('0.00')
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState<FuelingVersion | null>(null)
  const [details, setDetails] = useState<{ detail: FuelingDetail | null; error: string; loading: boolean } | null>(null)
  const [notice, setNotice] = useState('')

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({
    value: vehicle.id,
    label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}`,
  })), [vehicles])
  const driverOptions = useMemo(() => drivers.map((driver) => ({ value: driver.id, label: driver.name })), [drivers])

  useEffect(() => {
    if (!allowed) return
    let current = true
    Promise.allSettled([listVehicles(api), listDrivers(api)])
      .then(([vehicleResult, driverResult]) => {
        if (!current) return
        if (vehicleResult.status === 'fulfilled') { setVehicles(vehicleResult.value); setVehiclesError('') }
        else setVehiclesError(vehicleResult.reason instanceof Error ? vehicleResult.reason.message : 'Não foi possível carregar os veículos.')
        if (driverResult.status === 'fulfilled') { setDrivers(driverResult.value); setDriversError('') }
        else setDriversError(driverResult.reason instanceof Error ? driverResult.reason.message : 'Não foi possível carregar os motoristas.')
      })
      .finally(() => { if (current) setOptionsLoading(false) })
    return () => { current = false }
  }, [allowed, api])

  useEffect(() => {
    if (!allowed) return
    let current = true
    const filters: FuelingFilters = {
      ...(vehicleId ? { vehicleId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(from ? { from: operationalDayStart(from) } : {}),
      ...(to ? { to: operationalDayEndExclusive(to) } : {}),
      page,
      pageSize: PAGE_SIZE,
    }
    listFuelings(api, filters)
      .then((result) => {
        if (!current) return
        setError('')
        setItems(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setTotalLiters(result.totalLiters)
        setTotalValue(result.totalValue)
        if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages)
      })
      .catch((requestError: unknown) => {
        if (!current) return
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os abastecimentos.')
        setItems([]); setTotal(0); setTotalPages(0); setTotalLiters('0.000'); setTotalValue('0.00')
      })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [allowed, api, driverId, from, page, refreshToken, to, vehicleId])

  function changeFilter(setter: (value: string) => void, value: string) {
    setLoading(true)
    setItems([]); setTotal(0); setTotalPages(0); setTotalLiters('0.000'); setTotalValue('0.00')
    setter(value)
    setPage(1)
  }

  function changePage(value: number) {
    setLoading(true)
    setPage(value)
  }

  function clearFilters() {
    setLoading(true)
    setItems([]); setTotal(0); setTotalPages(0); setTotalLiters('0.000'); setTotalValue('0.00')
    setVehicleId('')
    setDriverId('')
    setFrom('')
    setTo('')
    setPage(1)
    setRefreshToken((current) => current + 1)
  }

  function handleSaved() {
    setFormOpen(false)
    setCorrectionTarget(null)
    setNotice(correctionTarget ? 'Correção registrada. As versões anteriores foram preservadas.' : 'Abastecimento registrado com sucesso.')
    setPage(1)
    setLoading(true)
    setRefreshToken((current) => current + 1)
  }

  async function openDetails(fueling: FuelingVersion): Promise<void> {
    setDetails({ detail: null, error: '', loading: true })
    try { setDetails({ detail: await getFuelingDetail(api, fueling.id), error: '', loading: false }) }
    catch (requestError) { setDetails({ detail: null, error: requestError instanceof Error ? requestError.message : 'Não foi possível carregar o histórico.', loading: false }) }
  }

  const filtersActive = Boolean(vehicleId || driverId || from || to)

  return (
    <Box>
      <PageHeader
        title="Abastecimentos"
        actions={allowed ? <Button variant="contained" startIcon={<AddIcon aria-hidden="true" />} onClick={() => setFormOpen(true)} disabled={optionsLoading || Boolean(vehiclesError) || vehicles.length === 0} sx={{ minHeight: 48 }}>Registrar Abastecimento</Button> : undefined}
      />

      {!allowed && <StateFeedback kind="forbidden" title="Acesso restrito" description="Seu perfil não tem permissão para consultar abastecimentos." />}
      {allowed && (
        <>
          {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
          {vehiclesError && <Alert severity="error" sx={{ mb: 2 }}>{vehiclesError} O cadastro de abastecimento ficará indisponível até que os veículos possam ser consultados.</Alert>}
          {driversError && <Alert severity="warning" sx={{ mb: 2 }}>Não foi possível carregar a lista de motoristas. Você ainda pode registrar um abastecimento sem vínculo de motorista.</Alert>}
          {!optionsLoading && !vehiclesError && vehicles.length === 0 && <StateFeedback kind="empty" title="Nenhum veículo disponível" description="Cadastre um veículo antes de registrar um abastecimento." />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography variant="body2" color="text.secondary">Total gasto no período filtrado</Typography><Typography component="p" variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>{CURRENCY.format(Number(totalValue))}</Typography></CardContent></Card>
            <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography variant="body2" color="text.secondary">Total de litros no período filtrado</Typography><Typography component="p" variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>{NUMBER.format(Number(totalLiters))} L</Typography></CardContent></Card>
          </Stack>
          <FilterBar label="Filtros de abastecimentos">
            <Box sx={{ flex: '1 1 200px', minWidth: { xs: '100%', sm: 200 } }}><FormSelect label="Veículo" value={vehicleId} onChange={(value) => changeFilter(setVehicleId, value)} options={vehicleOptions} emptyLabel="Todos os veículos" /></Box>
            <Box sx={{ flex: '1 1 200px', minWidth: { xs: '100%', sm: 200 } }}><FormSelect label="Motorista" value={driverId} onChange={(value) => changeFilter(setDriverId, value)} options={driverOptions} emptyLabel="Todos os motoristas" disabled={Boolean(driversError)} /></Box>
            <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}><FormField label="De" type="date" value={from} onChange={(value) => changeFilter(setFrom, value)} /></Box>
            <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}><FormField label="Até" type="date" value={to} onChange={(value) => changeFilter(setTo, value)} /></Box>
            <Button onClick={clearFilters} disabled={!filtersActive} sx={{ minHeight: 44 }}>Limpar filtros</Button>
          </FilterBar>

          {error && <StateFeedback kind="error" title="Não foi possível carregar os abastecimentos." description={error} actionLabel="Tentar novamente" onAction={() => { setLoading(true); setRefreshToken((current) => current + 1) }} />}
          {!error && (smallScreen ? <Stack spacing={1.5}>
            {loading ? <StateFeedback kind="loading" title="Carregando abastecimentos..." /> : items.length ? items.map((fueling) => <Card key={fueling.id} variant="outlined"><CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{snapshotPlate(fueling)} · {CURRENCY.format(Number(fueling.totalValue))}</Typography>
              <Typography variant="body2">{FUEL_TYPE_LABELS[fueling.fuelType]} · {NUMBER.format(Number(fueling.liters))} L · {formatDate(fueling.fueledAt)}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{fueling.driverSnapshot?.name ?? 'Motorista não informado'} · {NUMBER.format(fueling.odometerKm)} km</Typography>
            </CardContent><CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Button onClick={() => { void openDetails(fueling) }} startIcon={<HistoryOutlined aria-hidden="true" />} sx={{ minHeight: 48 }}>Histórico</Button>
              <Button onClick={() => { setCorrectionTarget(fueling); setFormOpen(true) }} disabled={fueling.isAnnulled || !fueling.revision} startIcon={<EditOutlined aria-hidden="true" />} sx={{ minHeight: 48 }}>Corrigir</Button>
            </CardActions></Card>) : <StateFeedback kind="empty" title={filtersActive ? 'Nenhum abastecimento encontrado' : 'Nenhum abastecimento registrado'} description={filtersActive ? 'Ajuste os filtros ou limpe a busca para ver outros registros.' : 'Registre o primeiro abastecimento para acompanhar os gastos da frota.'} centered />}
          </Stack> : <DataTable
            caption="Abastecimentos registrados"
            columns={COLUMNS}
            rows={items}
            rowKey={(fueling) => fueling.id}
            busy={loading}
            minWidth={1200}
            loadingContent={<StateFeedback kind="loading" title="Carregando abastecimentos..." />}
            emptyContent={<StateFeedback kind="empty" title={filtersActive ? 'Nenhum abastecimento encontrado' : 'Nenhum abastecimento registrado'} description={filtersActive ? 'Ajuste os filtros ou limpe a busca para ver outros registros.' : 'Registre o primeiro abastecimento para acompanhar os gastos da frota.'} centered />}
            renderActions={(fueling) => <Stack direction="row" spacing={0.5}><Button onClick={() => { void openDetails(fueling) }} sx={{ minHeight: 44 }}>Histórico</Button><Button onClick={() => { setCorrectionTarget(fueling); setFormOpen(true) }} disabled={fueling.isAnnulled || !fueling.revision} sx={{ minHeight: 44 }}>Corrigir</Button></Stack>}
          />)}
          {!error && <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{total} registro(s) encontrado(s)</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button onClick={() => changePage(Math.max(1, page - 1))} disabled={page <= 1 || loading} sx={{ minHeight: 44 }}>Anterior</Button>
              <Typography variant="body2" color="text.secondary">Página {page} de {Math.max(1, totalPages)}</Typography>
              <Button onClick={() => changePage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading} sx={{ minHeight: 44 }}>Próxima</Button>
            </Box>
          </Box>}
          {formOpen && <FuelingFormDialog api={api} reportedBy={session?.nome ?? ''} vehicles={vehicleOptions} drivers={driverOptions} onSaved={handleSaved} onCancel={() => { setFormOpen(false); setCorrectionTarget(null) }} {...(correctionTarget ? { fueling: correctionTarget } : {})} />}
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
