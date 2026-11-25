import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import jwt = require('jsonwebtoken')
import type { PoolClient } from 'pg'
import { SvoOrdersRepository } from '../src/repositories/svo-orders.repository'
import { createSvoDispatchCandidatesRouter, svoOrderErrorHandler } from '../src/routes/svo-orders.routes'
import { SvoOrdersService } from '../src/services/svo-orders.service'
import type { SvoOccurrencesRepositoryContract } from '../src/repositories/svo-occurrences.repository'
import type { SvoOrdersRepositoryContract } from '../src/repositories/svo-orders.repository'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import type { AuditEntry, AuditLogger, CreateAuditInput } from '../src/types/audit.types'
import type { SvoActorSnapshot, SvoOccurrenceDetail } from '../src/types/svo-occurrence.types'
import { SvoOrderServiceError } from '../src/types/svo-order.types'
import type { OpenSvoOrderEvent, SvoOrderErrorCode, SvoTeamSnapshot, SvoOrderDetailRow, SvoOrderState, SvoOrderStatusEvent, SvoDispatchTeamCandidate } from '../src/types/svo-order.types'
import { SVO_ORDER_ALLOWED_RESULTS, SVO_ORDER_RESULTS, SVO_ORDER_STATUSES, SVO_ORDER_TRANSITIONS } from '../src/types/svo-order.types'
import type { Vehicle } from '../src/types/vehicle.types'
import { svoInput } from './fixtures/svo-occurrences.fixture'

const input = { occurrenceId: '9007199254740993', teamId: '2', vehicleId: '3' }

function harness() {
  const client = {} as PoolClient
  const time = new Date('2026-01-05T12:00:00Z')
  const actor: SvoActorSnapshot = { id: '1', name: 'Operador Fictício', email: 'svo@example.test', role: 'GESTOR' }
  const occurrence: SvoOccurrenceDetail = {
    ...svoInput(), id: input.occurrenceId, status: 'CONFIRMED', receivedAt: time, createdAt: time,
    notes: 'SENTINELA_NOTAS', attendantId: '1', revision: 2, triagedAt: time, triagedBy: '1', updatedAt: time,
    dispatchRequestedAt: time, dispatchRequestedBy: '1', dispatchWaitReason: null, executionOrderId: null,
  }
  const vehicle: Vehicle = {
    id: '3', licensePlate: 'FIC0A01', brand: null, model: null, year: null, vehicleType: null,
    ownership: 'OWNED', categories: ['BODY'], seats: 2, bodyLimit: 1, weightLimit: null,
    operationType: 'SVO', status: 'AVAILABLE', revision: 1, createdAt: time, updatedAt: time,
  }
  const team: SvoTeamSnapshot = { id: '2', name: 'Equipe Fictícia', active: true, revision: 1 }
  const candidate: SvoDispatchTeamCandidate = {
    ...team, shiftId: '9', shiftStartsAt: new Date(time.getTime() - 60_000),
    shiftEndsAt: new Date(time.getTime() + 60_000), activeOrderCount: 0, lastDispatchAt: null,
  }
  const calls: string[] = []
  const events: OpenSvoOrderEvent[] = []
  const audits: CreateAuditInput[] = []
  function step(name: string, transaction: PoolClient): void { assert.equal(transaction, client); calls.push(name) }
  const occurrences: Pick<SvoOccurrencesRepositoryContract, 'withTransaction' | 'findActorSnapshot' | 'currentTime' | 'findByIdForUpdate' | 'findById' | 'setDispatchIntent' | 'setDispatchWaitReason' | 'createEvent'> = {
    async withTransaction(work) {
      calls.push('begin')
      try { const result = await work(client); calls.push('commit'); return result }
      catch (error) { calls.push('rollback'); throw error }
    },
    async findActorSnapshot(_id, transaction) { step('actor', transaction); return actor },
    async findByIdForUpdate(id, transaction) { assert.equal(id, input.occurrenceId); step('occurrence', transaction); return occurrence },
    async currentTime(transaction) { step('clock', transaction); return time },
    async findById() { return occurrence },
    async setDispatchIntent() { return occurrence },
    async setDispatchWaitReason(_id, reason, _now, transaction) {
      step('saveDispatch', transaction)
      return { ...occurrence, revision: occurrence.revision + 1, dispatchWaitReason: reason, executionOrderId: '4' }
    },
    async createEvent(_event, transaction) { step('occurrenceEvent', transaction) },
  }
  const orders: SvoOrdersRepositoryContract = {
    async listForActor() { return [] },
    async findById() { return null },
    async findByIdForUpdate() { return null },
    async findMembershipForShare() { return null },
    async updateStatus() { throw new Error('Escrita inesperada') },
    async updateResult() { throw new Error('Resultado inesperado') },
    async createStatusEvent() { throw new Error('Evento inesperado') },
    async findByOccurrenceId(_id, transaction) { step('unique', transaction); return null },
    async findTeamForShare(_id, transaction) { step('team', transaction); return team },
    async countOccupyingOrders(_id, transaction) { step('capacity', transaction); return 0 },
    async create(order, transaction) { step('create', transaction); return { ...order, id: '4' } },
    async createOpenedEvent(event, transaction) { step('event', transaction); events.push(event) },
    async listActiveTeams(transaction) { step('listActiveTeams', transaction); return [{ id: team.id, name: team.name }] },
    async listEligibleVehiclesForDispatch(transaction) {
      step('listEligibleVehiclesForDispatch', transaction)
      return [{ id: vehicle.id, plate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model, bodyLimit: vehicle.bodyLimit, occupyingOrders: 0 }]
    },
    async lockEligibleDispatchTeams(_now, transaction) { step('lockTeams', transaction) },
    async rankDispatchTeams(_now, transaction) { step('rankTeams', transaction); return team.active ? [candidate] : [] },
    async listDispatchVehicleIds() { throw new Error('Despacho inesperado') },
    async hasInstitutionalTripConflict(_id, _now, transaction) { step('tripConflict', transaction); return false },
  }
  const vehicles: Pick<VehiclesRepositoryContract, 'findByIdForUpdate' | 'hasActiveMaintenanceBlock'> = {
    async findByIdForUpdate(_id, transaction) { step('vehicle', transaction); return vehicle },
    async hasActiveMaintenanceBlock(id, transaction) { assert.equal(id, vehicle.id); step('maintenance', transaction); return false },
  }
  const audit: AuditLogger = {
    async recordAudit(data, transaction) { step('audit', transaction!); audits.push(data); return {} as AuditEntry },
  }
  return { service: new SvoOrdersService(occurrences, orders, vehicles, audit), occurrences, orders, vehicles,
    audit, calls, events, audits, actor, occurrence, vehicle, team, candidate, time }
}

