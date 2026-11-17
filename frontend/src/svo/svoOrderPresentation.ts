import type { StatusTone } from '../components/ui/StatusChip.tsx'
import { SVO_ORDER_OCCUPYING_STATUSES } from './svoOrderTypes.ts'
import type { SvoOrderResult, SvoOrderStatus, SvoOrderTransition } from './svoOrderTypes.ts'

export { formatDateTime } from '../trips/tripPresentation.ts'
export const MISSING_DISPATCH = 'Não registrado no despacho'
export const MISSING_RECORD = 'Não registrado'
export const SVO_ORDER_LABELS: Record<SvoOrderStatus, string> = {
  OPEN: 'Aberta', IN_TRANSIT: 'Em deslocamento', IN_SERVICE: 'Em atendimento',
  IN_PROGRESS: 'Em andamento (legado)', COMPLETED: 'Concluída', NOT_PERFORMED: 'Não realizada', CANCELED: 'Cancelada',
}
export const SVO_ORDER_TONES: Record<SvoOrderStatus, StatusTone> = {
  OPEN: 'info', IN_TRANSIT: 'warning', IN_SERVICE: 'warning', IN_PROGRESS: 'neutral',
  COMPLETED: 'success', NOT_PERFORMED: 'neutral', CANCELED: 'neutral',
}
export const SVO_ACTION_LABELS: Record<SvoOrderTransition, string> = {
  IN_TRANSIT: 'Confirmar saída', IN_SERVICE: 'Confirmar chegada',
}
export function isActiveSvoOrder(status: SvoOrderStatus): boolean {
  return SVO_ORDER_OCCUPYING_STATUSES.some((active) => active === status)
}
export function orderConfirmation(id: string, action: SvoOrderTransition): string {
  return action === 'IN_TRANSIT' ? `Confirmar saída para a ordem #${id}? O horário atual será registrado.`
    : `Confirmar chegada ao local da ordem #${id}? O horário atual será registrado.`
}
export function orderClosedAnnouncement(id: string, result: SvoOrderResult): string {
  return `Ordem #${id} encerrada como ${SVO_ORDER_LABELS[result]}.`
}
