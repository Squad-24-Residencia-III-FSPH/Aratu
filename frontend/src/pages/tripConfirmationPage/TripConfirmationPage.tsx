import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import { useTripConfirmations } from '../../hooks/useTripConfirmations'
import type { TripConfirmationQueueItem, TripConfirmationQueueStatus } from '../../hooks/useTripConfirmations'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import {
  canConfirmTrip, formatTripInstant, formatTripOdometer, tripDistance,
} from '../../trips/tripConfirmationPresentation'

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

const DATE_FIELD_SX = {
  '& .MuiOutlinedInput-root': { minHeight: 44 },
  '& .MuiOutlinedInput-root .MuiInputBase-input': { minHeight: 44, boxSizing: 'border-box' },
} as const

const SELECT_FIELD_SX = {
  '& .MuiOutlinedInput-root': { minHeight: 44 },
  '& .MuiOutlinedInput-root .MuiSelect-select': {
    minHeight: 44,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
  },
} as const

const ALERT_WRAP_SX = { mb: 3, alignItems: 'center', flexWrap: 'wrap', gap: 1 } as const

function TripQueueStatusChip({ status }: { status: TripConfirmationQueueStatus }) {
  const confirmed = status === 'CONFIRMED'
  const Icon = confirmed ? CheckIcon : FlagOutlinedIcon
  const backgroundColor = confirmed ? '#dcfce7' : '#fef3c7'
  const color = confirmed ? '#14532d' : '#78350f'

  return (
    <Chip
      size="small"
      icon={<Icon aria-hidden="true" sx={{ fontSize: 16 }} />}
      label={confirmed ? 'Confirmada' : 'Finalizada'}
      sx={{
        backgroundColor,
        color,
        fontWeight: 700,
        fontSize: '0.75rem',
        height: 26,
        border: `1px solid ${color}33`,
        '& .MuiChip-icon': { color, ml: 0.75 },
      }}
    />
  )
}

