export const TRIP_AGENDA_PATH = '/viagens/agenda'

export const TRIP_AGENDA_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED', 'CANCELED'] as const
export type TripAgendaStatus = typeof TRIP_AGENDA_STATUSES[number]

export interface TripAgendaItem {
  id: string
  requestId: string
  status: TripAgendaStatus
  scheduledStart: string
  scheduledEnd: string
  startedAt: string | null
  finishedAt: string | null
  vehicleLicensePlate: string
  driverName: string
  origin: string
  destination: string
}

export const TRIP_AGENDA_STATUS_LABELS: Record<TripAgendaStatus, string> = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Aguardando conferência',
  CONFIRMED: 'Conferida',
  CANCELED: 'Cancelada',
}

export const TRIP_AGENDA_STATUS_TONES: Record<TripAgendaStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  FINISHED: 'warning',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
}
