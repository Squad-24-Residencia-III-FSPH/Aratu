import {
  ACTIVE_TRIP_AGENDA_STATUSES,
  DASHBOARD_MAX_PERIOD_DAYS,
  TRIP_AGENDA_PATH,
  type DashboardPeriodPreset,
  type DashboardSummary,
  type GestorTripAgendaItem,
} from '../../../types/dashboard.ts'
import type { StatusTone } from '../../../components/ui/StatusChip.tsx'
import { OPERATIONAL_TIME_ZONE, formatCalendarDate } from '../../../utils/dates.ts'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_IN_MS = 86_400_000

/**
 * Rota configurável da tela de documentos de veículos (L10) para abertura direta do alerta.
 * Alinhada com `VEHICLE_DOCUMENTS_PATH = '/vehicle-documents'` e query params `status` / `days` do lote L10.
 */
export const DOCUMENTS_ALERT_BASE_PATH = '/vehicle-documents'

/** Rota dedicada da agenda completa de viagens do Gestor integrada por L02/L18. */
export const TRIP_AGENDA_ROUTE_PATH = TRIP_AGENDA_PATH

/** Cores e rótulos para a distribuição atual da frota conforme `GET /dashboard/summary`. */
export const FLEET_STATUS_SEGMENTS = [
  { key: 'available', label: 'Disponíveis', color: '#15803d' },
  { key: 'inMaintenance', label: 'Em manutenção', color: '#b45309' },
  { key: 'inactive', label: 'Inativos', color: '#64748b' },
] as const

/** Rótulos em português dos estados reais de viagem retornados por `GET /trips`. */
export const TRIP_AGENDA_STATUS_LABELS: Readonly<Record<string, string>> = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Finalizada',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
}

/** Tons semânticos dos estados de viagem na agenda do Gestor. */
export const TRIP_AGENDA_STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  SCHEDULED: 'neutral',
  IN_PROGRESS: 'info',
  FINISHED: 'warning',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
}

const MACEIO_DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MACEIO_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OPERATIONAL_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const CURRENCY_FORMAT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Retorna a data civil atual (`AAAA-MM-DD`) no fuso operacional `America/Maceio`. */
export function todayInMaceio(now: Date = new Date()): string {
  const parts = MACEIO_DATE_PARTS.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

/** Verifica se a string representa uma data civil existente no formato `AAAA-MM-DD`. */
export function isValidCivilDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    Number.isFinite(utc.getTime())
    && utc.getUTCFullYear() === year
    && utc.getUTCMonth() === month - 1
    && utc.getUTCDate() === day
  )
}

function parseUtcEpoch(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

/** Soma ou subtrai dias civis a uma data `AAAA-MM-DD` validada. */
export function addCivilDays(dateStr: string, days: number): string {
  if (!isValidCivilDate(dateStr)) return dateStr
  const utc = new Date(parseUtcEpoch(dateStr) + days * DAY_IN_MS)
  return utc.toISOString().slice(0, 10)
}

/** Subtrai meses calendáricos mantendo um dia civil válido dentro do mês alvo. */
export function subtractCivilMonths(dateStr: string, months: number): string {
  if (!isValidCivilDate(dateStr)) return dateStr
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  const targetMonthIndex = month - 1 - months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDayOfMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDayOfMonth)
  return new Date(Date.UTC(targetYear, normalizedMonth, clampedDay)).toISOString().slice(0, 10)
}

/** Calcula a quantidade de dias entre duas datas civis válidas (`to - from`). */
export function diffCivilDays(from: string, to: string): number | null {
  if (!isValidCivilDate(from) || !isValidCivilDate(to)) return null
  return Math.round((parseUtcEpoch(to) - parseUtcEpoch(from)) / DAY_IN_MS)
}

/** Resultado da validação de período inclusivo do Dashboard antes de consultar a API. */
export type PeriodValidationResult =
  | {
      valid: true
      inclusiveDays: number
      apiPeriod: { from: string; to: string }
    }
  | {
      valid: false
      fromError?: string
      toError?: string
      summaryTitle: string
      summaryDescription: string
    }

