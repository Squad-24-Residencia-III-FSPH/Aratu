import type { StatusTone } from '../../components/ui/StatusChip'
import type { RequestTrip } from '../../requests/requestTypes'
import type {
  CreateRequestPayload,
  RequestDetailView,
  RequestEventSummary,
  ResubmitRequestPayload,
} from '../../services/requestsService'
import { formatCalendarDate, formatDateTime, OPERATIONAL_TIME_ZONE } from '../../utils/dates'

/** Campos editáveis no formulário de criação e reenvio de solicitação. */
export interface RequestFormValues {
  serviceId: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  passengers: string
  purpose: string
  notes: string
}

export type RequestFormField = keyof RequestFormValues
export type RequestFormAnyField = RequestFormField | 'reason'

/** Contexto necessário para reenviar uma solicitação rejeitada mantendo revisão otimista. */
export interface ResubmitTarget {
  id: string
  revision: number
  rejectionReason: string | null
}

export const REQUEST_FORM_FIELD_ORDER: readonly RequestFormField[] = [
  'serviceId',
  'requestedDate',
  'requestedTime',
  'origin',
  'destination',
  'passengers',
  'purpose',
  'notes',
]

export type RequestFormErrors = Partial<Record<RequestFormField, string>>

export const EMPTY_REQUEST_FORM: RequestFormValues = {
  serviceId: '',
  requestedDate: '',
  requestedTime: '',
  origin: '',
  destination: '',
  passengers: '1',
  purpose: '',
  notes: '',
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const POSITIVE_ID_PATTERN = /^[1-9]\d*$/
const MAX_NOTES_LENGTH = 1000
const MAX_RESUBMIT_REASON_LENGTH = 500

function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Retorna data (`YYYY-MM-DD`) e horário (`HH:mm`) correntes no fuso operacional da FSPH. */
export function operationalNowParts(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

export type RequestFormValidationResult =
  | { ok: true; payload: CreateRequestPayload }
  | { ok: false; errors: RequestFormErrors; firstInvalidField: RequestFormField }

export type ResubmitFormValidationResult =
  | { ok: true; payload: ResubmitRequestPayload }
  | { ok: false; errors: RequestFormErrors; reasonError?: string; firstInvalidField: RequestFormAnyField }

/** Valida no cliente os campos do formulário de solicitação antes de enviar à API. */
export function validateRequestForm(values: RequestFormValues, now: Date = new Date()): RequestFormValidationResult {
  const errors: RequestFormErrors = {}
  const serviceId = values.serviceId.trim()
  const requestedDate = values.requestedDate.trim()
  const requestedTime = values.requestedTime.trim()
  const origin = values.origin.trim()
  const destination = values.destination.trim()
  const passengersText = values.passengers.trim()
  const purpose = values.purpose.trim()
  const notes = values.notes.trim()

  if (!serviceId) {
    errors.serviceId = 'Selecione o tipo de serviço.'
  } else if (!POSITIVE_ID_PATTERN.test(serviceId)) {
    errors.serviceId = 'Selecione um tipo de serviço válido.'
  }

  const dateValid = isValidCalendarDate(requestedDate)
  if (!requestedDate) {
    errors.requestedDate = 'Informe a data da viagem.'
  } else if (!dateValid) {
    errors.requestedDate = 'Informe uma data válida no formato AAAA-MM-DD.'
  }

  const timeValid = TIME_PATTERN.test(requestedTime)
  if (!requestedTime) {
    errors.requestedTime = 'Informe o horário de saída.'
  } else if (!timeValid) {
    errors.requestedTime = 'Informe um horário válido no formato HH:mm.'
  }

  if (dateValid) {
    const current = operationalNowParts(now)
    if (requestedDate < current.date) {
      errors.requestedDate = 'A data da viagem não pode estar no passado.'
    } else if (requestedDate === current.date && timeValid && requestedTime < current.time) {
      errors.requestedTime = 'O horário de saída não pode estar no passado.'
    }
  }

  if (!origin) errors.origin = 'Informe a origem da viagem.'
  if (!destination) errors.destination = 'Informe o destino da viagem.'

  const passengersValid = POSITIVE_ID_PATTERN.test(passengersText)
  const passengers = passengersValid ? Number(passengersText) : Number.NaN
  if (!passengersText) {
    errors.passengers = 'Informe a quantidade de passageiros.'
  } else if (!passengersValid || !Number.isSafeInteger(passengers) || passengers < 1) {
    errors.passengers = 'Informe uma quantidade válida de passageiros (mínimo 1).'
  }

  if (!purpose) errors.purpose = 'Informe a finalidade da viagem.'
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `As observações devem ter no máximo ${MAX_NOTES_LENGTH} caracteres.`
  }

  const firstInvalidField = REQUEST_FORM_FIELD_ORDER.find((field) => Boolean(errors[field]))
  if (firstInvalidField) {
    return { ok: false, errors, firstInvalidField }
  }

  return {
    ok: true,
    payload: {
      serviceId,
      requestedDate,
      requestedTime,
      origin,
      destination,
      purpose,
      passengers,
      notes: notes.length > 0 ? notes : null,
    },
  }
}

/** Valida os campos da viagem e a justificativa obrigatória para o reenvio versionado. */
export function validateResubmitForm(
  values: RequestFormValues,
  reason: string,
  expectedRevision: number,
  now: Date = new Date(),
): ResubmitFormValidationResult {
  const base = validateRequestForm(values, now)
  const trimmedReason = reason.trim()
  let reasonError: string | undefined
  if (!trimmedReason) {
    reasonError = 'Informe a justificativa do reenvio.'
  } else if (trimmedReason.length > MAX_RESUBMIT_REASON_LENGTH) {
    reasonError = `A justificativa do reenvio deve ter no máximo ${MAX_RESUBMIT_REASON_LENGTH} caracteres.`
  }

  if (!base.ok) {
    return {
      ok: false,
      errors: base.errors,
      ...(reasonError ? { reasonError } : {}),
      firstInvalidField: base.firstInvalidField,
    }
  }

  if (reasonError) {
    return {
      ok: false,
      errors: {},
      reasonError,
      firstInvalidField: 'reason',
    }
  }

  return {
    ok: true,
    payload: {
      ...base.payload,
      expectedRevision,
      reason: trimmedReason,
    },
  }
}

/** Associa mensagens de validação devolvidas por `POST /requests` ou `/resubmit` ao respectivo campo. */
export function mapServerErrorToField(
  message: string,
  values: RequestFormValues,
  now: Date = new Date(),
): RequestFormAnyField | null {
  const normalized = message.trim().toLocaleLowerCase('pt-BR')
  if (normalized.includes('serviceid') || normalized.includes('tipo de serviço')) return 'serviceId'
  if (normalized.includes('requesteddate')) return 'requestedDate'
  if (normalized.includes('requestedtime')) return 'requestedTime'
  if (normalized.includes('passado')) {
    const current = operationalNowParts(now)
    return values.requestedDate.trim() === current.date ? 'requestedTime' : 'requestedDate'
  }
  if (normalized.includes('origin') || normalized.includes('origem')) return 'origin'
  if (normalized.includes('destination') || normalized.includes('destino')) return 'destination'
  if (normalized.includes('passengers') || normalized.includes('passageiro')) return 'passengers'
  if (normalized.includes('purpose') || normalized.includes('finalidade')) return 'purpose'
  if (normalized.includes('notes') || normalized.includes('observa')) return 'notes'
  if (normalized.includes('justificativa') || normalized.includes('reenvio')) return 'reason'
  return null
}

/** Rótulos e tonalidades da situação da viagem vinculada (`trip.status`) no detalhe do pedido. */
export const TRIP_DETAIL_STATUS_LABELS: Readonly<Record<string, string>> = {
  SCHEDULED: 'Viagem agendada',
  IN_PROGRESS: 'Viagem em andamento',
  FINISHED: 'Viagem finalizada',
  CONFIRMED: 'Viagem confirmada',
  CANCELED: 'Viagem cancelada',
}

export const TRIP_DETAIL_STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  FINISHED: 'info',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
}

