import { authReportQueries } from '../../../repositories/reports/auth.queries'
import { createReportDefinition } from '../../../repositories/reports.repository'
import { column as c, period } from './report-definition'
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
  filters: [
    { key: 'role', label: 'Perfil', type: 'text', placeholder: 'Nome exato do perfil' },
    { key: 'active', label: 'Ativo', type: 'boolean', options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }] },
  ]
})]
