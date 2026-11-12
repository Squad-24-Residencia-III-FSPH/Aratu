import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canConfirmTrip, confirmationFilterOptions, filterConfirmationTrips, formatTripOdometer, tripDistance,
} from '../src/trips/tripConfirmationPresentation.ts'

const trip = (id, overrides = {}) => ({
  id, requestId: id, status: 'FINISHED', scheduledStart: '2026-11-10T11:00:00.000Z',
  scheduledEnd: '2026-11-10T12:00:00.000Z', startedAt: null, finishedAt: null,
  startKm: 100, endKm: 150, vehicleLicensePlate: 'ABC1D23', driverName: 'Motorista Fictício',
  origin: 'Unidade A', destination: 'Unidade B', confirmedBy: null, confirmedAt: null, ...overrides,
})

test('distância e hodômetros preservam ausência em vez de convertê-la em zero', () => {
  assert.equal(tripDistance(100, 150), 50)
  assert.equal(tripDistance(null, 150), null)
  assert.equal(tripDistance(100, null), null)
  assert.equal(formatTripOdometer(null), 'Não informado')
  assert.equal(canConfirmTrip(trip('1')), true)
  assert.equal(canConfirmTrip(trip('2', { endKm: null })), false)
})

test('filtros locais e opções usam somente veículo e motorista devolvidos pela API', () => {
  const trips = [trip('1'), trip('2', { vehicleLicensePlate: 'XYZ9K87', driverName: 'Outra Pessoa Fictícia' })]
  assert.deepEqual(filterConfirmationTrips(trips, 'ABC1D23', ''), [trips[0]])
  assert.deepEqual(filterConfirmationTrips(trips, '', 'Outra Pessoa Fictícia'), [trips[1]])
  assert.deepEqual(confirmationFilterOptions(trips, 'vehicleLicensePlate'), [
    { value: 'ABC1D23', label: 'ABC1D23' }, { value: 'XYZ9K87', label: 'XYZ9K87' },
  ])
})