/** Descrição contextual para distinguir claramente pedido agendado de viagem confirmada pelo Gestor. */
export function describeTripStage(trip: RequestTrip): string {
  switch (trip.status) {
    case 'CONFIRMED':
      return `Viagem #${trip.id} confirmada pela gestão de frota após encerramento pelo motorista.`
    case 'FINISHED':
      return `Viagem #${trip.id} finalizada pelo motorista e aguardando confirmação da gestão de frota.`
    case 'IN_PROGRESS':
      return `Viagem #${trip.id} em andamento com o motorista alocado.`
    case 'CANCELED':
      return `Viagem #${trip.id} cancelada.`
    case 'SCHEDULED':
    default:
      return `Viagem #${trip.id} agendada com veículo e motorista alocados; aguardando execução e confirmação.`
  }
}

/** Formata placa, marca e modelo do veículo alocado na viagem. */
export function formatTripVehicle(vehicle: RequestTrip['vehicle']): string {
  const modelParts = [vehicle.brand, vehicle.model].filter((part): part is string => Boolean(part && part.trim()))
  return modelParts.length > 0
    ? `${vehicle.licensePlate} · ${modelParts.join(' ')}`
    : vehicle.licensePlate
}

export interface TimelineStep {
  key: string
  title: string
  subtitle: string
  state: 'completed' | 'pending' | 'rejected'
}

