import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { DriverAvailabilityFacts, VehicleAvailabilityFacts } from '../src/types/availability.types'
import type { CreateTripData, ScheduleTripInput, SchedulableRequest, Trip, TripActor, TripServiceSnapshot } from '../src/types/trip.types'
import { TripServiceError } from '../src/types/trip.types'
import type { AvailabilityRepositoryContract } from '../src/repositories/availability.repository'
import type { TripsRepositoryContract } from '../src/repositories/trips.repository'
import { AvailabilityService } from '../src/services/availability.service'
import { TripsService } from '../src/services/trips.service'

const NOW = new Date('2026-11-09T12:00:00Z')
const fakeClient = {} as PoolClient
const manager: TripActor = { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' }
const serviceSnapshot: TripServiceSnapshot = {
  id: '5', name: 'Transporte de equipe', categories: ['PASSENGER'],
  requiresTriage: false, requiresWeight: false, requiresIdentification: false, revision: 1,
}
const pendingRequest: SchedulableRequest = {
  id: '41', requesterId: '3', serviceId: null, status: 'PENDING', revision: 1,
  requestedDate: '2026-11-20', requestedTime: '08:00', origin: 'Origem fictícia',
  destination: 'Destino fictício', purpose: 'Finalidade fictícia', passengers: 2,
  specialRequirements: null, notes: null,
}
const input: ScheduleTripInput = {
  requestId: '41', expectedRevision: 1, serviceId: '5', vehicleId: '1', driverId: '7',
  scheduledStart: '2026-11-20T08:00:00-03:00', scheduledEnd: '2026-11-20T12:00:00-03:00',
}
const IDEMPOTENCY_KEY = '4d80aa5a-3a11-49a3-a1fa-8cb555384f29'

function setup(options: {
  request?: SchedulableRequest | null
  vehicle?: Partial<VehicleAvailabilityFacts> | null
  driver?: Partial<DriverAvailabilityFacts> | null
} = {}) {
  const request = options.request === undefined
    ? pendingRequest
    : options.request
  let currentRequest = request
  const vehicle = options.vehicle === null ? null : {
    id: '1', licensePlate: 'ABC1234', brand: null, model: null, categories: ['PASSENGER' as const],
    seats: 4, bodyLimit: 0, status: 'AVAILABLE' as const, compatible: true, hasConflict: false, ...options.vehicle,
  }
  const driver = options.driver === null ? null : {
    id: '7', name: 'Motorista Fictício', cnhCategory: 'D' as const, cnhExpiresAt: '2099-12-31',
    status: 'ACTIVE' as const, hasConflict: false, accountEligible: true, ...options.driver,
  }
  const created: CreateTripData[] = []
  const events: string[] = []
  const audits: CreateAuditInput[] = []

  const availabilityRepository: AvailabilityRepositoryContract = {
    async findRequestForAvailability() { return null },
    async serviceExists(): Promise<boolean> { return true },
    async listVehicleFacts(): Promise<VehicleAvailabilityFacts[]> { return vehicle ? [vehicle] : [] },
    async listDriverFacts(): Promise<DriverAvailabilityFacts[]> { return driver ? [driver] : [] },
    async lockVehicle(): Promise<boolean> { events.push('lock:vehicle'); return vehicle !== null },
    async lockDriver(): Promise<boolean> { events.push('lock:driver'); return driver !== null },
  }
  const repository: TripsRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return work(fakeClient) },
    async findScheduleTripRegistration() { return null },
    async findActiveServiceForScheduling(serviceId: string) { return serviceId === serviceSnapshot.id ? serviceSnapshot : null },
    async approveAndClassifyRequest(_id, _revision, service): Promise<SchedulableRequest | null> {
      if (!currentRequest) return null
      currentRequest = { ...currentRequest, status: 'APPROVED', serviceId: service.id, serviceSnapshot: service, revision: currentRequest.revision + 1 }
      return currentRequest
    },
    async reclassifyApprovedRequest(_id, _revision, service): Promise<SchedulableRequest | null> {
      if (!currentRequest) return null
      currentRequest = { ...currentRequest, serviceId: service.id, serviceSnapshot: service, revision: currentRequest.revision + 1 }
      return currentRequest
    },
    async findRequestForUpdate(): Promise<SchedulableRequest | null> { events.push('lock:request'); return currentRequest },
    async createTrip(data: CreateTripData): Promise<Trip> {
      created.push(data)
      return {
        id: '90', requestId: data.requestId, vehicleId: data.vehicleId, driverId: data.driverId,
        scheduledStart: data.scheduledStart, scheduledEnd: data.scheduledEnd, status: 'SCHEDULED',
        startKm: null, endKm: null, startedAt: null, finishedAt: null, revision: 1, createdAt: NOW,
      }
    },
    async markRequestScheduled(): Promise<SchedulableRequest | null> {
      if (!currentRequest) return null
      currentRequest = { ...currentRequest, status: 'SCHEDULED', revision: currentRequest.revision + 1 }
      return currentRequest
    },
    async createTripEvent(): Promise<void> { events.push('event:trip') },
    async createRequestEvent(_before, _after, _metadata, _client, eventType = 'SCHEDULED'): Promise<void> { events.push(`event:request:${eventType}`) },
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

function scheduleTrip(service: TripsService, data: ScheduleTripInput = input) {
  return service.scheduleTrip(data, manager.id, IDEMPOTENCY_KEY)
}

function domainError(statusCode: number, messagePart?: string) {
  return (error: unknown) => error instanceof TripServiceError
    && error.statusCode === statusCode
    && (!messagePart || error.message.includes(messagePart))
}

test('agendamento aprova a solicitação somente ao criar a viagem e grava eventos e auditoria', async () => {
  const context = setup()
  const result = await scheduleTrip(context.service)

  assert.equal(result.trip.status, 'SCHEDULED')
  assert.deepEqual(context.events, [
    'lock:request', 'lock:vehicle', 'lock:driver', 'event:request:APPROVED', 'event:trip', 'event:request:SCHEDULED',
  ])
  assert.equal(context.created[0]?.vehicleSnapshot.licensePlate, 'ABC1234')
  assert.equal(context.created[0]?.driverSnapshot.name, 'Motorista Fictício')
  assert.equal(context.audits[0]?.table, 'trip.trips')
  assert.equal(context.audits[0]?.reason, 'Viagem agendada')
})

test('dados inválidos retornam 400 e início no passado 422', async () => {
  const { service } = setup()
  await assert.rejects(scheduleTrip(service, { ...input, vehicleId: undefined }), domainError(400))
  await assert.rejects(scheduleTrip(service, { ...input, scheduledEnd: input.scheduledStart }), domainError(400))
  await assert.rejects(scheduleTrip(service, { ...input, scheduledStart: '2026-11-20T08:00:00' }), domainError(400))
  await assert.rejects(
    scheduleTrip(service, { ...input, scheduledStart: '2026-11-01T08:00:00-03:00', scheduledEnd: '2026-11-01T10:00:00-03:00' }),
    domainError(422, 'passado'),
  )
})

test('solicitação ausente 404 e situação não agendável 409', async () => {
  await assert.rejects(scheduleTrip(setup({ request: null }).service), domainError(404))
  await assert.rejects(
    scheduleTrip(setup({ request: { ...pendingRequest, status: 'RETURNED' } }).service),
    domainError(409, 'pendentes ou aprovadas'),
  )
})

test('conflito de agenda retorna 409 e nada é gravado', async () => {
  const context = setup({ vehicle: { hasConflict: true }, driver: { hasConflict: true } })
  await assert.rejects(scheduleTrip(context.service), domainError(409, 'O veículo já tem viagem no período. O motorista já tem viagem no período.'))
  assert.equal(context.created.length, 0)
})

test('indisponibilidade de cadastro retorna 422 e prevalece sobre o conflito', async () => {
  await assert.rejects(
    scheduleTrip(setup({ vehicle: { status: 'IN_MAINTENANCE', hasConflict: true } }).service),
    domainError(422, 'está em manutenção'),
  )
  await assert.rejects(scheduleTrip(setup({ vehicle: { compatible: false } }).service), domainError(422, 'tipo de serviço'))
  await assert.rejects(scheduleTrip(setup({ driver: { cnhExpiresAt: '2026-11-19' } }).service), domainError(422, 'CNH vencida'))
  await assert.rejects(scheduleTrip(setup({ driver: { status: 'AWAY' } }).service), domainError(422, 'afastado'))
})

test('veículo ou motorista inexistente retorna 404', async () => {
  await assert.rejects(scheduleTrip(setup({ vehicle: null }).service), domainError(404, 'Veículo'))
  await assert.rejects(scheduleTrip(setup({ driver: null }).service), domainError(404, 'Motorista'))
})

test('agendamento impede lotação acima da capacidade e devolve o código estável', async () => {
  const context = setup({ request: { ...pendingRequest, passengers: 5 } })
  await assert.rejects(scheduleTrip(context.service), (error: unknown) =>
    error instanceof TripServiceError && error.statusCode === 422 && error.code === 'INSUFFICIENT_CAPACITY')
  assert.equal(context.created.length, 0)
})

test('necessidades especiais exigem confirmação e evidência do Gestor', async () => {
  const context = setup({ request: { ...pendingRequest, specialRequirements: 'Acesso sem escadas' } })
  await assert.rejects(scheduleTrip(context.service), domainError(422, 'Confirme a conferência'))
  await assert.rejects(scheduleTrip(context.service, { ...input, specialRequirementsAcknowledged: true }), domainError(422, 'Registre como'))

  await scheduleTrip(context.service, { ...input, specialRequirementsAcknowledged: true, evidenceDescription: 'Foi confirmada a entrada sem degraus.' })
  assert.equal(context.created[0]?.specialRequirementsAcknowledged, true)
  assert.equal(context.created[0]?.evidenceDescription, 'Foi confirmada a entrada sem degraus.')
  assert.equal(context.created[0]?.requestSnapshot.specialRequirements, 'Acesso sem escadas')
})

test('motorista sem conta ativa vinculada não pode receber viagem', async () => {
  await assert.rejects(scheduleTrip(setup({ driver: { accountEligible: false } }).service),
    (error: unknown) => error instanceof TripServiceError && error.statusCode === 422 && error.code === 'ACCOUNT_UNAVAILABLE')
})
