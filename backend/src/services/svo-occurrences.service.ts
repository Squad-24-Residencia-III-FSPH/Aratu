import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import type { SvoOccurrencesRepositoryContract } from '../repositories/svo-occurrences.repository'
import {
  SVO_REQUESTER_TYPES, SVO_STATUSES, SVO_TRANSITIONS, SVO_WRITE_ROLES, SvoOccurrenceServiceError,
} from '../types/svo-occurrence.types'
import type {
  CreateSvoOccurrenceInput, SvoActorSnapshot, SvoOccurrenceDetail, SvoOccurrenceSummary,
  SvoCreationResult, SvoConfirmationResult,
} from '../types/svo-occurrence.types'

const CREATE_FIELDS = ['requesterName', 'requesterPhone', 'requesterType', 'location', 'description', 'notes', 'receivedAt', 'evidenceDescription']
const RECEIVED_REASON = 'Solicitação SVO recebida e registrada.'
const CONFIRMED_REASON = 'Triagem SVO conferida e solicitação confirmada.'
const CONFIRMATION_EVIDENCE = 'Campos obrigatórios conferidos pelo operador na sessão autenticada.'
const MAX_BIGINT = 9223372036854775807n
const DAY_MS = 86_400_000
const OPERATIONAL_TIME_ZONE = 'America/Maceio'
const MAX_ZONE_ADJUSTMENTS = 3
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

function invalid(message: string): never {
  throw new SvoOccurrenceServiceError('INVALID_INPUT', message)
}

function inputRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('Envie um objeto JSON com os campos da solicitação.')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowed.includes(key))) invalid('Envie somente os campos permitidos para esta operação.')
  return record
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(message)
  return value.trim()
}

function validCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function receivedInstant(value: unknown): Date {
  if (typeof value !== 'string' || !INSTANT_PATTERN.test(value) || !validCivilDate(value.slice(0, 10))) {
    invalid('Informe uma data de recebimento válida em ISO 8601 com fuso horário.')
  }
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime())) invalid('Informe uma data de recebimento válida com fuso horário.')
  return instant
}

function occurrenceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) {
    invalid('Informe um identificador positivo válido para a solicitação.')
  }
  return value
}

function requiredFields(body: Record<string, unknown>): Pick<CreateSvoOccurrenceInput, 'requesterName' | 'requesterPhone' | 'requesterType' | 'location' | 'description'> {
  const typeText = requiredText(body.requesterType, 'Informe o tipo do solicitante.')
  const requesterType = SVO_REQUESTER_TYPES.find((type) => type === typeText)
  if (!requesterType) invalid('Informe um tipo de solicitante válido.')
  return {
    requesterName: requiredText(body.requesterName, 'Informe o nome do solicitante.'),
    requesterPhone: requiredText(body.requesterPhone, 'Informe o telefone do solicitante.'),
    requesterType,
    location: requiredText(body.location, 'Informe o local da solicitação.'),
    description: requiredText(body.description, 'Informe a descrição da solicitação.'),
  }
}

function createInput(value: unknown): CreateSvoOccurrenceInput {
  const body = inputRecord(value, CREATE_FIELDS)
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
    invalid('Informe as observações em texto ou deixe o campo vazio.')
  }
  return {
    ...requiredFields(body),
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    evidenceDescription: requiredText(body.evidenceDescription, 'Descreva o canal ou meio de recebimento da solicitação.'),
    ...(body.receivedAt === undefined ? {} : { receivedAt: receivedInstant(body.receivedAt).toISOString() }),
  }
}

function filterDate(value: unknown, field: string): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !validCivilDate(value)) invalid(`Informe ${field} como uma data válida no formato AAAA-MM-DD.`)
  return value
}

/** Resolve o limite civil no fuso operacional, sem aplicar funções à coluna indexada. */
function civilBoundary(value: string, nextDay = false): Date {
  const nominal = new Date(`${value}T00:00:00Z`).getTime() + (nextDay ? DAY_MS : 0)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', era: 'short',
  })
  let instant = nominal
  for (let attempt = 0; attempt < MAX_ZONE_ADJUSTMENTS; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value: part }) => [type, part]))
    const local = new Date(0)
    const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year)
    local.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day))
    local.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), 0)
    const correction = nominal - local.getTime()
    instant += correction
    if (correction === 0) break
  }
  return new Date(instant)
}

function auditState(occurrence: SvoOccurrenceDetail): Record<string, unknown> {
  const { id, status, revision, receivedAt, triagedAt, triagedBy } = occurrence
  return { id, status, revision, receivedAt, triagedAt, triagedBy }
}

/** Registro e confirmação simples do SVO, sem deduplicação por dados pessoais. */
export class SvoOccurrencesService {
  constructor(private readonly repository: SvoOccurrencesRepositoryContract, private readonly audit: AuditLogger) {}

