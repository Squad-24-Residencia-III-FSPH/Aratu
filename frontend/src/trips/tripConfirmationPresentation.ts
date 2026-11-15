import type { TripConfirmationItem } from './tripConfirmationTypes.ts'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short',
})
const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

/** Formata um instante da viagem no fuso operacional usado pela API. */
export function formatTripInstant(value: string | null): string {
  return value ? DATE_TIME_FORMAT.format(new Date(value)) : 'Não informado'
}

/** Exibe quilômetros sem transformar dado ausente em zero. */
export function formatTripOdometer(value: number | null): string {
  return value === null ? 'Não informado' : `${NUMBER_FORMAT.format(value)} km`
}

/** Calcula a distância somente quando os dois hodômetros foram registrados. */
export function tripDistance(startKm: number | null, endKm: number | null): number | null {
  return startKm === null || endKm === null ? null : endKm - startKm
}

/** A API exige ambos os hodômetros antes de aceitar a confirmação. */
export function canConfirmTrip(trip: TripConfirmationItem): boolean {
  return trip.startKm !== null && trip.endKm !== null
}

/** Aplica filtros de veículo e motorista usando apenas os snapshots da resposta da API. */
export function filterConfirmationTrips(
  trips: readonly TripConfirmationItem[],
  vehicle: string,
  driver: string,
): TripConfirmationItem[] {
  return trips.filter((trip) => (!vehicle || trip.vehicleLicensePlate === vehicle)
    && (!driver || trip.driverName === driver))
}

/** Produz opções determinísticas com os valores já carregados, sem criar catálogos paralelos. */
export function confirmationFilterOptions(trips: readonly TripConfirmationItem[], field: 'vehicleLicensePlate' | 'driverName') {
  return [...new Set(trips.map((trip) => trip[field]))]
    .sort((first, second) => first.localeCompare(second, 'pt-BR'))
    .map((value) => ({ value, label: value }))
}
