import type { StatusTone } from '../components/ui/StatusChip'
import { DRIVER_STATUSES } from './driverTypes'
import type { DriverStatus } from './driverTypes'

/** Rótulos em português das situações do motorista, reutilizados em tabela, formulário e detalhes. */
export const DRIVER_STATUS_LABELS: Readonly<Record<DriverStatus, string>> = {
  ACTIVE: 'Ativo',
  AWAY: 'Afastado',
  INACTIVE: 'Inativo',
}

/** Tom visual de cada situação, alinhado ao componente `StatusChip`. */
export const DRIVER_STATUS_TONES: Readonly<Record<DriverStatus, StatusTone>> = {
  ACTIVE: 'success',
  AWAY: 'warning',
  INACTIVE: 'neutral',
}

/** Opções de situação para os seletores do módulo de motoristas. */
export const DRIVER_STATUS_OPTIONS = DRIVER_STATUSES.map((status) => ({
  value: status,
  label: DRIVER_STATUS_LABELS[status],
}))