function code(expected: SvoOrderErrorCode): (error: unknown) => boolean {
  return (error) => error instanceof SvoOrderServiceError && error.code === expected
}

test('ORD unit: usa ordem fixa de travas, mesmo cliente, relógio e auditoria mínima', async () => {
  const h = harness()
  assert.deepEqual(await h.service.createOrder(input, '1'), { id: '4', status: 'OPEN' })
  assert.deepEqual(h.calls, ['begin', 'actor', 'occurrence', 'unique', 'clock', 'lockTeams', 'rankTeams', 'team', 'vehicle', 'maintenance', 'tripConflict', 'capacity', 'create', 'event', 'audit', 'saveDispatch', 'occurrenceEvent', 'audit', 'commit'])
  assert.equal(h.events[0]!.order.openedAt, h.time)
  assert.deepEqual(h.events[0]!.order.teamSnapshot, h.team)
  assert.equal(h.events[0]!.order.occurrenceSnapshot.requesterPhone, svoInput().requesterPhone)
  assert.deepEqual(Object.keys(h.audits[0]!.after!).sort(), ['id', 'occurrenceId', 'teamId', 'vehicleId', 'status', 'openedAt', 'revision'].sort())
  assert.doesNotMatch(JSON.stringify(h.audits), /SENTINELA/)
  assert.deepEqual(h.audits[0]!.actorSnapshot, h.actor)
})

test('SVO dispatch: triagem usa equipe de menor carga e viatura elegível, com snapshot da seleção', async () => {
  const h = harness()
  h.actor.role = 'ATENDENTE_SVO'
  const candidate: SvoDispatchTeamCandidate = {
    ...h.team, shiftId: '9', shiftStartsAt: new Date(h.time.getTime() - 60_000),
    shiftEndsAt: new Date(h.time.getTime() + 60_000), activeOrderCount: 2, lastDispatchAt: null,
  }
  const afterOccurrence = { ...h.occurrence, revision: h.occurrence.revision + 1, dispatchWaitReason: null as null }
  h.orders.lockEligibleDispatchTeams = async () => { h.calls.push('lockTeams') }
  h.orders.rankDispatchTeams = async () => { h.calls.push('rankTeams'); return [candidate] }
  h.orders.listDispatchVehicleIds = async () => { h.calls.push('vehicleCandidates'); return ['3'] }
  h.orders.hasInstitutionalTripConflict = async () => { h.calls.push('tripConflict'); return false }
  h.occurrences.setDispatchWaitReason = async (_id, reason, _now, transaction) => {
    assert.equal(reason, null); h.calls.push('saveDispatch'); return afterOccurrence
  }
  h.occurrences.findById = async () => ({ ...afterOccurrence, executionOrderId: '4' })

  const result = await h.service.dispatchAfterTriage(h.occurrence.id, '1')

  assert.deepEqual(result, { status: 'DISPATCHED', orderId: '4', teamId: '2', vehicleId: '3', revision: 3 })
  assert.equal(h.events[0]!.order.teamShiftId, '9')
  assert.equal(h.events[0]!.order.allocationSnapshot?.selectionRule, 'LOWEST_ACTIVE_ORDERS_THEN_LONGEST_WITHOUT_DISPATCH')
  assert.ok(h.calls.indexOf('lockTeams') < h.calls.indexOf('rankTeams'))
  assert.ok(h.calls.indexOf('rankTeams') < h.calls.indexOf('vehicle'))
})

