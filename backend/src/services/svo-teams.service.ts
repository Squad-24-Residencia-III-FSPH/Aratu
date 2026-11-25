import type { PoolClient } from 'pg'
import type { AuditLogger } from '../types/audit.types'
import type { SvoTeamsRepositoryContract } from '../repositories/svo-teams.repository'
import type { SvoActorSnapshot } from '../types/svo-occurrence.types'
import { SvoTeamServiceError } from '../types/svo-team.types'
import type { SvoTeam, SvoTeamEventInput, SvoTeamShift } from '../types/svo-team.types'

const MAX_BIGINT = 9223372036854775807n
const MANAGER_ROLES = ['GESTOR', 'ADMINISTRADOR']
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function invalid(message: string): never { throw new SvoTeamServiceError('INVALID_INPUT', message) }
function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('Envie um objeto JSON válido.')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some((key) => !allowed.includes(key))) invalid('Remova os campos não permitidos.')
  return input
}
function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT) invalid(`Informe ${field} válido.`)
  return value
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid('A revisão deve ser um inteiro positivo.')
  return Number(value)
}
function text(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`Informe ${field} com até ${max} caracteres.`)
  return value.trim()
}
function instant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) invalid(`Informe ${field} como instante ISO 8601 com fuso.`)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) invalid(`Informe ${field} válida.`)
  return date
}

/** Gerencia equipes, vínculos e plantões com eventos/auditoria append-only. */
export class SvoTeamsService {
  constructor(private readonly repository: SvoTeamsRepositoryContract, private readonly audit: AuditLogger) {}

  async listTeams(userId: string): Promise<SvoTeam[]> {
    await this.readActor(userId)
    return this.repository.list()
  }

  async listEligibleMembers(userId: string) {
    await this.readActor(userId)
    return this.repository.listEligibleMembers()
  }

  async createTeam(body: unknown, userId: string): Promise<SvoTeam> {
    const input = record(body, ['name'])
    const name = text(input.name, 'o nome da equipe', 120)
    try {
      return await this.repository.withTransaction(async (client) => {
        const actor = await this.requireManager(userId, client)
        const now = await this.repository.currentTime(client)
        const team = await this.repository.createTeam(name, client)
        await this.writeEvent({ teamId: team.id, eventType: 'CREATED', actor, occurredAt: now, reason: 'Equipe SVO cadastrada.', beforeState: null, afterState: team }, client)
        await this.writeAudit(team.id, null, team, actor, 'CREATE', 'Equipe SVO cadastrada.', client)
        return team
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new SvoTeamServiceError('CONFLICT', 'Já existe uma equipe com esse nome.')
      throw error
    }
  }

  async updateTeam(teamIdValue: unknown, body: unknown, userId: string): Promise<SvoTeam> {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const input = record(body, ['expectedRevision', 'name', 'active', 'reason'])
    const expectedRevision = revision(input.expectedRevision)
    const name = text(input.name, 'o nome da equipe', 120)
    const active = input.active
    if (typeof active !== 'boolean') invalid('Informe se a equipe está ativa.')
    const reason = text(input.reason, 'o motivo da alteração')
    await this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      const before = await this.repository.findTeamForUpdate(teamId, client)
      if (!before) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      if (before.revision !== expectedRevision) throw new SvoTeamServiceError('CONFLICT', 'A equipe foi alterada. Atualize os dados antes de salvar.')
      const now = await this.repository.currentTime(client)
      if (!await this.repository.updateTeam(teamId, expectedRevision, name, active, now, client)) {
        throw new SvoTeamServiceError('CONFLICT', 'A equipe foi alterada. Atualize os dados antes de salvar.')
      }
      const after = { ...before, name, active, revision: before.revision + 1 }
      const eventType = before.active === active ? 'UPDATED' : 'STATUS_CHANGED'
      await this.writeEvent({ teamId, eventType, actor, occurredAt: now, reason, beforeState: before, afterState: after }, client)
      await this.writeAudit(teamId, before, after, actor, 'UPDATE', reason, client)
    })
    const result = await this.repository.findById(teamId)
    if (!result) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
    return result
  }

