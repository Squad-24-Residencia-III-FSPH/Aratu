import type { Profile } from '../auth/profiles'
import type { StatusTone } from '../components/ui/StatusChip'

/** Rota canônica da tela de solicitações e triagem SVO (FROTA-109). */
export const SVO_OCCURRENCES_PATH = '/svo/solicitacoes'

/** Tipos de solicitante aceitos pelo contrato de ocorrências SVO. */
export const SVO_REQUESTER_TYPES = ['FAMILY', 'HOSPITAL', 'UBS', 'UPA', 'PUBLIC_AGENCY', 'OTHER'] as const
export type SvoRequesterType = typeof SVO_REQUESTER_TYPES[number]

/** Situações válidas para solicitação SVO. */
export const SVO_OCCURRENCE_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELED'] as const
export type SvoOccurrenceStatus = typeof SVO_OCCURRENCE_STATUSES[number]

/** Perfis com permissão para registrar ocorrência e confirmar triagem. */
export const SVO_OCCURRENCE_WRITE_ROLES: readonly Profile[] = ['ATENDENTE_SVO', 'ADMINISTRADOR']

/** Perfis que podem despachar e reprocessar ordens na Central SVO. */
export const SVO_DISPATCH_ROLES: readonly Profile[] = ['GESTOR', 'ADMINISTRADOR']

/** Perfis com permissão de leitura na tela de solicitações SVO. */
export const SVO_OCCURRENCE_READ_ROLES: readonly Profile[] = ['ATENDENTE_SVO', 'ADMINISTRADOR', 'GESTOR']

/** Rótulos em português para exibição dos tipos de solicitante. */
export const SVO_REQUESTER_TYPE_LABELS: Readonly<Record<SvoRequesterType, string>> = {
  FAMILY: 'Familiar',
  HOSPITAL: 'Hospital',
  UBS: 'UBS',
  UPA: 'UPA',
  PUBLIC_AGENCY: 'Órgão público',
  OTHER: 'Outro',
}

/** Rótulos em português para exibição da situação da solicitação. */
export const SVO_OCCURRENCE_STATUS_LABELS: Readonly<Record<SvoOccurrenceStatus, string>> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
}

/** Tons acessíveis de `StatusChip` para cada situação da solicitação SVO. */
export const SVO_OCCURRENCE_STATUS_TONES: Readonly<Record<SvoOccurrenceStatus, StatusTone>> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELED: 'neutral',
}

/** Rótulos resumidos das situações de ordem vinculada exibidas na Central SVO. */
export const SVO_DISPATCH_ORDER_STATUS_LABELS: Readonly<Record<string, string>> = {
  OPEN: 'Aberta',
  IN_TRANSIT: 'Em deslocamento',
  IN_SERVICE: 'Em atendimento',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  NOT_PERFORMED: 'Não realizada',
  CANCELED: 'Cancelada',
}

/** Status de ordem SVO que reservam vaga na capacidade de transporte de corpos da viatura. */
export const SVO_DISPATCH_OCCUPYING_STATUSES = ['OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS'] as const

const MAX_BIGINT = 9223372036854775807n

/** Resumo de solicitação SVO retornado na listagem (sem dados pessoais do solicitante). */
export interface SvoOccurrenceSummary {
  id: string
  requesterType: SvoRequesterType
  location: string
  status: SvoOccurrenceStatus
  receivedAt: string
  createdAt: string
  revision: number
  dispatchRequestedAt?: string | null
  dispatchRequestedBy?: string | null
  dispatchWaitReason?: 'NO_TEAM' | 'NO_VEHICLE' | null
  executionOrderId?: string | null
}

/** Detalhe completo de uma solicitação SVO carregado sob demanda. */
export interface SvoOccurrenceDetail extends SvoOccurrenceSummary {
  requesterName: string
  requesterPhone: string
  description: string
  notes: string | null
  attendantId: string
  triagedAt: string | null
  triagedBy: string | null
  updatedAt: string
  evidenceDescription: string | null
}

/** Payload de cadastro aceito por `POST /svo/occurrences`. */
export interface CreateSvoOccurrenceInput {
  requesterName: string
  requesterPhone: string
  requesterType: SvoRequesterType
  location: string
  description: string
  notes?: string | null
  receivedAt?: string
  evidenceDescription: string
}

/** Resposta de criação em `POST /svo/occurrences`. */
export interface SvoOccurrenceCreationResult {
  id: string
  status: 'PENDING'
  receivedAt: string
  createdAt: string
  revision: number
}

