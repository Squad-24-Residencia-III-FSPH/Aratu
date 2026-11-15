/** Viagem finalizada devolvida pelo contrato de listagem gerencial FROTA-106. */
export const TRIP_CONFIRMATION_PATH = '/viagens/confirmacao'

export interface TripConfirmationItem {
  id: string
  requestId: string
  status: 'FINISHED'
  scheduledStart: string
  scheduledEnd: string
  startedAt: string | null
  finishedAt: string | null
  startKm: number | null
  endKm: number | null
  vehicleLicensePlate: string
  driverName: string
  origin: string
  destination: string
  confirmedBy: string | null
  confirmedAt: string | null
}

/** Filtros suportados pelo GET gerencial de viagens. */
export interface TripConfirmationFilters {
  from?: string
  to?: string
}

/** Resultado da transição FINISHED → CONFIRMED realizada pelo Gestor. */
export interface TripConfirmationResult {
  id: string
  status: 'CONFIRMED'
  confirmedBy: string
  confirmedAt: string
  revision: number
}
