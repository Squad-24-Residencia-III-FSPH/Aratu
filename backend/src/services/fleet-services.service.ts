import type { PoolClient } from 'pg'
import type { AuditActorSnapshot, AuditLogger } from '../types/audit.types'
import type { UserRole } from '../types/auth'
import { LEGACY_ROLE_PERMISSIONS } from '../types/permission.types'
import { VEHICLE_CATEGORIES } from '../types/vehicle.types'
import type { Vehicle, VehicleCategory } from '../types/vehicle.types'
import {
  SERVICE_AUDIT_OPERATIONS,
  FleetServiceError,
} from '../types/fleet-service.types'
import type {
  ChangeFleetServiceStatusInput,
  CompatibleVehiclesView,
  CreateFleetServiceInput,
  FleetService,
  FleetServiceActorSnapshot,
  FleetServiceAttributes,
  FleetServiceFilters,
  FleetServiceListResult,
  NormalizedFleetServiceAttributes,
  ReplaceCompatibleVehiclesInput,
  UpdateFleetServiceInput,
} from '../types/fleet-service.types'
import type { ServicesRepositoryContract } from '../repositories/services.repository'

const DEFAULT_CATEGORIES: readonly VehicleCategory[] = ['PASSENGER']
const NOT_FOUND_MESSAGE = 'Tipo de serviço não encontrado.'
const REVISION_CONFLICT_MESSAGE = 'O tipo de serviço foi alterado por outra operação. Atualize os dados e tente novamente.'

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isPositiveId(value: string): boolean {
  return /^[1-9]\d*$/.test(value)
}

function isCategory(value: unknown): value is VehicleCategory {
  return typeof value === 'string' && VEHICLE_CATEGORIES.some((category) => category === value)
}

type ServiceViewer = UserRole | readonly string[] | undefined

function permissionsOf(viewer: ServiceViewer): readonly string[] {
  return typeof viewer === 'string' ? LEGACY_ROLE_PERMISSIONS[viewer] ?? [] : viewer ?? []
}

function canArchiveServices(viewer: ServiceViewer): boolean {
  return permissionsOf(viewer).includes('services:archive')
}

function optionalFlag(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') throw new FleetServiceError(400, `${fieldName} deve ser verdadeiro ou falso.`)
  return value
}

function auditState(service: FleetService | null): Record<string, unknown> | null {
  if (!service) return null
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    categories: service.categories,
    requiresTriage: service.requiresTriage,
    requiresWeight: service.requiresWeight,
    requiresIdentification: service.requiresIdentification,
    active: service.active,
    revision: service.revision,
  }
}

function auditActor(actor: FleetServiceActorSnapshot): AuditActorSnapshot {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role }
}

