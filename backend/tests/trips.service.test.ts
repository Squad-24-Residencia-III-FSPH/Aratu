import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { DriverAvailabilityFacts, VehicleAvailabilityFacts } from '../src/types/availability.types'
import type { CreateTripData, SchedulableRequest, Trip, TripActor } from '../src/types/trip.types'
import { TripServiceError } from '../src/types/trip.types'
import type { AvailabilityRepositoryContract } from '../src/repositories/availability.repository'
import type { TripsRepositoryContract } from '../src/repositories/trips.repository'
import { AvailabilityService } from '../src/services/availability.service'
import { TripsService } from '../src/services/trips.service'

const NOW = new Date('2026-11-09T12:00:00Z')
const fakeClient = {} as PoolClient
const manager: TripActor = { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' }
const input = {
  requestId: '41', vehicleId: '1', driverId: '7',
  scheduledStart: '2026-11-20T08:00:00-03:00', scheduledEnd: '2026-11-20T12:00:00-03:00',
}

function setup(options: {
  request?: SchedulableRequest | null
  vehicle?: Partial<VehicleAvailabilityFacts> | null
  driver?: Partial<DriverAvailabilityFacts> | null
} = {}) {
  const request = options.request === undefined
    ? { id: '41', requesterId: '3', serviceId: '5', status: 'APPROVED', revision: 2 }
    : options.request
  const vehicle = options.vehicle === null ? null : {
    id: '1', licensePlate: 'ABC1234', brand: null, model: null, categories: ['PASSENGER' as const],
    seats: 4, bodyLimit: 0, status: 'AVAILABLE' as const, compatible: true, hasConflict: false, ...options.vehicle,
  }
  const driver = options.driver === null ? null : {
    id: '7', name: 'Motorista Fictício', cnhCategory: 'D' as const, cnhExpiresAt: '2099-12-31',
    status: 'ACTIVE' as const, hasConflict: false, ...options.driver,
  }
  const created: CreateTripData[] = []
  const events: string[] = []
  const audits: CreateAuditInput[] = []

  const availabilityRepository: AvailabilityRepositoryContract = {
    async serviceExists(): Promise<boolean> { return true },
    async listVehicleFacts(): Promise<VehicleAvailabilityFacts[]> { return vehicle ? [vehicle] : [] },
    async listDriverFacts(): Promise<DriverAvailabilityFacts[]> { return driver ? [driver] : [] },
    async lockVehicle(): Promise<boolean> { events.push('lock:vehicle'); return vehicle !== null },
    async lockDriver(): Promise<boolean> { events.push('lock:driver'); return driver !== null },
  }
  const repository: TripsRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return work(fakeClient) },
    async findRequestForUpdate(): Promise<SchedulableRequest | null> { events.push('lock:request'); return request },
    async createTrip(data: CreateTripData): Promise<Trip> {
      created.push(data)
      return {
        id: '90', requestId: data.requestId, vehicleId: data.vehicleId, driverId: data.driverId,
        scheduledStart: data.scheduledStart, scheduledEnd: data.scheduledEnd, status: 'SCHEDULED',
        startKm: null, endKm: null, startedAt: null, finishedAt: null, revision: 1, createdAt: NOW,
      }
    },
    async markRequestScheduled(): Promise<SchedulableRequest | null> {
      return request ? { ...request, status: 'SCHEDULED', revision: request.revision + 1 } : null
    },
    async createTripEvent(): Promise<void> { events.push('event:trip') },
    async createRequestEvent(): Promise<void> { events.push('event:request') },
    async findActorSnapshot(): Promise<TripActor> { return manager },
    async findTripForUpdate(): Promise<Trip | null> { return null },
    async findDriverByUserId(): Promise<null> { return null },
    async lockVehicle(): Promise<void> {},
    async saveStart(): Promise<Trip | null> { return null },
    async saveFinish(): Promise<Trip | null> { return null },
    async createOdometerReading(): Promise<void> {},
    async listDriverTrips(): Promise<[]> { return [] },
    async saveConfirmation(): Promise<null> { return null },
    async listTrips(): Promise<[]> { return [] },
  }
  const auditService: AuditLogger = {
    async recordAudit(audit): Promise<AuditEntry> {
      audits.push(audit)
      return {
        id: '1', userId: '8', table: audit.table, recordId: String(audit.recordId), operation: audit.operation,
        before: null, after: null, actorSnapshot: null, reason: audit.reason ?? null, registeredAt: NOW,
      }
    },
  }
  const availability = new AvailabilityService(availabilityRepository, () => '2026-11-09')
  const odometer = { async timeline() { return { facts: [], valid: true } } }
  return { service: new TripsService(repository, availability, auditService, odometer, () => NOW), created, events, audits }
}

