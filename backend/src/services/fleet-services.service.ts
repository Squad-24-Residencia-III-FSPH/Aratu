import type { PoolClient } from 'pg'
import type { AuditActorSnapshot, AuditLogger } from '../types/audit.types'
import type { UserRole } from '../types/auth'
import { VEHICLE_CATEGORIES } from '../types/vehicle.types'
import type { VehicleCategory } from '../types/vehicle.types'
import {
  SERVICE_AUDIT_OPERATIONS,
  SERVICE_MANAGER_ROLES,
  FleetServiceError,
} from '../types/fleet-service.types'
import type {
  ChangeFleetServiceStatusInput,
  CreateFleetServiceInput,
  FleetService,
  FleetServiceActorSnapshot,
  FleetServiceAttributes,
  FleetServiceFilters,
  NormalizedFleetServiceAttributes,
  UpdateFleetServiceInput,
} from '../types/fleet-service.types'
import type { ServicesRepositoryContract } from '../repositories/services.repository'

const DEFAULT_CATEGORIES: readonly VehicleCategory[] = ['PASSENGER']
const NOT_FOUND_MESSAGE = 'Tipo de serviço não encontrado.'
const REVISION_CONFLICT_MESSAGE = 'O tipo de serviço foi alterado por outra operação. Atualize os dados e tente novamente.'

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isCategory(value: unknown): value is VehicleCategory {
  return typeof value === 'string' && VEHICLE_CATEGORIES.some((category) => category === value)
}

function isManager(role: UserRole | undefined): boolean {
  return SERVICE_MANAGER_ROLES.some((managerRole) => managerRole === role)
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
  async listServices(filters: FleetServiceFilters, viewerRole: UserRole | undefined): Promise<FleetService[]> {
    if (isManager(viewerRole)) return this.repository.list(filters)
    if (filters.active === false) {
      throw new FleetServiceError(400, 'Somente Gestor ou Administrador consultam tipos de serviço inativos.')
    }
    return this.repository.list({ active: true })
  }

  /**
   * Busca o detalhe de um tipo de serviço; inativos ficam ocultos (404) para não gestores.
   *
   * @throws {FleetServiceError} 400 para id malformado e 404 quando não existe ou não é visível.
   */
  async getService(id: string, viewerRole: UserRole | undefined): Promise<FleetService> {
    this.validateId(id)
    const service = await this.repository.findById(id)
    if (!service || (!service.active && !isManager(viewerRole))) {
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
    if (!/^[1-9]\d*$/.test(id)) throw new FleetServiceError(400, 'Identificador de tipo de serviço inválido.')
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
