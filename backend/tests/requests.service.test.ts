import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger } from '../src/types/audit.types'
import type { RequestsRepositoryContract } from '../src/repositories/requests.repository'
import { RequestsService } from '../src/services/requests.service'
import type {
  CreateRequestEventInput,
  CreateRequestLifecycleEventInput,
  CreateRequestInput,
  PaginatedRequestHistory,
  PaginatedRequests,
  RequestActorSnapshot,
  RequestDetail,
  RequestListFilters,
  RequestServiceSnapshot,
  RequestSummary,
  TripRequest,
} from '../src/types/request.types'
import { RequestServiceError } from '../src/types/request.types'

const client = {} as PoolClient
const actor: RequestActorSnapshot = {
  id: '3', name: 'Solicitante Fictício', email: 'solicitante@example.test', role: 'SOLICITANTE',
}
const serviceSnapshot: RequestServiceSnapshot = {
  id: '5', name: 'Transporte fictício', requiresTriage: false, requiresWeight: false,
  requiresIdentification: false,
}

function createSummary(overrides: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: '10',
    requesterId: '2',
    requesterName: 'Solicitante Fictício QA',
    serviceId: '3',
    serviceName: 'Transporte Administrativo',
    requestedDate: '2026-11-10',
    requestedTime: '08:30',
    origin: 'Sede FSPH',
    destination: 'Unidade Centro',
    purpose: 'Reunião institucional',
    passengers: 2,
    specialRequirements: null,
    notes: null,
    status: 'PENDING',
    revision: 1,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    ...overrides,
  }
}

function createDetail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    ...createSummary(),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionReason: null,
    revision: 1,
    trip: null,
    ...overrides,
  }
}

function setup(options: { serviceAvailable?: boolean; failAudit?: boolean; requestStatus?: TripRequest['status']; revision?: number } = {}) {
  const saved: {
    input?: CreateRequestInput
    actor?: RequestActorSnapshot
    event?: CreateRequestEventInput
    lifecycle?: CreateRequestLifecycleEventInput
  } = {}
  const calls: Array<RequestListFilters & { requesterId?: string }> = []
  let detail: RequestDetail | null = createDetail()
  let receivedDetailArgs: { id: string; requesterId?: string } | null = null
  let versionState: TripRequest | null = {
    id: '10', requesterId: actor.id, serviceId: serviceSnapshot.id,
    requestedDate: '2099-12-01', requestedTime: '08:30', origin: 'Origem anterior',
    destination: 'Destino anterior', purpose: 'Finalidade anterior', passengers: 1,
    specialRequirements: null, notes: null, status: options.requestStatus ?? 'PENDING',
    revision: options.revision ?? 1, requesterSnapshot: actor, serviceSnapshot,
  }

  const repository: RequestsRepositoryContract = {
    async withTransaction<T>(work: (transaction: PoolClient) => Promise<T>): Promise<T> { return work(client) },
    async findActorSnapshot(): Promise<RequestActorSnapshot> { return actor },
    async findActiveServiceForUpdate(): Promise<RequestServiceSnapshot | null> {
      return options.serviceAvailable === false ? null : serviceSnapshot
    },
    async create(input, requester, service): Promise<TripRequest> {
      saved.input = input
      saved.actor = requester
      return {
        id: '41', requesterId: requester.id, ...input,
        status: 'PENDING', revision: 1, requesterSnapshot: requester, serviceSnapshot: service,
      }
    },
    async createEvent(input): Promise<void> { saved.event = input },
    async list(filters): Promise<PaginatedRequests> {
      calls.push(filters)
      return {
        requests: [createSummary()],
        total: 1,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        totalPages: 1,
      }
    },
    async findById(id, requesterId): Promise<RequestDetail | null> {
      receivedDetailArgs = { id, ...(requesterId !== undefined ? { requesterId } : {}) }
      if (!detail || detail.id !== id || (requesterId !== undefined && detail.requesterId !== requesterId)) return null
      return detail
    },
    async findByIdForUpdate(id): Promise<TripRequest | null> { return versionState?.id === id ? versionState : null },
    async resubmit(id, expectedRevision, input, requester, service): Promise<TripRequest | null> {
      if (!versionState || versionState.id !== id || versionState.status !== 'RETURNED'
        || versionState.revision !== expectedRevision || versionState.requesterId !== requester.id) return null
      versionState = { ...versionState, ...input, status: 'PENDING', revision: versionState.revision + 1,
        requesterSnapshot: requester, serviceSnapshot: service }
      detail = { ...createDetail(), id, requesterId: requester.id, ...input, status: 'PENDING', revision: versionState.revision }
      return versionState
    },
    async createLifecycleEvent(input): Promise<void> { saved.lifecycle = input },
    async listHistory(): Promise<PaginatedRequestHistory> {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
    },
  }

  const auditService: AuditLogger = {
    async recordAudit(input): Promise<AuditEntry> {
      if (options.failAudit) throw new Error('falha fictícia de auditoria')
      return {
        id: '1', userId: String(input.userId), table: input.table, recordId: String(input.recordId),
        operation: input.operation, before: input.before ?? null, after: input.after ?? null,
        actorSnapshot: input.actorSnapshot ?? null, reason: input.reason ?? null, registeredAt: new Date(),
      }
    },
  }

  return {
    service: new RequestsService(repository, auditService),
    saved,
    calls,
    setDetail(value: RequestDetail | null) { detail = value },
    getDetailArgs() { return receivedDetailArgs },
  }
}

