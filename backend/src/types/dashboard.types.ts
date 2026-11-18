/** Indicadores calculados como proposta, ainda pendentes de validação do cliente (FROTA-128). */
export const PENDING_VALIDATION_INDICATORS = {
  averageConsumption: 'averageConsumptionKmPerLiter',
  svoTimeToCollection: 'svo.averageMinutesToCollection',
} as const

/** Intervalo máximo do período, igual ao dos relatórios gerenciais. */
export const DASHBOARD_MAX_PERIOD_DAYS = 366

/** Cards de situação atual da operação (sem período). */
export interface DashboardSummaryCounts {
  fleet: { available: number; inMaintenance: number; inactive: number; total: number }
  pendingRequests: number
  tripsToConfirm: number
  documents: { expiring: number; expired: number }
}

/** Situação atual do SVO, entregue só a perfis com acesso ao SVO. */
export interface DashboardSvoSummary {
  ordersInProgress: number
  vehicles: { total: number; busy: number; occupancyRate: number | null }
}

/** Resposta de `GET /dashboard/summary`. */
export interface DashboardSummary extends DashboardSummaryCounts {
  generatedAt: string
  documents: DashboardSummaryCounts['documents'] & { alertDays: number }
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

/** Linha devolvida pelo repositório: medidas do veículo e totais do período (iguais em todas as linhas). */
export interface VehicleIndicatorsRow extends VehicleIndicators {
  totals: VehicleIndicatorMeasures
}

/** Indicadores do SVO no período. */
export interface DashboardSvoIndicators {
  ordersOpened: number
  ordersCollected: number
  averageMinutesToCollection: number | null
}

/** Resposta de `GET /dashboard/indicators`. */
export interface DashboardIndicators {
  period: { from: string; to: string }
  vehicles: VehicleIndicators[]
  totals: VehicleIndicatorMeasures
  svo?: DashboardSvoIndicators
  pendingValidation: string[]
}

/** Período validado: datas civis de Aracaju, `to` excluído. */
export interface DashboardPeriod {
  from: string
  to: string
}

/** Parâmetros brutos de `GET /dashboard/indicators`. */
export interface DashboardIndicatorsQuery {
  from?: unknown
  to?: unknown
  vehicleId?: unknown
}

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class DashboardError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'DashboardError'
    this.statusCode = statusCode
  }
}
