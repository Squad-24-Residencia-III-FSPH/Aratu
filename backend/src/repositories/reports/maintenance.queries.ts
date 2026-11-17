import type { ReportQuerySpec } from '../reports.repository'

const plate = "COALESCE(NULLIF(m.vehicle_snapshot->>'licensePlate', ''), v.license_plate)"
export const maintenanceReportQueries: Readonly<Record<string, ReportQuerySpec>> = {
  'maintenance-orders': {
    dateExpression: 'm.opened_at',
    orderBy: 'm.opened_at DESC, m.id DESC',
    source: `fleet.maintenance_orders m JOIN fleet.vehicles v ON v.id = m.vehicle_id
      LEFT JOIN LATERAL (SELECT SUM(CASE WHEN item->>'kind' = 'PART'
        THEN round((item->>'quantity')::numeric * (item->>'unitPrice')::numeric, 2)
        ELSE (item->>'amount')::numeric END) AS total
        FROM jsonb_array_elements(m.estimate_items) item) estimate ON true`,
    expressions: { id: 'm.id::text', openedAt: 'm.opened_at', licensePlate: plate, type: 'm.type', status: 'm.status', blocksVehicle: 'm.blocks_vehicle', workshop: 'm.workshop',
    estimatedTotal: 'estimate.total',
    finalCost: "CASE WHEN m.status = 'DONE' THEN m.cost ELSE NULL END", odometerKm: 'm.odometer_km', expectedCompletionDate: 'm.expected_completion_date::text', closedAt: 'm.closed_at', description: 'm.description' },
    filterExpressions: { type: 'm.type', status: 'm.status', licensePlatePrefix: plate }
  }
}