const futureRequest = {
  requestedDate: '2099-12-01', requestedTime: '08:30', origin: 'Origem fictícia',
  destination: 'Destino fictício', purpose: 'Finalidade fictícia', serviceId: '5',
}

function isServiceError(statusCode: number) {
  return (error: unknown): boolean => error instanceof RequestServiceError && error.statusCode === statusCode
}

test('cria solicitação PENDING com autoria do usuário autenticado e evento CREATED', async () => {
  const context = setup()
  const forgedBody = { ...futureRequest, status: 'APPROVED', requesterId: '999' }
  const result = await context.service.createRequest(forgedBody, actor.id)

  assert.deepEqual(result, { id: '41', status: 'PENDING' })
  assert.equal(context.saved.actor?.id, actor.id)
  assert.equal(context.saved.input?.serviceId, '5')
  assert.equal(context.saved.input?.passengers, 1)
  assert.equal(context.saved.event?.reportedBy, actor.name)
  assert.equal(context.saved.event?.afterState.status, 'PENDING')
})

test('valida passageiros e registra campos adicionais da solicitação', async () => {
  const context = setup()
  await assert.rejects(context.service.createRequest({ ...futureRequest, passengers: 0 }, actor.id), isServiceError(400))
  await assert.rejects(context.service.createRequest({ ...futureRequest, passengers: 1.5 }, actor.id), isServiceError(400))
  await context.service.createRequest({ ...futureRequest, passengers: 3, specialRequirements: '  Acesso sem escadas  ', notes: '  Contato na recepção  ' }, actor.id)
  assert.deepEqual(context.saved.input && {
    passengers: context.saved.input.passengers,
    specialRequirements: context.saved.input.specialRequirements,
    notes: context.saved.input.notes,
  }, { passengers: 3, specialRequirements: 'Acesso sem escadas', notes: 'Contato na recepção' })
})

test('reenviada devolução com revisão atual preserva os snapshots e os estados no histórico', async () => {
  const context = setup({ requestStatus: 'RETURNED', revision: 4 })
  const result = await context.service.resubmitRequest('10', {
    ...futureRequest, expectedRevision: 4, passengers: 2,
    specialRequirements: 'Acesso sem escadas', notes: 'Contato na recepção',
  }, actor.id)

  assert.equal(result.status, 'PENDING')
  assert.equal(result.revision, 5)
  assert.equal(context.saved.lifecycle?.eventType, 'RESUBMITTED')
  assert.equal(context.saved.lifecycle?.beforeState.status, 'RETURNED')
  assert.equal(context.saved.lifecycle?.afterState.revision, 5)
  assert.equal(context.saved.lifecycle?.reason, 'Solicitação reenviada após correção pelo Solicitante.')
})

test('reenvio exige revisão, estado devolvido e titularidade', async () => {
  const returned = setup({ requestStatus: 'RETURNED', revision: 2 })
  await assert.rejects(returned.service.resubmitRequest('10', { ...futureRequest }, actor.id), isServiceError(400))
  await assert.rejects(returned.service.resubmitRequest('10', { ...futureRequest, expectedRevision: 1 }, actor.id), isServiceError(409))
  await assert.rejects(returned.service.resubmitRequest('10', { ...futureRequest, expectedRevision: 2 }, '9'), isServiceError(404))
  const pending = setup({ revision: 2 })
  await assert.rejects(pending.service.resubmitRequest('10', { ...futureRequest, expectedRevision: 2 }, actor.id), isServiceError(409))
})

