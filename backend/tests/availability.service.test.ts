import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type {
  DriverAvailabilityFacts,
  Period,
  VehicleAvailabilityFacts,
} from '../src/types/availability.types'
import { AvailabilityError } from '../src/types/availability.types'
import type { AvailabilityRepositoryContract } from '../src/repositories/availability.repository'
import { AvailabilityService, parsePeriod } from '../src/services/availability.service'

const TODAY = '2026-11-09'
const fakeClient = {} as PoolClient
const query = { start: '2026-11-20T08:00:00-03:00', end: '2026-11-20T12:00:00-03:00', serviceId: '5' }

function vehicle(overrides: Partial<VehicleAvailabilityFacts> = {}): VehicleAvailabilityFacts {
  return {
    id: '1', licensePlate: 'ABC1234', brand: null, model: null, categories: ['PASSENGER'],
    seats: 4, bodyLimit: 0, status: 'AVAILABLE', compatible: true, hasConflict: false, ...overrides,
  }
}

function driver(overrides: Partial<DriverAvailabilityFacts> = {}): DriverAvailabilityFacts {
  return {
    id: '7', name: 'Motorista Fictício', cnhCategory: 'D', cnhExpiresAt: '2099-12-31',
    status: 'ACTIVE', hasConflict: false, ...overrides,
  }
}

function setup(vehicles: VehicleAvailabilityFacts[], drivers: DriverAvailabilityFacts[], serviceExists = true) {
  const locked: string[] = []
  const repository: AvailabilityRepositoryContract = {
    async serviceExists(): Promise<boolean> { return serviceExists },
    async listVehicleFacts(_serviceId: string, _period: Period, vehicleId: string | null): Promise<VehicleAvailabilityFacts[]> {
      return vehicleId ? vehicles.filter((item) => item.id === vehicleId) : vehicles.filter((item) => item.status !== 'INACTIVE')
    },
    async listDriverFacts(_period: Period, driverId: string | null): Promise<DriverAvailabilityFacts[]> {
      return driverId ? drivers.filter((item) => item.id === driverId) : drivers.filter((item) => item.status !== 'INACTIVE')
    },
    async lockVehicle(vehicleId: string): Promise<boolean> { locked.push(`vehicle:${vehicleId}`); return vehicles.some((item) => item.id === vehicleId) },
    async lockDriver(driverId: string): Promise<boolean> { locked.push(`driver:${driverId}`); return drivers.some((item) => item.id === driverId) },
  }
  return { service: new AvailabilityService(repository, () => TODAY), locked }
}

function domainError(statusCode: number) {
  return (error: unknown) => error instanceof AvailabilityError && error.statusCode === statusCode
}

test('período exige ISO 8601 com fuso e fim posterior ao início', () => {
  const period = parsePeriod('2026-11-20T08:00:00-03:00', '2026-11-20T13:00Z')
  assert.equal(period.start.toISOString(), '2026-11-20T11:00:00.000Z')
  assert.throws(() => parsePeriod('2026-11-20T08:00:00-03:00', '2026-11-20T10:00Z'), domainError(400))
  assert.throws(() => parsePeriod('2026-02-30T10:00:00-03:00', '2026-03-05T11:00:00-03:00'), domainError(400))
  assert.throws(() => parsePeriod('2026-11-20T08:00:00', '2026-11-20T10:00:00-03:00'), domainError(400))
  assert.throws(() => parsePeriod('2026-11-20', '2026-11-21T10:00:00-03:00'), domainError(400))
  assert.throws(() => parsePeriod('2026-11-20T10:00:00-03:00', '2026-11-20T10:00:00-03:00'), domainError(400))
  assert.throws(() => parsePeriod('2026-13-40T10:00:00-03:00', '2026-11-20T11:00:00-03:00'), domainError(400))
})

test('veículos trazem disponibilidade e motivos acumulados', async () => {
  const { service } = setup([
    vehicle({ id: '1' }),
    vehicle({ id: '2', status: 'IN_MAINTENANCE', compatible: false }),
    vehicle({ id: '3', hasConflict: true }),
  ], [])
  const result = await service.listVehicles(query)
  assert.deepEqual(result.map((item) => [item.id, item.available, item.reasons]), [
    ['1', true, []],
    ['2', false, ['MAINTENANCE', 'INCOMPATIBLE']],
    ['3', false, ['CONFLICT']],
  ])
  assert.equal('compatible' in (result[0] ?? {}), false)
})

test('consulta de veículos exige serviceId válido (400) e existente (404)', async () => {
  await assert.rejects(setup([], []).service.listVehicles({ ...query, serviceId: undefined }), domainError(400))
  await assert.rejects(setup([], []).service.listVehicles({ ...query, serviceId: 'abc' }), domainError(400))
  await assert.rejects(setup([], [], false).service.listVehicles(query), domainError(404))
})

test('motoristas: afastado, CNH vencendo antes do fim da viagem e conflito', async () => {
  const { service } = setup([], [
    driver({ id: '1' }),
    driver({ id: '2', status: 'AWAY' }),
    driver({ id: '3', cnhExpiresAt: '2026-11-15' }),
    driver({ id: '4', cnhExpiresAt: '2026-11-20' }),
    driver({ id: '5', hasConflict: true, cnhExpiresAt: '2026-11-01' }),
  ])
  const result = await service.listDrivers(query)
  assert.deepEqual(result.map((item) => [item.id, item.available, item.reasons]), [
    ['1', true, []],
    ['2', false, ['AWAY']],
    ['3', false, ['CNH_EXPIRED']],
    ['4', true, []],
    ['5', false, ['CNH_EXPIRED', 'CONFLICT']],
  ])
})

test('avaliação para o agendamento trava o registro e reconhece inativos', async () => {
  const { service, locked } = setup([vehicle({ id: '9', status: 'INACTIVE' })], [driver({ id: '8', status: 'INACTIVE' })])
  const period = parsePeriod(query.start, query.end)
  const assessedVehicle = await service.assessVehicle('9', '5', period, fakeClient)
  const assessedDriver = await service.assessDriver('8', period, fakeClient)
  assert.deepEqual(assessedVehicle?.reasons, ['INACTIVE'])
  assert.deepEqual(assessedDriver?.reasons, ['INACTIVE'])
  assert.deepEqual(locked, ['vehicle:9', 'driver:8'])
  assert.equal(await service.assessVehicle('404', '5', period, fakeClient), null)
})
