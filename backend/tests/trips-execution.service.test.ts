import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { OdometerFact } from '../src/types/fueling.types'
import type { Trip, TripActor, TripDriverAccount, TripOdometerReading } from '../src/types/trip.types'
import { TripServiceError } from '../src/types/trip.types'
import type { AvailabilityRepositoryContract } from '../src/repositories/availability.repository'
import type { TripsRepositoryContract } from '../src/repositories/trips.repository'
import { AvailabilityService } from '../src/services/availability.service'
import { TripsService } from '../src/services/trips.service'

const NOW = new Date('2026-11-10T12:00:00Z')
const fakeClient = {} as PoolClient
const driverUser: TripActor = { id: '30', name: 'Motorista Fictício', email: 'motorista@example.test', role: 'MOTORISTA' }
const otherUser: TripActor = { id: '31', name: 'Outro Motorista', email: 'outro@example.test', role: 'MOTORISTA' }
const driversByUser: Record<string, TripDriverAccount> = { '30': { id: '7', name: 'Motorista Fictício' }, '31': { id: '8', name: 'Outro Motorista' } }

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: '90', requestId: '41', vehicleId: '1', driverId: '7',
    scheduledStart: new Date('2026-11-20T11:00:00Z'), scheduledEnd: new Date('2026-11-20T15:00:00Z'),
    status: 'SCHEDULED', startKm: null, endKm: null, startedAt: null, finishedAt: null, revision: 1, createdAt: NOW,
    ...overrides,
  }
}

function setup(initial: Trip | null = trip(), facts: OdometerFact[] = [], timelineValid = true) {
  let stored = initial
  const readings: TripOdometerReading[] = []
  const events: string[] = []
  const audits: CreateAuditInput[] = []
  const repository: TripsRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return work(fakeClient) },
    async findRequestForUpdate() { return null },
    async createTrip(): Promise<Trip> { throw new Error('não usado') },
    async markRequestScheduled() { return null },
    async createTripEvent(eventType): Promise<void> { events.push(eventType) },
    async createRequestEvent(): Promise<void> {},
    async findActorSnapshot(id: string): Promise<TripActor | null> { return [driverUser, otherUser].find((user) => user.id === id) ?? null },
    async findTripForUpdate(id: string): Promise<Trip | null> { return stored?.id === id ? stored : null },
    async findDriverByUserId(userId: string): Promise<TripDriverAccount | null> { return driversByUser[userId] ?? null },
    async lockVehicle(): Promise<void> { events.push('lock:vehicle') },
    async saveStart(_id: string, startKm: number): Promise<Trip | null> {
      if (!stored || stored.status !== 'SCHEDULED') return null
      stored = { ...stored, status: 'IN_PROGRESS', startKm, startedAt: NOW, revision: stored.revision + 1 }
      return stored
    },
    async saveFinish(_id: string, endKm: number): Promise<Trip | null> {
      if (!stored || stored.status !== 'IN_PROGRESS') return null
      stored = { ...stored, status: 'FINISHED', endKm, finishedAt: NOW, revision: stored.revision + 1 }
      return stored
    },
    async createOdometerReading(reading: TripOdometerReading): Promise<void> { readings.push(reading) },
    async listDriverTrips(driverId: string) {
      return driverId === '7' ? [{
        id: '90', status: 'SCHEDULED', scheduledStart: NOW, scheduledEnd: NOW, startKm: null, startedAt: null,
        origin: 'Sede', destination: 'Unidade', purpose: 'Teste', vehicleLicensePlate: 'ABC1234',
      }] : []
    },
    async saveConfirmation(): Promise<null> { return null },
    async listTrips(): Promise<[]> { return [] },
  }
  const availabilityRepository = {} as AvailabilityRepositoryContract
  const auditService: AuditLogger = {
    async recordAudit(audit): Promise<AuditEntry> {
      audits.push(audit)
      return {
        id: '1', userId: String(audit.userId), table: audit.table, recordId: String(audit.recordId), operation: audit.operation,
        before: null, after: null, actorSnapshot: null, reason: audit.reason ?? null, registeredAt: NOW,
      }
    },
  }
  const odometer = { async timeline() { return { facts, valid: timelineValid } } }
  const service = new TripsService(repository, new AvailabilityService(availabilityRepository), auditService, odometer, () => NOW)
  return { service, readings, events, audits, getStored: () => stored }
}

