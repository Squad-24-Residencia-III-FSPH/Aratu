import type { ReportQuerySpec } from '../reports.repository'


export const authReportQueries: Readonly<Record<string, ReportQuerySpec>> = {
  'auth-users': {
    dateExpression: 'u.created_at',
    orderBy: 'u.name, u.id',
    source: 'auth.users u JOIN auth.roles r ON r.id = u.role_id',
    expressions: { id: 'u.id::text', name: 'u.name', email: 'u.email', role: 'r.name', active: 'u.active', createdAt: 'u.created_at', updatedAt: 'u.updated_at' },
    filterExpressions: { role: 'r.name', active: 'u.active' }
  }
}
