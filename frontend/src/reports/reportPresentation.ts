import type { ReportCell, ReportColumn } from './reportTypes.ts'

const LABELS: Record<string, string> = { AVAILABLE: 'Disponível', IN_MAINTENANCE: 'Em manutenção', INACTIVE: 'Inativo', ACTIVE: 'Ativo', AWAY: 'Afastado',
  ADMINISTRATIVE: 'Administrativa', SVO: 'SVO', OWNED: 'Próprio', LEASED: 'Locado', GASOLINE: 'Gasolina', ETHANOL: 'Etanol', DIESEL: 'Diesel', DIESEL_S10: 'Diesel S10', GNV: 'GNV', FLEX: 'Flex', OTHER: 'Outro',
  VALID: 'Válido', EXPIRING: 'Próximo do vencimento', EXPIRED: 'Vencido', RENEWED: 'Renovado', ANNULLED: 'Anulado', PENDING: 'Pendente', PAID: 'Paga', CONTESTED: 'Contestada', CANCELED: 'Cancelado',
  APPROVED: 'Aprovada', REJECTED: 'Recusada', SCHEDULED: 'Agendada', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', CONFIRMED: 'Confirmada', PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva', OPEN: 'Aberta', DONE: 'Concluída',
  CRLV: 'CRLV', LICENSING: 'Licenciamento', IPVA: 'IPVA', INSURANCE: 'Seguro', LEASE_CONTRACT: 'Contrato de locação', FAMILY: 'Família', HOSPITAL: 'Hospital', UBS: 'UBS', UPA: 'UPA', PUBLIC_AGENCY: 'Órgão público',
  IN_TRANSIT: 'Em deslocamento', IN_SERVICE: 'Em atendimento', COMPLETED: 'Realizado', NOT_PERFORMED: 'Não realizado',
  ADMINISTRADOR: 'Administrador', GESTOR: 'Gestor', SOLICITANTE: 'Solicitante', MOTORISTA: 'Motorista', ATENDENTE_SVO: 'Atendente SVO', EQUIPE_SVO: 'Equipe SVO' }
/** Preserva os centavos das somas globais recebidas como decimal do PostgreSQL, sem conversão para ponto flutuante. */
function formatDecimal(value: ReportCell, currency: boolean): string {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return String(value)
  const integer = new Intl.NumberFormat('pt-BR').format(BigInt(match[2]))
  const fraction = currency ? (match[3] ?? '').padEnd(2, '0').slice(0, 2) : (match[3] ?? '').replace(/0+$/, '')
  return `${currency ? 'R$\u00a0' : ''}${match[1]}${integer}${fraction ? `,${fraction}` : ''}`
}
export function formatReportCell(value: ReportCell | undefined, column: ReportColumn): string {
  if (value === null || value === undefined) return '—'
  if (column.type === 'boolean') return value ? 'Sim' : 'Não'
  if (column.type === 'status') return LABELS[String(value)] ?? String(value)
  if (column.type === 'currency') return formatDecimal(value, true)
  if (column.type === 'number') return formatDecimal(value, false)
  if (column.type === 'date') return String(value).slice(0, 10).split('-').reverse().join('/')
  if (column.type === 'datetime') return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(value)))
  return String(value)
}
