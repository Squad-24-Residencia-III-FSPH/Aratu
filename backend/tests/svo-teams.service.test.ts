import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import { SvoTeamsService } from '../src/services/svo-teams.service'
import type { SvoTeamsRepositoryContract } from '../src/repositories/svo-teams.repository'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { SvoActorSnapshot } from '../src/types/svo-occurrence.types'
import type { SvoTeam, SvoTeamEventInput, SvoTeamMember, SvoTeamShift } from '../src/types/svo-team.types'
import { SvoTeamServiceError } from '../src/types/svo-team.types'

function harness() {
  const client = {} as PoolClient
  const now = new Date('2026-11-24T12:00:00Z')
  const actor: SvoActorSnapshot = { id: '1', name: 'Gestor Fictício', email: 'gestor@example.test', role: 'GESTOR' }
  const team: SvoTeam = { id: '8', name: 'Equipe de teste', active: true, revision: 1, members: [], shifts: [] }
  const events: SvoTeamEventInput[] = []
  const audits: CreateAuditInput[] = []
  let overlaps = false
  let eligible = true
  const repository: SvoTeamsRepositoryContract = {
    async withTransaction(work) { return work(client) },
    async findActor() { return actor },
    async currentTime() { return now },
    async list() { return [team] },
    async listEligibleMembers() { return [{ id: '2', name: 'Integrante Fictício', email: 'integrante@example.test' }] },
    async findTeamForUpdate() { return team },
    async createTeam(name) { return { ...team, name } },
    async updateTeam() { return true },
    async findMemberForUpdate() { return null },
    async addMember(_teamId, userId): Promise<SvoTeamMember> { return { id: '3', userId, name: 'Integrante Fictício', active: true, joinedAt: now.toISOString(), leftAt: null } },
    async removeMember() { return true },
    async isEligibleMember() { return eligible },
    async findShiftForUpdate(): Promise<SvoTeamShift | null> { return null },
    async hasOverlappingShift() { return overlaps },
    async createShift(_teamId, startsAt, endsAt): Promise<SvoTeamShift> {
      return { id: '4', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), canceledAt: null, cancellationReason: null, revision: 1 }
    },
    async updateShift() { return true },
    async cancelShift() { return true },
    async createEvent(event) { events.push(event) },
    async findById() { return team },
  }
  const audit: AuditLogger = {
    async recordAudit(input, _transaction) { audits.push(input); return {} as AuditEntry },
  }
  return { service: new SvoTeamsService(repository, audit), repository, actor, team, events, audits, now,
    setActor(role: SvoActorSnapshot['role']) { actor.role = role }, setOverlaps(value: boolean) { overlaps = value },
    setEligible(value: boolean) { eligible = value } }
}

const code = (expected: SvoTeamServiceError['code']) => (error: unknown): boolean => error instanceof SvoTeamServiceError && error.code === expected

test('SVO teams: gestor cria equipe com evento e auditoria na mesma transação', async () => {
  const h = harness()
  const result = await h.service.createTeam({ name: '  Plantão Norte  ' }, '1')
  assert.equal(result.name, 'Plantão Norte')
  assert.equal(h.events[0]?.eventType, 'CREATED')
  assert.equal(h.audits[0]?.operation, 'CREATE')
})

test('SVO teams: administrador mantém e perfis de rotina não alteram composição', async () => {
  const admin = harness(); admin.setActor('ADMINISTRADOR')
  assert.equal((await admin.service.createTeam({ name: 'Equipe de apoio' }, '1')).name, 'Equipe de apoio')
  for (const role of ['ATENDENTE_SVO', 'EQUIPE_SVO', 'SOLICITANTE', 'MOTORISTA'] as const) {
    const h = harness(); h.setActor(role)
    await assert.rejects(h.service.createTeam({ name: 'Equipe bloqueada' }, '1'), code('ACCESS_DENIED'))
    assert.equal(h.events.length, 0)
  }
})

test('SVO teams: integrante precisa ser conta ativa de Equipe SVO', async () => {
  const h = harness(); h.setEligible(false)
  await assert.rejects(h.service.addMember('8', { userId: '2' }, '1'), code('INVALID_INPUT'))
  assert.equal(h.events.length, 0)
  h.setEligible(true)
  const result = await h.service.addMember('8', { userId: '2' }, '1')
  assert.equal(h.events[0]?.eventType, 'MEMBER_ADDED')
  assert.equal(result?.id, h.team.id)
})

test('SVO teams: plantões rejeitam períodos inválidos e sobreposição', async () => {
  const h = harness()
  const body = { startsAt: '2026-11-24T12:00:00Z', endsAt: '2026-11-24T13:00:00Z' }
  await assert.rejects(h.service.createShift('8', { ...body, endsAt: body.startsAt }, '1'), code('INVALID_INPUT'))
  h.setOverlaps(true)
  await assert.rejects(h.service.createShift('8', body, '1'), code('CONFLICT'))
  assert.equal(h.events.length, 0)
  h.setOverlaps(false)
  const shift = await h.service.createShift('8', body, '1')
  assert.equal(shift.id, '4')
  assert.equal(h.events[0]?.eventType, 'SHIFT_CREATED')
  assert.equal(h.audits[0]?.operation, 'CREATE')
})

test('SVO teams: revisão antiga não sobrescreve o estado atual', async () => {
  const h = harness()
  await assert.rejects(h.service.updateTeam('8', { expectedRevision: 2, name: 'Nova equipe', active: true, reason: 'Revisão fictícia.' }, '1'), code('CONFLICT'))
  assert.equal(h.events.length, 0)
})
