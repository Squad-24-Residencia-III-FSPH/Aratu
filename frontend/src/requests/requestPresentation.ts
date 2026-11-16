import type { StatusTone } from '../components/ui/StatusChip'
import type { RequestStatus } from './requestTypes'

/** Rótulos e tonalidades únicos da situação da solicitação, usados pela lista e pelo painel de detalhes. */
export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  SCHEDULED: 'Agendada',
  CANCELED: 'Cancelada',
}

export const REQUEST_STATUS_TONES: Readonly<Record<RequestStatus, StatusTone>> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  SCHEDULED: 'info',
  CANCELED: 'neutral',
}
