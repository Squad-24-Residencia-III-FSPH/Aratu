import type { StatusTone } from '../components/ui/StatusChip.tsx'
import type { DriverTrip, DriverTripStatus, Trip, TripExecutionAction, TripFilter } from './tripTypes.ts'

/** Fuso em que a FSPH opera; define o "dia" das viagens independentemente do aparelho. */
export const OPERATIONAL_TIME_ZONE = 'America/Maceio'

export const TRIP_STATUS_LABELS: Readonly<Record<DriverTripStatus, string>> = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
}

export const TRIP_STATUS_TONES: Readonly<Record<DriverTripStatus, StatusTone>> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
}

export const TRIP_FILTER_LABELS: Readonly<Record<TripFilter, string>> = {
  TODAY_AND_IN_PROGRESS: 'Hoje e em andamento',
  ALL_PENDING: 'Todas as pendentes',
}

/** Única ação de execução disponível em cada situação; também define a compatibilidade da ação com a viagem. */
export const NEXT_ACTION: Readonly<Record<DriverTripStatus, TripExecutionAction>> = {
  SCHEDULED: 'START',
  IN_PROGRESS: 'FINISH',
}

export const ACTION_LABELS: Readonly<Record<TripExecutionAction, string>> = {
  START: 'Iniciar viagem',
  FINISH: 'Finalizar viagem',
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OPERATIONAL_TIME_ZONE, dateStyle: 'short', timeStyle: 'short',
})
const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

/** Dia civil (`AAAA-MM-DD`) de um instante no fuso operacional. */
export function operationalDay(value: string | Date): string {
  return DAY_FORMAT.format(typeof value === 'string' ? new Date(value) : value)
}

/** Data e hora em pt-BR no fuso operacional, o mesmo usado no recorte "hoje". */
export function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value))
}

export function formatKm(value: number): string {
  return `${NUMBER_FORMAT.format(value)} km`
}

/**
 * Aplica o recorte de apresentação e ordena pelo início agendado.
 *
 * "Hoje e em andamento" mostra as agendadas cujo início cai hoje e todas as em andamento
 * (inclusive iniciadas em dias anteriores), sem duplicar. O filtro não altera permissões:
 * o conjunto autorizado continua sendo o devolvido pela API. A ordenação é estável,
 * então viagens com o mesmo início mantêm a ordem recebida.
 */
export function selectTrips(trips: readonly DriverTrip[], filter: TripFilter, now: Date): DriverTrip[] {
  const today = operationalDay(now)
  const visible = filter === 'ALL_PENDING'
    ? [...trips]
    : trips.filter((trip) => trip.status === 'IN_PROGRESS' || operationalDay(trip.scheduledStart) === today)
  return visible.sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart))
}

/** Mensagem de sucesso montada somente com valores confirmados pelo servidor. */
export function confirmationMessage(action: TripExecutionAction, trip: Trip): string {
  if (action === 'START') {
    const when = trip.startedAt ? ` em ${formatDateTime(trip.startedAt)}` : ''
    const km = trip.startKm !== null ? ` com ${formatKm(trip.startKm)}` : ''
    return `Viagem #${trip.id} iniciada${when}${km}. Ela segue em andamento nesta lista.`
  }
  const when = trip.finishedAt ? ` em ${formatDateTime(trip.finishedAt)}` : ''
  const km = trip.endKm !== null ? ` com ${formatKm(trip.endKm)}` : ''
  return `Viagem #${trip.id} finalizada${when}${km}. Ela saiu da lista de pendentes e o registro foi mantido no histórico.`
}

export type KmParseResult = { ok: true; value: number } | { ok: false; error: string }

const KM_PATTERN = /^\d+$/

/**
 * Valida a quilometragem digitada: inteiro seguro e não negativo. Vazio nunca vira zero.
 * A comparação com a última leitura do veículo permanece com a API.
 */
export function parseKmInput(text: string): KmParseResult {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, error: 'Informe a quilometragem em km.' }
  if (!KM_PATTERN.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
    return { ok: false, error: 'Use apenas números inteiros, sem pontos, vírgulas ou sinais. Exemplo: 1500.' }
  }
  return { ok: true, value: Number(trimmed) }
}
