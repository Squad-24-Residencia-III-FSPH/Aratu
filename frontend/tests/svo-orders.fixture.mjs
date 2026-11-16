export const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
export function makeOrder(overrides = {}) {
  return { id: '1', occurrenceId: '2', teamId: '3', vehicleId: '4', status: 'OPEN', revision: 1,
    openedAt: '2026-11-15T12:00:00.000Z', departedAt: null, arrivedAt: null, collectedAt: null, closedAt: null,
    dispatch: { location: 'Local Fictício QA', teamName: 'Equipe Fictícia QA', vehicleLicensePlate: 'FIC0A01' },
    current: { location: 'Local Fictício QA', teamName: 'Equipe Fictícia QA', vehicleLicensePlate: 'FIC0A01' },
    allowedTransitions: ['IN_TRANSIT'], ...overrides }
}
export const makeDetail = (overrides = {}) => ({ ...makeOrder(), occurrenceSnapshot: null, teamSnapshot: null, vehicleSnapshot: null, ...overrides })