test('SVO dispatch: registra fila com motivo controlado quando não há equipe', async () => {
  const h = harness()
  h.actor.role = 'ATENDENTE_SVO'
  h.orders.lockEligibleDispatchTeams = async () => { h.calls.push('lockTeams') }
  h.orders.rankDispatchTeams = async () => { h.calls.push('rankTeams'); return [] }
  h.occurrences.setDispatchWaitReason = async (_id, reason, _now, transaction) => {
    assert.equal(reason, 'NO_TEAM'); h.calls.push('saveWait')
    return { ...h.occurrence, revision: h.occurrence.revision + 1, dispatchWaitReason: reason }
  }

  assert.deepEqual(await h.service.dispatchAfterTriage(h.occurrence.id, '1'), { status: 'WAITING', reason: 'NO_TEAM', revision: 3 })
  assert.ok(h.calls.includes('saveWait'))
  assert.ok(!h.calls.includes('vehicleCandidates'))
})

test('SVO dispatch retry: revisão obsoleta é rejeitada antes de selecionar recursos', async () => {
  const h = harness()
  h.actor.role = 'GESTOR'
  await assert.rejects(h.service.retryDispatch(h.occurrence.id, { expectedRevision: 1, reason: 'Nova tentativa após troca de plantão.' }, '1'), code('CONFLICT'))
  assert.deepEqual(h.calls, ['begin', 'actor', 'occurrence', 'unique', 'rollback'])
})

function trackingHarness() {
  const h = harness()
  h.actor.role = 'EQUIPE_SVO'
  const state: SvoOrderState = { id: '4', occurrenceId: input.occurrenceId, teamId: '2', vehicleId: '3',
    status: 'OPEN', result: null, failureReason: null, notes: null, revision: 1,
    openedAt: new Date(h.time.getTime() - 1000), departedAt: null, arrivedAt: null,
    collectedAt: null, closedAt: null, closedBy: null }
  const events: SvoOrderStatusEvent[] = []
  const membership = { active: true, joinedAt: new Date('2025-01-01Z'), leftAt: null as Date | null }
  const row = (): SvoOrderDetailRow => ({ ...state, teamActive: h.team.active,
    dispatch: { location: 'Local fictício do despacho', teamName: 'Equipe fictícia', vehicleLicensePlate: 'FIC0A01' },
    current: { location: 'Local fictício atual', teamName: 'Equipe atual', vehicleLicensePlate: 'FIC0A02' },
    occurrenceSnapshot: null, teamSnapshot: null, vehicleSnapshot: null, allocationSnapshot: null })
  h.orders.findByIdForUpdate = async () => { h.calls.push('order'); return { ...state } }
  h.orders.findMembershipForShare = async () => { h.calls.push('membership'); return membership }
  h.orders.findById = async () => { h.calls.push('detail'); return row() }
  h.orders.listForActor = async () => [row()]
  h.orders.updateStatus = async (_before, status, time) => {
    h.calls.push('update'); state.status = status; state.revision++
    if (status === 'IN_TRANSIT') state.departedAt = time
    else state.arrivedAt = time
    return true
  }
  h.orders.updateResult = async (after, expectedRevision) => {
    if (state.revision !== expectedRevision) return false
    h.calls.push('updateResult'); Object.assign(state, after); return true
  }
  h.orders.createStatusEvent = async (event) => { h.calls.push('statusEvent'); events.push(event) }
  return { ...h, state, statusEvents: events, membership }
}