function mapStoredEventToStep(event: RequestEventSummary): TimelineStep {
  const when = formatDateTime(event.occurredAt)
  switch (event.eventType) {
    case 'CREATED':
      return {
        key: `ev-${event.id}`,
        title: 'Solicitação enviada',
        subtitle: `${when} · Por ${event.reportedBy}`,
        state: 'completed',
      }
    case 'REJECTED':
      return {
        key: `ev-${event.id}`,
        title: 'Solicitação recusada pelo Gestor de Frota',
        subtitle: `${when} · Por ${event.reportedBy} · Motivo: ${event.reason}`,
        state: 'rejected',
      }
    case 'RESUBMITTED':
      return {
        key: `ev-${event.id}`,
        title: 'Solicitação reenviada pelo Solicitante',
        subtitle: `${when} · Por ${event.reportedBy} · Justificativa: ${event.reason}`,
        state: 'completed',
      }
    case 'APPROVED':
      return {
        key: `ev-${event.id}`,
        title: 'Solicitação aprovada',
        subtitle: `${when} · Por ${event.reportedBy} · ${event.reason}`,
        state: 'completed',
      }
    case 'SCHEDULED':
      return {
        key: `ev-${event.id}`,
        title: 'Viagem agendada pela gestão de frota',
        subtitle: `${when} · Por ${event.reportedBy} · ${event.reason}`,
        state: 'completed',
      }
    case 'CANCELED':
      return {
        key: `ev-${event.id}`,
        title: 'Solicitação cancelada',
        subtitle: `${when} · Por ${event.reportedBy} · ${event.reason}`,
        state: 'rejected',
      }
    default:
      return {
        key: `ev-${event.id}`,
        title: event.eventType,
        subtitle: `${when} · Por ${event.reportedBy} · ${event.reason}`,
        state: 'completed',
      }
  }
}

