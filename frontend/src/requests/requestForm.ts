import type { CreateTripRequestInput } from './requestTypes.ts'

/** Fuso horário operacional da FSPH/SVO (Aracaju/Maceió — UTC-3). */
export const OPERATIONAL_TIME_ZONE = 'America/Maceio'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const POSITIVE_ID_PATTERN = /^[1-9]\d*$/

export type RequestFormValues = CreateTripRequestInput
export type RequestFormField = keyof RequestFormValues
export type RequestFormErrors = Partial<Record<RequestFormField, string>>

/** Ordem visual e de tabulação dos campos no formulário para redirecionamento de foco em erro. */
export const REQUEST_FORM_FIELD_ORDER: readonly RequestFormField[] = [
  'requestedDate',
  'requestedTime',
  'serviceId',
  'origin',
  'destination',
  'purpose',
] as const

/** Estado inicial limpo do formulário de solicitação de viagem. */
export const EMPTY_REQUEST_FORM: RequestFormValues = {
  requestedDate: '',
  requestedTime: '',
  serviceId: '',
  origin: '',
  destination: '',
  purpose: '',
}

/**
 * Retorna o instante corrente no fuso operacional (`America/Maceio`) no formato `YYYY-MM-DDTHH:mm`,
 * espelhando a regra do backend em `backend/src/services/requests.service.ts`.
 */
export function operationalNow(now = new Date()): string {
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
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

/** Retorna a data civil corrente (`YYYY-MM-DD`) no fuso operacional (`America/Maceio`). */
export function operationalToday(now = new Date()): string {
  return operationalNow(now).slice(0, 10)
}

/** Verifica se a string representa uma data calendário real no formato `YYYY-MM-DD`. */
export function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Verifica se a string representa um horário válido em 24h no formato `HH:mm`. */
export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

/** Normaliza os valores do formulário removendo espaços excedentes para envio à API. */
export function toCreateTripRequestInput(values: RequestFormValues): CreateTripRequestInput {
  return {
    requestedDate: values.requestedDate.trim(),
    requestedTime: values.requestedTime.trim(),
    serviceId: values.serviceId.trim(),
    origin: values.origin.trim(),
    destination: values.destination.trim(),
    purpose: values.purpose.trim(),
  }
}

/**
 * Valida os campos do formulário de solicitação de viagem (US11 / FROTA-78) antes do envio HTTP.
 *
 * @param values - Valores atuais digitados pelo Solicitante.
 * @param now - Data/hora de referência para comparação no fuso `America/Maceio`.
 * @returns Mapa de mensagens de erro por campo em português claro.
 */
export function validateRequestForm(
  values: RequestFormValues,
  now = new Date(),
): RequestFormErrors {
  const normalized = toCreateTripRequestInput(values)
  const errors: RequestFormErrors = {}

  if (!normalized.requestedDate) {
    errors.requestedDate = 'Informe a data da viagem.'
  } else if (!isValidIsoDate(normalized.requestedDate)) {
    errors.requestedDate = 'Informe uma data válida no formato AAAA-MM-DD.'
  }

  if (!normalized.requestedTime) {
    errors.requestedTime = 'Informe o horário de saída.'
  } else if (!isValidTime(normalized.requestedTime)) {
    errors.requestedTime = 'Informe um horário válido no formato HH:mm.'
  }

  if (!errors.requestedDate) {
    const currentNow = operationalNow(now)
    const currentToday = currentNow.slice(0, 10)
    if (normalized.requestedDate < currentToday) {
      errors.requestedDate = 'A data e o horário da viagem não podem estar no passado.'
    } else if (
      !errors.requestedTime
      && `${normalized.requestedDate}T${normalized.requestedTime}` < currentNow
    ) {
      errors.requestedDate = 'A data e o horário da viagem não podem estar no passado.'
    }
  }

  if (!normalized.serviceId) {
    errors.serviceId = 'Selecione o tipo de serviço.'
  } else if (!POSITIVE_ID_PATTERN.test(normalized.serviceId)) {
    errors.serviceId = 'Selecione um tipo de serviço válido.'
  }

  if (!normalized.origin) {
    errors.origin = 'Informe o local de origem.'
  }

  if (!normalized.destination) {
    errors.destination = 'Informe o destino da viagem.'
  }

  if (!normalized.purpose) {
    errors.purpose = 'Informe a finalidade da viagem.'
  }

  return errors
}

/** Retorna o primeiro campo com erro na ordem de tabulação do formulário. */
export function firstInvalidRequestField(errors: RequestFormErrors): RequestFormField | null {
  for (const field of REQUEST_FORM_FIELD_ORDER) {
    if (errors[field]) return field
  }
  return null
}

/** Formata data `YYYY-MM-DD` e horário `HH:mm` no padrão `DD/MM/AAAA — HH:mm` da listagem. */
export function formatRequestDateTimePtBr(requestedDate: string, requestedTime: string): string {
  const [year, month, day] = requestedDate.split('-')
  if (!year || !month || !day) return `${requestedDate} — ${requestedTime}`
  return `${day}/${month}/${year} — ${requestedTime}`
}
