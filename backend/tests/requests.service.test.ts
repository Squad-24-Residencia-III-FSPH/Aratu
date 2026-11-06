import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RequestsRepositoryContract } from '../src/repositories/requests.repository'
import { RequestsService } from '../src/services/requests.service'
import { RequestServiceError } from '../src/types/request.types'
import type {
  PaginatedRequests,
  RequestDetail,
  RequestListFilters,
  RequestSummary,
} from '../src/types/request.types'

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
    status: 'PENDING',
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
    trip: null,
    ...overrides,
  }
}

function setup() {
  const calls: Array<RequestListFilters & { requesterId?: string }> = []
  let detail: RequestDetail | null = createDetail()
  let receivedDetailArgs: { id: string; requesterId?: string } | null = null

  const repository: RequestsRepositoryContract = {
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
      return detail
    },
  }

  return {
    service: new RequestsService(repository),
    calls,
    setDetail(value: RequestDetail | null) { detail = value },
    getDetailArgs() { return receivedDetailArgs },
  }
}

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
  await service.listRequests({ status: 'APPROVED' }, { id: '4', role: 'GESTOR' })
  await service.listRequests({}, { id: '1', role: 'ADMINISTRADOR' })

  assert.equal(calls[0]?.requesterId, undefined)
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
