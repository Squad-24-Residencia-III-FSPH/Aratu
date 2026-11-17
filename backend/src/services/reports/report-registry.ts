import type { ReportDefinition } from '../../types/report.types'
import type { UserRole } from '../../types/auth'
import { createFleetReports } from './definitions/fleet.reports'
import { driverReports } from './definitions/drivers.reports'
import { tripReports } from './definitions/trips.reports'
import { maintenanceReports } from './definitions/maintenance.reports'
import { authReports } from './definitions/auth.reports'
import { svoReports } from './definitions/svo.reports'

/** Registro fechado à mutação; novos relatórios são agregados pelas definições dos módulos. */
export class ReportRegistry {
  private readonly definitions: ReadonlyMap<string, ReportDefinition>
  constructor(alertDays?: number) {
    this.definitions = new Map([...createFleetReports(alertDays), ...driverReports, ...tripReports, ...maintenanceReports, ...authReports, ...svoReports].map(definition => [definition.key, definition]))
  }
  /** Localiza a definição versionada sem aceitar SQL ou projeções enviados pelo cliente. */
  get(key: string): ReportDefinition | undefined { return this.definitions.get(key) }
  /** Omite do catálogo os relatórios não autorizados para o perfil cadastral vigente. */
  forRole(role: UserRole): readonly ReportDefinition[] { return [...this.definitions.values()].filter(definition => definition.allowedRoles.includes(role)) }
}
