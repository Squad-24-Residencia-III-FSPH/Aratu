import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import { useAuth } from '../auth/useAuth'
import { EntityCard } from '../components/ui/EntityCard'
import { FormSelect } from '../components/ui/FormField'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import { useMyTrips } from '../hooks/useMyTrips'
import {
  ACTION_LABELS, formatDateTime, formatKm, NEXT_ACTION, selectTrips,
  TRIP_FILTER_LABELS, TRIP_STATUS_LABELS, TRIP_STATUS_TONES,
} from '../trips/tripPresentation'
import { TRIP_FILTERS } from '../trips/tripTypes'
import type { DriverTrip, TripFilter } from '../trips/tripTypes'
import TripExecutionDialog from './myTripsPage/TripExecutionDialog'

const DOCUMENT_TITLE = 'Minhas viagens — Aratu'
const FILTER_OPTIONS = TRIP_FILTERS.map((value) => ({ value, label: TRIP_FILTER_LABELS[value] }))

function isTripFilter(value: string): value is TripFilter {
  return (TRIP_FILTERS as readonly string[]).includes(value)
}

/**
 * Home do MOTORISTA: consulta as próprias viagens pendentes e registra início e término com hodômetro.
 *
 * Remonta ao trocar o token da sessão, para nunca exibir dados do usuário anterior.
 */
export default function MyTripsPage() {
  const { session } = useAuth()
  return <MyTripsContent key={session?.token ?? 'anonymous'} />
}

function MyTripsContent() {
  const { api } = useAuth()
  const trips = useMyTrips(api)
  const [filter, setFilter] = useState<TripFilter>('TODAY_AND_IN_PROGRESS')
  const headingId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const { result } = trips

  useEffect(() => {
    const previous = document.title
    document.title = DOCUMENT_TITLE
    return () => { document.title = previous }
  }, [])

  // Aguarda a restauração de foco do diálogo desmontado; o acionador não existe após o término.
  useEffect(() => {
    if (result?.action !== 'FINISH') return
    const frame = requestAnimationFrame(() => resultRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [result])

  const visible = trips.trips ? selectTrips(trips.trips, filter, trips.now) : []
  const actionsBlocked = trips.stale || trips.submitting

  function renderContent() {
    if (trips.trips === null) {
      return trips.loading
        ? <StateFeedback kind="loading" title="Carregando suas viagens..." />
        : <StateFeedback kind="error" title="Não foi possível carregar suas viagens." description={trips.listError} actionLabel="Tentar novamente" onAction={trips.refresh} />
    }
    if (visible.length === 0) {
      const noPendingTrips = trips.trips.length === 0
      if (filter === 'TODAY_AND_IN_PROGRESS' && !noPendingTrips) {
        return <StateFeedback kind="empty" title="Nenhuma viagem para hoje ou em andamento" description="Há viagens pendentes em outras datas." actionLabel="Ver todas as pendentes" onAction={() => setFilter('ALL_PENDING')} />
      }
      return <StateFeedback kind="empty" title="Nenhuma viagem pendente" description="Quando o gestor agendar uma viagem para você, ela aparecerá aqui." actionLabel="Atualizar" onAction={trips.refresh} />
    }
    return visible.map((trip) => <TripCard key={trip.id} trip={trip} disabled={actionsBlocked} onAction={() => trips.openExecution(trip.id, NEXT_ACTION[trip.status])} />)
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader
        title="Minhas viagens"
        titleVariant="h4"
        description="Registre o início e o término das viagens atribuídas a você."
        actions={
          <>
            <Box sx={{ minWidth: { sm: 220 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
              <FormSelect label="Exibir" value={filter} onChange={(value) => { if (isTripFilter(value)) setFilter(value) }} options={FILTER_OPTIONS} />
            </Box>
            <Button variant="outlined" color="inherit" onClick={trips.refresh} disabled={trips.loading} sx={{ minHeight: 44 }}>
              {trips.loading && trips.trips !== null ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </>
        }
      />

      <Box ref={resultRef} role="status" aria-live="polite" tabIndex={-1} sx={{ '&:focus-visible': { outline: '2px solid #115e59', outlineOffset: 2 } }}>
        {result && <Alert severity="success" sx={{ mb: 2 }}>{result.message}</Alert>}
      </Box>

      {trips.stale && (
        <StateFeedback kind="partial" title="A lista pode estar desatualizada." description={trips.listError} actionLabel="Atualizar situação" onAction={trips.refresh} />
      )}

      <Box component="section" aria-labelledby={headingId} aria-busy={trips.loading}>
        <Typography id={headingId} component="h2" variant="h6" sx={{ mb: 1.5, fontWeight: 600 }}>
          {TRIP_FILTER_LABELS[filter]}
        </Typography>
        {renderContent()}
      </Box>

      {trips.execution && (
        <TripExecutionDialog
          draft={trips.execution}
          trip={trips.activeTrip}
          issue={trips.executionIssue}
          submitting={trips.submitting}
          refreshing={trips.loading}
          onKmChange={trips.changeKm}
          onConfirm={() => { void trips.submitExecution() }}
          onCancel={trips.closeExecution}
          onRefresh={trips.refresh}
        />
      )}
    </Box>
  )
}

interface TripCardProps {
  trip: DriverTrip
  disabled: boolean
  onAction: () => void
}

function TripCard({ trip, disabled, onAction }: TripCardProps) {
  const action = NEXT_ACTION[trip.status]
  return (
    <EntityCard>
      <EntityCard.Header title={trip.destination}>
        <EntityCard.Status>
          <StatusChip label={TRIP_STATUS_LABELS[trip.status]} tone={TRIP_STATUS_TONES[trip.status]} />
        </EntityCard.Status>
      </EntityCard.Header>
      <EntityCard.Body>
        <Typography variant="body2">Viagem #{trip.id}</Typography>
        <Typography variant="body2">Origem: {trip.origin}</Typography>
        <Typography variant="body2">Início agendado: {formatDateTime(trip.scheduledStart)}</Typography>
        <Typography variant="body2">Término previsto: {formatDateTime(trip.scheduledEnd)}</Typography>
        <Typography variant="body2">Placa do veículo: {trip.vehicleLicensePlate}</Typography>
        {trip.startKm !== null && <Typography variant="body2">Quilometragem inicial: {formatKm(trip.startKm)}</Typography>}
      </EntityCard.Body>
      <EntityCard.Actions>
        <Button
          variant="contained"
          onClick={onAction}
          disabled={disabled}
          aria-label={`${ACTION_LABELS[action]} #${trip.id} para ${trip.destination}`}
          sx={{ minHeight: 44, minWidth: 44 }}
        >
          {ACTION_LABELS[action]}
        </Button>
      </EntityCard.Actions>
    </EntityCard>
  )
}