  async addMember(teamIdValue: unknown, body: unknown, userId: string) {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const input = record(body, ['userId'])
    const userToAdd = id(input.userId, 'o identificador do integrante')
    await this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      const team = await this.repository.findTeamForUpdate(teamId, client)
      if (!team) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      if (!team.active) throw new SvoTeamServiceError('CONFLICT', 'Ative a equipe antes de incluir integrantes.')
      if (!await this.repository.isEligibleMember(userToAdd, client)) throw new SvoTeamServiceError('INVALID_INPUT', 'Selecione uma conta ativa com perfil de equipe SVO.')
      const previous = await this.repository.findMemberForUpdate(teamId, userToAdd, client)
      if (previous?.active) throw new SvoTeamServiceError('CONFLICT', 'Este integrante já pertence à equipe.')
      const now = await this.repository.currentTime(client)
      const member = await this.repository.addMember(teamId, userToAdd, now, client)
      const reason = previous ? 'Vínculo de integrante reativado na equipe SVO.' : 'Integrante incluído na equipe SVO.'
      await this.writeEvent({ teamId, eventType: 'MEMBER_ADDED', actor, occurredAt: now, reason, beforeState: previous, afterState: member }, client)
      await this.writeAudit(teamId, previous, member, actor, 'UPDATE', reason, client)
    })
    return this.repository.findById(teamId).then((team) => {
      if (!team) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada após incluir integrante.')
      return team
    })
  }

  async removeMember(teamIdValue: unknown, memberIdValue: unknown, body: unknown, userId: string) {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const memberId = id(memberIdValue, 'o identificador do integrante')
    const input = record(body, ['reason'])
    const reason = text(input.reason, 'o motivo da remoção')
    await this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      const team = await this.repository.findTeamForUpdate(teamId, client)
      if (!team) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      const before = await this.repository.findMemberForUpdate(teamId, memberId, client)
      if (!before?.active) throw new SvoTeamServiceError('NOT_FOUND', 'Vínculo ativo não encontrado.')
      const now = await this.repository.currentTime(client)
      if (!await this.repository.removeMember(teamId, memberId, now, client)) throw new SvoTeamServiceError('CONFLICT', 'O vínculo mudou. Atualize a equipe.')
      const after = { ...before, active: false, leftAt: now.toISOString() }
      await this.writeEvent({ teamId, eventType: 'MEMBER_REMOVED', actor, occurredAt: now, reason, beforeState: before, afterState: after }, client)
      await this.writeAudit(teamId, before, after, actor, 'UPDATE', reason, client)
    })
    return this.repository.findById(teamId).then((team) => {
      if (!team) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada após remover integrante.')
      return team
    })
  }

  async createShift(teamIdValue: unknown, body: unknown, userId: string): Promise<SvoTeamShift> {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const input = record(body, ['startsAt', 'endsAt'])
    const startsAt = instant(input.startsAt, 'o início do plantão')
    const endsAt = instant(input.endsAt, 'o fim do plantão')
    if (endsAt <= startsAt) invalid('O fim do plantão deve ser posterior ao início.')
    return this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      const team = await this.repository.findTeamForUpdate(teamId, client)
      if (!team) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      if (!team.active) throw new SvoTeamServiceError('CONFLICT', 'Ative a equipe antes de cadastrar um plantão.')
      if (await this.repository.hasOverlappingShift(teamId, startsAt, endsAt, null, client)) throw new SvoTeamServiceError('CONFLICT', 'O horário sobrepõe outro plantão não cancelado da equipe.')
      const now = await this.repository.currentTime(client)
      const shift = await this.repository.createShift(teamId, startsAt, endsAt, actor.id, now, client)
      const reason = 'Plantão SVO cadastrado.'
      await this.writeEvent({ teamId, eventType: 'SHIFT_CREATED', actor, occurredAt: now, reason, beforeState: null, afterState: shift }, client)
      await this.writeAudit(teamId, null, shift, actor, 'CREATE', reason, client)
      return shift
    })
  }

  async updateShift(teamIdValue: unknown, shiftIdValue: unknown, body: unknown, userId: string): Promise<SvoTeamShift> {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const shiftId = id(shiftIdValue, 'o identificador do plantão')
    const input = record(body, ['expectedRevision', 'startsAt', 'endsAt', 'reason'])
    const expectedRevision = revision(input.expectedRevision)
    const startsAt = instant(input.startsAt, 'o início do plantão')
    const endsAt = instant(input.endsAt, 'o fim do plantão')
    if (endsAt <= startsAt) invalid('O fim do plantão deve ser posterior ao início.')
    const reason = text(input.reason, 'o motivo da alteração')
    return this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      if (!await this.repository.findTeamForUpdate(teamId, client)) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      const before = await this.repository.findShiftForUpdate(teamId, shiftId, client)
      if (!before) throw new SvoTeamServiceError('NOT_FOUND', 'Plantão SVO não encontrado.')
      if (before.revision !== expectedRevision || before.canceledAt !== null) throw new SvoTeamServiceError('CONFLICT', 'O plantão foi alterado ou cancelado. Atualize a equipe.')
      if (await this.repository.hasOverlappingShift(teamId, startsAt, endsAt, shiftId, client)) throw new SvoTeamServiceError('CONFLICT', 'O horário sobrepõe outro plantão não cancelado da equipe.')
      const now = await this.repository.currentTime(client)
      if (!await this.repository.updateShift(teamId, shiftId, expectedRevision, startsAt, endsAt, now, client)) throw new SvoTeamServiceError('CONFLICT', 'O plantão foi alterado. Atualize a equipe.')
      const after = { ...before, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), revision: before.revision + 1 }
      await this.writeEvent({ teamId, eventType: 'SHIFT_UPDATED', actor, occurredAt: now, reason, beforeState: before, afterState: after }, client)
      await this.writeAudit(teamId, before, after, actor, 'UPDATE', reason, client)
      return after
    })
  }

  async cancelShift(teamIdValue: unknown, shiftIdValue: unknown, body: unknown, userId: string): Promise<SvoTeamShift> {
    const teamId = id(teamIdValue, 'o identificador da equipe')
    const shiftId = id(shiftIdValue, 'o identificador do plantão')
    const input = record(body, ['expectedRevision', 'reason'])
    const expectedRevision = revision(input.expectedRevision)
    const reason = text(input.reason, 'o motivo do cancelamento')
    return this.repository.withTransaction(async (client) => {
      const actor = await this.requireManager(userId, client)
      if (!await this.repository.findTeamForUpdate(teamId, client)) throw new SvoTeamServiceError('NOT_FOUND', 'Equipe SVO não encontrada.')
      const before = await this.repository.findShiftForUpdate(teamId, shiftId, client)
      if (!before) throw new SvoTeamServiceError('NOT_FOUND', 'Plantão SVO não encontrado.')
      if (before.revision !== expectedRevision || before.canceledAt !== null) throw new SvoTeamServiceError('CONFLICT', 'O plantão foi alterado ou já cancelado.')
      const now = await this.repository.currentTime(client)
      if (!await this.repository.cancelShift(teamId, shiftId, expectedRevision, reason, now, client)) throw new SvoTeamServiceError('CONFLICT', 'O plantão foi alterado. Atualize a equipe.')
      const after = { ...before, canceledAt: now.toISOString(), cancellationReason: reason, revision: before.revision + 1 }
      await this.writeEvent({ teamId, eventType: 'SHIFT_CANCELED', actor, occurredAt: now, reason, beforeState: before, afterState: after }, client)
      await this.writeAudit(teamId, before, after, actor, 'UPDATE', reason, client)
      return after
    })
  }

  private async readActor(userId: string): Promise<SvoActorSnapshot> {
    return this.repository.withTransaction((client) => this.requireManager(userId, client))
  }

  private async requireManager(userId: string, client: PoolClient): Promise<SvoActorSnapshot> {
    const actor = await this.repository.findActor(userId, client)
    if (!actor) throw new SvoTeamServiceError('ACCOUNT_UNAVAILABLE', 'Sua conta não está ativa. Entre novamente ou procure a administração.')
    if (!MANAGER_ROLES.includes(actor.role)) throw new SvoTeamServiceError('ACCESS_DENIED', 'Somente o gestor de frota pode administrar equipes e plantões SVO.')
    return actor
  }

  private async writeEvent(event: SvoTeamEventInput, client: PoolClient): Promise<void> { await this.repository.createEvent(event, client) }

  private async writeAudit(teamId: string, before: unknown, after: unknown, actor: SvoActorSnapshot, operation: 'CREATE' | 'UPDATE', reason: string, client: PoolClient): Promise<void> {
    await this.audit.recordAudit({ userId: actor.id, table: 'svo.teams', recordId: teamId, operation,
      before: before as Record<string, unknown> | null, after: after as Record<string, unknown>, actorSnapshot: { ...actor }, reason }, client)
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
