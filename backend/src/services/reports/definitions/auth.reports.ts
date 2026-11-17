import { authReportQueries } from '../../../repositories/reports/auth.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { USER_ROLES } from '../../../types/auth'
import { column as c, period, selectFilter } from './report-definition'
const queries = authReportQueries
export const authReports = [createReportDefinition({
  ...queries['auth-users']!,
  key: 'auth-users',
  module: 'AUTENTICACAO_RBAC',
  title: 'Usuários',
  description: 'Contas e perfis, sem dados de autenticação.',
  allowedRoles: ['ADMINISTRADOR'],
  period: period(false, 'Data de cadastro'),
  columns: [c('id', 'Usuário'), c('name', 'Nome'), c('email', 'E-mail'), c('role', 'Perfil', 'status'), c('active', 'Ativo', 'boolean'), c('createdAt', 'Cadastro', 'datetime'), c('updatedAt', 'Atualização', 'datetime', false)],
  filters: [selectFilter('role', 'Perfil', Object.fromEntries(USER_ROLES.map(role => [role, role]))), { key: 'active', label: 'Ativo', type: 'boolean', options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }] }]
})]