function appendTripSteps(steps: TimelineStep[], detail: RequestDetailView): void {
  if (!detail.trip) {
    steps.push(
      {
        key: 'pending-schedule',
        title: detail.status === 'SCHEDULED' ? 'Agendamento registrado' : 'Agendamento da viagem',
        subtitle: detail.status === 'SCHEDULED' ? 'Dados da viagem ainda indisponíveis' : 'Aguardando alocação de veículo e motorista',
        state: 'pending',
      },
      { key: 'pending-confirm', title: 'Confirmação da viagem', subtitle: 'Aguardando execução', state: 'pending' },
    )
    return
  }

  steps.push({
    key: `trip-scheduled-${detail.trip.id}`,
    title: `Viagem #${detail.trip.id} agendada`,
    subtitle: `${formatDateTime(detail.trip.scheduledStart)} – ${formatDateTime(detail.trip.scheduledEnd)} · ${detail.trip.vehicle.licensePlate}`,
    state: 'completed',
  })

  if (detail.trip.status === 'CONFIRMED') {
    steps.push({
      key: `trip-confirmed-${detail.trip.id}`,
      title: 'Viagem confirmada pela gestão de frota',
      subtitle: 'Ciclo da viagem concluído e conferido',
      state: 'completed',
    })
  } else if (detail.trip.status === 'FINISHED') {
    steps.push({
      key: `trip-finished-${detail.trip.id}`,
      title: 'Viagem finalizada pelo motorista',
      subtitle: 'Aguardando confirmação da gestão de frota',
      state: 'pending',
    })
  } else if (detail.trip.status === 'IN_PROGRESS') {
    steps.push({
      key: `trip-progress-${detail.trip.id}`,
      title: 'Viagem em andamento',
      subtitle: 'Execução em campo pelo motorista',
      state: 'pending',
    })
  } else if (detail.trip.status === 'CANCELED') {
    steps.push({
      key: `trip-canceled-${detail.trip.id}`,
      title: 'Viagem cancelada',
      subtitle: 'Alocação cancelada',
      state: 'rejected',
    })
  } else {
    steps.push({
      key: `trip-awaiting-${detail.trip.id}`,
      title: 'Confirmação da viagem',
      subtitle: 'Aguardando início, término e conferência',
      state: 'pending',
    })
  }
}

/** Constrói a linha do tempo preservando eventos históricos imutáveis de `GET /requests/:id`. */
export function buildRequestTimeline(detail: RequestDetailView): TimelineStep[] {
  if (detail.events && detail.events.length > 0) {
    const steps = detail.events.map(mapStoredEventToStep)
    if (detail.status === 'PENDING') {
      steps.push(
        { key: 'pending-analysis', title: 'Em análise pelo Gestor de Frota', subtitle: 'Aguardando decisão', state: 'pending' },
        { key: 'pending-schedule', title: 'Agendamento da viagem', subtitle: 'Aguardando aprovação', state: 'pending' },
        { key: 'pending-confirm', title: 'Confirmação da viagem', subtitle: 'Aguardando execução', state: 'pending' },
      )
      return steps
    }
    if (detail.status === 'APPROVED' || detail.status === 'SCHEDULED') {
      appendTripSteps(steps, detail)
    }
    return steps
  }

  const steps: TimelineStep[] = [
    {
      key: 'created',
      title: 'Solicitação enviada',
      subtitle: `${formatDateTime(detail.createdAt)} · Viagem solicitada para ${formatCalendarDate(detail.requestedDate)} às ${detail.requestedTime}`,
      state: 'completed',
    },
  ]

  if (detail.status === 'PENDING') {
    steps.push(
      { key: 'pending-analysis', title: 'Em análise pelo Gestor de Frota', subtitle: 'Aguardando decisão', state: 'pending' },
      { key: 'pending-schedule', title: 'Agendamento da viagem', subtitle: 'Aguardando aprovação', state: 'pending' },
      { key: 'pending-confirm', title: 'Confirmação da viagem', subtitle: 'Aguardando execução', state: 'pending' },
    )
    return steps
  }

  if (detail.status === 'REJECTED') {
    steps.push({
      key: 'rejected',
      title: 'Solicitação recusada pelo Gestor de Frota',
      subtitle: detail.decidedAt ? formatDateTime(detail.decidedAt) : 'Decisão registrada',
      state: 'rejected',
    })
    return steps
  }

  if (detail.status === 'CANCELED') {
    steps.push({
      key: 'canceled',
      title: 'Solicitação cancelada',
      subtitle: formatDateTime(detail.updatedAt),
      state: 'rejected',
    })
    return steps
  }

  steps.push({
    key: 'approved',
    title: 'Solicitação aprovada',
    subtitle: detail.decidedAt ? formatDateTime(detail.decidedAt) : 'Aprovada pela gestão',
    state: 'completed',
  })

  appendTripSteps(steps, detail)
  return steps
}
