import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import type { AuditEntry, AuditLogger } from '../src/types/audit.types'
import type { RequestsRepositoryContract } from '../src/repositories/requests.repository'
import { RequestsService } from '../src/services/requests.service'
import type {
  CreateRequestEventInput,
  CreateRequestInput,
  RequestActor,
  RequestListFilters,
  RequestActorSnapshot,
  RequestServiceSnapshot,
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

function setup(options: { serviceAvailable?: boolean; failAudit?: boolean } = {}) {
  const saved: {
    input?: CreateRequestInput
    actor?: RequestActorSnapshot
    event?: CreateRequestEventInput
    filters?: RequestListFilters & { requesterId?: string }
    lookup?: { id: string; requesterId?: string }
  } = {}
  const repository: RequestsRepositoryContract = {
    async withTransaction<T>(work: (transaction: PoolClient) => Promise<T>): Promise<T> { return work(client) },
    async list(filters) {
      saved.filters = filters
      return { requests: [], total: 0, page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, totalPages: 0 }
    },
    async findById(id, requesterId) { saved.lookup = { id, ...(requesterId ? { requesterId } : {}) }; return null },
    async findActorSnapshot(): Promise<RequestActorSnapshot> { return actor },
    async findActiveServiceForUpdate(): Promise<RequestServiceSnapshot | null> {
      return options.serviceAvailable === false ? null : serviceSnapshot
    },
    async create(input, requester, service): Promise<TripRequest> {
      saved.input = input
      saved.actor = requester
      return {
        id: '41', requesterId: requester.id, ...input, passengers: 1,
        status: 'PENDING', requesterSnapshot: requester, serviceSnapshot: service,
      }
    },
    async createEvent(input): Promise<void> { saved.event = input },
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
  return { service: new RequestsService(repository, auditService), saved }
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
  assert.equal(context.saved.event?.reportedBy, actor.name)
  assert.equal(context.saved.event?.afterState.status, 'PENDING')
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

test('consulta pagina, valida filtros e restringe listas e detalhes de solicitantes ao próprio id', async () => {
  const context = setup()
  const manager: RequestActor = { id: '8', role: 'GESTOR' }
  await context.service.listRequests({
    status: 'PENDING', from: '2099-01-01', to: '2099-12-31', requester: ' Solicitante ',
    service: 'Transporte', page: 2, pageSize: 10,
  }, manager)
  assert.deepEqual(context.saved.filters, {
    status: 'PENDING', from: '2099-01-01', to: '2099-12-31', requester: 'Solicitante',
    service: 'Transporte', page: 2, pageSize: 10,
  })

  const requester: RequestActor = { id: actor.id, role: 'SOLICITANTE' }
  await context.service.listRequests({}, requester)
  assert.equal(context.saved.filters?.requesterId, actor.id)
  await assert.rejects(context.service.getRequest('41', requester), isServiceError(404))
  assert.deepEqual(context.saved.lookup, { id: '41', requesterId: actor.id })
  await assert.rejects(context.service.listRequests({ from: '2099-12-31', to: '2099-01-01' }, manager), isServiceError(400))
  await assert.rejects(context.service.listRequests({ pageSize: 101 }, manager), isServiceError(400))
})
