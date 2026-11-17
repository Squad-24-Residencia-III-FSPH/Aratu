// Dados 100% fictícios (LGPD/SVO): placas, destinos e quilometragens inventados para os testes.
export function makeDriverTrip(id, overrides = {}) {
  return {
    id: String(id),
    status: 'SCHEDULED',
    scheduledStart: '2026-11-10T12:00:00.000Z',
    scheduledEnd: '2026-11-10T15:00:00.000Z',
    startKm: null,
    startedAt: null,
    origin: 'Unidade fictícia A',
    destination: `Unidade fictícia ${id}`,
    purpose: 'Transporte de teste',
    vehicleLicensePlate: 'EXE1A00',
    ...overrides,
  }
}

export function makeTrip(id, overrides = {}) {
  return {
    id: String(id),
    requestId: '70',
    vehicleId: '12',
    driverId: '8',
    scheduledStart: '2026-11-10T12:00:00.000Z',
    scheduledEnd: '2026-11-10T15:00:00.000Z',
    status: 'IN_PROGRESS',
    startKm: 1500,
    endKm: null,
    startedAt: '2026-11-10T12:05:00.000Z',
    finishedAt: null,
    revision: 2,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

export function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