function buildFilterOptions(
  trips: readonly TripConfirmationQueueItem[],
  field: 'vehicleLicensePlate' | 'driverName',
) {
  return [...new Set(trips.map((trip) => trip[field]))]
    .sort((first, second) => first.localeCompare(second, 'pt-BR'))
    .map((value) => ({ value, label: value }))
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

const BASE_COLUMNS: readonly DataTableColumn<TripConfirmationQueueItem>[] = [
  {
    key: 'request', header: 'Solicitação',
    render: (trip) => (
      <Stack spacing={0.25} sx={{ minWidth: 140 }}>
        <Typography sx={{ fontWeight: 600 }}>#{trip.requestId}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {trip.origin} → {trip.destination}
        </Typography>
      </Stack>
    ),
  },
  { key: 'vehicle', header: 'Veículo', render: (trip) => trip.vehicleLicensePlate },
  { key: 'driver', header: 'Motorista', render: (trip) => trip.driverName },
  { key: 'scheduled', header: 'Início planejado', render: (trip) => formatTripInstant(trip.scheduledStart) },
  { key: 'finished', header: 'Fim realizado', render: (trip) => formatTripInstant(trip.finishedAt) },
  {
    key: 'distance', header: 'Distância', align: 'right',
    render: (trip) => {
      const distance = tripDistance(trip.startKm, trip.endKm)
      return distance === null ? 'Não informada' : `${NUMBER_FORMAT.format(distance)} km`
    },
  },
  { key: 'status', header: 'Status', render: (trip) => <TripQueueStatusChip status={trip.status} /> },
]

const CONFIRMED_COLUMNS: readonly DataTableColumn<TripConfirmationQueueItem>[] = [
  ...BASE_COLUMNS.slice(0, 6),
  { key: 'confirmedAt', header: 'Confirmada em', render: (trip) => formatTripInstant(trip.confirmedAt) },
  BASE_COLUMNS[6],
]

interface AnnouncedResult {
  message: string
  partialError: string
}

/** Permite ao Gestor conferir viagens finalizadas (`FINISHED`) e consultar recibos de confirmadas (`CONFIRMED`). */
export default function TripConfirmationPage() {
  const { api, session } = useAuth()
  const allowed = session !== null && resolveProfile(session.perfil) === 'GESTOR'
  const [viewMode, setViewMode] = useState<TripConfirmationQueueStatus>('FINISHED')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailSnapshot, setDetailSnapshot] = useState<TripConfirmationQueueItem | null>(null)
  const [confirmClosingTrip, setConfirmClosingTrip] = useState<TripConfirmationQueueItem | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [announcedResult, setAnnouncedResult] = useState<AnnouncedResult | null>(null)

  const periodInvalid = Boolean(from && to && from > to)
  const fromError = periodInvalid ? 'A data "De" não pode ser posterior à data "Até".' : undefined
  const toError = periodInvalid ? 'A data "Até" deve ser igual ou posterior à data "De".' : undefined

  const filters = useMemo(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to])
  const state = useTripConfirmations(api, filters, allowed && !periodInvalid, viewMode)
  const trips = useMemo(
    () => state.items.filter((trip) => (!vehicle || trip.vehicleLicensePlate === vehicle) && (!driver || trip.driverName === driver)),
    [state.items, vehicle, driver],
  )
  const vehicleOptions = useMemo(() => buildFilterOptions(state.items, 'vehicleLicensePlate'), [state.items])
  const driverOptions = useMemo(() => buildFilterOptions(state.items, 'driverName'), [state.items])

  const selectedTrip = selectedId
    ? (state.items.find((trip) => trip.id === selectedId) ?? (detailSnapshot?.id === selectedId ? detailSnapshot : null))
    : null
  const confirmDialogTrip = selectedTrip ?? confirmClosingTrip
  const selectedDistance = selectedTrip ? tripDistance(selectedTrip.startKm, selectedTrip.endKm) : null
  const hasFilters = Boolean(from || to || vehicle || driver)
  const isConfirmedView = viewMode === 'CONFIRMED'

  const statusRef = useRef<HTMLDivElement>(null)
  const conflictAlertRef = useRef<HTMLDivElement>(null)
  const detailTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const pendingAnnouncementRef = useRef<AnnouncedResult | null>(null)
  const pendingFocusModeRef = useRef<'conflict' | null>(null)
  const lastOpenedTripIdRef = useRef<string | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const selectedIdRef = useRef(selectedId)
  const confirmOpenRef = useRef(confirmOpen)
  const tripsRef = useRef(trips)

  useEffect(() => {
    selectedIdRef.current = selectedId
    confirmOpenRef.current = confirmOpen
    tripsRef.current = trips
  }, [selectedId, confirmOpen, trips])

  useEffect(() => {
    const previous = document.title
    document.title = 'Confirmar viagens — Aratu'
    return () => {
      document.title = previous
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current)
    }
  }, [])

  function scheduleFocus(callback: () => void) {
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null
      callback()
    })
  }

  function focusFallbackAfterQueueChange() {
    if (selectedIdRef.current !== null || confirmOpenRef.current) return
    const lastId = lastOpenedTripIdRef.current
    const existingTrigger = lastId ? detailTriggerRefs.current.get(lastId) : undefined
    if (existingTrigger && existingTrigger.isConnected) {
      existingTrigger.focus()
      return
    }
    for (const candidate of tripsRef.current) {
      const button = detailTriggerRefs.current.get(candidate.id)
      if (button && button.isConnected) {
        button.focus()
        return
      }
    }
    statusRef.current?.focus()
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setVehicle('')
    setDriver('')
  }

  function handleViewModeChange(nextMode: TripConfirmationQueueStatus) {
    if (nextMode === viewMode) return
    setViewMode(nextMode)
    setVehicle('')
    setDriver('')
    setSelectedId(null)
    setDetailSnapshot(null)
    setConfirmOpen(false)
    setConfirmClosingTrip(null)
    setAnnouncedResult(null)
    pendingAnnouncementRef.current = null
    pendingFocusModeRef.current = null
    state.clearConfirmError()
  }

  function openDetails(trip: TripConfirmationQueueItem) {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
    lastOpenedTripIdRef.current = trip.id
    pendingAnnouncementRef.current = null
    pendingFocusModeRef.current = null
    setConfirmClosingTrip(null)
    state.clearConfirmError()
    setDetailSnapshot(trip)
    setSelectedId(trip.id)
  }

  function closeDetails() {
    if (state.confirmingId !== null) return
    setSelectedId(null)
    setDetailSnapshot(null)
    state.clearConfirmError()
    scheduleFocus(focusFallbackAfterQueueChange)
  }

  function handleRefresh() {
    setAnnouncedResult(null)
    state.refresh()
  }

  async function confirmSelectedTrip() {
    if (!selectedTrip || selectedTrip.status !== 'FINISHED' || !canConfirmTrip(selectedTrip) || state.invalidatedTripIds.includes(selectedTrip.id)) return
    const targetTrip = selectedTrip
    const outcome = await state.confirm(targetTrip.id)
    setConfirmOpen(false)
    if (outcome.ok) {
      pendingAnnouncementRef.current = { message: outcome.message, partialError: outcome.partialError }
      setConfirmClosingTrip(targetTrip)
      setSelectedId(null)
      setDetailSnapshot(null)
      return
    }
    if (outcome.isConflict) {
      pendingFocusModeRef.current = 'conflict'
    }
  }

  const tripConfirmError = selectedTrip && state.confirmError?.tripId === selectedTrip.id ? state.confirmError : null
  const isDialogTripInvalidated = selectedTrip !== null && state.invalidatedTripIds.includes(selectedTrip.id)

  return (
    <Box sx={{ maxWidth: '100%', minWidth: 0 }}>
      <PageHeader
        title="Confirmar viagens"
        titleVariant="h4"
        breadcrumbs={['Início', 'Viagens', 'Conferência']}
        description="Confira os registros das viagens finalizadas antes de confirmar a conclusão."
      />

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="Seu perfil não tem permissão para consultar ou confirmar viagens."
          sx={ALERT_WRAP_SX}
        />
      )}

      {allowed && <>
        <Tabs
          value={viewMode}
          onChange={(_event, next: TripConfirmationQueueStatus) => handleViewModeChange(next)}
          aria-label="Visão da conferência de viagens"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', '& .MuiTabs-flexContainer': { flexWrap: 'wrap' } }}
        >
          <Tab label="Aguardando conferência" value="FINISHED" sx={{ minHeight: 44, minWidth: 44 }} />
          <Tab label="Confirmadas (Recibo)" value="CONFIRMED" sx={{ minHeight: 44, minWidth: 44 }} />
        </Tabs>

        <Box
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          sx={{ '&:focus-visible': { outline: '2px solid #115e59', outlineOffset: 2, borderRadius: 1 } }}
        >
          {announcedResult && !announcedResult.partialError && (
            <Alert
              severity="success"
              role="none"
              sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              action={
                <Button color="inherit" onClick={() => handleViewModeChange('CONFIRMED')} sx={{ minHeight: 44, minWidth: 44 }}>
                  Consultar em Confirmadas
                </Button>
              }
            >
              {announcedResult.message}
            </Alert>
          )}
          {announcedResult && announcedResult.partialError && (
            <Alert
              severity="warning"
              role="none"
              sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
              action={
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Button color="inherit" onClick={() => handleViewModeChange('CONFIRMED')} sx={{ minHeight: 44, minWidth: 44 }}>
                    Consultar em Confirmadas
                  </Button>
                  <Button color="inherit" onClick={handleRefresh} sx={{ minHeight: 44, minWidth: 44 }}>
                    Atualizar listagem
                  </Button>
                </Box>
              }
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{announcedResult.message}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{announcedResult.partialError}</Typography>
            </Alert>
          )}
        </Box>

        {!announcedResult && state.partialError && (
          <StateFeedback
            kind="partial"
            title="A lista pode estar desatualizada."
            description={state.partialError}
            actionLabel="Atualizar listagem"
            onAction={handleRefresh}
            sx={ALERT_WRAP_SX}
          />
        )}

        <FilterBar label={isConfirmedView ? 'Filtros das viagens confirmadas' : 'Filtros das viagens finalizadas'}>
          <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}>
            <FormField label="De" type="date" value={from} onChange={setFrom} error={fromError} sx={DATE_FIELD_SX} />
          </Box>
          <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}>
            <FormField
              label="Até"
              type="date"
              value={to}
              onChange={setTo}
              error={toError}
              helperText="Data final inclusiva."
              sx={DATE_FIELD_SX}
            />
          </Box>
          <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
            <FormSelect
              label="Veículo"
              value={vehicle}
              onChange={setVehicle}
              options={vehicleOptions}
              emptyLabel="Todos os veículos"
              sx={SELECT_FIELD_SX}
            />
          </Box>
          <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}>
            <FormSelect
              label="Motorista"
              value={driver}
              onChange={setDriver}
              options={driverOptions}
              emptyLabel="Todos os motoristas"
              sx={SELECT_FIELD_SX}
            />
          </Box>
          <Button
            onClick={clearFilters}
            disabled={!hasFilters}
            sx={{ minHeight: 44, minWidth: 44, width: { xs: '100%', md: 'auto' } }}
          >
            Limpar filtros
          </Button>
        </FilterBar>

        {periodInvalid && (
          <Alert severity="info" role="none" sx={{ mb: 2 }}>
            {isConfirmedView
              ? 'Ajuste o período informado nos campos "De" e "Até" para consultar as viagens confirmadas.'
              : 'Ajuste o período informado nos campos "De" e "Até" para consultar as viagens finalizadas.'}
          </Alert>
        )}

        {!periodInvalid && state.error && (
          <StateFeedback
            kind="error"
            title={isConfirmedView ? 'Não foi possível carregar as viagens confirmadas.' : 'Não foi possível carregar as viagens finalizadas.'}
            description={state.error}
            actionLabel="Tentar novamente"
            onAction={handleRefresh}
            sx={ALERT_WRAP_SX}
          />
        )}

        {!periodInvalid && !state.error && state.loading && (
          <StateFeedback
            kind="loading"
            title={isConfirmedView ? 'Carregando viagens confirmadas...' : 'Carregando viagens finalizadas...'}
          />
        )}

        {!periodInvalid && !state.error && !state.loading && trips.length === 0 && (
          <StateFeedback
            kind="empty"
            title={hasFilters
              ? 'Nenhuma viagem encontrada com os filtros atuais.'
              : isConfirmedView
                ? 'Não há viagens confirmadas para exibir.'
                : 'Não há viagens finalizadas aguardando conferência.'}
            description={hasFilters ? 'Ajuste os filtros ou limpe a busca para consultar outras viagens.' : undefined}
            actionLabel={hasFilters ? 'Limpar filtros' : undefined}
            onAction={hasFilters ? clearFilters : undefined}
            sx={ALERT_WRAP_SX}
          />
        )}

        {!periodInvalid && !state.error && !state.loading && trips.length > 0 && (
          <DataTable
            caption={isConfirmedView ? 'Viagens confirmadas e recibos' : 'Viagens finalizadas para conferência'}
            columns={isConfirmedView ? CONFIRMED_COLUMNS : BASE_COLUMNS}
            rows={trips}
            rowKey={(trip) => trip.id}
            minWidth={720}
            renderActions={(trip) => (
              <Button
                ref={(node) => {
                  if (node) detailTriggerRefs.current.set(trip.id, node)
                  else detailTriggerRefs.current.delete(trip.id)
                }}
                variant="text"
                startIcon={<VisibilityIcon aria-hidden="true" />}
                aria-label={trip.status === 'CONFIRMED' ? `Ver recibo da viagem ${trip.id}` : `Ver detalhes da viagem ${trip.id}`}
                onClick={() => openDetails(trip)}
                onFocus={(event) => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}
                sx={{ minHeight: 44, minWidth: 44, whiteSpace: 'nowrap' }}
              >
                {trip.status === 'CONFIRMED' ? 'Ver recibo' : 'Ver detalhes'}
              </Button>
            )}
          />
        )}

        {selectedTrip && (
          <Dialog
            open
            onClose={closeDetails}
            fullWidth
            maxWidth="md"
            aria-labelledby="trip-confirmation-details-title"
          >
            <DialogTitle id="trip-confirmation-details-title">
              {selectedTrip.status === 'CONFIRMED' ? `Recibo da viagem #${selectedTrip.id}` : `Conferir viagem #${selectedTrip.id}`}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary">Solicitação</Typography>
                    <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                      #{selectedTrip.requestId} · {selectedTrip.origin} → {selectedTrip.destination}
                    </Typography>
                  </Box>
                  <TripQueueStatusChip status={selectedTrip.status} />
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
                  <DetailValue
                    label="Distância percorrida"
                    value={selectedDistance === null ? 'Não informada' : `${NUMBER_FORMAT.format(selectedDistance)} km`}
                  />
                  {selectedTrip.status === 'CONFIRMED' && (
                    <>
                      <DetailValue
                        label="Confirmada por"
                        value={selectedTrip.confirmedBy ? `Gestor #${selectedTrip.confirmedBy}` : 'Não informado'}
                      />
                      <DetailValue label="Confirmada em" value={formatTripInstant(selectedTrip.confirmedAt)} />
                    </>
                  )}
                </Box>
                {selectedTrip.status === 'FINISHED' && !canConfirmTrip(selectedTrip) && (
                  <Alert severity="warning">
                    Esta viagem não pode ser confirmada porque a API não registrou o hodômetro {selectedTrip.startKm === null && selectedTrip.endKm === null ? 'inicial nem o final' : selectedTrip.startKm === null ? 'inicial' : 'final'}. Os dois registros são obrigatórios.
                  </Alert>
                )}
                {tripConfirmError && (
                  <Alert
                    ref={conflictAlertRef}
                    tabIndex={-1}
                    severity="error"
                    role="alert"
                    action={state.partialError ? (
                      <Button color="inherit" onClick={handleRefresh} sx={{ minHeight: 44, minWidth: 44 }}>
                        Atualizar lista
                      </Button>
                    ) : undefined}
                    sx={{ '&:focus-visible': { outline: '2px solid #991b1b', outlineOffset: 2 } }}
                  >
                    {tripConfirmError.message}
                  </Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
              <Button onClick={closeDetails} disabled={state.confirmingId !== null} sx={{ minHeight: 44, minWidth: 44 }}>
                Fechar
              </Button>
              {selectedTrip.status === 'FINISHED' && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckIcon aria-hidden="true" />}
                  disabled={!canConfirmTrip(selectedTrip) || isDialogTripInvalidated || state.confirmingId === selectedTrip.id}
                  onClick={() => setConfirmOpen(true)}
                  sx={{ minHeight: 44, minWidth: 44 }}
                >
                  Confirmar viagem
                </Button>
              )}
            </DialogActions>
          </Dialog>
        )}

        <ConfirmDialog
          open={confirmOpen && confirmDialogTrip !== null}
          title={`Confirmar viagem #${confirmDialogTrip?.id ?? ''}?`}
          description={confirmDialogTrip
            ? <>A viagem de <strong>{confirmDialogTrip.origin}</strong> para <strong>{confirmDialogTrip.destination}</strong> será marcada como confirmada.</>
            : 'Confirme a conclusão da viagem selecionada.'}
          confirmLabel="Confirmar viagem"
          cancelLabel="Revisar dados"
          loadingLabel="Confirmando..."
          onConfirm={() => { void confirmSelectedTrip() }}
          onCancel={() => setConfirmOpen(false)}
          onExited={() => {
            setConfirmClosingTrip(null)
            if (pendingFocusModeRef.current === 'conflict') {
              pendingFocusModeRef.current = null
              scheduleFocus(() => conflictAlertRef.current?.focus())
              return
            }
            const announcement = pendingAnnouncementRef.current
            if (announcement) {
              pendingAnnouncementRef.current = null
              setAnnouncedResult(announcement)
              scheduleFocus(() => statusRef.current?.focus())
            }
          }}
          actionsSx={{ p: 2, flexWrap: 'wrap', gap: 1 }}
          loading={confirmDialogTrip !== null && state.confirmingId === confirmDialogTrip.id}
        />
      </>}
    </Box>
  )
}