test('SVO tracking: FSM total impede saltos, retornos, repetição e avanço do legado', async () => {
  for (const origin of SVO_ORDER_STATUSES) {
    for (const target of SVO_ORDER_STATUSES) {
      const h = trackingHarness(); h.state.status = origin
      if (SVO_ORDER_TRANSITIONS[origin].some((next) => next === target)) {
        const result = await h.service.updateStatus('4', { status: target, revision: 1 }, '1')
        assert.equal(result.status, target); assert.equal(result.revision, 2)
        assert.equal(h.statusEvents.length, 1); assert.equal(h.audits.length, 1)
        assert.deepEqual(h.calls, ['begin', 'actor', 'order', 'team', 'membership', 'clock', 'update', 'statusEvent', 'audit', 'detail', 'commit'])
        assert.doesNotMatch(JSON.stringify(h.audits), /Local fictício|requester|Snapshot.*SENTINELA/)
      } else {
        await assert.rejects(h.service.updateStatus('4', { status: target, revision: 1 }, '1'), code('INVALID_TRANSITION'))
        assert.ok(!h.calls.includes('update')); assert.equal(h.statusEvents.length, 0)
      }
    }
  }
})

test('SVO tracking: contrato estrito, revisão e datas rejeitados sem escrita', async () => {
  for (const body of [null, [], {}, { status: 'IN_TRANSIT' }, { status: 'UNKNOWN', revision: 1 },
    { status: 'IN_TRANSIT', revision: 1, teamId: '2' }, ...[0, -1, 1.1, '1', null, Number.MAX_SAFE_INTEGER + 1].map((revision) => ({ status: 'IN_TRANSIT', revision }))]) {
    await assert.rejects(trackingHarness().service.updateStatus('4', body, '1'), code('INVALID_INPUT'))
  }
  for (const modify of [
    (h: ReturnType<typeof trackingHarness>) => { h.state.revision = 2 },
    (h: ReturnType<typeof trackingHarness>) => { h.state.openedAt = new Date(h.time.getTime() + 1) },
    (h: ReturnType<typeof trackingHarness>) => { h.state.departedAt = h.time },
  ]) {
    const h = trackingHarness(); modify(h)
    await assert.rejects(h.service.updateStatus('4', { status: 'IN_TRANSIT', revision: 1 }, '1'), code('INVALID_TRANSITION'))
    assert.ok(!h.calls.includes('update'))
  }
  const h = trackingHarness(); h.state.status = 'IN_TRANSIT'; h.state.departedAt = new Date(h.time.getTime() + 1)
  await assert.rejects(h.service.updateStatus('4', { status: 'IN_SERVICE', revision: 1 }, '1'), code('INVALID_TRANSITION'))
})

test('SVO tracking: autorização precede estado e detalhe sigiloso, equipe inativa mantém leitura', async () => {
  for (const change of [
    (h: ReturnType<typeof trackingHarness>) => { h.membership.active = false },
    (h: ReturnType<typeof trackingHarness>) => { h.membership.joinedAt = new Date(h.time.getTime() + 1) },
    (h: ReturnType<typeof trackingHarness>) => { h.membership.leftAt = h.time },
    (h: ReturnType<typeof trackingHarness>) => { h.orders.findMembershipForShare = async () => null },
  ]) {
    const h = trackingHarness(); change(h); h.state.status = 'COMPLETED'
    await assert.rejects(h.service.getOrder('4', '1'), code('ACCESS_DENIED'))
    await assert.rejects(h.service.updateStatus('4', { status: 'IN_TRANSIT', revision: 1 }, '1'), code('ACCESS_DENIED'))
    assert.ok(!h.calls.includes('detail')); assert.ok(!h.calls.includes('update'))
  }
  const h = trackingHarness(); h.team.active = false
  assert.deepEqual((await h.service.getOrder('4', '1')).allowedTransitions, [])
  await assert.rejects(h.service.updateStatus('4', { status: 'IN_TRANSIT', revision: 1 }, '1'), code('ACCESS_DENIED'))
})

test('SVO tracking: consulta global sem ações, filtro estrito e conta atual', async () => {
  for (const role of ['ATENDENTE_SVO', 'GESTOR', 'ADMINISTRADOR'] as const) {
    const h = trackingHarness(); h.actor.role = role
    h.orders.listForActor = async (userId, status) => { assert.equal(userId, null); assert.equal(status, 'OPEN'); return [] }
    await h.service.listOrders({ status: 'OPEN' }, '1')
    assert.deepEqual((await h.service.getOrder('4', '1')).allowedTransitions, [])
    await assert.rejects(h.service.updateStatus('4', { status: 'IN_TRANSIT', revision: 1 }, '1'), code('ACCESS_DENIED'))
  }
  for (const query of [{ status: ['OPEN', 'OPEN'] }, { status: 'BAD' }, { userId: '1' }, { teamId: '2' }]) {
    await assert.rejects(trackingHarness().service.listOrders(query, '1'), code('INVALID_INPUT'))
  }
  const h = trackingHarness(); h.occurrences.findActorSnapshot = async () => null
  await assert.rejects(h.service.getOrder('4', '1'), code('ACCOUNT_UNAVAILABLE'))
})