function domainError(statusCode: number, messagePart?: string) {
  return (error: unknown) => error instanceof TripServiceError
    && error.statusCode === statusCode
    && (!messagePart || error.message.includes(messagePart))
}

test('início pelo motorista alocado grava IN_PROGRESS, leitura START, evento e auditoria', async () => {
  const context = setup(trip(), [{ odometerKm: 52000, occurredAt: '2026-11-01T10:00:00Z' }])
  const started = await context.service.startTrip('90', { startKm: 52000 }, driverUser.id)
  assert.equal(started.status, 'IN_PROGRESS')
  assert.equal(started.startKm, 52000)
  assert.deepEqual(context.readings, [{ vehicleId: '1', tripId: '90', readingType: 'START', odometerKm: 52000 }])
  assert.deepEqual(context.events, ['lock:vehicle', 'STARTED'])
  assert.equal(context.audits[0]?.reason, 'Início da viagem')
})

test('término grava FINISHED com leitura END e recusa km final menor que o inicial', async () => {
  const context = setup(trip({ status: 'IN_PROGRESS', startKm: 52000 }))
  await assert.rejects(context.service.finishTrip('90', { endKm: 51999 }, driverUser.id), domainError(422, 'menor que a inicial'))
  const finished = await context.service.finishTrip('90', { endKm: 52080, reason: 'Retorno à sede' }, driverUser.id)
  assert.equal(finished.status, 'FINISHED')
  assert.equal(finished.endKm, 52080)
  assert.deepEqual(context.readings.map((reading) => reading.readingType), ['END'])
  assert.equal(context.audits[0]?.reason, 'Retorno à sede')
})

test('somente o motorista alocado inicia ou finaliza (403)', async () => {
  const context = setup()
  await assert.rejects(context.service.startTrip('90', { startKm: 1 }, otherUser.id), domainError(403))
  await assert.rejects(context.service.startTrip('90', { startKm: 1 }, '99'), domainError(403))
  const inProgress = setup(trip({ status: 'IN_PROGRESS', startKm: 10 }))
  await assert.rejects(inProgress.service.finishTrip('90', { endKm: 20 }, otherUser.id), domainError(403))
})

test('status errado retorna 409 para iniciar e para finalizar', async () => {
  await assert.rejects(setup(trip({ status: 'IN_PROGRESS', startKm: 10 })).service.startTrip('90', { startKm: 10 }, driverUser.id), domainError(409))
  await assert.rejects(setup(trip({ status: 'SCHEDULED' })).service.finishTrip('90', { endKm: 10 }, driverUser.id), domainError(409))
  await assert.rejects(setup(trip({ status: 'FINISHED', startKm: 10, endKm: 20 })).service.finishTrip('90', { endKm: 30 }, driverUser.id), domainError(409))
})

test('km inicial abaixo da última quilometragem conhecida retorna 422; histórico inconsistente 409', async () => {
  const facts = [{ odometerKm: 52000, occurredAt: '2026-11-01T10:00:00Z' }, { odometerKm: 51000, occurredAt: '2026-10-01T10:00:00Z' }]
  await assert.rejects(setup(trip(), facts).service.startTrip('90', { startKm: 51999 }, driverUser.id), domainError(422, '52000 km'))
  await assert.rejects(setup(trip(), facts, false).service.startTrip('90', { startKm: 60000 }, driverUser.id), domainError(409, 'inconsistente'))
  const firstReading = await setup(trip(), []).service.startTrip('90', { startKm: 0 }, driverUser.id)
  assert.equal(firstReading.startKm, 0)
})

test('dados inválidos: km ausente, negativo, fracionário ou texto (400); viagem inexistente (404)', async () => {
  const context = setup()
  for (const startKm of [undefined, -1, 10.5, '100']) {
    await assert.rejects(context.service.startTrip('90', { startKm }, driverUser.id), domainError(400))
  }
  await assert.rejects(context.service.startTrip('abc', { startKm: 1 }, driverUser.id), domainError(400))
  await assert.rejects(context.service.startTrip('91', { startKm: 1 }, driverUser.id), domainError(404))
})

test('minhas viagens: só do motorista logado; usuário sem cadastro de motorista recebe lista vazia', async () => {
  const context = setup()
  assert.deepEqual((await context.service.listMyTrips(driverUser.id)).map((item) => item.id), ['90'])
  assert.deepEqual(await context.service.listMyTrips(otherUser.id), [])
  assert.deepEqual(await context.service.listMyTrips('99'), [])
})
