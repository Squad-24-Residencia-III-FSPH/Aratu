import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { Trip, TripActor, TripConfirmation, TripListFilters } from '../src/types/trip.types'
import { TripServiceError } from '../src/types/trip.types'
import type { AvailabilityRepositoryContract } from '../src/repositories/availability.repository'
import type { TripsRepositoryContract } from '../src/repositories/trips.repository'
import { AvailabilityService } from '../src/services/availability.service'
import { TripsService } from '../src/services/trips.service'

const NOW = new Date('2026-11-10T12:00:00Z')
const fakeClient = {} as PoolClient
const manager: TripActor = { id: '8', name: 'Gestora Fictícia', email: 'gestora@example.test', role: 'GESTOR' }

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: '90', requestId: '41', vehicleId: '1', driverId: '7',
    scheduledStart: new Date('2026-11-05T11:00:00Z'), scheduledEnd: new Date('2026-11-05T15:00:00Z'),
    status: 'FINISHED', startKm: 1500, endKm: 1580, startedAt: NOW, finishedAt: NOW, revision: 3, createdAt: NOW,
    ...overrides,
  }
}

function setup(initial: Trip | null = trip()) {
  let stored = initial
  const events: string[] = []
  const audits: CreateAuditInput[] = []
  const listed: TripListFilters[] = []
  const repository: TripsRepositoryContract = {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return work(fakeClient) },
    async findRequestForUpdate() { return null },
    async createTrip(): Promise<Trip> { throw new Error('não usado') },
    async markRequestScheduled() { return null },
    async createTripEvent(eventType): Promise<void> { events.push(eventType) },
    async createRequestEvent(): Promise<void> {},
    async findActorSnapshot(): Promise<TripActor> { return manager },
    async findTripForUpdate(id: string): Promise<Trip | null> { return stored?.id === id ? stored : null },
    async findDriverByUserId() { return null },
    async lockVehicle(): Promise<void> {},
    async saveStart() { return null },
    async saveFinish() { return null },
    async createOdometerReading(): Promise<void> {},
    async listDriverTrips() { return [] },
    async saveConfirmation(id: string, confirmerId: string): Promise<TripConfirmation | null> {
      if (!stored || stored.id !== id || stored.status !== 'FINISHED') return null
      stored = { ...stored, status: 'CONFIRMED', revision: stored.revision + 1 }
      return { id, status: 'CONFIRMED', confirmedBy: confirmerId, confirmedAt: NOW, revision: stored.revision }
    },
    async listTrips(filters: TripListFilters) { listed.push(filters); return [] },
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
  const odometer = { async timeline() { return { facts: [], valid: true } } }
  const service = new TripsService(repository, new AvailabilityService({} as AvailabilityRepositoryContract), auditService, odometer, () => NOW)
  return { service, events, audits, listed }
}

function domainError(statusCode: number, messagePart?: string) {
  return (error: unknown) => error instanceof TripServiceError
    && error.statusCode === statusCode
    && (!messagePart || error.message.includes(messagePart))
}

test('confirmação de viagem finalizada com evidências grava CONFIRMED, responsável, evento e auditoria', async () => {
  const context = setup()
  const confirmation = await context.service.confirmTrip('90', {}, manager.id)
  assert.deepEqual(confirmation, { id: '90', status: 'CONFIRMED', confirmedBy: '8', confirmedAt: NOW, revision: 4 })
  assert.deepEqual(context.events, ['CONFIRMED'])
  assert.equal(context.audits[0]?.reason, 'Viagem confirmada')
})

test('viagem em outra situação ou já confirmada retorna 409', async () => {
  for (const status of ['SCHEDULED', 'IN_PROGRESS', 'CANCELED']) {
    await assert.rejects(setup(trip({ status })).service.confirmTrip('90', {}, manager.id), domainError(409, 'finalizadas'))
  }
  const context = setup()
  await context.service.confirmTrip('90', {}, manager.id)
  await assert.rejects(context.service.confirmTrip('90', {}, manager.id), domainError(409, 'já foi confirmada'))
})

test('viagem sem evidências do odômetro retorna 422 com a mensagem do Jira', async () => {
  for (const missing of [{ startKm: null }, { endKm: null }]) {
    const context = setup(trip(missing))
    await assert.rejects(context.service.confirmTrip('90', {}, manager.id), domainError(422, 'Viagem sem evidências do odômetro não pode ser confirmada'))
    assert.equal(context.events.length, 0)
  }
})

test('id inválido 400 e viagem inexistente 404', async () => {
  await assert.rejects(setup().service.confirmTrip('abc', {}, manager.id), domainError(400))
  await assert.rejects(setup().service.confirmTrip('91', {}, manager.id), domainError(404))
})

test('listagem valida status e período antes de consultar', async () => {
  const context = setup()
  await context.service.listTrips({ status: 'FINISHED', from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(context.listed, [{ status: 'FINISHED', from: '2026-11-01', to: '2026-11-30' }])
  await assert.rejects(context.service.listTrips({ status: 'FINALIZADA' }), domainError(400))
  await assert.rejects(context.service.listTrips({ from: '01/11/2026' }), domainError(400))
  await assert.rejects(context.service.listTrips({ to: '2026-02-30' }), domainError(400))
  await assert.rejects(context.service.listTrips({ from: '2026-12-01', to: '2026-11-01' }), domainError(400))
  assert.equal(context.listed.length, 1)
})
