/** Situações de viagem que o MOTORISTA enxerga e opera em `GET /trips/mine`. */
export const DRIVER_TRIP_STATUSES = ['SCHEDULED', 'IN_PROGRESS'] as const
export type DriverTripStatus = typeof DRIVER_TRIP_STATUSES[number]

/** Ações de execução permitidas ao MOTORISTA sobre a própria viagem. */
export type TripExecutionAction = 'START' | 'FINISH'

/** Viagem pendente do motorista (contrato FROTA-99). Datas chegam em ISO 8601. */
export interface DriverTrip {
  id: string
  status: DriverTripStatus
  scheduledStart: string
  scheduledEnd: string
  startKm: number | null
  startedAt: string | null
  origin: string
  destination: string
  purpose: string
  vehicleLicensePlate: string
}

/** Viagem devolvida pelos POSTs de início e término (contrato FROTA-99). */
export interface Trip {
  id: string
  requestId: string
  vehicleId: string
  driverId: string
  scheduledStart: string
  scheduledEnd: string
  status: string
  startKm: number | null
  endKm: number | null
  startedAt: string | null
  finishedAt: string | null
  revision: number
  createdAt: string
}

/** Solicitação aprovada que pode ser selecionada no fluxo de agendamento. */
export interface ApprovedRequestSummary {
  id: string
  serviceId: string
  serviceName: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  status: 'APPROVED'
}

export interface VehicleAvailability {
  id: string
  licensePlate: string
  brand: string | null
  model: string | null
  categories: string[]
  seats: number
  bodyLimit: number
  status: string
  available: boolean
  reasons: string[]
}

export interface DriverAvailability {
  id: string
  name: string
  cnhCategory: string
  cnhExpiresAt: string
  status: string
  available: boolean
  reasons: string[]
}

export interface ScheduleTripInput {
  requestId: string
  vehicleId: string
  driverId: string
  scheduledStart: string
  scheduledEnd: string
}

/** Recortes de apresentação do conjunto de viagens já autorizado pela API. */
export const TRIP_FILTERS = ['TODAY_AND_IN_PROGRESS', 'ALL_PENDING'] as const
export type TripFilter = typeof TRIP_FILTERS[number]

/**
 * Classes de falha das chamadas de viagens do motorista.
 *
 * `network`, `server` e `invalidResponse` significam resultado incerto quando a
 * chamada é um POST: o servidor pode ter gravado a transição sem que a resposta chegasse.
 */
export type TripRequestErrorKind =
  | 'session'
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rejected'
  | 'server'
  | 'network'
  | 'invalidResponse'

/** Erro tipado que o hook usa para decidir entre erro de campo, conflito e resultado incerto. */
export class TripRequestError extends Error {
  readonly kind: TripRequestErrorKind
  readonly status: number | null

  constructor(kind: TripRequestErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'TripRequestError'
    this.kind = kind
    this.status = status
  }
}

const UNCERTAIN_KINDS: readonly TripRequestErrorKind[] = ['network', 'server', 'invalidResponse']

/** Indica se um POST falho pode ter sido executado pelo servidor sem confirmação ao cliente. */
export function isOutcomeUncertain(error: unknown): boolean {
  return error instanceof TripRequestError && UNCERTAIN_KINDS.includes(error.kind)
}
