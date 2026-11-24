import {
  formatInstant,
  isActiveOrder,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../../../maintenance/maintenanceTypes.ts'
import type {
  MaintenanceFilters,
  MaintenanceItem,
  MaintenanceOrder,
  MaintenanceStatus,
  MaintenanceType,
} from '../../../maintenance/maintenanceTypes.ts'
import { getOdometerError, maintenanceItemErrors } from '../../../maintenance/maintenanceForm.ts'
import type { Vehicle } from '../../../vehicles/vehicleTypes.ts'
import { MaintenanceRequestError } from '../../../services/maintenanceService.ts'

export interface FilterFormValues {
  vehicleId: string
  type: string
  status: string
  from: string
  to: string
}

export interface PeriodValidationResult {
  valid: boolean
  fromError?: string
  toError?: string
  summaryError?: string
}

export type VehicleSituationKind =
  | 'available'
  | 'inactive'
  | 'blocked_by_this'
  | 'blocked_by_other'
  | 'in_maintenance_unconfirmed'
  | 'unknown'

export interface VehicleSituation {
  kind: VehicleSituationKind
  vehicle: Vehicle | null
  otherBlockingOrder: MaintenanceOrder | null
  plateLabel: string
  statusLabel: string
  message: string
}

export interface VehicleSituationState {
  loading: boolean
  error: string
  situation: VehicleSituation | null
}

export type MaintenanceFormFieldKey =
  | 'vehicleId'
  | 'description'
  | 'odometer'
  | 'expectedDate'
  | 'openedAt'
  | 'estimateItems'
  | 'reportedBy'
  | 'reason'

export interface ItemValidationFailure {
  index: number
  field: 'description' | 'quantity' | 'unitPrice' | 'amount'
}

/** Converte os campos da barra de filtros no contrato aceito pela API. */
export function toMaintenanceFilters(values: FilterFormValues): MaintenanceFilters {
  return {
    ...(values.vehicleId ? { vehicleId: values.vehicleId } : {}),
    ...(values.type ? { type: values.type as MaintenanceType } : {}),
    ...(values.status ? { status: values.status as MaintenanceStatus } : {}),
    ...(values.from ? { from: new Date(values.from).toISOString() } : {}),
    ...(values.to ? { to: new Date(values.to).toISOString() } : {}),
  }
}

/** Verifica se o recorte exibido difere dos filtros atualmente selecionados na barra. */
export function areFiltersEqual(a: MaintenanceFilters, b: MaintenanceFilters): boolean {
  return (a.vehicleId ?? '') === (b.vehicleId ?? '')
    && (a.type ?? '') === (b.type ?? '')
    && (a.status ?? '') === (b.status ?? '')
    && (a.from ?? '') === (b.from ?? '')
    && (a.to ?? '') === (b.to ?? '')
}

/** Valida datas de início e fim do período, associando erros aos respectivos campos. */
export function validateFilterPeriod(values: Pick<FilterFormValues, 'from' | 'to'>): PeriodValidationResult {
  const fromTime = values.from ? Date.parse(values.from) : null
  const toTime = values.to ? Date.parse(values.to) : null

  if (values.from && (fromTime === null || !Number.isFinite(fromTime))) {
    const message = 'Informe uma data e hora de início válida.'
    return { valid: false, fromError: message, summaryError: message }
  }
  if (values.to && (toTime === null || !Number.isFinite(toTime))) {
    const message = 'Informe uma data e hora de fim válida.'
    return { valid: false, toError: message, summaryError: message }
  }
  if (fromTime !== null && toTime !== null && fromTime >= toTime) {
    return {
      valid: false,
      fromError: 'O início do período deve anteceder o fim.',
      toError: 'O fim do período deve ser posterior ao início.',
      summaryError: 'O início do período deve anteceder o fim.',
    }
  }
  return { valid: true }
}

/** Descreve de forma legível o recorte ao qual os totais e a listagem pertencem. */
export function formatFilterSummary(filters: MaintenanceFilters, vehicles: readonly Vehicle[]): string {
  const vehicle = filters.vehicleId
    ? vehicles.find((item) => item.id === filters.vehicleId)
    : undefined
  const vehiclePart = filters.vehicleId
    ? (vehicle ? `${vehicle.licensePlate} (ID ${filters.vehicleId})` : `Veículo ID ${filters.vehicleId}`)
    : 'Todos os veículos'
  const typePart = filters.type ? TYPE_LABELS[filters.type] : 'Todos os tipos'
  const statusPart = filters.status ? STATUS_LABELS[filters.status] : 'Todas as situações'

  let periodPart = 'Todo o período'
  if (filters.from && filters.to) {
    periodPart = `de ${formatInstant(filters.from)} até ${formatInstant(filters.to)}`
  } else if (filters.from) {
    periodPart = `a partir de ${formatInstant(filters.from)}`
  } else if (filters.to) {
    periodPart = `até ${formatInstant(filters.to)}`
  }

  return `${vehiclePart} · ${typePart} · ${statusPart} · ${periodPart}`
}

function saoPauloCivilDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${read('year')}-${read('month')}-${read('day')}`
}

function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Valida a data de entrada informada na abertura da ordem. */
export function validateOpenedAt(openedAt: string): string | undefined {
  if (!openedAt) return undefined
  if (!Number.isFinite(Date.parse(openedAt))) {
    return 'Informe uma data e hora de entrada válida.'
  }
  return undefined
}

/** Valida a previsão de término contra formato civil e data local de entrada. */
export function validateExpectedCompletionDate(
  expectedDate: string,
  openedAtInput: string,
  existingOpenedAt?: string,
): string | undefined {
  if (!expectedDate) return undefined
  if (!isValidCivilDate(expectedDate)) {
    return 'Informe uma previsão válida no formato AAAA-MM-DD.'
  }
  const referenceDate = existingOpenedAt
    ? new Date(existingOpenedAt)
    : openedAtInput && Number.isFinite(Date.parse(openedAtInput))
      ? new Date(openedAtInput)
      : new Date()
  const localOpeningDate = saoPauloCivilDate(referenceDate)
  if (expectedDate < localOpeningDate) {
    return 'A previsão não pode anteceder a data local de entrada do veículo.'
  }
  return undefined
}

/** Valida a data de encerramento contra formato e data de abertura da ordem. */
export function validateClosedAt(closedAt: string, orderOpenedAt: string): string | undefined {
  if (!closedAt) return undefined
  const parsed = Date.parse(closedAt)
  if (!Number.isFinite(parsed)) {
    return 'Informe uma data e hora de encerramento válida.'
  }
  if (parsed < Date.parse(orderOpenedAt)) {
    return 'O encerramento não pode anteceder a abertura.'
  }
  return undefined
}

/** Localiza o primeiro campo inválido na lista de peças e serviços para mover o foco. */
export function findFirstInvalidItem(items: readonly MaintenanceItem[]): ItemValidationFailure | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!
    const errors = maintenanceItemErrors(item)
    if (errors.description) return { index, field: 'description' }
    if (item.kind === 'PART') {
      if (errors.quantity) return { index, field: 'quantity' }
      if (errors.unitPrice) return { index, field: 'unitPrice' }
    } else if (errors.amount) {
      return { index, field: 'amount' }
    }
  }
  return null
}

/** Valida todos os campos do formulário de manutenção e identifica o primeiro erro em ordem visual. */
export function validateMaintenanceFormFields(input: {
  isEditing: boolean
  vehicleId: string
  description: string
  odometer: string
  expectedDate: string
  openedAt: string
  existingOpenedAt?: string
  hasEstimate: boolean
  estimateItems: readonly MaintenanceItem[]
  reportedBy: string
  reason: string
}) {
  const vehicleError = !input.isEditing && !input.vehicleId ? 'Selecione o veículo.' : undefined
  const descriptionError = !input.description.trim() ? 'Informe a descrição da manutenção.' : undefined
  const odometerError = getOdometerError(input.odometer)
  const expectedDateError = validateExpectedCompletionDate(
    input.expectedDate,
    input.openedAt,
    input.existingOpenedAt,
  )
  const openedAtError = !input.isEditing ? validateOpenedAt(input.openedAt) : undefined
  const firstInvalidEstimateItem = input.hasEstimate ? findFirstInvalidItem(input.estimateItems) : null
  const reportedByError = !input.reportedBy.trim() ? 'Informe a origem da informação.' : undefined
  const reasonError = !input.reason.trim() ? 'Informe a justificativa.' : undefined

  let firstInvalidField: MaintenanceFormFieldKey | null = null
  if (vehicleError) firstInvalidField = 'vehicleId'
  else if (descriptionError) firstInvalidField = 'description'
  else if (odometerError) firstInvalidField = 'odometer'
  else if (expectedDateError) firstInvalidField = 'expectedDate'
  else if (openedAtError) firstInvalidField = 'openedAt'
  else if (firstInvalidEstimateItem) firstInvalidField = 'estimateItems'
  else if (reportedByError) firstInvalidField = 'reportedBy'
  else if (reasonError) firstInvalidField = 'reason'

  return {
    valid: firstInvalidField === null,
    firstInvalidField,
    firstInvalidEstimateItem,
    errors: {
      vehicleError,
      descriptionError,
      odometerError,
      expectedDateError,
      openedAtError,
      reportedByError,
      reasonError,
    },
  }
}

/** Identifica se o erro 409 decorre de conflito com outra ordem impeditiva ativa no mesmo veículo. */
export function isBlockingOrderConflict(failure: unknown): boolean {
  return failure instanceof MaintenanceRequestError
    && failure.status === 409
    && (Boolean(failure.blockingOrderId) || /impeditiva ativa/i.test(failure.message))
}

/** Identifica conflito 409 de revisão otimista obsoleta em edição ou encerramento. */
export function isRevisionConflict(failure: unknown, isEditing: boolean): boolean {
  if (!(failure instanceof MaintenanceRequestError) || failure.status !== 409) return false
  if (isBlockingOrderConflict(failure)) return false
  if (!isEditing && /chave já foi usada/i.test(failure.message)) return false
  return isEditing || /alterada ou encerrada/i.test(failure.message)
}

/** Constrói o diagnóstico real da situação do veículo distinguindo bloqueio desta ordem, outra OS ou inativação. */
export function buildVehicleSituation(
  order: MaintenanceOrder,
  vehicles: readonly Vehicle[],
  vehicleOrders: readonly MaintenanceOrder[] | null,
): VehicleSituation {
  const vehicle = vehicles.find((item) => item.id === order.vehicleId) ?? null
  const plateLabel = vehicle?.licensePlate ?? order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}`
  const otherBlockingOrder = vehicleOrders
    ? (vehicleOrders.find((item) => isActiveOrder(item) && item.blocksVehicle && item.id !== order.id) ?? null)
    : null

  if (!vehicle) {
    return {
      kind: 'unknown',
      vehicle: null,
      otherBlockingOrder,
      plateLabel,
      statusLabel: 'Não confirmada',
      message: `Não foi possível confirmar a situação atual do veículo ${plateLabel} (ID ${order.vehicleId}).`,
    }
  }

  if (vehicle.status === 'AVAILABLE') {
    return {
      kind: 'available',
      vehicle,
      otherBlockingOrder: null,
      plateLabel,
      statusLabel: 'Disponível',
      message: `Veículo ${plateLabel} está Disponível para viagens (revisão ${vehicle.revision}).`,
    }
  }

  if (vehicle.status === 'INACTIVE') {
    return {
      kind: 'inactive',
      vehicle,
      otherBlockingOrder,
      plateLabel,
      statusLabel: 'Inativo',
      message: `Veículo ${plateLabel} permanece Inativo por inativação independente (revisão ${vehicle.revision}).`,
    }
  }

  if (otherBlockingOrder) {
    return {
      kind: 'blocked_by_other',
      vehicle,
      otherBlockingOrder,
      plateLabel,
      statusLabel: 'Em manutenção',
      message: `Veículo ${plateLabel} permanece Em manutenção devido à ordem impeditiva ativa #${otherBlockingOrder.id} (${TYPE_LABELS[otherBlockingOrder.type]}).`,
    }
  }

  if (order.blocksVehicle && isActiveOrder(order)) {
    return {
      kind: 'blocked_by_this',
      vehicle,
      otherBlockingOrder: null,
      plateLabel,
      statusLabel: 'Em manutenção',
      message: `Veículo ${plateLabel} está Em manutenção devido ao impedimento desta ordem (#${order.id}).`,
    }
  }

  return {
    kind: 'in_maintenance_unconfirmed',
    vehicle,
    otherBlockingOrder: null,
    plateLabel,
    statusLabel: 'Em manutenção',
    message: vehicleOrders === null
      ? `Veículo ${plateLabel} está Em manutenção (revisão ${vehicle.revision}). Não foi possível consultar outras ordens impeditivas deste veículo.`
      : `Veículo ${plateLabel} permanece Em manutenção (revisão ${vehicle.revision}), sem outra ordem impeditiva ativa localizada.`,
  }
}

