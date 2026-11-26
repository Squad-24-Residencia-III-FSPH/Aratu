import type { ReportQuerySpec } from '../reports.repository'

const plate = "COALESCE(NULLIF(t.vehicle_snapshot->>'licensePlate', ''), v.license_plate)"
export const tripsReportQueries: Readonly<Record<string, ReportQuerySpec>> = {
  'trips-requests': {
    dateExpression: 'r.requested_date',
    dateOnly: true,
    orderBy: 'r.requested_date DESC, r.id DESC',
    source: 'trip.requests r JOIN auth.users u ON u.id = r.requester_id LEFT JOIN fleet.services s ON s.id = r.service_id',
    expressions: { id: 'r.id::text', requestedDate: 'r.requested_date::text', requesterName: "COALESCE(NULLIF(r.requester_snapshot->>'name', ''), u.name)", serviceName: "COALESCE(NULLIF(r.service_snapshot->>'name', ''), s.name)", origin: 'r.origin', destination: 'r.destination', passengers: 'r.passengers', status: 'r.status', purpose: 'r.purpose', decidedAt: 'r.decided_at', decisionReason: 'r.decision_reason' },
    filterExpressions: { status: 'r.status' }
  },
  'trips-executions': {
    dateExpression: 't.scheduled_start',
    orderBy: 't.scheduled_start DESC, t.id DESC',
    source: 'trip.trips t LEFT JOIN trip.requests r ON r.id = t.request_id JOIN fleet.vehicles v ON v.id = t.vehicle_id JOIN fleet.drivers d ON d.id = t.driver_id',
    expressions: { id: 't.id::text', scheduledStart: 't.scheduled_start', scheduledEnd: 't.scheduled_end', licensePlate: plate, driverName: "COALESCE(NULLIF(t.driver_snapshot->>'name', ''), d.name)", origin: "COALESCE(t.context_snapshot->>'origin', t.request_snapshot->>'origin', r.origin)", destination: "COALESCE(t.context_snapshot->>'destination', t.request_snapshot->>'destination', r.destination)", status: 't.status', distanceKm: '(t.end_km - t.start_km)', startKm: 't.start_km', endKm: 't.end_km', startedAt: 't.started_at', finishedAt: 't.finished_at', confirmedAt: 't.confirmed_at' },
    filterExpressions: { status: 't.status', licensePlatePrefix: plate }
  }
}