test('SVO tracking: chegada preserva saída ausente no legado e falhas não anunciam sucesso', async () => {
  const h = trackingHarness(); h.state.status = 'IN_TRANSIT'
  const result = await h.service.updateStatus('4', { status: 'IN_SERVICE', revision: 1 }, '1')
  assert.equal(result.departedAt, null); assert.equal(result.arrivedAt, h.time)
  for (const step of ['statusEvent', 'audit', 'revision'] as const) {
    const failed = trackingHarness()
    if (step === 'statusEvent') failed.orders.createStatusEvent = async () => { throw new Error('Falha sintética') }
    if (step === 'audit') failed.audit.recordAudit = async () => { throw new Error('Falha sintética') }
    if (step === 'revision') failed.orders.updateStatus = async () => false
    await assert.rejects(failed.service.updateStatus('4', { status: 'IN_TRANSIT', revision: 1 }, '1'))
    assert.equal(failed.calls.at(-1), 'rollback'); assert.ok(!failed.calls.includes('commit'))
  }
})

test('ORD unit: IDs canônicos até BIGINT, sem perda de precisão ou consulta em entrada inválida', async () => {
  for (const field of Object.keys(input)) {
    for (const value of [undefined, null, 1, 0, '', '0', '-1', '1.2', ' 1', '1 ', '01', '+1', '1e2', '9223372036854775808', '9'.repeat(100), {}, []]) {
      const h = harness()
      await assert.rejects(h.service.createOrder({ ...input, [field]: value }, '1'), code('INVALID_INPUT'))
      assert.deepEqual(h.calls, [])
    }
  }
  for (const body of [null, [], true, 'value', { ...input, status: 'OPEN' }, {}]) {
    await assert.rejects(harness().service.createOrder(body, '1'), code('INVALID_INPUT'))
  }
  const h = harness()
  h.team.id = '9223372036854775807'
  h.candidate.id = '9223372036854775807'
  h.orders.findTeamForShare = async (id) => { assert.equal(id, '9223372036854775807'); return h.team }
  await h.service.createOrder({ ...input, teamId: '9223372036854775807' }, '1')
})