test('rejeita campos inválidos, serviço indisponível e data passada', async () => {
  const context = setup()
  await assert.rejects(context.service.createRequest({ ...futureRequest, origin: '  ' }, actor.id), isServiceError(400))
  await assert.rejects(context.service.createRequest({ ...futureRequest, requestedDate: '2025-02-30' }, actor.id), isServiceError(400))
  await assert.rejects(context.service.createRequest({ ...futureRequest, requestedTime: '24:00' }, actor.id), isServiceError(400))
  await assert.rejects(context.service.createRequest({ ...futureRequest, requestedDate: '2000-01-01' }, actor.id), isServiceError(422))
  await assert.rejects(setup({ serviceAvailable: false }).service.createRequest(futureRequest, actor.id), isServiceError(400))
  assert.equal(context.saved.input, undefined)
})

test('falha de auditoria propaga o erro para permitir rollback da transação', async () => {
  await assert.rejects(setup({ failAudit: true }).service.createRequest(futureRequest, actor.id), /falha fictícia de auditoria/)
})

test('rejeita situação desconhecida com 400', async () => {
  const { service } = setup()
  await assert.rejects(
    service.listRequests({ status: 'APROVADA' as never }, { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'Situação da solicitação inválida.',
  )
})

test('rejeita data de calendário inválida com 400', async () => {
  const { service } = setup()
  await assert.rejects(
    service.listRequests({ from: '2026-02-30' }, { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'Data inicial inválida.',
  )
})

test('rejeita período invertido com 400', async () => {
  const { service } = setup()
  await assert.rejects(
    service.listRequests(
      { from: '2026-11-30', to: '2026-11-01' },
      { id: '2', role: 'SOLICITANTE' },
    ),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'A data inicial não pode ser posterior à data final.',
  )
})

test('rejeita paginação inválida com 400', async () => {
  const { service } = setup()
  await assert.rejects(
    service.listRequests({ page: 0 }, { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'Página inválida.',
  )
  await assert.rejects(
    service.listRequests({ pageSize: 101 }, { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'O tamanho da página deve estar entre 1 e 100.',
  )
})

test('aplica o escopo do solicitante e os defaults de paginação', async () => {
  const { service, calls } = setup()
  await service.listRequests({}, { id: '2', role: 'SOLICITANTE' })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.requesterId, '2')
  assert.equal(calls[0]?.page, 1)
  assert.equal(calls[0]?.pageSize, 20)
})

test('não aplica escopo de solicitante para gestor e administrador', async () => {
  const { service, calls } = setup()
  await service.listRequests({ status: 'APPROVED', requester: '  Marta QA  ', service: '  Transporte  ' }, { id: '4', role: 'GESTOR' })
  await service.listRequests({}, { id: '1', role: 'ADMINISTRADOR' })

  assert.equal(calls[0]?.requesterId, undefined)
  assert.equal(calls[0]?.requester, 'Marta QA')
  assert.equal(calls[0]?.service, 'Transporte')
  assert.equal(calls[1]?.requesterId, undefined)
})

test('retorna 404 quando a solicitação não existe no escopo', async () => {
  const { service, setDetail } = setup()
  setDetail(null)

  await assert.rejects(
    service.getRequest('99', { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 404
      && error.message === 'Solicitação não encontrada.',
  )
})

test('rejeita identificador inválido com 400', async () => {
  const { service } = setup()
  await assert.rejects(
    service.getRequest('abc', { id: '2', role: 'SOLICITANTE' }),
    (error: unknown) => error instanceof RequestServiceError
      && error.statusCode === 400
      && error.message === 'Identificador de solicitação inválido.',
  )
})

test('repassa o escopo do solicitante ao buscar o detalhe', async () => {
  const { service, getDetailArgs } = setup()
  const detail = await service.getRequest('10', { id: '2', role: 'SOLICITANTE' })

  assert.equal(detail.id, '10')
  assert.deepEqual(getDetailArgs(), { id: '10', requesterId: '2' })
})

test('não repassa escopo de solicitante para gestor no detalhe', async () => {
  const { service, getDetailArgs } = setup()
  await service.getRequest('10', { id: '4', role: 'GESTOR' })

  assert.deepEqual(getDetailArgs(), { id: '10' })
})
