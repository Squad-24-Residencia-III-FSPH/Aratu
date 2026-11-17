import type { ReportQuerySpec } from '../reports.repository'
import { CIVIL_TODAY_SQL } from './report-sql'

const plate = "COALESCE(NULLIF(f.vehicle_snapshot->>'licensePlate', ''), v.license_plate)"
const driver = "COALESCE(NULLIF(f.driver_snapshot->>'name', ''), d.name, 'Não informado')"
export function createFleetReportQueries(alertDays: number): Readonly<Record<string, ReportQuerySpec>> {
const documentStatus = `CASE WHEN f.is_annulled THEN 'ANNULLED'
    WHEN EXISTS (SELECT 1 FROM fleet.vehicle_documents n WHERE n.supersedes_id = f.id AND NOT n.is_annulled) THEN 'RENEWED'
    WHEN f.expires_at < ${CIVIL_TODAY_SQL} THEN 'EXPIRED'
    WHEN f.expires_at <= ${CIVIL_TODAY_SQL} + $1::int THEN 'EXPIRING' ELSE 'VALID' END`
return {
  'fleet-vehicles': {
    dateExpression: 'v.created_at',
    source: 'fleet.vehicles v',
    orderBy: 'v.license_plate, v.id',
    expressions: { licensePlate: 'v.license_plate', vehicleDescription: "concat_ws(' / ', v.brand, v.model, v.year::text)", status: 'v.status',
        operationType: 'v.operation_type', ownership: 'v.ownership', seats: 'v.seats', bodyLimit: 'v.body_limit', weightLimitKg: 'v.weight_limit', categories: 'v.categories', createdAt: 'v.created_at' },
    filterExpressions: { status: 'v.status', operationType: 'v.operation_type', ownership: 'v.ownership', licensePlatePrefix: 'v.license_plate' }
  },
  'fleet-fuelings': {
    dateExpression: 'f.fueled_at',
    orderBy: 'f.fueled_at DESC, f.id DESC',
    source: 'fleet.fuelings f JOIN fleet.vehicles v ON v.id = f.vehicle_id LEFT JOIN fleet.drivers d ON d.id = f.driver_id',
    where: 'NOT f.is_annulled AND NOT EXISTS (SELECT 1 FROM fleet.fuelings n WHERE n.supersedes_id = f.id)',
    expressions: { fueledAt: 'f.fueled_at', licensePlate: plate, driverName: driver, fuelType: 'f.fuel_type', liters: 'f.liters', totalValue: 'f.total_value', odometerKm: 'f.odometer_km', station: 'f.station', reportedBy: 'f.reported_by', isRectified: '(f.supersedes_id IS NOT NULL)' },
    filterExpressions: { fuelType: 'f.fuel_type', licensePlatePrefix: plate }
  },
  'fleet-vehicle-documents': {
    where: '$1::int >= 0',
    dateExpression: 'f.expires_at',
    dateOnly: true,
    source: 'fleet.vehicle_documents f JOIN fleet.vehicles v ON v.id = f.vehicle_id',
    orderBy: 'f.expires_at, f.id',
    extraValues: [alertDays],
    expressions: { licensePlate: plate, documentType: 'f.document_type', documentNumber: 'f.document_number', issuedAt: 'f.issued_at::text', expiresAt: 'f.expires_at::text', status: documentStatus, daysToExpire: `(f.expires_at - ${CIVIL_TODAY_SQL})`, notes: 'f.notes' },
    filterExpressions: { documentType: 'f.document_type', status: `(${documentStatus})`, licensePlatePrefix: plate }
  },
  'fleet-fines': {
    dateExpression: 'f.infraction_at',
    orderBy: 'f.infraction_at DESC, f.id DESC',
    source: 'fleet.fines f JOIN fleet.vehicles v ON v.id = f.vehicle_id LEFT JOIN fleet.drivers d ON d.id = f.driver_id',
    expressions: { infractionAt: 'f.infraction_at', licensePlate: plate, driverName: driver, infractionCode: 'f.infraction_code', description: 'f.description', amount: 'f.amount', status: 'f.status', dueAt: 'f.due_at::text', paidAt: 'f.paid_at', location: 'f.location' },
    filterExpressions: { status: 'f.status', licensePlatePrefix: plate }
  }
}
}