test('ORD unit: conta e perfil são revalidados antes de consultar ocorrência', async () => {
  for (const role of ['ATENDENTE_SVO', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) {
    const h = harness(); h.actor.role = role
    await assert.rejects(h.service.createOrder(input, '1'), code('ACCESS_DENIED'))
    assert.deepEqual(h.calls, ['begin', 'actor', 'rollback'])
  }
  const h = harness(); h.occurrences.findActorSnapshot = async () => null
  await assert.rejects(h.service.createOrder(input, '1'), code('ACCOUNT_UNAVAILABLE'))
})

test('ORD unit: duplicidade precede estado; referências e equipe são validadas', async () => {
  const duplicate = harness(); duplicate.occurrence.status = 'CANCELED'
  duplicate.orders.findByOccurrenceId = async () => ({ id: '9', teamId: '2', vehicleId: '3' })
  await assert.rejects(duplicate.service.createOrder(input, '1'), code('ORDER_ALREADY_EXISTS'))
  for (const status of ['PENDING', 'CANCELED'] as const) {
    const h = harness(); h.occurrence.status = status
    await assert.rejects(h.service.createOrder(input, '1'), code('OCCURRENCE_NOT_CONFIRMED'))
    assert.ok(!h.calls.includes('team'))
  }
  const missing = harness(); missing.occurrences.findByIdForUpdate = async () => null
  await assert.rejects(missing.service.createOrder(input, '1'), code('NOT_FOUND'))
  const team = harness(); team.orders.findTeamForShare = async () => null
  await assert.rejects(team.service.createOrder(input, '1'), code('NOT_FOUND'))
  const inactive = harness(); inactive.team.active = false
  await assert.rejects(inactive.service.createOrder(input, '1'), code('TEAM_UNAVAILABLE'))
  const vehicle = harness(); vehicle.vehicles.findByIdForUpdate = async () => null
  await assert.rejects(vehicle.service.createOrder(input, '1'), code('NOT_FOUND'))
})

test('ORD unit: elegibilidade e capacidade vigente incluem limite zero e redução', async () => {
  for (const changes of [{ status: 'INACTIVE' }, { status: 'IN_MAINTENANCE' },
    { operationType: 'ADMINISTRATIVE' }, { categories: ['PASSENGER'] }] as const) {
    const h = harness(); Object.assign(h.vehicle, changes)
    await assert.rejects(h.service.createOrder(input, '1'), code('VEHICLE_UNAVAILABLE'))
  }
  for (const [occupied, limit, allowed] of [[0, 0, false], [0, 1, true], [1, 2, true], [2, 2, false], [3, 1, false]] as const) {
    const h = harness(); h.vehicle.bodyLimit = limit; h.orders.countOccupyingOrders = async () => occupied
    if (allowed) await h.service.createOrder(input, '1')
    else await assert.rejects(h.service.createOrder(input, '1'), code('CAPACITY_EXCEEDED'))
  }
})

test('ORD unit: falhas de evento/auditoria propagam rollback antes do resultado', async () => {
  for (const step of ['event', 'audit'] as const) {
    const h = harness(); const failure = new Error('Falha fictícia')
    if (step === 'event') h.orders.createOpenedEvent = async () => { throw failure }
    else h.audit.recordAudit = async () => { throw failure }
    await assert.rejects(h.service.createOrder(input, '1'), (error) => error === failure)
    assert.equal(h.calls.at(-1), 'rollback')
    assert.ok(!h.calls.includes('commit'))
  }
})

test('ORD unit: manutenção impeditiva em veículo AVAILABLE é consultada sob a mesma trava e impede escritas', async () => {
  const h = harness()
  const normalCheck = h.vehicles.hasActiveMaintenanceBlock
  h.vehicles.hasActiveMaintenanceBlock = async (id, transaction) => {
    await normalCheck(id, transaction)
    return true
  }
  await assert.rejects(h.service.createOrder(input, '1'), code('VEHICLE_UNAVAILABLE'))
  assert.deepEqual(h.calls, ['begin', 'actor', 'occurrence', 'unique', 'clock', 'lockTeams', 'rankTeams', 'team', 'vehicle', 'maintenance', 'rollback'])
  assert.deepEqual(h.events, [])
  assert.deepEqual(h.audits, [])
})

test('ORD unit: somente a constraint histórica conhecida vira conflito de duplicidade', async () => {
  for (const constraint of ['execution_orders_occurrence_id_key', 'outra_constraint']) {
    const h = harness()
    const failure = { code: '23505', schema: 'svo', table: 'execution_orders', constraint }
    h.orders.create = async () => { throw failure }
    await assert.rejects(h.service.createOrder(input, '1'), constraint === 'execution_orders_occurrence_id_key'
      ? code('ORDER_ALREADY_EXISTS') : (error) => error === failure)
    assert.equal(h.calls.at(-1), 'rollback')
  }
})

test('SVO result: matriz total de encerramento, horários de coleta/fechamento, motivo e auditoria', async () => {
  for (const origin of SVO_ORDER_STATUSES) {
    for (const target of SVO_ORDER_RESULTS) {
      const h = trackingHarness(); h.state.status = origin
      const payload = {
        result: target,
        revision: 1,
        failureReason: target === 'NOT_PERFORMED' ? '  Impedimento fictício no local.  ' : null,
        notes: '  Observação fictícia da equipe.  ',
      }
      if (SVO_ORDER_ALLOWED_RESULTS[origin].some((allowed) => allowed === target)) {
        const result = await h.service.recordResult('4', payload, '1')
        assert.equal(result.status, target); assert.equal(result.result, target)
        assert.equal(result.revision, 2); assert.equal(result.closedBy, '1')
        assert.equal(result.closedAt, h.time)
        assert.equal(result.collectedAt, target === 'COMPLETED' ? h.time : null)
        assert.equal(result.failureReason, target === 'NOT_PERFORMED' ? 'Impedimento fictício no local.' : null)
        assert.equal(result.notes, 'Observação fictícia da equipe.')
        assert.deepEqual(result.allowedTransitions, []); assert.deepEqual(result.allowedResults, [])
        assert.deepEqual(h.calls, ['begin', 'actor', 'order', 'team', 'membership', 'clock', 'updateResult', 'statusEvent', 'audit', 'detail', 'commit'])
        assert.equal(h.statusEvents.length, 1); assert.equal(h.statusEvents[0]!.eventType, target)
        assert.equal(h.statusEvents[0]!.after.collectedAt, target === 'COMPLETED' ? h.time : null)
        assert.equal(h.audits.length, 1)
        assert.doesNotMatch(JSON.stringify([h.audits[0]!.before, h.audits[0]!.after]), /Observação fictícia|Impedimento fictício/)
      } else {
        await assert.rejects(h.service.recordResult('4', payload, '1'), code('INVALID_TRANSITION'))
        assert.ok(!h.calls.includes('updateResult')); assert.equal(h.statusEvents.length, 0)
      }
    }
  }
})

test('SVO result: contrato estrito, motivo condicional, datas, encerramento prévio e rollback', async () => {
  for (const body of [
    null, [], {}, { result: 'COMPLETED' }, { result: 'UNKNOWN', revision: 1 },
    { result: 'NOT_PERFORMED', revision: 1 }, { result: 'NOT_PERFORMED', revision: 1, failureReason: '   ' },
    { result: 'COMPLETED', revision: 1, failureReason: 'Motivo contraditório' },
    { result: 'COMPLETED', revision: 1, notes: 123 }, { result: 'COMPLETED', revision: 1, closedAt: '2026-01-05T12:00:00Z' },
    { result: 'COMPLETED', revision: 1, closedBy: '1' }, { resultado: 'CONCLUIDA', revision: 1 },
  ]) {
    const h = trackingHarness(); h.state.status = 'IN_SERVICE'
    await assert.rejects(h.service.recordResult('4', body, '1'), code('INVALID_INPUT'))
    assert.deepEqual(h.calls, [])
  }
  const blankNotes = trackingHarness(); blankNotes.state.status = 'IN_SERVICE'
  const completed = await blankNotes.service.recordResult('4', { result: 'COMPLETED', revision: 1, failureReason: '  ', notes: '   ' }, '1')
  assert.equal(completed.failureReason, null); assert.equal(completed.notes, null)
  for (const corrupt of [
    (h: ReturnType<typeof trackingHarness>) => { h.state.revision = 2 },
    (h: ReturnType<typeof trackingHarness>) => { h.state.result = 'COMPLETED' },
    (h: ReturnType<typeof trackingHarness>) => { h.state.closedAt = h.time },
    (h: ReturnType<typeof trackingHarness>) => { h.state.closedBy = '1' },
    (h: ReturnType<typeof trackingHarness>) => { h.state.collectedAt = h.time },
    (h: ReturnType<typeof trackingHarness>) => { h.state.failureReason = 'Prévio' },
    (h: ReturnType<typeof trackingHarness>) => { h.state.openedAt = new Date(h.time.getTime() + 1) },
    (h: ReturnType<typeof trackingHarness>) => { h.state.departedAt = new Date(h.time.getTime() + 1) },
    (h: ReturnType<typeof trackingHarness>) => { h.state.arrivedAt = new Date(h.time.getTime() + 1) },
  ]) {
    const h = trackingHarness(); h.state.status = 'IN_SERVICE'; corrupt(h)
    await assert.rejects(h.service.recordResult('4', { result: 'COMPLETED', revision: 1 }, '1'), code('INVALID_TRANSITION'))
    assert.ok(!h.calls.includes('updateResult'))
  }
  for (const step of ['statusEvent', 'audit', 'revision'] as const) {
    const failed = trackingHarness(); failed.state.status = 'IN_SERVICE'
    if (step === 'statusEvent') failed.orders.createStatusEvent = async () => { throw new Error('Falha sintética') }
    if (step === 'audit') failed.audit.recordAudit = async () => { throw new Error('Falha sintética') }
    if (step === 'revision') failed.orders.updateResult = async () => false
    await assert.rejects(failed.service.recordResult('4', { result: 'COMPLETED', revision: 1 }, '1'))
    assert.equal(failed.calls.at(-1), 'rollback'); assert.ok(!failed.calls.includes('commit'))
  }
})

test('DISP unit: candidatos exigem perfil de despacho SVO e conta ativa antes da consulta', async () => {
  for (const role of ['GESTOR', 'ADMINISTRADOR'] as const) {
    const h = harness()
    h.actor.role = role
    const result = await h.service.listDispatchCandidates('1')
    assert.deepEqual(result.teams, [{ id: '2', name: 'Equipe Fictícia' }])
    assert.equal(result.vehicles.length, 1)
    assert.deepEqual(h.calls, ['begin', 'actor', 'listActiveTeams', 'listEligibleVehiclesForDispatch', 'commit'])
  }

  for (const role of ['ATENDENTE_SVO', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) {
    const h = harness()
    h.actor.role = role
    await assert.rejects(h.service.listDispatchCandidates('1'), code('ACCESS_DENIED'))
    assert.deepEqual(h.calls, ['begin', 'actor', 'rollback'])
  }

  const inactive = harness()
  inactive.occurrences.findActorSnapshot = async () => {
    inactive.calls.push('actor')
    return null
  }
  await assert.rejects(inactive.service.listDispatchCandidates('1'), code('ACCOUNT_UNAVAILABLE'))
  assert.deepEqual(inactive.calls, ['begin', 'actor', 'rollback'])
})

test('DISP unit: calcula availableSlots e exclui viaturas sem vaga disponível', async () => {
  const h = harness()
  h.actor.role = 'GESTOR'
  h.orders.listActiveTeams = async () => [
    { id: '1', name: 'Equipe Alfa Fictícia' },
    { id: '2', name: 'Equipe Beta Fictícia' },
  ]
  h.orders.listEligibleVehiclesForDispatch = async () => [
    { id: '10', plate: 'FIC0A01', brand: 'Marca Fictícia', model: 'Modelo A', bodyLimit: 2, occupyingOrders: 1 },
    { id: '11', plate: 'FIC0B02', brand: null, model: 'Modelo B', bodyLimit: 2, occupyingOrders: 2 },
    { id: '12', plate: 'FIC0C03', brand: 'Marca Fictícia', model: null, bodyLimit: 0, occupyingOrders: 0 },
  ]

  const result = await h.service.listDispatchCandidates('1')
  assert.deepEqual(result.teams, [
    { id: '1', name: 'Equipe Alfa Fictícia' },
    { id: '2', name: 'Equipe Beta Fictícia' },
  ])
  assert.deepEqual(result.vehicles, [
    { id: '10', plate: 'FIC0A01', brand: 'Marca Fictícia', model: 'Modelo A', bodyLimit: 2, occupyingOrders: 1, availableSlots: 1 },
  ])
})

test('DISP repo: queries de equipes ativas e viaturas sem manutenção impeditiva usam filtros e parâmetros corretos', async () => {
  const repository = new SvoOrdersRepository()
  const queries: Array<{ sql: string; params: unknown[] | undefined }> = []
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params })
      return { rows: [] }
    },
  } as unknown as PoolClient

  await repository.listActiveTeams(fakeClient)
  await repository.listEligibleVehiclesForDispatch(fakeClient)

  assert.equal(queries.length, 2)
  assert.doesNotMatch(queries[0]!.sql, /SELECT \*/i)
  assert.match(queries[0]!.sql, /FROM svo\.teams/i)
  assert.match(queries[0]!.sql, /WHERE active = true/i)

  assert.doesNotMatch(queries[1]!.sql, /SELECT \*/i)
  assert.match(queries[1]!.sql, /v\.status = 'AVAILABLE'/i)
  assert.match(queries[1]!.sql, /v\.operation_type = 'SVO'/i)
  assert.match(queries[1]!.sql, /'BODY' = ANY\(v\.categories\)/i)
  assert.match(queries[1]!.sql, /NOT EXISTS\s*\(\s*SELECT 1\s+FROM fleet\.maintenance_orders m[\s\S]*m\.blocks_vehicle = true[\s\S]*m\.status IN \('OPEN', 'IN_PROGRESS'\)/i)
  assert.deepEqual(queries[1]!.params, [['OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS']])
})