/** Gera a descrição explícita da consequência esperada ao confirmar o encerramento da ordem. */
export function buildCloseConsequenceDescription(
  order: MaintenanceOrder,
  situationState: VehicleSituationState | null,
): string {
  const plateLabel = situationState?.situation?.plateLabel
    ?? order.vehicleSnapshot?.licensePlate
    ?? `Veículo ${order.vehicleId}`
  const base = `Veículo ${plateLabel}. O orçamento será preservado e o custo final será calculado com a execução confirmada.`
  const situation = situationState?.situation ?? null

  if (!order.blocksVehicle) {
    const orderNote = 'Esta ordem NÃO é impeditiva, portanto encerrá-la não libera nem altera a situação atual do veículo.'
    if (situation?.kind === 'inactive') {
      return `${base} ${orderNote} O veículo permanece Inativo (inativação independente).`
    }
    if (situation?.kind === 'blocked_by_other' && situation.otherBlockingOrder) {
      return `${base} ${orderNote} O veículo permanece Em manutenção devido à ordem impeditiva ativa #${situation.otherBlockingOrder.id} (${TYPE_LABELS[situation.otherBlockingOrder.type]}).`
    }
    if (situation?.kind === 'available') {
      return `${base} ${orderNote} O veículo permanece Disponível.`
    }
    if (situation?.kind === 'in_maintenance_unconfirmed') {
      return `${base} ${orderNote} O veículo permanece Em manutenção.`
    }
    return `${base} ${orderNote}`
  }

  const blockingNote = 'Esta ordem É impeditiva: ao confirmar o encerramento, o impedimento desta ordem será retirado.'
  if (situation?.kind === 'inactive') {
    return `${base} ${blockingNote} Atenção: o veículo possui inativação independente e permanecerá Inativo.`
  }
  if (situation?.kind === 'blocked_by_other' && situation.otherBlockingOrder) {
    return `${base} ${blockingNote} Atenção: há outra ordem impeditiva ativa (#${situation.otherBlockingOrder.id}); o veículo permanecerá Em manutenção.`
  }
  if (situation?.kind === 'blocked_by_this' || situation?.kind === 'available') {
    return `${base} ${blockingNote} Como não há outro impedimento ativo nem inativação independente identificados, o veículo voltará a ficar Disponível (salvo alteração concorrente).`
  }
  return `${base} ${blockingNote} O veículo voltará a ficar Disponível apenas se não houver inativação independente nem outro impedimento ativo.`
}