/** Resultado da tentativa automática de despacho executada pelo backend após triagem ou reavaliação. */
export type SvoDispatchAutoResult =
  | { status: 'DISPATCHED'; orderId: string; teamId: string; vehicleId: string; revision: number }
  | { status: 'WAITING'; reason: 'NO_TEAM' | 'NO_VEHICLE'; revision: number }

/** Resposta de confirmação em `POST /svo/occurrences/:id/confirm`. */
export interface SvoOccurrenceConfirmationResult {
  id: string
  status: 'CONFIRMED'
  triagedAt: string | null
  triagedBy: string | null
  revision: number
  dispatch?: SvoDispatchAutoResult
}

/** Filtros suportados pela listagem `GET /svo/occurrences`. */
export interface SvoOccurrenceListFilters {
  status?: SvoOccurrenceStatus | ''
  from?: string
  to?: string
}

/** Filtros preenchidos da listagem SVO com campos obrigatórios. */
export interface SvoOccurrenceFilters {
  status: SvoOccurrenceStatus | ''
  from: string
  to: string
}

/** Vínculo resumido de ordem já gerada para impedir duplicidade e calcular ocupação. */
export interface SvoDispatchOrderRef {
  id: string
  occurrenceId: string
  teamId: string
  vehicleId: string
  status: string
  teamName: string
  vehicleLicensePlate: string
}

/** Equipe SVO ativa elegível para recebimento de ordem de execução. */
export interface SvoDispatchCandidateTeam {
  id: string
  name: string
}

/** Viatura SVO elegível consultada em `GET /svo/dispatch-candidates`. */
export interface SvoDispatchCandidateVehicle {
  id: string
  plate: string
  brand: string | null
  model: string | null
  bodyLimit: number
  occupyingOrders: number
  availableSlots: number
}

/** Resposta de `GET /svo/dispatch-candidates`. */
export interface SvoDispatchCandidatesResult {
  teams: SvoDispatchCandidateTeam[]
  vehicles: SvoDispatchCandidateVehicle[]
}

/** Payload aceito por `POST /svo/orders`. */
export interface CreateSvoOrderDispatchInput {
  occurrenceId: string
  teamId: string
  vehicleId: string
}

/** Resposta de geração em `POST /svo/orders`. */
export interface SvoOrderDispatchResult {
  id: string
  status: 'OPEN'
}

/** Classificação de falhas de comunicação e regras para recuperação segura na tela. */
export type SvoOccurrenceErrorKind =
  | 'session'
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'server'
  | 'network'
  | 'invalidResponse'
  | 'rejected'

/** Erro tipado do cliente SVO preservando a orientação sem expor dados sensíveis. */
export class SvoOccurrenceRequestError extends Error {
  readonly kind: SvoOccurrenceErrorKind

  constructor(kind: SvoOccurrenceErrorKind, message: string) {
    super(message)
    this.name = 'SvoOccurrenceRequestError'
    this.kind = kind
  }
}

/** Verifica se o perfil possui acesso de leitura às solicitações SVO. */
export function canReadSvoOccurrences(profile: Profile | null): boolean {
  return profile !== null && SVO_OCCURRENCE_READ_ROLES.includes(profile)
}

/** Verifica se o perfil possui acesso de registro e confirmação de triagem. */
export function canWriteSvoOccurrences(profile: Profile | null): boolean {
  return profile !== null && SVO_OCCURRENCE_WRITE_ROLES.includes(profile)
}

/** Espelha a autorização da API para o despacho manual e o reprocessamento. */
export function canManageSvoDispatch(profile: Profile | null): boolean {
  return profile !== null && SVO_DISPATCH_ROLES.includes(profile)
}

/** Uma ocorrência pode aguardar novo despacho depois que a triagem registrou a intenção. */
export function isAwaitingSvoDispatch(occurrence: SvoOccurrenceSummary): boolean {
  return occurrence.status === 'CONFIRMED' && Boolean(occurrence.dispatchRequestedAt) && !occurrence.executionOrderId
}

/** Valida se o texto representa um identificador decimal positivo dentro do limite `BIGINT`. */
export function isCanonicalBigIntId(value: string): boolean {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= MAX_BIGINT
}

/** Valida data civil no formato `AAAA-MM-DD` sem normalização silenciosa de calendário. */
export function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Converte data e hora informadas no fuso operacional (`America/Maceio`, UTC-03:00)
 * para instante ISO 8601 com offset explícito.
 */
export function buildMaceioReceivedAtIso(date: string, time: string): string | null {
  if (!isValidCivilDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const iso = `${date}T${time}:00-03:00`
  const parsed = new Date(iso)
  return Number.isFinite(parsed.getTime()) ? iso : null
}