test('DISP route: HTTP 401/403/200 respeita RBAC na rota /svo/dispatch-candidates', async () => {
  const h = harness()
  const secret = 'segredo-ficticio-unit-dispatch-candidates'
  const usersRepo = {
    async findById(id: string) {
      return {
        id,
        name: h.actor.name,
        email: h.actor.email,
        roleId: '1',
        role: h.actor.role,
        active: true,
        revision: 1,
        passwordHash: 'x',
        createdAt: h.time,
        updatedAt: h.time,
      }
    },
  }
  const app = express()
  app.use('/svo/dispatch-candidates', createSvoDispatchCandidatesRouter(h.service, { secret, expiresInSeconds: 3600 }, usersRepo))
  app.use('/svo/dispatch-candidates', svoOrderErrorHandler)
  const server = app.listen(0)
  try {
    const port = (server.address() as { port: number }).port
    const url = `http://127.0.0.1:${port}/svo/dispatch-candidates`

    const unauth = await fetch(url)
    assert.equal(unauth.status, 401)

    for (const role of ['ATENDENTE_SVO', 'SOLICITANTE', 'MOTORISTA', 'EQUIPE_SVO'] as const) {
      h.actor.role = role
      const token = jwt.sign({ id: '1', perfil: role }, secret, { expiresIn: 3600 })
      const denied = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      assert.equal(denied.status, 403)
    }

    h.actor.role = 'GESTOR'
    const token = jwt.sign({ id: '1', perfil: 'GESTOR' }, secret, { expiresIn: 3600 })
    const allowed = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(allowed.status, 200)
    const body = await allowed.json() as { teams: unknown[]; vehicles: unknown[] }
    assert.equal(body.teams.length, 1)
    assert.equal(body.vehicles.length, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
})
