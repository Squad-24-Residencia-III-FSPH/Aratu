import type { Profile } from '../auth/profiles.ts'
import type { StatusTone } from '../components/ui/StatusChip.tsx'

/** Caminho canônico da tela de multas e infrações. */
export const FINES_PATH = '/multas'

/** Perfis autorizados a consultar e gerenciar multas, espelhando `fines.routes.ts`. */
export const FINE_ACCESS_PROFILES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Indica se o perfil possui permissão operacional no módulo de multas. */
export function canManageFines(profile: Profile | null): boolean {
  return profile !== null && FINE_ACCESS_PROFILES.includes(profile)
}

export const FINE_STATUSES = ['PENDING', 'PAID', 'CONTESTED', 'CANCELED'] as const
export type FineStatus = typeof FINE_STATUSES[number]

export const FINE_TRANSITIONS: Record<FineStatus, readonly FineStatus[]> = {
  PENDING: ['CONTESTED', 'PAID', 'CANCELED'],
  CONTESTED: ['PENDING', 'PAID', 'CANCELED'],
  PAID: ['PENDING'],
  CANCELED: ['PENDING'],
}

export const FINE_STATUS_LABELS: Record<FineStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  CONTESTED: 'Em recurso',
  CANCELED: 'Cancelada',
}

export const FINE_STATUS_TONES: Record<FineStatus, StatusTone> = {
  PENDING: 'warning',
  PAID: 'success',
  CONTESTED: 'info',
  CANCELED: 'neutral',
}

export const FINE_EVENT_LABELS: Record<string, string> = {
  REGISTERED: 'Multa registrada',
  DRIVER_IDENTIFIED: 'Motorista identificado',
  DRIVER_CHANGED: 'Vínculo de motorista alterado',
  RECTIFIED: 'Dados retificados',
  PAID: 'Pagamento registrado',
  CONTESTED: 'Recurso registrado',
  CANCELED: 'Multa cancelada',
  REOPENED: 'Multa reaberta',
}

export const SNAPSHOT_SOURCE_LABELS: Record<FineSnapshotSource, string> = {
  TRIP_SNAPSHOT: 'Snapshot da viagem',
  CURRENT_REGISTRY: 'Cadastro vigente no registro',
}

export const TRIP_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Concluída',
  CONFIRMED: 'Confirmada',
}

export const FINE_TRANSITION_ACTION_LABELS: Record<FineStatus, string> = {
  PENDING: 'Reabrir multa',
  PAID: 'Registrar pagamento',
  CONTESTED: 'Registrar recurso',
  CANCELED: 'Cancelar multa',
}

export type FineSnapshotSource = 'TRIP_SNAPSHOT' | 'CURRENT_REGISTRY'

export interface FineMetadata {
  reportedBy: string
  reason: string
  evidenceDescription: string
  attachmentUrl?: string | null
}

export interface FineAttributes {
  vehicleId: string
  driverId: string | null
  tripId: string | null
  infractionAt: string
  infractionCode: string
  description: string
  location: string | null
  amount: string
  dueAt: string | null
  notes: string | null
}

export type CreateFineInput = FineMetadata
  & Pick<FineAttributes, 'vehicleId' | 'infractionAt' | 'infractionCode' | 'description' | 'amount'>
  & Partial<Omit<FineAttributes, 'vehicleId' | 'infractionAt' | 'infractionCode' | 'description' | 'amount'>>

export type UpdateFineInput = FineMetadata & Partial<FineAttributes> & {
  expectedRevision: number
  occurredAt: string
}

export type ChangeFineStatusInput = FineMetadata & {
  expectedRevision: number
} & (
  | { status: 'PAID'; paidAt: string; occurredAt?: string }
  | { status: Exclude<FineStatus, 'PAID'>; occurredAt: string; paidAt?: never }
)

export interface FineVehicleSnapshot {
  id: string
  licensePlate: string
  model: string | null
  source: FineSnapshotSource
  capturedAt: string
}

export interface FineDriverSnapshot {
  id: string
  name: string
  source: FineSnapshotSource
  capturedAt: string
}

export interface FineTripSnapshot {
  id: string
  vehicleId: string
  driverId: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  capturedAt: string
}

export interface FineContext {
  vehicleSnapshot: FineVehicleSnapshot | null
  driverSnapshot: FineDriverSnapshot | null
  tripSnapshot: FineTripSnapshot | null
}

