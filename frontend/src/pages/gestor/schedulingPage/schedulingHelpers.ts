import { TripRequestError } from '../../../trips/tripTypes.ts'
import type { DriverAvailability, VehicleAvailability } from '../../../trips/tripTypes.ts'

/** Fuso operacional da FSPH/SVO usado nas consultas de disponibilidade e agendamento. */
export const OPERATIONAL_TIME_ZONE = 'America/Maceio'

/** Valores digitados para o período previsto da viagem. */
export interface PeriodValue {
  start: string
  end: string
}

/** Resultado da validação dos campos de período no fuso operacional. */
export interface PeriodValidationResult {
  scheduledStart: string | null
  scheduledEnd: string | null
  startError: string | undefined
  endError: string | undefined
  isValid: boolean
}

/** Seleção atual de recursos para o agendamento. */
export interface SchedulingSelection {
  vehicleId: string
  driverId: string
}

/** Origem da atualização de disponibilidade que disparou a reconciliação. */
export type ReconciliationTrigger = 'revalidation' | 'refresh'

/** Resultado da comparação da seleção com a disponibilidade recém-consultada. */
export interface SelectionReconciliationResult {
  vehicleId: string
  driverId: string
  hasRemovals: boolean
  summaryMessage: string
}

/** Resumo de recursos indisponíveis para exibição transparente na tela. */
export interface UnavailableSummary {
  total: number
  overview: string
  items: { id: string; label: string; reasonText: string }[]
}

const KNOWN_REASON_DESCRIPTIONS: Readonly<Record<string, string>> = {
  CONFLICT: 'já possui outra viagem agendada no período',
  MAINTENANCE: 'está em manutenção impeditiva',
  INCOMPATIBLE: 'não atende ao tipo de serviço da solicitação',
  CAPACITY_EXCEEDED: 'não comporta a quantidade de passageiros da solicitação',
  AWAY: 'está afastado no momento',
  CNH_EXPIRED: 'está com a CNH vencida antes do término previsto',
  INACTIVE: 'está inativo no cadastro',
}

const KNOWN_REASON_LABELS: Readonly<Record<string, string>> = {
  CONFLICT: 'Conflito de agenda',
  MAINTENANCE: 'Em manutenção impeditiva',
  INCOMPATIBLE: 'Incompatível com o serviço',
  CAPACITY_EXCEEDED: 'Lotação insuficiente',
  AWAY: 'Afastado',
  CNH_EXPIRED: 'CNH vencida',
  INACTIVE: 'Inativo',
}

function operationalParts(timestamp: number): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]))
}

function offsetMinutesAt(timestamp: number): number {
  const parts = operationalParts(timestamp)
  const wallTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((wallTime - timestamp) / 60_000)
}

