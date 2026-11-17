import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useAuth } from '../auth/useAuth'
import { resolveProfile } from '../auth/profiles'
import { useTripConfirmations } from '../hooks/useTripConfirmations'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import { FormField, FormSelect } from '../components/ui/FormField'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import {
  canConfirmTrip, confirmationFilterOptions, filterConfirmationTrips, formatTripInstant,
  formatTripOdometer, tripDistance,
} from '../trips/tripConfirmationPresentation'
import type { TripConfirmationItem } from '../trips/tripConfirmationTypes'

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

const COLUMNS: readonly DataTableColumn<TripConfirmationItem>[] = [
  {
    key: 'request', header: 'Solicitação', width: 200,
    render: (trip) => <Stack spacing={0.25}><Typography sx={{ fontWeight: 600 }}>#{trip.requestId}</Typography><Typography variant="body2" color="text.secondary">{trip.origin} → {trip.destination}</Typography></Stack>,
  },
  { key: 'vehicle', header: 'Veículo', width: 140, render: (trip) => trip.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', width: 180, render: (trip) => trip.driverName },
  { key: 'scheduled', header: 'Início planejado', width: 160, render: (trip) => formatTripInstant(trip.scheduledStart) },
  { key: 'finished', header: 'Fim realizado', width: 160, render: (trip) => formatTripInstant(trip.finishedAt) },
  { key: 'distance', header: 'Distância', align: 'right', width: 120, render: (trip) => {
    const distance = tripDistance(trip.startKm, trip.endKm)
    return distance === null ? 'Não informada' : `${NUMBER_FORMAT.format(distance)} km`
  } },
  { key: 'status', header: 'Status', width: 130, render: () => <StatusChip label="Finalizada" tone="warning" /> },
]

/** Permite ao Gestor conferir os dados disponíveis e confirmar viagens finalizadas pela API FROTA-106. */
export default function TripConfirmationPage() {
  const { api, session } = useAuth()
  const allowed = session !== null && resolveProfile(session.perfil) === 'GESTOR'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const filters = useMemo(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to])
  const state = useTripConfirmations(api, filters, allowed)
  const trips = useMemo(() => filterConfirmationTrips(state.items, vehicle, driver), [state.items, vehicle, driver])
  const vehicleOptions = useMemo(() => confirmationFilterOptions(state.items, 'vehicleLicensePlate'), [state.items])
  const driverOptions = useMemo(() => confirmationFilterOptions(state.items, 'driverName'), [state.items])
  const selectedTrip = state.items.find((trip) => trip.id === selectedId) ?? null
  const selectedDistance = selectedTrip ? tripDistance(selectedTrip.startKm, selectedTrip.endKm) : null
  const hasFilters = Boolean(from || to || vehicle || driver)

  useEffect(() => {
    const previous = document.title
    document.title = 'Confirmar viagens — Aratu'
    return () => { document.title = previous }
  }, [])

  function clearFilters() {
    setFrom('')
    setTo('')
    setVehicle('')
    setDriver('')
  }

  async function confirmSelectedTrip() {
    if (!selectedTrip || !canConfirmTrip(selectedTrip)) return
    const confirmed = await state.confirm(selectedTrip.id)
    setConfirmOpen(false)
    if (confirmed) setSelectedId(null)
  }

  return (
    <Box>
      <PageHeader
        title="Confirmar viagens"
        titleVariant="h4"
        breadcrumbs={['Início', 'Viagens', 'Conferência']}
        description="Confira os registros das viagens finalizadas antes de confirmar a conclusão."
      />

      {!allowed && <StateFeedback kind="forbidden" title="Acesso restrito" description="Seu perfil não tem permissão para consultar ou confirmar viagens." />}

      {allowed && <>
        {state.success && <Alert severity="success" role="status" sx={{ mb: 2 }}>{state.success}</Alert>}
        {state.partialError && <StateFeedback kind="partial" title="A confirmação foi registrada." description={state.partialError} actionLabel="Atualizar listagem" onAction={state.refresh} />}

        <FilterBar label="Filtros das viagens finalizadas">
          <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}>
            <FormField label="De" type="date" value={from} onChange={setFrom} />
          </Box>
          <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}>
            <FormField label="Até" type="date" value={to} onChange={setTo} helperText="Data final inclusiva." />
          </Box>
          <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Veículo" value={vehicle} onChange={setVehicle} options={vehicleOptions} emptyLabel="Todos os veículos" />
          </Box>
          <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Motorista" value={driver} onChange={setDriver} options={driverOptions} emptyLabel="Todos os motoristas" />
          </Box>
          <Button onClick={clearFilters} disabled={!hasFilters} sx={{ minHeight: 44 }}>Limpar filtros</Button>
        </FilterBar>

        {state.error && !selectedTrip && <StateFeedback kind="error" title="Não foi possível carregar as viagens finalizadas." description={state.error} actionLabel="Tentar novamente" onAction={state.refresh} />}
        {!state.error && <DataTable
          caption="Viagens finalizadas para conferência"
          columns={COLUMNS}
          rows={trips}
          rowKey={(trip) => trip.id}
          busy={state.loading}
          minWidth={1080}
          loadingContent={<StateFeedback kind="loading" title="Carregando viagens finalizadas..." />}
          emptyContent={<StateFeedback kind="empty"
            title={hasFilters ? 'Nenhuma viagem encontrada com os filtros atuais.' : 'Não há viagens finalizadas aguardando conferência.'}
            description={hasFilters ? 'Ajuste os filtros ou limpe a busca para consultar outras viagens.' : undefined}
            actionLabel={hasFilters ? 'Limpar filtros' : undefined}
            onAction={hasFilters ? clearFilters : undefined}
          />}
          renderActions={(trip) => <Button
            variant="text"
            startIcon={<VisibilityIcon aria-hidden="true" />}
            aria-label={`Ver detalhes da viagem ${trip.id}`}
            onClick={() => setSelectedId(trip.id)}
            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
          >Ver detalhes</Button>}
        />}

        {selectedTrip && <Dialog open onClose={() => setSelectedId(null)} fullWidth maxWidth="md" aria-labelledby="trip-confirmation-details-title">
          <DialogTitle id="trip-confirmation-details-title">Conferir viagem #{selectedTrip.id}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Box><Typography variant="body2" color="text.secondary">Solicitação</Typography><Typography variant="h6">#{selectedTrip.requestId} · {selectedTrip.origin} → {selectedTrip.destination}</Typography></Box>
                <StatusChip label="Finalizada" tone="warning" />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
                <DetailValue label="Veículo" value={selectedTrip.vehicleLicensePlate} />
                <DetailValue label="Motorista" value={selectedTrip.driverName} />
                <DetailValue label="Início planejado" value={formatTripInstant(selectedTrip.scheduledStart)} />
                <DetailValue label="Fim planejado" value={formatTripInstant(selectedTrip.scheduledEnd)} />
                <DetailValue label="Início realizado" value={formatTripInstant(selectedTrip.startedAt)} />
                <DetailValue label="Fim realizado" value={formatTripInstant(selectedTrip.finishedAt)} />
                <DetailValue label="Km inicial" value={formatTripOdometer(selectedTrip.startKm)} />
                <DetailValue label="Km final" value={formatTripOdometer(selectedTrip.endKm)} />
                <DetailValue label="Distância percorrida" value={selectedDistance === null
                  ? 'Não informada'
                  : `${NUMBER_FORMAT.format(selectedDistance)} km`} />
              </Box>
              {!canConfirmTrip(selectedTrip) && <Alert severity="warning">
                Esta viagem não pode ser confirmada porque a API não registrou o hodômetro {selectedTrip.startKm === null && selectedTrip.endKm === null ? 'inicial nem o final' : selectedTrip.startKm === null ? 'inicial' : 'final'}. Os dois registros são obrigatórios.
              </Alert>}
              {state.error && <Alert severity="error" role="alert" action={<Button color="inherit" onClick={state.refresh} sx={{ minHeight: 44 }}>Atualizar lista</Button>}>{state.error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
            <Button onClick={() => setSelectedId(null)} sx={{ minHeight: 44 }}>Fechar</Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckIcon aria-hidden="true" />}
              disabled={!canConfirmTrip(selectedTrip) || state.confirmingId === selectedTrip.id}
              onClick={() => setConfirmOpen(true)}
              sx={{ minHeight: 44 }}
            >Confirmar viagem</Button>
          </DialogActions>
        </Dialog>}

        <ConfirmDialog
          open={confirmOpen && selectedTrip !== null}
          title={`Confirmar viagem #${selectedTrip?.id ?? ''}?`}
          description={selectedTrip
            ? <>A viagem de <strong>{selectedTrip.origin}</strong> para <strong>{selectedTrip.destination}</strong> será marcada como confirmada.</>
            : 'Confirme a conclusão da viagem selecionada.'}
          confirmLabel="Confirmar viagem"
          cancelLabel="Revisar dados"
          loadingLabel="Confirmando..."
          onConfirm={() => { void confirmSelectedTrip() }}
          onCancel={() => setConfirmOpen(false)}
          loading={selectedTrip !== null && state.confirmingId === selectedTrip.id}
        />
      </>}
    </Box>
  )
}
