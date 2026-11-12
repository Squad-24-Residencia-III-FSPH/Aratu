import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateTime, formatKm, operationalDay, parseKmInput, selectTrips } from '../src/trips/tripPresentation.ts'
import { makeDriverTrip } from './my-trips.fixture.mjs'

// 2026-11-10 12:00 em Maceió (UTC-3) = 15:00Z.
const NOW = new Date('2026-11-10T15:00:00.000Z')

test('o dia usa o fuso operacional, não o do aparelho', () => {
  assert.equal(operationalDay('2026-11-10T02:59:59.000Z'), '2026-11-09')
  assert.equal(operationalDay('2026-11-10T03:00:00.000Z'), '2026-11-10')
  assert.equal(operationalDay('2026-11-11T02:59:00.000Z'), '2026-11-10')
  assert.equal(operationalDay('2026-11-11T03:00:00.000Z'), '2026-11-11')
})

test('hoje e em andamento: agendadas de hoje + todas em andamento, sem duplicar', () => {
  const trips = [
    makeDriverTrip(1, { scheduledStart: '2026-11-10T20:00:00.000Z' }),
    makeDriverTrip(2, { scheduledStart: '2026-11-09T12:00:00.000Z' }),
    makeDriverTrip(3, { scheduledStart: '2026-11-11T12:00:00.000Z' }),
    makeDriverTrip(4, { status: 'IN_PROGRESS', scheduledStart: '2026-11-09T12:00:00.000Z', startKm: 10, startedAt: '2026-11-09T12:10:00.000Z' }),
    makeDriverTrip(5, { status: 'IN_PROGRESS', scheduledStart: '2026-11-10T13:00:00.000Z', startKm: 20, startedAt: '2026-11-10T13:10:00.000Z' }),
  ]
  assert.deepEqual(selectTrips(trips, 'TODAY_AND_IN_PROGRESS', NOW).map((trip) => trip.id), ['4', '5', '1'])
})

test('o dia muda na meia-noite de Maceió', () => {
  const trips = [makeDriverTrip(1, { scheduledStart: '2026-11-10T23:30:00.000Z' })]
  assert.equal(selectTrips(trips, 'TODAY_AND_IN_PROGRESS', new Date('2026-11-11T02:59:00.000Z')).length, 1)
  assert.equal(selectTrips(trips, 'TODAY_AND_IN_PROGRESS', new Date('2026-11-11T03:00:00.000Z')).length, 0)
})

test('todas as pendentes inclui antigas e futuras, ordenadas de forma estável', () => {
  const trips = [
    makeDriverTrip(1, { scheduledStart: '2026-11-12T12:00:00.000Z' }),
    makeDriverTrip(2, { scheduledStart: '2026-11-08T12:00:00.000Z' }),
    makeDriverTrip(3, { scheduledStart: '2026-11-12T12:00:00.000Z' }),
  ]
  const original = trips.map((trip) => trip.id)
  assert.deepEqual(selectTrips(trips, 'ALL_PENDING', NOW).map((trip) => trip.id), ['2', '1', '3'])
  assert.deepEqual(trips.map((trip) => trip.id), original, 'não altera a lista recebida')
})

test('quilometragem aceita só inteiro seguro não negativo e vazio nunca vira zero', () => {
  assert.deepEqual(parseKmInput(' 1500 '), { ok: true, value: 1500 })
  assert.deepEqual(parseKmInput('0'), { ok: true, value: 0 })
  for (const text of ['', '   ', '-1', '+5', '1.5', '1,5', '1e3', '0x10', 'abc', '١٢٣', '9007199254740993']) {
    assert.equal(parseKmInput(text).ok, false, `deveria rejeitar "${text}"`)
  }
})

test('formata km e data em pt-BR no fuso operacional', () => {
  assert.equal(formatKm(1580), '1.580 km')
  assert.match(formatDateTime('2026-11-10T15:30:00.000Z'), /^10\/11\/2026,? 12:30$/)
})
