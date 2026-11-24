import type { Profile } from '../auth/profiles.ts'

/** Caminho canônico da tela dedicada de agenda de viagens do Gestor (FROTA / T04-P03). */
export const TRIP_AGENDA_PATH = '/viagens/agenda'

/** Perfis autorizados a consultar `GET /trips` (`SCHEDULING_ROLES` em `backend/src/routes/trips.routes.ts`). */
export const TRIP_AGENDA_ROLES: readonly Profile[] = ['GESTOR']

/** Perfis autorizados a consultar o Dashboard gerencial (`MANAGEMENT_ROLES` em `backend/src/routes/dashboard.routes.ts`). */
export const DASHBOARD_READ_ROLES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Indica se o perfil possui permissão para consultar a agenda de viagens (`GET /trips`). */
export function canAccessTripAgenda(profile: Profile | null): boolean {
  return profile !== null && TRIP_AGENDA_ROLES.includes(profile)
}

/** Indica se o perfil possui permissão para consultar o Dashboard gerencial. */
export function canAccessDashboard(profile: Profile | null): boolean {
  return profile !== null && DASHBOARD_READ_ROLES.includes(profile)
}

/** Estados operacionais ativos exibidos por padrão na Agenda de hoje e em `TripAgendaPage` (exclui `CANCELED`). */
export const ACTIVE_TRIP_AGENDA_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CONFIRMED'] as const

/** Indicadores calculados como proposta, ainda pendentes de validação do cliente (FROTA-128). */
export const PENDING_VALIDATION_INDICATORS = {
  averageConsumption: 'averageConsumptionKmPerLiter',
  svoTimeToCollection: 'svo.averageMinutesToCollection',
} as const

/** Intervalo máximo do período do dashboard, igual ao dos relatórios gerenciais. */
export const DASHBOARD_MAX_PERIOD_DAYS = 366

/** Contagens da frota no retrato atual do dashboard. */
export interface DashboardFleetSummary {
  available: number
  inMaintenance: number
  inactive: number
  total: number
}

/** Situação atual do SVO devolvida apenas a perfis autorizados. */
export interface DashboardSvoSummary {
  ordersInProgress: number
  vehicles: {
    total: number
    busy: number
    occupancyRate: number | null
  }
}

/** Resposta de `GET /dashboard/summary`. */
export interface DashboardSummary {
  generatedAt: string
  fleet: DashboardFleetSummary
  pendingRequests: number
  tripsToConfirm: number
  documents: {
    expiring: number
    expired: number
    alertDays: number
  }
  svo?: DashboardSvoSummary
}

/** Medidas de uso e custo de um veículo (ou do total) no período. */
export interface VehicleIndicatorMeasures {
  tripsCount: number
  kmDriven: number
  litersFueled: number
  fuelCost: number
  averageConsumptionKmPerLiter: number | null
  maintenanceCost: number
}

/** Linha por veículo de `GET /dashboard/indicators`. */
export interface VehicleIndicators extends VehicleIndicatorMeasures {
  vehicleId: string
  licensePlate: string
}

/** Indicadores do SVO no período selecionado. */
export interface DashboardSvoIndicators {
  ordersOpened: number
  ordersCollected: number
  averageMinutesToCollection: number | null
}

/** Resposta de `GET /dashboard/indicators`. */
export interface DashboardIndicators {
  period: {
    from: string
    to: string
  }
  vehicles: VehicleIndicators[]
  totals: VehicleIndicatorMeasures
  svo?: DashboardSvoIndicators
  pendingValidation: string[]
}

/** Parâmetros enviados a `GET /dashboard/indicators` (`to` exclusivo em `America/Maceio`). */
export interface DashboardIndicatorsQuery {
  from: string
  to: string
  vehicleId?: string
}

/** Atalhos de recorte de período disponíveis no painel. */
export type DashboardPeriodPreset = 'today' | '7days' | '30days' | '6months' | 'custom'

/** Viagem resumida devolvida por `GET /trips` para a agenda do Gestor. */
export interface GestorTripAgendaItem {
  id: string
  requestId: string
  status: string
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
}

/** Filtros suportados pela consulta gerencial `GET /trips`. */
export interface GestorTripAgendaFilters {
  from?: string
  to?: string
  status?: string
}

/** Classificação das falhas de comunicação com a API do dashboard. */
export type DashboardRequestErrorKind =
  | 'session'
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'server'
  | 'network'
  | 'invalidResponse'

/** Erro tipado do serviço do dashboard com mensagem segura para exibição em tela. */
export class DashboardRequestError extends Error {
  readonly kind: DashboardRequestErrorKind
  readonly status?: number

  constructor(kind: DashboardRequestErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'DashboardRequestError'
    this.kind = kind
    this.status = status
  }
}
