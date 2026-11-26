import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  DashboardPeriod,
  DashboardSummaryCounts,
  DashboardSvoIndicators,
  DashboardSvoSummary,
  VehicleIndicatorsRow,
} from '../src/types/dashboard.types'
import { DashboardError } from '../src/types/dashboard.types'
import type { DashboardRepositoryContract } from '../src/repositories/dashboard.repository'
import { DashboardService } from '../src/services/dashboard.service'

const NO_PERMISSIONS = [] as const
const SVO_DASHBOARD_PERMISSION = ['dashboard:svo:read'] as const

const totals = {
  tripsCount: 3, kmDriven: 300, litersFueled: 30, fuelCost: 180, averageConsumptionKmPerLiter: 10,
  maintenanceOrdersOpened: 2, preventiveMaintenanceOrdersOpened: 1, correctiveMaintenanceOrdersOpened: 1,
  vehiclesWithCorrectiveMaintenance: 1, maintenanceCost: 500,
}
const row: VehicleIndicatorsRow = {
  vehicleId: '1', licensePlate: 'ABC1234', tripsCount: 3, kmDriven: 300, litersFueled: 30, fuelCost: 180,
  averageConsumptionKmPerLiter: 10, maintenanceOrdersOpened: 2, preventiveMaintenanceOrdersOpened: 1,
  correctiveMaintenanceOrdersOpened: 1, vehiclesWithCorrectiveMaintenance: 1, maintenanceCost: 500, totals,
}

function setup(rows: VehicleIndicatorsRow[] = [row], vehicles: string[] = ['1']) {
  const calls: { period?: DashboardPeriod; vehicleId?: string | null; svo: number } = { svo: 0 }
  const repository: DashboardRepositoryContract = {
    async summary(): Promise<DashboardSummaryCounts> {
      return {
        fleet: { available: 2, inMaintenance: 1, inactive: 0, total: 3 },
        drivers: { active: 2, away: 0, inactive: 0, total: 2, cnhExpiring: 0, cnhExpired: 0 },
        fines: { pending: 1, paid: 1, contested: 0 },
        pendingRequests: 4, tripsInProgress: 1, vehiclesInTrip: 1, tripsToConfirm: 1,
        documents: { expiring: 2, expired: 1 },
      }
    },
    async svoSummary(): Promise<DashboardSvoSummary> { calls.svo += 1; return { ordersInProgress: 1, vehicles: { total: 2, busy: 1, occupancyRate: 50 } } },
    async vehicleIndicators(period: DashboardPeriod, vehicleId: string | null) { calls.period = period; calls.vehicleId = vehicleId; return rows },
    async activitySeries() { return [] },
    async svoIndicators(): Promise<DashboardSvoIndicators> { calls.svo += 1; return { ordersOpened: 2, ordersCollected: 1, averageMinutesToCollection: 45 } },
    async vehicleExists(id: string) { return vehicles.includes(id) },
  }
  return { service: new DashboardService(repository, 30), calls }
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof DashboardError && error.statusCode === statusCode
}

test('summary devolve os cards, a janela de documentos e o SVO para perfis com acesso', async () => {
  const { service } = setup()
  const summary = await service.getSummary(SVO_DASHBOARD_PERMISSION)
  assert.equal(summary.pendingRequests, 4)
  assert.deepEqual(summary.documents, { expiring: 2, expired: 1, alertDays: 30 })
  assert.equal(summary.svo?.vehicles.occupancyRate, 50)
  assert.ok(summary.generatedAt)
})

test('perfis sem acesso ao SVO não recebem nem disparam as consultas do SVO', async () => {
  const context = setup()
  const summary = await context.service.getSummary(NO_PERMISSIONS)
  const indicators = await context.service.getIndicators({ from: '2026-11-01', to: '2026-12-01' }, NO_PERMISSIONS)
  assert.equal(summary.svo, undefined)
  assert.equal(indicators.svo, undefined)
  assert.equal(context.calls.svo, 0)
  assert.deepEqual(indicators.pendingValidation, ['averageConsumptionKmPerLiter'])
})

test('indicators separa os totais das linhas e lista as propostas pendentes', async () => {
  const context = setup()
  const indicators = await context.service.getIndicators({ from: '2026-11-01', to: '2026-12-01', vehicleId: '1' }, SVO_DASHBOARD_PERMISSION)
  assert.deepEqual(indicators.period, { from: '2026-11-01', to: '2026-12-01' })
  assert.equal('totals' in (indicators.vehicles[0] ?? {}), false)
  assert.deepEqual(indicators.totals, totals)
  assert.equal(context.calls.vehicleId, '1')
  assert.deepEqual(indicators.pendingValidation, ['averageConsumptionKmPerLiter', 'svo.averageMinutesToCollection'])
})

test('sem veículos no período os totais são zero e o consumo é nulo', async () => {
  const indicators = await setup([]).service.getIndicators({ from: '2026-11-01', to: '2026-11-02' }, NO_PERMISSIONS)
  assert.deepEqual(indicators.vehicles, [])
  assert.deepEqual(indicators.totals, {
    tripsCount: 0, kmDriven: 0, litersFueled: 0, fuelCost: 0, averageConsumptionKmPerLiter: null,
    maintenanceOrdersOpened: 0, preventiveMaintenanceOrdersOpened: 0, correctiveMaintenanceOrdersOpened: 0,
    vehiclesWithCorrectiveMaintenance: 0, maintenanceCost: 0,
  })
})

test('período inválido: ausente, mal formatado, data inexistente, fim não posterior e acima de 366 dias → 400', async () => {
  const { service } = setup()
  for (const query of [
    {}, { from: '2026-11-01' }, { from: '01/11/2026', to: '2026-12-01' }, { from: '2026-02-30', to: '2026-03-10' },
    { from: '2026-11-01', to: '2026-11-01' }, { from: '2026-12-01', to: '2026-11-01' }, { from: '2025-01-01', to: '2026-01-03' },
  ]) {
    await assert.rejects(service.getIndicators(query, NO_PERMISSIONS), domainError(400), JSON.stringify(query))
  }
  const longest = await service.getIndicators({ from: '2025-01-01', to: '2026-01-02' }, NO_PERMISSIONS)
  assert.equal(longest.period.to, '2026-01-02')
})

test('vehicleId malformado → 400 e inexistente → 404', async () => {
  const { service } = setup()
  await assert.rejects(service.getIndicators({ from: '2026-11-01', to: '2026-12-01', vehicleId: 'abc' }, NO_PERMISSIONS), domainError(400))
  await assert.rejects(service.getIndicators({ from: '2026-11-01', to: '2026-12-01', vehicleId: '99' }, NO_PERMISSIONS), domainError(404))
})