/**
 * Valida datas civis inclusivas e converte para o intervalo semiaberto `[from, to)` em `America/Maceio`.
 * Garante intervalo mínimo de 1 dia e máximo de 366 dias aceito pelo backend.
 */
export function validateDashboardPeriod(from: string, to: string): PeriodValidationResult {
  const fromValid = isValidCivilDate(from)
  const toValid = isValidCivilDate(to)

  if (!fromValid || !toValid) {
    const fromError = !from
      ? 'Informe a data inicial.'
      : !fromValid ? 'Data inicial inválida. Use o formato AAAA-MM-DD.' : undefined
    const toError = !to
      ? 'Informe a data final.'
      : !toValid ? 'Data final inválida. Use o formato AAAA-MM-DD.' : undefined
    return {
      valid: false,
      fromError,
      toError,
      summaryTitle: 'Informe um período válido para consultar os indicadores.',
      summaryDescription: 'Preencha as datas inicial e final no formato AAAA-MM-DD para atualizar o painel.',
    }
  }

  const diff = diffCivilDays(from, to)
  if (diff === null || diff < 0) {
    return {
      valid: false,
      toError: 'A data final deve ser igual ou posterior à data inicial.',
      summaryTitle: 'O período selecionado é inválido.',
      summaryDescription: 'A data final precisa ser igual ou posterior à data inicial.',
    }
  }

  const inclusiveDays = diff + 1
  if (inclusiveDays > DASHBOARD_MAX_PERIOD_DAYS) {
    return {
      valid: false,
      toError: `O intervalo máximo é de ${DASHBOARD_MAX_PERIOD_DAYS} dias.`,
      summaryTitle: `O período excede o limite de ${DASHBOARD_MAX_PERIOD_DAYS} dias.`,
      summaryDescription: `Você selecionou ${inclusiveDays} dias. Reduza o intervalo para no máximo ${DASHBOARD_MAX_PERIOD_DAYS} dias civis.`,
    }
  }

  return {
    valid: true,
    inclusiveDays,
    apiPeriod: {
      from,
      to: addCivilDays(to, 1),
    },
  }
}

/** Calcula o intervalo civil inclusivo correspondente a um atalho de período no fuso de Aracaju. */
export function computeQuickPeriodRange(
  preset: Exclude<DashboardPeriodPreset, 'custom'>,
  referenceToday: string = todayInMaceio(),
): { from: string; to: string } {
  if (preset === 'today') return { from: referenceToday, to: referenceToday }
  if (preset === '7days') return { from: addCivilDays(referenceToday, -6), to: referenceToday }
  if (preset === '30days') return { from: addCivilDays(referenceToday, -29), to: referenceToday }
  const candidateStart = addCivilDays(subtractCivilMonths(referenceToday, 6), 1)
  const diff = diffCivilDays(candidateStart, referenceToday) ?? 0
  const safeStart = diff + 1 > DASHBOARD_MAX_PERIOD_DAYS
    ? addCivilDays(referenceToday, -(DASHBOARD_MAX_PERIOD_DAYS - 1))
    : candidateStart
  return { from: safeStart, to: referenceToday }
}

/** Formata com segurança uma data civil `AAAA-MM-DD` sem risco de `RangeError` em valores vazios ou inválidos. */
export function formatSafeCalendarDate(value: string): string {
  if (!isValidCivilDate(value)) return 'Data não definida'
  return formatCalendarDate(value)
}

/** Formata um intervalo civil inclusivo para exibição ao usuário. */
export function formatInclusivePeriodLabel(from: string, to: string): string {
  if (!isValidCivilDate(from) || !isValidCivilDate(to)) return 'Período aguardando definição'
  return from === to ? formatCalendarDate(from) : `${formatCalendarDate(from)} a ${formatCalendarDate(to)}`
}

/** Formata um instante ISO para horário `HH:mm` no fuso operacional `America/Maceio`. */
export function formatTimeInMaceio(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Horário não informado' : MACEIO_TIME_FORMAT.format(date)
}

/** Formata valores monetários em reais (BRL) preservando centavos. */
export function formatCurrency(value: number): string {
  return CURRENCY_FORMAT.format(value)
}

/** Formata números decimais ou inteiros no padrão brasileiro. */
export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value)
}