/** Converte o horário local informado para ISO 8601 no fuso operacional da FSPH. */
export function toOperationalIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  const firstOffset = offsetMinutesAt(wallTime)
  const timestamp = wallTime - firstOffset * 60_000
  const actualOffset = offsetMinutesAt(timestamp)
  const actualParts = operationalParts(timestamp)
  if (
    actualOffset !== firstOffset
    || Number(actualParts.year) !== year
    || Number(actualParts.month) !== month
    || Number(actualParts.day) !== day
    || Number(actualParts.hour) !== hour
    || Number(actualParts.minute) !== minute
  ) {
    return null
  }
  const sign = actualOffset < 0 ? '-' : '+'
  const absoluteOffset = Math.abs(actualOffset)
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`
  return `${value}:00${offset}`
}

/**
 * Valida os campos de início e término previstos e associa mensagens de erro
 * diretamente a cada campo inválido.
 */
export function validatePeriodFields(
  period: PeriodValue,
  rejectedPastStart: string | null = null,
): PeriodValidationResult {
  const scheduledStart = toOperationalIso(period.start)
  const scheduledEnd = toOperationalIso(period.end)

  let startError: string | undefined
  if (period.start && !scheduledStart) {
    startError = 'Informe um horário válido no fuso operacional de Aracaju.'
  } else if (rejectedPastStart && scheduledStart === rejectedPastStart) {
    startError = 'O início da viagem não pode estar no passado.'
  }

  let endError: string | undefined
  if (period.end && !scheduledEnd) {
    endError = 'Informe um horário válido no fuso operacional de Aracaju.'
  } else if (scheduledStart && scheduledEnd && Date.parse(scheduledEnd) <= Date.parse(scheduledStart)) {
    endError = 'O término previsto precisa ser posterior ao início.'
  }

  const isValid = Boolean(
    scheduledStart
    && scheduledEnd
    && !startError
    && !endError
    && Date.parse(scheduledEnd) > Date.parse(scheduledStart),
  )

  return {
    scheduledStart,
    scheduledEnd,
    startError,
    endError,
    isValid,
  }
}

/** Traduz códigos estruturados de indisponibilidade em frase clara em português. */
export function translateAvailabilityReasons(reasons: readonly string[]): string {
  if (reasons.length === 0) return 'não está mais disponível para o período selecionado'
  return reasons
    .map((reason) => KNOWN_REASON_DESCRIPTIONS[reason] ?? 'apresenta impedimento operacional no período')
    .join(' e ')
}

/** Traduz códigos estruturados de indisponibilidade em rótulos curtos para resumo. */
export function formatAvailabilityReasonLabels(reasons: readonly string[]): string {
  if (reasons.length === 0) return 'Indisponível no período'
  return reasons
    .map((reason) => KNOWN_REASON_LABELS[reason] ?? 'Impedimento operacional')
    .join(' · ')
}

/** Formata o rótulo legível do veículo para seleção e avisos ao Gestor. */
export function formatVehicleLabel(vehicle: Pick<VehicleAvailability, 'licensePlate' | 'brand' | 'model'>): string {
  const details = [vehicle.brand, vehicle.model].filter(Boolean).join(' ')
  return details ? `${vehicle.licensePlate} — ${details}` : vehicle.licensePlate
}

/** Formata a capacidade de assentos em português para exibição no resumo e seletor. */
export function formatSeatsLabel(seats: number): string {
  return seats === 1 ? '1 lugar' : `${seats} lugares`
}

/** Formata o rótulo da opção do veículo incluindo sua capacidade vigente de assentos. */
export function formatVehicleOptionLabel(
  vehicle: Pick<VehicleAvailability, 'licensePlate' | 'brand' | 'model' | 'seats'>,
): string {
  return `${formatVehicleLabel(vehicle)} (${formatSeatsLabel(vehicle.seats)})`
}

/**
 * Resume veículos ou motoristas indisponíveis no período com motivos traduzidos,
 * evitando estado vazio genérico quando existem candidatos impedidos ou ocupados.
 */
export function summarizeUnavailableVehicles(vehicles: readonly VehicleAvailability[]): UnavailableSummary {
  const unavailable = vehicles.filter((vehicle) => !vehicle.available)
  return buildUnavailableSummary(unavailable.map((vehicle) => ({
    id: vehicle.id,
    label: formatVehicleOptionLabel(vehicle),
    reasons: vehicle.reasons,
  })), 'veículo', 'veículos')
}

/** Resume motoristas indisponíveis no período com motivos traduzidos. */
export function summarizeUnavailableDrivers(drivers: readonly DriverAvailability[]): UnavailableSummary {
  const unavailable = drivers.filter((driver) => !driver.available)
  return buildUnavailableSummary(unavailable.map((driver) => ({
    id: driver.id,
    label: driver.name,
    reasons: driver.reasons,
  })), 'motorista', 'motoristas')
}

function buildUnavailableSummary(
  entries: readonly { id: string; label: string; reasons: readonly string[] }[],
  singular: string,
  plural: string,
): UnavailableSummary {
  if (entries.length === 0) {
    return { total: 0, overview: '', items: [] }
  }

  const reasonCounts = new Map<string, number>()
  const items = entries.map((entry) => {
    const seenReasons = new Set(entry.reasons.length > 0 ? entry.reasons : ['UNAVAILABLE'])
    for (const reason of seenReasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
    return {
      id: entry.id,
      label: entry.label,
      reasonText: formatAvailabilityReasonLabels(entry.reasons),
    }
  })

  const breakdown = [...reasonCounts.entries()]
    .map(([reason, count]) => {
      const label = reason === 'UNAVAILABLE'
        ? 'Indisponível no período'
        : (KNOWN_REASON_LABELS[reason] ?? 'Impedimento operacional')
      return `${count} ${label.toLowerCase()}`
    })
    .join(', ')

  const noun = entries.length === 1 ? singular : plural
  const adjective = entries.length === 1 ? 'indisponível' : 'indisponíveis'
  return {
    total: entries.length,
    overview: `${entries.length} ${noun} ${adjective} neste período (${breakdown}).`,
    items,
  }
}

/**
 * Compara a seleção atual pelos IDs contra a disponibilidade do intervalo efetivo,
 * mantendo apenas os recursos ainda válidos e explicando os removidos.
 */
export function reconcileSchedulingSelection(
  current: SchedulingSelection,
  vehicles: readonly VehicleAvailability[],
  drivers: readonly DriverAvailability[],
  trigger: ReconciliationTrigger,
): SelectionReconciliationResult {
  const matchedVehicle = current.vehicleId
    ? vehicles.find((vehicle) => vehicle.id === current.vehicleId) ?? null
    : null
  const matchedDriver = current.driverId
    ? drivers.find((driver) => driver.id === current.driverId) ?? null
    : null

  const vehicleValid = Boolean(matchedVehicle && matchedVehicle.available)
  const driverValid = Boolean(matchedDriver && matchedDriver.available)

  const nextVehicleId = vehicleValid ? current.vehicleId : ''
  const nextDriverId = driverValid ? current.driverId : ''

  const removedNotices: string[] = []
  if (current.vehicleId && !vehicleValid) {
    const vehicleDescription = matchedVehicle
      ? `O veículo ${formatVehicleLabel(matchedVehicle)} ${translateAvailabilityReasons(matchedVehicle.reasons)}`
      : 'O veículo selecionado anteriormente não está mais disponível na frota para este período'
    removedNotices.push(`${vehicleDescription} e foi removido da seleção.`)
  }

  if (current.driverId && !driverValid) {
    const driverDescription = matchedDriver
      ? `O motorista ${matchedDriver.name} ${translateAvailabilityReasons(matchedDriver.reasons)}`
      : 'O motorista selecionado anteriormente não está mais disponível para este período'
    removedNotices.push(`${driverDescription} e foi removido da seleção.`)
  }

  if (removedNotices.length === 0) {
    return {
      vehicleId: nextVehicleId,
      driverId: nextDriverId,
      hasRemovals: false,
      summaryMessage: '',
    }
  }

  const preservedParts: string[] = []
  if (vehicleValid && matchedVehicle) {
    preservedParts.push(`o veículo ${formatVehicleLabel(matchedVehicle)} permaneceu selecionado`)
  }
  if (driverValid && matchedDriver) {
    preservedParts.push(`o motorista ${matchedDriver.name} permaneceu selecionado`)
  }

  const prefix = trigger === 'revalidation'
    ? 'Disponibilidade atualizada após conflito ou impedimento:'
    : 'Disponibilidade atualizada para o período:'
  const preservedSentence = preservedParts.length > 0
    ? `Recurso ainda válido mantido: ${preservedParts.join(' e ')}.`
    : ''
  const guidance = 'Escolha outro recurso disponível ou ajuste o período previsto.'

  return {
    vehicleId: nextVehicleId,
    driverId: nextDriverId,
    hasRemovals: true,
    summaryMessage: [prefix, ...removedNotices, preservedSentence, guidance].filter(Boolean).join(' '),
  }
}

/** Indica se a falha de `POST /trips` exige reconsulta automática da disponibilidade. */
export function isSchedulingRequeryStatus(status: number | null): boolean {
  return status === 409 || status === 422
}

/** Identifica erro 422 específico de início da viagem no passado retornado pela API. */
export function isPastStartScheduleError(error: unknown): boolean {
  return error instanceof TripRequestError
    && error.status === 422
    && /passado/i.test(error.message)
}