/** Regras de domínio do catálogo de tipos de serviço da frota (FSPH/SVO). */
export class FleetServicesService {
  constructor(
    private readonly repository: ServicesRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /**
   * Lista os tipos de serviço visíveis ao perfil.
   *
   * Gestor e Administrador veem o catálogo inteiro e podem filtrar por `active`;
   * os demais leitores (quem solicita viagens) recebem só os tipos ativos.
   *
   * @throws {FleetServiceError} 400 quando um não gestor tenta filtrar inativos.
   */
  async listServices(filters: FleetServiceFilters, viewer: ServiceViewer): Promise<FleetServiceListResult> {
    const search = filters.search?.trim()
    if (search && search.length > 120) throw new FleetServiceError(400, 'A busca deve ter até 120 caracteres.')
    const canArchive = canArchiveServices(viewer)
    const hasPagination = filters.page !== undefined || filters.pageSize !== undefined
    if (!canArchive && filters.active === false) {
      throw new FleetServiceError(400, 'Seu perfil não pode consultar tipos de serviço arquivados.')
    }
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    if (hasPagination && (!Number.isInteger(page) || page < 1 || page > 1_000_000)) {
      throw new FleetServiceError(400, 'page deve ser um inteiro positivo.')
    }
    if (hasPagination && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) {
      throw new FleetServiceError(400, 'pageSize deve ser um inteiro entre 1 e 100.')
    }
    const { search: _rawSearch, ...filtersWithoutSearch } = filters
    const visibleFilters = canArchive ? filtersWithoutSearch : { active: true }
    const normalizedFilters = { ...visibleFilters, ...(search ? { search } : {}) }
    if (hasPagination) {
      if (!this.repository.listPaged) throw new FleetServiceError(501, 'A paginação dos tipos de serviço não está disponível.')
      return this.repository.listPaged({ ...normalizedFilters, page, pageSize })
    }
    return this.repository.list(normalizedFilters)
  }

  /**
   * Busca o detalhe de um tipo de serviço; inativos ficam ocultos (404) para não gestores.
   *
   * @throws {FleetServiceError} 400 para id malformado e 404 quando não existe ou não é visível.
   */
  async getService(id: string, viewer: ServiceViewer): Promise<FleetService> {
    this.validateId(id)
    const service = await this.repository.findById(id)
    if (!service || (!service.active && !canArchiveServices(viewer))) {
      throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
    }
    return service
  }

  /**
   * Cadastra um tipo de serviço ativo e registra a auditoria na mesma transação.
   *
   * @throws {FleetServiceError} 400 dados inválidos e 409 nome já usado (sem diferenciar maiúsculas).
   */
  async createService(input: CreateFleetServiceInput, actorId: string): Promise<FleetService> {
    const attributes = this.validateAttributes(input)
    const reason = this.validateReason(input.reason)
    if (await this.repository.findByName(attributes.name)) throw this.duplicateNameError()

    try {
      return await this.repository.withTransaction(async (client) => {
        const actor = await this.requireActor(actorId, client)
        const service = await this.repository.create(attributes, client)
        await this.recordAudit(SERVICE_AUDIT_OPERATIONS.create, null, service, actor, reason, client)
        return service
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) throw this.duplicateNameError()
      throw error
    }
  }

  /**
   * Substitui todos os atributos editáveis (campos omitidos voltam ao padrão) sob revisão otimista.
   *
   * @throws {FleetServiceError} 400, 404 ou 409 (revisão divergente ou nome já usado).
   */
  async updateService(id: string, input: UpdateFleetServiceInput, actorId: string): Promise<FleetService> {
    this.validateId(id)
    const attributes = this.validateAttributes(input)
    const reason = this.validateReason(input.reason)
    this.validateRevision(input.expectedRevision)

    try {
      return await this.repository.withTransaction(async (client) => {
        const before = await this.repository.findByIdForUpdate(id, client)
        if (!before) throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
        if (before.revision !== input.expectedRevision) throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)
        const duplicate = await this.repository.findByName(attributes.name, client)
        if (duplicate && duplicate.id !== id) throw this.duplicateNameError()
        const actor = await this.requireActor(actorId, client)
        const result = await this.repository.saveAttributes(id, input.expectedRevision, attributes, client)
        if (result.kind === 'not-found') throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
        if (result.kind === 'revision-conflict') throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)
        await this.recordAudit(SERVICE_AUDIT_OPERATIONS.edit, before, result.service, actor, reason, client)
        return result.service
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) throw this.duplicateNameError()
      throw error
    }
  }

  /**
   * Ativa ou inativa o tipo de serviço; pedir o estado atual devolve o registro sem nova auditoria.
   *
   * Inativar não apaga o tipo: viagens e solicitações antigas continuam referenciando-o.
   *
   * @throws {FleetServiceError} 400, 404 ou 409 (revisão divergente).
   */
  async setServiceActive(
    id: string,
    active: boolean,
    input: ChangeFleetServiceStatusInput,
    actorId: string,
  ): Promise<FleetService> {
    this.validateId(id)
    this.validateRevision(input.expectedRevision)
    const reason = this.validateReason(input.reason)
    return this.repository.withTransaction(async (client) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before) throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
      if (before.revision !== input.expectedRevision) throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)
      if (before.active === active) return before
      const actor = await this.requireActor(actorId, client)
      const result = await this.repository.saveActive(id, input.expectedRevision, active, client)
      if (result.kind === 'not-found') throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
      if (result.kind === 'revision-conflict') throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)
      await this.recordAudit(SERVICE_AUDIT_OPERATIONS.statusChange, before, result.service, actor, reason, client)
      return result.service
    })
  }

  /**
   * Lista os veículos compatíveis com o tipo de serviço.
   *
   * @throws {FleetServiceError} 400 para id malformado e 404 quando o tipo de serviço não existe.
   */
  async listCompatibleVehicles(id: string): Promise<CompatibleVehiclesView> {
    this.validateId(id)
    const service = await this.repository.findById(id)
    if (!service) throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
    return {
      serviceId: service.id,
      revision: service.revision,
      vehicles: await this.repository.listCompatibleVehicles(id),
    }
  }

  /**
   * Substitui integralmente a lista de veículos compatíveis do tipo de serviço.
   *
   * A operação é atômica: valida a revisão esperada, aplica o diff de vínculos
   * (ativando os desejados e desativando os ausentes), incrementa a revisão do
   * serviço e grava a auditoria no mesmo cliente transacional. Novos vínculos
   * com veículos inexistentes ou `INACTIVE` são rejeitados; os existentes
   * permanecem até serem removidos explicitamente.
   *
   * @throws {FleetServiceError} 400 payload ou veículo inválido, 404 serviço inexistente e 409 revisão divergente.
   */
  async replaceCompatibleVehicles(
    id: string,
    input: ReplaceCompatibleVehiclesInput,
    actorId: string,
  ): Promise<CompatibleVehiclesView> {
    this.validateId(id)
    this.validateRevision(input.expectedRevision)
    const reason = this.validateReason(input.reason)
    const vehicleIds = this.validateVehicleIds(input.vehicleIds)

    return this.repository.withTransaction(async (client) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before) throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
      if (before.revision !== input.expectedRevision) throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)

      const currentIds = await this.repository.findActiveVehicleIdsForUpdate(id, client)
      const desired = new Set(vehicleIds)
      const current = new Set(currentIds)
      const addedVehicleIds = vehicleIds.filter((vehicleId) => !current.has(vehicleId))
      this.ensureVehiclesCanBeLinked(
        addedVehicleIds,
        await this.repository.findVehiclesByIds(addedVehicleIds, client),
      )

      for (const vehicleId of vehicleIds) {
        if (current.has(vehicleId)) continue
        const link = await this.repository.findVehicleLink(id, vehicleId, client)
        if (link) {
          await this.repository.setVehicleLinkActive(id, vehicleId, true, client)
        } else {
          await this.repository.createVehicleLink(id, vehicleId, client)
        }
      }
      for (const vehicleId of currentIds) {
        if (!desired.has(vehicleId)) await this.repository.setVehicleLinkActive(id, vehicleId, false, client)
      }

      const actor = await this.requireActor(actorId, client)
      const result = await this.repository.saveRevision(id, input.expectedRevision, client)
      if (result.kind === 'not-found') throw new FleetServiceError(404, NOT_FOUND_MESSAGE)
      if (result.kind === 'revision-conflict') throw new FleetServiceError(409, REVISION_CONFLICT_MESSAGE)

      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'fleet.services',
        recordId: result.service.id,
        operation: SERVICE_AUDIT_OPERATIONS.compatibilityChange,
        before: { vehicleIds: currentIds },
        after: { vehicleIds },
        actorSnapshot: auditActor(actor),
        reason,
      }, client)

      return {
        serviceId: result.service.id,
        revision: result.service.revision,
        vehicles: await this.repository.listCompatibleVehicles(id, client),
      }
    })
  }

  /**
   * Informa se o veículo é compatível com o tipo de serviço, considerando apenas
   * a existência de vínculo ativo. Identificadores malformados respondem `false`.
   *
   * A disponibilidade operacional (serviço ativo, veículo não inativo) é
   * responsabilidade do agendamento que consome esta regra.
   */
  async isVehicleCompatible(serviceId: string, vehicleId: string): Promise<boolean> {
    if (!isPositiveId(serviceId) || !isPositiveId(vehicleId)) return false
    return this.repository.isVehicleLinked(serviceId, vehicleId)
  }

  private ensureVehiclesCanBeLinked(requestedIds: string[], vehicles: Vehicle[]): void {
    const found = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
    const missing = requestedIds.filter((id) => !found.has(id))
    if (missing.length > 0) {
      throw new FleetServiceError(400, `Veículo(s) não encontrado(s): ${missing.join(', ')}.`)
    }
    const inactive = vehicles.filter((vehicle) => vehicle.status === 'INACTIVE')
    if (inactive.length > 0) {
      const plates = inactive.map((vehicle) => vehicle.licensePlate).join(', ')
      throw new FleetServiceError(400, `Veículo(s) inativo(s) não podem ser vinculados: ${plates}.`)
    }
  }

  private validateVehicleIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new FleetServiceError(400, 'vehicleIds deve ser uma lista de identificadores de veículo.')
    }
    const normalized = value.map((item) => {
      const text = typeof item === 'number' ? String(item) : typeof item === 'string' ? item.trim() : ''
      if (!isPositiveId(text)) throw new FleetServiceError(400, 'Identificador de veículo inválido na lista.')
      return text
    })
    if (new Set(normalized).size !== normalized.length) {
      throw new FleetServiceError(400, 'A lista de veículos contém identificadores repetidos.')
    }
    return normalized.sort((left, right) => left.length - right.length || left.localeCompare(right))
  }

  private async recordAudit(
    operation: string,
    before: FleetService | null,
    after: FleetService,
    actor: FleetServiceActorSnapshot,
    reason: string,
    client: PoolClient,
  ): Promise<void> {
    await this.auditService.recordAudit({
      userId: actor.id,
      table: 'fleet.services',
      recordId: after.id,
      operation,
      before: auditState(before),
      after: auditState(after),
      actorSnapshot: auditActor(actor),
      reason,
    }, client)
  }

  private validateAttributes(input: FleetServiceAttributes): NormalizedFleetServiceAttributes {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new FleetServiceError(400, 'Nome do tipo de serviço é obrigatório.')
    let description: string | null = null
    if (input.description !== undefined && input.description !== null) {
      if (typeof input.description !== 'string') throw new FleetServiceError(400, 'Descrição inválida.')
      description = input.description.trim() || null
    }
    let categories: VehicleCategory[] = [...DEFAULT_CATEGORIES]
    if (input.categories !== undefined && input.categories !== null) {
      if (!Array.isArray(input.categories) || input.categories.length === 0 || !input.categories.every(isCategory)) {
        throw new FleetServiceError(400, `Informe ao menos uma categoria válida: ${VEHICLE_CATEGORIES.join(', ')}.`)
      }
      categories = [...new Set(input.categories)]
    }
    return {
      name,
      description,
      categories,
      requiresTriage: optionalFlag(input.requiresTriage, 'requiresTriage'),
      requiresWeight: optionalFlag(input.requiresWeight, 'requiresWeight'),
      requiresIdentification: optionalFlag(input.requiresIdentification, 'requiresIdentification'),
    }
  }

  private validateReason(reason: unknown): string {
    const trimmed = typeof reason === 'string' ? reason.trim() : ''
    if (!trimmed) throw new FleetServiceError(400, 'reason é obrigatório.')
    return trimmed
  }

  private validateId(id: string): void {
    if (!isPositiveId(id)) throw new FleetServiceError(400, 'Identificador de tipo de serviço inválido.')
  }

  private validateRevision(revision: number): void {
    if (!Number.isInteger(revision) || revision < 1) {
      throw new FleetServiceError(400, 'expectedRevision deve ser um inteiro positivo.')
    }
  }

  private async requireActor(id: string, client: PoolClient): Promise<FleetServiceActorSnapshot> {
    const actor = await this.repository.findActorSnapshot(id, client)
    if (!actor) throw new FleetServiceError(401, 'Usuário autenticado não está ativo ou não existe.')
    return actor
  }

  private duplicateNameError(): FleetServiceError {
    return new FleetServiceError(409, 'Tipo de serviço já cadastrado')
  }
}
