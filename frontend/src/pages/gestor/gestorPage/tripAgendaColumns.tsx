import type { DataTableColumn } from '../../../components/ui/DataTable.tsx'
import StatusChip from '../../../components/ui/StatusChip.tsx'
import type { GestorTripAgendaItem } from '../../../types/dashboard.ts'
import {
  TRIP_AGENDA_STATUS_LABELS,
  TRIP_AGENDA_STATUS_TONES,
  formatTimeInMaceio,
} from './gestorDashboardData.ts'

/** Colunas padronizadas da agenda operacional de viagens do Gestor. */
export const TRIP_AGENDA_COLUMNS: readonly DataTableColumn<GestorTripAgendaItem>[] = [
  {
    key: 'time',
    header: 'Horário',
    width: 125,
    render: (trip) => `${formatTimeInMaceio(trip.scheduledStart)} – ${formatTimeInMaceio(trip.scheduledEnd)}`,
  },
  {
    key: 'request',
    header: 'Solicitação',
    width: 110,
    render: (trip) => `#${trip.requestId}`,
  },
  {
    key: 'route',
    header: 'Trajeto',
    render: (trip) => `${trip.origin} → ${trip.destination}`,
  },
  {
    key: 'vehicle',
    header: 'Veículo',
    width: 115,
    render: (trip) => trip.vehicleLicensePlate,
  },
  {
    key: 'driver',
    header: 'Motorista',
    render: (trip) => trip.driverName,
  },
  {
    key: 'status',
    header: 'Status',
    width: 145,
    render: (trip) => (
      <StatusChip
        label={TRIP_AGENDA_STATUS_LABELS[trip.status] ?? trip.status}
        tone={TRIP_AGENDA_STATUS_TONES[trip.status] ?? 'neutral'}
      />
    ),
  },
]
