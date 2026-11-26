import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { EntityCard } from '../../components/ui/EntityCard'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { operationalDateTimeInput } from '../../time/operationalTime'
import { listTripAgenda } from '../../services/tripAgendaService'
import { TRIP_AGENDA_STATUSES, TRIP_AGENDA_STATUS_LABELS, TRIP_AGENDA_STATUS_TONES } from '../../trips/tripAgendaTypes'
import type { TripAgendaItem, TripAgendaStatus } from '../../trips/tripAgendaTypes'
import { TRIP_CONFIRMATION_PATH } from '../../trips/tripConfirmationTypes'
import { TRIP_SCHEDULING_PATH } from '../../trips/tripSchedulingAccess'
import { formatDateTime } from '../../utils/dates'

const STATUS_OPTIONS = TRIP_AGENDA_STATUSES.map((value) => ({ value, label: TRIP_AGENDA_STATUS_LABELS[value] }))

const COLUMNS: readonly DataTableColumn<TripAgendaItem>[] = [
  { key: 'start', header: 'Início previsto', width: 160, render: (trip) => formatDateTime(trip.scheduledStart) },
  { key: 'request', header: 'Origem', width: 170, render: (trip) => trip.requestId === null ? 'Criada pelo gestor' : `Solicitação #${trip.requestId}` },
  { key: 'route', header: 'Origem e destino', render: (trip) => `${trip.origin} → ${trip.destination}` },
  { key: 'vehicle', header: 'Veículo', width: 130, render: (trip) => trip.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', width: 180, render: (trip) => trip.driverName },
  { key: 'status', header: 'Situação', width: 190, render: (trip) => <StatusChip label={TRIP_AGENDA_STATUS_LABELS[trip.status]} tone={TRIP_AGENDA_STATUS_TONES[trip.status]} /> },
]

function todayInOperationalZone(): string {
  return operationalDateTimeInput(new Date().toISOString()).slice(0, 10)
}

function AgendaCard({ trip }: { trip: TripAgendaItem }) {
  return (
    <EntityCard>
      <EntityCard.Header title={`${trip.origin} → ${trip.destination}`}>
        <EntityCard.Status><StatusChip label={TRIP_AGENDA_STATUS_LABELS[trip.status]} tone={TRIP_AGENDA_STATUS_TONES[trip.status]} /></EntityCard.Status>
      </EntityCard.Header>
      <EntityCard.Body>
        <Typography variant="body2">{trip.requestId === null ? 'Criada pelo gestor' : `Solicitação #${trip.requestId}`}</Typography>
        <Typography variant="body2">Início previsto: {formatDateTime(trip.scheduledStart)}</Typography>
        <Typography variant="body2">Veículo: {trip.vehicleLicensePlate}</Typography>
        <Typography variant="body2">Motorista: {trip.driverName}</Typography>
        {trip.startedAt && <Typography variant="body2">Iniciada: {formatDateTime(trip.startedAt)}</Typography>}
        {trip.finishedAt && <Typography variant="body2">Finalizada: {formatDateTime(trip.finishedAt)}</Typography>}
      </EntityCard.Body>
      {trip.status === 'FINISHED' && <EntityCard.Actions>
        <Button component={RouterLink} to={TRIP_CONFIRMATION_PATH} variant="outlined" sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
          Abrir fila de conferência
        </Button>
      </EntityCard.Actions>}
    </EntityCard>
  )
}

/** Agenda operacional do gestor com todos os estados de viagem já persistidos. */
export default function TripAgendaPage() {
  const { api } = useAuth()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('sm'))
  const today = todayInOperationalZone()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<TripAgendaItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState({ from: today, to: today, status: '' })

  const refresh = useCallback(async (filters: { from: string; to: string; status: string }) => {
    setLoading(true)
    setError('')
    try {
      const next = await listTripAgenda(api, {
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      })
      setItems(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a agenda de viagens.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    document.title = 'Agenda de viagens — Aratu'
    const timer = window.setTimeout(() => { void refresh({ from: today, to: today, status: '' }) }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh, today])

  const statusLabel = useMemo(() => query.status ? TRIP_AGENDA_STATUS_LABELS[query.status as TripAgendaStatus] : 'Todas as situações', [query.status])
  const hasFilters = Boolean(from || to || status)

  function applyFilters() {
    const filters = { from, to, status }
    setQuery(filters)
    void refresh(filters)
  }

  function showToday() {
    const next = todayInOperationalZone()
    setFrom(next)
    setTo(next)
    setStatus('')
    const filters = { from: next, to: next, status: '' }
    setQuery(filters)
    void refresh(filters)
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setStatus('')
    const filters = { from: '', to: '', status: '' }
    setQuery(filters)
    void refresh(filters)
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Agenda de viagens" description="Consulte viagens agendadas, em execução, concluídas, conferidas ou canceladas." actions={(
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to={`${TRIP_SCHEDULING_PATH}?mode=direct`} variant="contained" sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>Criar viagem</Button>
          <Button component={RouterLink} to={TRIP_CONFIRMATION_PATH} variant="outlined" sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>Conferir finalizadas</Button>
        </Stack>
      )} />
      <FilterBar label="Filtros da agenda">
        <Box sx={{ flex: '1 1 160px', minWidth: { xs: '100%', sm: 160 } }}><FormField label="De" type="date" value={from} onChange={setFrom} /></Box>
        <Box sx={{ flex: '1 1 160px', minWidth: { xs: '100%', sm: 160 } }}><FormField label="Até" type="date" value={to} onChange={setTo} /></Box>
        <Box sx={{ flex: '1 1 210px', minWidth: { xs: '100%', sm: 210 } }}><FormSelect label="Situação" value={status} onChange={setStatus} options={STATUS_OPTIONS} emptyLabel="Todas as situações" /></Box>
        <Button variant="contained" onClick={applyFilters} disabled={loading} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>Aplicar filtros</Button>
        <Button onClick={showToday} disabled={loading} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>Hoje</Button>
        <Button onClick={clearFilters} disabled={loading || !hasFilters} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>Limpar</Button>
      </FilterBar>

      {error && items !== null && <StateFeedback kind="partial" title="A agenda pode estar desatualizada." description={error} actionLabel="Tentar novamente" onAction={() => { void refresh(query) }} />}
      {error && items === null && <StateFeedback kind="error" title="Não foi possível carregar a agenda." description={error} actionLabel="Tentar novamente" onAction={() => { void refresh(query) }} />}
      {items === null && !error && <StateFeedback kind="loading" title="Carregando agenda de viagens..." />}
      {items !== null && !error && loading && <StateFeedback kind="loading" title="Atualizando agenda de viagens..." />}
      {items !== null && !loading && items.length === 0 && <StateFeedback kind="empty" title="Nenhuma viagem encontrada." description={`Filtro aplicado: ${statusLabel.toLocaleLowerCase('pt-BR')}.`} actionLabel={hasFilters ? 'Limpar filtros' : undefined} onAction={hasFilters ? clearFilters : undefined} />}
      {items !== null && !loading && items.length > 0 && (compact
        ? <Stack spacing={1.5} component="section" aria-label="Viagens encontradas">{items.map((trip) => <AgendaCard key={trip.id} trip={trip} />)}</Stack>
        : <Paper component="section" variant="outlined" sx={{ borderRadius: 2 }}>
            <DataTable caption="Agenda de viagens" columns={COLUMNS} rows={items} rowKey={(trip) => trip.id} minWidth={980} />
          </Paper>)}
    </Box>
  )
}
