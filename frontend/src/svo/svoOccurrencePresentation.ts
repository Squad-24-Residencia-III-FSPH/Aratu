import type { StatusTone } from '../components/ui/StatusChip.tsx'
import type { SvoOccurrenceStatus, SvoRequesterType } from './svoOccurrenceTypes.ts'

export const SVO_OCCURRENCE_STATUS_LABELS: Record<SvoOccurrenceStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
}

export const SVO_OCCURRENCE_STATUS_TONES: Record<SvoOccurrenceStatus, StatusTone> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
}

export const SVO_REQUESTER_TYPE_LABELS: Record<SvoRequesterType, string> = {
  FAMILY: 'Família',
  HOSPITAL: 'Hospital',
  UBS: 'UBS',
  UPA: 'UPA',
  PUBLIC_AGENCY: 'Órgão público',
  OTHER: 'Outro',
}

/** Apresenta os instantes retornados pela API no formato local usado pelo módulo. */
export function formatSvoOccurrenceDateTime(value: string | null): string {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
