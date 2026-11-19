import type { UserRole } from '../types/auth'
import {
  DASHBOARD_MAX_PERIOD_DAYS,
  DashboardError,
  PENDING_VALIDATION_INDICATORS,
} from '../types/dashboard.types'
import type {
  DashboardIndicators,
  DashboardIndicatorsQuery,
  DashboardPeriod,
  DashboardSummary,
  VehicleIndicatorMeasures,
} from '../types/dashboard.types'
import type { DashboardRepositoryContract } from '../repositories/dashboard.repository'
import { SVO_REPORT_ROLES } from './reports/definitions/report-definition'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ID_PATTERN = /^[1-9]\d{0,18}$/
const DAY_MS = 86_400_000
const EMPTY_TOTALS: VehicleIndicatorMeasures = {
  tripsCount: 0,
  kmDriven: 0,
  litersFueled: 0,
  fuelCost: 0,
  averageConsumptionKmPerLiter: null,
  maintenanceCost: 0,
}

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new DashboardError(400, `Informe ${field} no formato AAAA-MM-DD.`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DashboardError(400, `${field} não é uma data válida.`)
  }
  return value
}

/** Indica se o perfil pode ver os indicadores do SVO (mesma regra dos relatórios do SVO). */
export function canSeeSvo(role: UserRole | undefined): boolean {
  return SVO_REPORT_ROLES.some((allowed) => allowed === role)
}

/** Indicadores do dashboard gerencial (US21), conforme a definição da FROTA-128. */
export class DashboardService {
  /**
   * @param alertDays - Janela de documentos a vencer, a mesma do módulo de documentos.
   */
  constructor(
    private readonly repository: DashboardRepositoryContract,
    private readonly alertDays: number,
  ) {}

  /**
   * Retrato atual da operação (sem período); o bloco do SVO só é calculado para perfis com acesso ao SVO.
   */
  async getSummary(role: UserRole | undefined): Promise<DashboardSummary> {
    const counts = await this.repository.summary(this.alertDays)
    const summary: DashboardSummary = {
      generatedAt: new Date().toISOString(),
      ...counts,
      documents: { ...counts.documents, alertDays: this.alertDays },
    }
    if (canSeeSvo(role)) summary.svo = await this.repository.svoSummary()
    return summary
  }

  /**
   * Indicadores de uso e custo por veículo no período `[from, to)`, com totais e bloco do SVO quando permitido.
   *
   * Consumo médio e tempo até a coleta são propostas ainda não validadas pelo cliente e vêm listados em
   * `pendingValidation`.
   *
   * @throws {DashboardError} 400 período ou veículo inválido; 404 veículo inexistente.
   */
  async getIndicators(query: DashboardIndicatorsQuery, role: UserRole | undefined): Promise<DashboardIndicators> {
    const period = this.validatePeriod(query.from, query.to)
    const vehicleId = await this.validateVehicle(query.vehicleId)
    const rows = await this.repository.vehicleIndicators(period, vehicleId)
    const indicators: DashboardIndicators = {
      period,
      vehicles: rows.map(({ totals: _totals, ...vehicle }) => vehicle),
      totals: rows[0]?.totals ?? EMPTY_TOTALS,
      pendingValidation: [PENDING_VALIDATION_INDICATORS.averageConsumption],
    }
    if (canSeeSvo(role)) {
      indicators.svo = await this.repository.svoIndicators(period, vehicleId)
      indicators.pendingValidation.push(PENDING_VALIDATION_INDICATORS.svoTimeToCollection)
    }
    return indicators
  }

  private validatePeriod(from: unknown, to: unknown): DashboardPeriod {
    if (from === undefined || to === undefined) {
      throw new DashboardError(400, 'Informe o período com from e to no formato AAAA-MM-DD.')
    }
    const period = { from: parseDate(from, 'from'), to: parseDate(to, 'to') }
    const days = (Date.parse(period.to) - Date.parse(period.from)) / DAY_MS
    if (days < 1) throw new DashboardError(400, 'A data final (to, excluída) deve ser posterior à data inicial (from).')
    if (days > DASHBOARD_MAX_PERIOD_DAYS) {
      throw new DashboardError(400, `O período máximo do dashboard é de ${DASHBOARD_MAX_PERIOD_DAYS} dias.`)
    }
    return period
  }

  private async validateVehicle(value: unknown): Promise<string | null> {
    if (value === undefined) return null
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      throw new DashboardError(400, 'vehicleId deve ser um identificador válido.')
    }
    if (!(await this.repository.vehicleExists(value))) throw new DashboardError(404, 'Veículo não encontrado.')
    return value
  }
}