function domainError(statusCode: number, messagePart?: string) {
  return (error: unknown) => error instanceof TripServiceError
    && error.statusCode === statusCode
    && (!messagePart || error.message.includes(messagePart))
}

test('agendamento trava solicitação, veículo e motorista nessa ordem e grava viagem, eventos e auditoria', async () => {
  const context = setup()
  const trip = await context.service.scheduleTrip(input, manager.id)

  assert.equal(trip.status, 'SCHEDULED')
  assert.deepEqual(context.events, ['lock:request', 'lock:vehicle', 'lock:driver', 'event:trip', 'event:request'])
  assert.equal(context.created[0]?.vehicleSnapshot.licensePlate, 'ABC1234')
  assert.equal(context.created[0]?.driverSnapshot.name, 'Motorista Fictício')
  assert.equal(context.audits[0]?.table, 'trip.trips')
  assert.equal(context.audits[0]?.reason, 'Viagem agendada')
})

test('dados inválidos retornam 400 e início no passado 422', async () => {
  const { service } = setup()
  await assert.rejects(service.scheduleTrip({ ...input, vehicleId: undefined }, manager.id), domainError(400))
  await assert.rejects(service.scheduleTrip({ ...input, scheduledEnd: input.scheduledStart }, manager.id), domainError(400))
  await assert.rejects(service.scheduleTrip({ ...input, scheduledStart: '2026-11-20T08:00:00' }, manager.id), domainError(400))
  await assert.rejects(
    service.scheduleTrip({ ...input, scheduledStart: '2026-11-01T08:00:00-03:00', scheduledEnd: '2026-11-01T10:00:00-03:00' }, manager.id),
    domainError(422, 'passado'),
  )
})

test('solicitação ausente 404 e não aprovada 409', async () => {
  await assert.rejects(setup({ request: null }).service.scheduleTrip(input, manager.id), domainError(404))
  await assert.rejects(
    setup({ request: { id: '41', requesterId: '3', serviceId: '5', status: 'PENDING', revision: 1 } }).service.scheduleTrip(input, manager.id),
    domainError(409, 'aprovadas'),
  )
})

test('conflito de agenda retorna 409 e nada é gravado', async () => {
  const context = setup({ vehicle: { hasConflict: true }, driver: { hasConflict: true } })
  await assert.rejects(context.service.scheduleTrip(input, manager.id), domainError(409, 'O veículo já tem viagem no período. O motorista já tem viagem no período.'))
  assert.equal(context.created.length, 0)
})

test('indisponibilidade de cadastro retorna 422 e prevalece sobre o conflito', async () => {
  await assert.rejects(
    setup({ vehicle: { status: 'IN_MAINTENANCE', hasConflict: true } }).service.scheduleTrip(input, manager.id),
    domainError(422, 'está em manutenção'),
  )
  await assert.rejects(setup({ vehicle: { compatible: false } }).service.scheduleTrip(input, manager.id), domainError(422, 'tipo de serviço'))
  await assert.rejects(setup({ driver: { cnhExpiresAt: '2026-11-19' } }).service.scheduleTrip(input, manager.id), domainError(422, 'CNH vencida'))
  await assert.rejects(setup({ driver: { status: 'AWAY' } }).service.scheduleTrip(input, manager.id), domainError(422, 'afastado'))
})

test('veículo ou motorista inexistente retorna 404', async () => {
  await assert.rejects(setup({ vehicle: null }).service.scheduleTrip(input, manager.id), domainError(404, 'Veículo'))
  await assert.rejects(setup({ driver: null }).service.scheduleTrip(input, manager.id), domainError(404, 'Motorista'))
})