/** Formata medidas que podem vir nulas sem converter `null` em zero. */
export function formatNullableMeasure(
  value: number | null,
  unit: string,
  emptyText = 'Sem base no período',
  maximumFractionDigits = 2,
): string {
  if (value === null) return emptyText
  return `${formatNumber(value, maximumFractionDigits)} ${unit}`
}

/** Monta a URL configurável do alerta documental para abrir a tela do L10 já filtrada. */
export function buildDocumentsAlertPath(documents: DashboardSummary['documents']): string {
  const params = new URLSearchParams()
  if (documents.expiring > 0) {
    params.set('status', 'EXPIRING')
    params.set('days', String(documents.alertDays))
  } else if (documents.expired > 0) {
    params.set('status', 'EXPIRED')
  } else {
    params.set('days', String(documents.alertDays))
  }
  return `${DOCUMENTS_ALERT_BASE_PATH}?${params.toString()}`
}

/** Formata o resumo textual do card de documentos usando `alertDays` e contagens reais da API. */
export function formatDocumentsAlertCopy(documents: DashboardSummary['documents']): {
  headlineCount: number
  title: string
  detail: string
} {
  const { expiring, expired, alertDays } = documents
  const totalAttention = expiring + expired
  if (expiring > 0 && expired > 0) {
    return {
      headlineCount: totalAttention,
      title: totalAttention === 1 ? 'documento requer atenção' : 'documentos requerem atenção',
      detail: `${expiring} a vencer em até ${alertDays} dias · ${expired} ${expired === 1 ? 'vencido' : 'vencidos'}`,
    }
  }
  if (expired > 0) {
    return {
      headlineCount: expired,
      title: expired === 1 ? 'documento vencido' : 'documentos vencidos',
      detail: `Nenhum a vencer nos próximos ${alertDays} dias`,
    }
  }
  return {
    headlineCount: expiring,
    title: expiring === 1 ? 'documento a vencer' : 'documentos a vencer',
    detail: `Vencimento nos próximos ${alertDays} dias · ${expired} vencidos`,
  }
}

/** Indica se a viagem compõe a visão operacional padrão da agenda (exclui `CANCELED`). */
export function isActiveAgendaTrip(trip: Pick<GestorTripAgendaItem, 'status'>): boolean {
  return ACTIVE_TRIP_AGENDA_STATUSES.some((status) => status === trip.status)
}

/** Opções de situação para o filtro da tela `TripAgendaPage`. */
export const TRIP_AGENDA_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Todas (incluindo canceladas)' },
  { value: 'SCHEDULED', label: 'Agendada' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'FINISHED', label: 'Finalizada' },
  { value: 'CONFIRMED', label: 'Confirmada' },
  { value: 'CANCELED', label: 'Cancelada' },
] as const

/** Resultado da validação de datas inclusivas na consulta da agenda (`GET /trips`). */
export type AgendaPeriodValidation =
  | { valid: true }
  | {
      valid: false
      fromError?: string
      toError?: string
      summaryTitle: string
      summaryDescription: string
    }

/** Valida datas opcionais inclusivas (`from` e `to` em `AAAA-MM-DD`) antes de consultar `GET /trips`. */
export function validateAgendaPeriod(from: string, to: string): AgendaPeriodValidation {
  const fromInvalid = Boolean(from) && !isValidCivilDate(from)
  const toInvalid = Boolean(to) && !isValidCivilDate(to)
  if (fromInvalid || toInvalid) {
    return {
      valid: false,
      fromError: fromInvalid ? 'Data inicial inválida. Use o formato AAAA-MM-DD.' : undefined,
      toError: toInvalid ? 'Data final inválida. Use o formato AAAA-MM-DD.' : undefined,
      summaryTitle: 'Informe datas válidas para consultar a agenda.',
      summaryDescription: 'Use o formato AAAA-MM-DD ou limpe os filtros para consultar o dia de hoje.',
    }
  }
  if (from && to && from > to) {
    return {
      valid: false,
      toError: 'A data final deve ser igual ou posterior à data inicial.',
      summaryTitle: 'O período informado na agenda é inválido.',
      summaryDescription: 'Ajuste a data final para ser igual ou posterior à data inicial.',
    }
  }
  return { valid: true }
}
