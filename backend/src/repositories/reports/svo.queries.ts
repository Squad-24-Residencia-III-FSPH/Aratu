import type { ReportQuerySpec } from '../reports.repository'

const plate = "COALESCE(NULLIF(o.vehicle_snapshot->>'licensePlate', ''), v.license_plate)"
export const svoReportQueries: Readonly<Record<string, ReportQuerySpec>> = {
  'svo-occurrences': {
    dateExpression: 'o.received_at',
    source: 'svo.occurrences o JOIN auth.users u ON u.id = o.attendant_id',
    orderBy: 'o.received_at DESC, o.id DESC',
    expressions: { id: 'o.id::text', receivedAt: 'o.received_at', requesterType: 'o.requester_type', location: 'o.location', status: 'o.status', attendantName: "COALESCE(NULLIF(o.attendant_snapshot->>'name', ''), u.name)", triagedAt: 'o.triaged_at' },
    filterExpressions: { status: 'o.status', requesterType: 'o.requester_type' }
  },
  'svo-orders': {
    dateExpression: 'o.opened_at',
    source: 'svo.execution_orders o JOIN svo.teams t ON t.id = o.team_id JOIN fleet.vehicles v ON v.id = o.vehicle_id',
    orderBy: 'o.opened_at DESC, o.id DESC',
    expressions: { id: 'o.id::text', occurrenceId: 'o.occurrence_id::text', openedAt: 'o.opened_at', teamName: "COALESCE(NULLIF(o.team_snapshot->>'name', ''), t.name)", licensePlate: plate, status: 'o.status', result: 'o.result', departedAt: 'o.departed_at', arrivedAt: 'o.arrived_at', closedAt: 'o.closed_at', failureReason: 'o.failure_reason' },
    filterExpressions: { status: 'o.status', result: 'o.result', licensePlatePrefix: plate }
  }
}