export interface Fine extends FineAttributes, FineContext {
  id: string
  status: FineStatus
  paidAt: string | null
  cancellationReason: string | null
  createdBy: string
  revision: number
  createdAt: string
  updatedAt: string
  vehicle: { id: string; licensePlate: string; model: string | null }
  driver: { id: string; name: string } | null
}

export interface FineTimelineEntry {
  id: string
  eventType: string
  occurredAt: string
  registeredAt: string
  reportedBy: string
  reason: string
  evidenceDescription: string | null
  attachmentUrl: string | null
  supersedesId: string | null
  actor: { id: string; name: string; role: string }
  before: Partial<Fine> | null
  after: Partial<Fine>
}

export interface FineDetail extends Fine {
  events: FineTimelineEntry[]
}

export interface FineFilters {
  vehicleId?: string
  driverId?: string
  status?: FineStatus
  from?: string
  to?: string
}

export interface FineDriverSuggestion {
  tripId: string
  driverId: string
  driverName: string
  vehicleId: string
  startedAt: string
  finishedAt: string | null
  tripStatus: string
  nameSource: FineSnapshotSource
}

const MAX_AMOUNT_CENTS = 999999999999n
const MONEY_INPUT_ERROR = 'Informe o valor em reais com até duas casas decimais, entre 0,00 e 9.999.999.999,99.'

/** Indica se a multa está em estado final fechado, exigindo reabertura antes de retificar dados. */
export function isFineClosed(fine: Pick<Fine, 'status'>): boolean {
  return fine.status === 'PAID' || fine.status === 'CANCELED'
}

/** Formata valor monetário canônico sem conversão para ponto flutuante. */
export function formatFineMoney(value: string | null): string {
  if (value === null) return 'Não informado'
  const match = /^(\d+)\.(\d{2})$/.exec(value)
  if (!match) return value
  const [, whole, cents] = match
  return `R$ ${BigInt(whole!).toLocaleString('pt-BR')},${cents}`
}

/** Soma valores monetários usando aritmética exata em centavos para o resumo do recorte. */
export function sumFineAmounts(fines: readonly Pick<Fine, 'amount'>[]): string {
  let totalCents = 0n
  for (const fine of fines) {
    const match = /^(\d+)\.(\d{2})$/.exec(fine.amount)
    if (match) totalCents += BigInt(`${match[1]}${match[2]}`)
  }
  const whole = totalCents / 100n
  const cents = (totalCents % 100n).toString().padStart(2, '0')
  return formatFineMoney(`${whole}.${cents}`)
}

/** Normaliza entrada monetária localizada (`195,23` ou `195.23`) para o formato da API (`195.23`). */
export function normalizeFineAmount(value: string): string {
  const normalized = value.trim().replace(',', '.')
  if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(MONEY_INPUT_ERROR)
  }
  const [whole, fraction = ''] = normalized.split('.')
  const canonical = `${whole}.${fraction.padEnd(2, '0')}`
  if (BigInt(canonical.replace('.', '')) > MAX_AMOUNT_CENTS) {
    throw new Error(MONEY_INPUT_ERROR)
  }
  return canonical
}

/** Valida o campo monetário no formulário sem lançar exceções para o render. */
export function getFineAmountError(value: string): string | undefined {
  if (!value.trim()) return 'Informe o valor da multa.'
  try {
    normalizeFineAmount(value)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : MONEY_INPUT_ERROR
  }
}

/** Valida URL opcional da evidência com as mesmas restrições de protocolo e credenciais do backend. */
export function getAttachmentUrlError(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      return 'Informe uma URL HTTP ou HTTPS sem credenciais para a evidência.'
    }
    return undefined
  } catch {
    return 'Informe uma URL HTTP ou HTTPS válida para a evidência.'
  }
}

/** Converte instante UTC ISO para valor compatível com `<input type="datetime-local">` no fuso do aparelho. */
export function toLocalDateTimeInput(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

/** Verifica se o valor preenchido em `datetime-local` gera um instante calendário válido. */
export function isValidLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return false
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime())
}

/** Converte entrada `datetime-local` para instante UTC ISO 8601 exigido pela API. */
export function localDateTimeToIso(value: string): string {
  if (!isValidLocalDateTime(value)) {
    throw new Error('Informe data e hora válidas.')
  }
  return new Date(value).toISOString()
}