  /**
   * Registra recebimento, autoria e auditoria de forma atômica, inclusive fora do expediente.
   * @throws {SvoOccurrenceServiceError} Entrada inválida, recebimento futuro ou conta sem permissão atual.
   */
  async createOccurrence(body: unknown, userId: string): Promise<SvoCreationResult> {
    const input = createInput(body)
    return this.repository.withTransaction(async (client) => {
      const actor = await this.requireActor(userId, client)
      const now = await this.repository.currentTime(client)
      const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now
      if (receivedAt > now) invalid('A data de recebimento não pode estar no futuro.')
      const occurrence = await this.repository.create(input, receivedAt, actor, client)
      const after = { ...occurrence, evidenceDescription: input.evidenceDescription }
      await this.repository.createEvent({
        occurrenceId: occurrence.id, eventType: 'RECEIVED', occurredAt: receivedAt,
        reportedBy: input.requesterName, actorSnapshot: actor, reason: RECEIVED_REASON,
        evidenceDescription: input.evidenceDescription, beforeState: null, afterState: after,
      }, client)
      await this.recordAudit(null, after, actor, RECEIVED_REASON, client)
      const { id, status, createdAt, revision } = occurrence
      return { id, status, receivedAt, createdAt, revision }
    })
  }

  /**
   * Filtra pelo dia do recebimento em America/Maceio; fim inclusivo vira limite exclusivo.
   * @throws {SvoOccurrenceServiceError} Filtro desconhecido, data impossível ou intervalo invertido.
   */
  async listOccurrences(query: unknown): Promise<SvoOccurrenceSummary[]> {
    const input = inputRecord(query, ['status', 'from', 'to'])
    const status = input.status === undefined ? null : SVO_STATUSES.find((item) => item === input.status)
    if (status === undefined) invalid('Informe uma situação válida: PENDING, CONFIRMED ou CANCELED.')
    const from = filterDate(input.from, 'a data inicial')
    const to = filterDate(input.to, 'a data final')
    if (from && to && from > to) invalid('A data inicial não pode ser posterior à data final.')
    return this.repository.list({ status, from: from ? civilBoundary(from) : null, until: to ? civilBoundary(to, true) : null })
  }

  /**
   * Retorna o detalhe restrito, preservando ausência de evidência em registros legados.
   * @throws {SvoOccurrenceServiceError} Identificador inválido ou ocorrência inexistente.
   */
  async getOccurrence(id: unknown): Promise<SvoOccurrenceDetail> {
    const occurrence = await this.repository.findById(occurrenceId(id))
    if (!occurrence) throw new SvoOccurrenceServiceError('NOT_FOUND', 'Solicitação SVO não encontrada.')
    return occurrence
  }

  /**
   * Confirma apenas PENDING após travar conta e ocorrência, preservando o recebimento original.
   * @throws {SvoOccurrenceServiceError} Entrada inválida, acesso negado, registro inexistente ou transição já concluída.
   */
  async confirmOccurrence(id: unknown, body: unknown, userId: string): Promise<SvoConfirmationResult> {
    const validId = occurrenceId(id)
    inputRecord(body === undefined ? {} : body, [])
    return this.repository.withTransaction(async (client) => {
      const actor = await this.requireActor(userId, client)
      const before = await this.repository.findByIdForUpdate(validId, client)
      if (!before) throw new SvoOccurrenceServiceError('NOT_FOUND', 'Solicitação SVO não encontrada.')
      if (!SVO_TRANSITIONS[before.status].includes('CONFIRMED')) {
        throw new SvoOccurrenceServiceError('INVALID_TRANSITION', before.status === 'CONFIRMED'
          ? 'Esta solicitação já foi confirmada.' : 'Uma solicitação cancelada não pode ser confirmada.')
      }
      requiredFields({ ...before })
      const now = await this.repository.currentTime(client)
      const after = await this.repository.confirm(validId, actor.id, now, client)
      await this.repository.createEvent({
        occurrenceId: validId, eventType: 'CONFIRMED', occurredAt: now, reportedBy: actor.name,
        actorSnapshot: actor, reason: CONFIRMED_REASON, evidenceDescription: CONFIRMATION_EVIDENCE,
        beforeState: before, afterState: after,
      }, client)
      await this.recordAudit(before, after, actor, CONFIRMED_REASON, client)
      const { status, triagedAt, triagedBy, revision } = after
      return { id: validId, status, triagedAt, triagedBy, revision }
    })
  }

  private async requireActor(id: string, client: PoolClient): Promise<SvoActorSnapshot> {
    const actor = await this.repository.findActorSnapshot(id, client)
    if (!actor) throw new SvoOccurrenceServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    if (!SVO_WRITE_ROLES.some((role) => role === actor.role)) {
      throw new SvoOccurrenceServiceError('ACCESS_DENIED', 'Seu perfil atual não permite registrar ou confirmar solicitações SVO.')
    }
    return actor
  }

  private async recordAudit(before: SvoOccurrenceDetail | null, after: SvoOccurrenceDetail, actor: SvoActorSnapshot, reason: string, client: PoolClient): Promise<void> {
    await this.audit.recordAudit({
      userId: actor.id, table: 'svo.occurrences', recordId: after.id,
      operation: before ? 'STATUS_CHANGE' : 'CREATE', before: before ? auditState(before) : null,
      after: auditState(after), actorSnapshot: { ...actor }, reason,
    }, client)
  }
}
