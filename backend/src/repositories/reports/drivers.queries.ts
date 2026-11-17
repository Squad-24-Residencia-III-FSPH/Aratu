import type { ReportQuerySpec } from '../reports.repository'
import { CIVIL_TODAY_SQL, CNH_ALERT_DAYS } from './report-sql'

const validity = `CASE WHEN d.cnh_expires_at < ${CIVIL_TODAY_SQL} THEN 'EXPIRED' WHEN d.cnh_expires_at <= ${CIVIL_TODAY_SQL} + ${CNH_ALERT_DAYS} THEN 'EXPIRING' ELSE 'VALID' END`
export const driversReportQueries: Readonly<Record<string, ReportQuerySpec>> = {
  'drivers-roster': {
    dateExpression: 'd.cnh_expires_at',
    dateOnly: true,
    source: 'fleet.drivers d',
    orderBy: 'd.name, d.id',
    expressions: { name: 'd.name', maskedCpf: "'***.' || substring(d.cpf FROM 4 FOR 3) || '.' || substring(d.cpf FROM 7 FOR 3) || '-**'", cnhNumber: 'd.cnh_number', cnhCategory: 'd.cnh_category', cnhExpiresAt: 'd.cnh_expires_at::text', cnhValidity: validity, status: 'd.status', phone: 'd.phone', createdAt: 'd.created_at' },
    filterExpressions: { status: 'd.status', cnhCategory: 'd.cnh_category', cnhValidity: `(${validity})` }
  }
}
