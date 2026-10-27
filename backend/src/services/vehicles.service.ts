import type { PoolClient } from 'pg'
import type { AuditActorSnapshot, AuditLogger } from '../types/audit.types'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_AUDIT_OPERATIONS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_STATUSES,
  VehicleServiceError,
} from '../types/vehicle.types'
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  Vehicle,
  VehicleActorSnapshot,
  VehicleAttributes,
  VehicleFilters,
  VehicleStatus,
  UpdateVehicleInput,
} from '../types/vehicle.types'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'

const LICENSE_PLATE_PATTERN = /^(?:[A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/
const ALLOWED_TRANSITIONS: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> = {
  AVAILABLE: ['IN_MAINTENANCE', 'INACTIVE'],
  IN_MAINTENANCE: ['AVAILABLE', 'INACTIVE'],
  INACTIVE: ['AVAILABLE'],
}

function isDatabaseError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function auditState(vehicle: Vehicle | null): Record<string, unknown> | null {
  if (!vehicle) return null
  return {
    id: vehicle.id,
    licensePlate: vehicle.licensePlate,
    categories: vehicle.categories,
    seats: vehicle.seats,
    bodyLimit: vehicle.bodyLimit,
    weightLimit: vehicle.weightLimit,
    operationType: vehicle.operationType,
    status: vehicle.status,
    revision: vehicle.revision,
  }
}

function auditActor(actor: VehicleActorSnapshot): AuditActorSnapshot {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role }
}

/** Regras de domínio, validação, transições de estado e orquestração de histórico. */
export class VehiclesService {
  constructor(
    private readonly repository: VehiclesRepositoryContract,
    private readonly auditService: AuditLogger,
  ) {}

  /** Lista veículos após validar os filtros opcionais. */
  async listVehicles(filters: VehicleFilters): Promise<Vehicle[]> {
    if (filters.status !== undefined && !isOneOf(filters.status, VEHICLE_STATUSES)) {
      throw new VehicleServiceError(400, 'Situação de veículo inválida.')
    }
    if (filters.category !== undefined && !isOneOf(filters.category, VEHICLE_CATEGORIES)) {
      throw new VehicleServiceError(400, 'Categoria de veículo inválida.')
    }
    if (filters.operationType !== undefined && !isOneOf(filters.operationType, VEHICLE_OPERATION_TYPES)) {
      throw new VehicleServiceError(400, 'Tipo de operação inválido.')
    }
    return this.repository.list(filters)
  }

  /** Busca o detalhe do veículo e sinaliza claramente quando ele não existe. */
  async getVehicle(id: string): Promise<Vehicle> {
    this.validateId(id)
    const vehicle = await this.repository.findById(id)
    if (!vehicle) throw new VehicleServiceError(404, 'Veículo não encontrado.')
    return vehicle
  }

  /** Valida e cadastra um veículo, o evento inicial e a auditoria atomicamente. */
  async createVehicle(input: CreateVehicleInput, actorId: string): Promise<Vehicle> {
    const attributes = this.validateAttributes(input)
    const metadata = this.validateMetadata(input)
    const existing = await this.repository.findByLicensePlate(attributes.licensePlate)
    if (existing) throw this.duplicatePlateError()

    try {
      return await this.repository.withTransaction(async (client) => {
        const actor = await this.requireActor(actorId, client)
        const vehicle = await this.repository.create(attributes, client)
        await this.repository.createEvent({
          vehicleId: vehicle.id,
          eventType: 'CREATED',
          reportedBy: metadata.reportedBy,
          registeredBy: actor.id,
          actorSnapshot: actor,
          reason: metadata.reason,
          beforeState: null,
          afterState: vehicle,
        }, client)
        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'fleet.vehicles',
          recordId: vehicle.id,
          operation: VEHICLE_AUDIT_OPERATIONS.create,
          before: null,
          after: auditState(vehicle),
          actorSnapshot: auditActor(actor),
          reason: metadata.reason,
        }, client)
        return vehicle
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) throw this.duplicatePlateError()
      throw error
    }
  }

  /** Atualiza os atributos editáveis e grava os dois históricos na mesma transação. */
  async updateVehicle(id: string, input: UpdateVehicleInput, actorId: string): Promise<Vehicle> {
    this.validateId(id)
    const attributes = this.validateAttributes(input)
    const metadata = this.validateMetadata(input)
    this.validateRevision(input.expectedRevision)

    try {
      return await this.repository.withTransaction(async (client) => {
        const before = await this.repository.findByIdForUpdate(id, client)
        if (!before) throw new VehicleServiceError(404, 'Veículo não encontrado.')
        const duplicate = await this.repository.findByLicensePlate(attributes.licensePlate, client)
        if (duplicate && duplicate.id !== id) throw this.duplicatePlateError()
        const actor = await this.requireActor(actorId, client)
        const result = await this.repository.saveAttributes(id, input.expectedRevision, attributes, client)
        if (result.kind === 'not-found') throw new VehicleServiceError(404, 'Veículo não encontrado.')
        if (result.kind === 'revision-conflict') {
          throw new VehicleServiceError(409, 'O veículo foi alterado por outra operação. Atualize os dados e tente novamente.')
        }
        await this.repository.createEvent({
          vehicleId: id,
          eventType: 'UPDATED',
          reportedBy: metadata.reportedBy,
          registeredBy: actor.id,
          actorSnapshot: actor,
          reason: metadata.reason,
          beforeState: before,
          afterState: result.vehicle,
        }, client)
        await this.auditService.recordAudit({
          userId: actor.id,
          table: 'fleet.vehicles',
          recordId: id,
          operation: VEHICLE_AUDIT_OPERATIONS.edit,
          before: auditState(before),
          after: auditState(result.vehicle),
          actorSnapshot: auditActor(actor),
          reason: metadata.reason,
        }, client)
        return result.vehicle
      })
    } catch (error) {
      if (isDatabaseError(error, '23505')) throw this.duplicatePlateError()
      throw error
    }
  }

  /** Aplica a máquina de estados e registra mudança, histórico e auditoria. */
  async changeVehicleStatus(
    id: string,
    input: ChangeVehicleStatusInput,
    actorId: string,
  ): Promise<Vehicle> {
    this.validateId(id)
    this.validateRevision(input.expectedRevision)
    if (!isOneOf(input.status, VEHICLE_STATUSES)) {
      throw new VehicleServiceError(400, 'Situação de veículo inválida.')
    }
    const metadata = this.validateMetadata(input)
    return this.repository.withTransaction(async (client) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before) throw new VehicleServiceError(404, 'Veículo não encontrado.')
      if (before.revision !== input.expectedRevision) {
        throw new VehicleServiceError(409, 'O veículo foi alterado por outra operação. Atualize os dados e tente novamente.')
      }
      if (before.status === input.status) return before
      if (!ALLOWED_TRANSITIONS[before.status].includes(input.status)) {
        throw new VehicleServiceError(
          422,
          `Transição de ${before.status} para ${input.status} não permitida.`,
        )
      }
      const actor = await this.requireActor(actorId, client)
      const result = await this.repository.saveStatus(id, input.expectedRevision, input.status, client)
      if (result.kind === 'not-found') throw new VehicleServiceError(404, 'Veículo não encontrado.')
      if (result.kind === 'revision-conflict') {
        throw new VehicleServiceError(409, 'O veículo foi alterado por outra operação. Atualize os dados e tente novamente.')
      }
      await this.repository.createEvent({
        vehicleId: id,
        eventType: 'STATUS_CHANGED',
        reportedBy: metadata.reportedBy,
        registeredBy: actor.id,
        actorSnapshot: actor,
        reason: metadata.reason,
        beforeState: before,
        afterState: result.vehicle,
      }, client)
      await this.auditService.recordAudit({
        userId: actor.id,
        table: 'fleet.vehicles',
        recordId: id,
        operation: VEHICLE_AUDIT_OPERATIONS.statusChange,
        before: auditState(before),
        after: auditState(result.vehicle),
        actorSnapshot: auditActor(actor),
        reason: metadata.reason,
      }, client)
      return result.vehicle
    })
  }

  /** Retorna true somente para AVAILABLE; estados impeditivos retornam false. */
  async isAvailableForAllocation(vehicleId: string): Promise<boolean> {
    const vehicle = await this.getVehicle(vehicleId)
    return vehicle.status === 'AVAILABLE'
  }

  private validateAttributes(input: VehicleAttributes): VehicleAttributes {
    const licensePlate = typeof input.licensePlate === 'string'
      ? input.licensePlate.trim().toUpperCase()
      : ''
    if (!LICENSE_PLATE_PATTERN.test(licensePlate)) {
      throw new VehicleServiceError(400, 'Placa inválida. Informe ABC1234 ou ABC1D23.')
    }
    if (!Array.isArray(input.categories) || input.categories.length === 0
      || input.categories.some((category) => !isOneOf(category, VEHICLE_CATEGORIES))) {
      throw new VehicleServiceError(400, 'Informe ao menos uma categoria de veículo válida.')
    }
    if (!Number.isInteger(input.seats) || input.seats < 0
      || !Number.isInteger(input.bodyLimit) || input.bodyLimit < 0) {
      throw new VehicleServiceError(400, 'Capacidade de assentos e limite de corpos devem ser inteiros não negativos.')
    }
    if (input.weightLimit !== null && (!Number.isFinite(input.weightLimit) || input.weightLimit < 0)) {
      throw new VehicleServiceError(400, 'Limite de peso deve ser não negativo ou nulo.')
    }
    if (!isOneOf(input.operationType, VEHICLE_OPERATION_TYPES)) {
      throw new VehicleServiceError(400, 'Tipo de operação inválido.')
    }
    return {
      licensePlate,
      categories: [...new Set(input.categories)],
      seats: input.seats,
      bodyLimit: input.bodyLimit,
      weightLimit: input.weightLimit,
      operationType: input.operationType,
    }
  }

  private validateMetadata(input: { reportedBy: string; reason: string }): { reportedBy: string; reason: string } {
    const reportedBy = typeof input.reportedBy === 'string' ? input.reportedBy.trim() : ''
    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
    if (!reportedBy || !reason) {
      throw new VehicleServiceError(400, 'reportedBy e reason são obrigatórios.')
    }
    return { reportedBy, reason }
  }

  private validateId(id: string): void {
    if (!/^[1-9]\d*$/.test(id)) throw new VehicleServiceError(400, 'Identificador de veículo inválido.')
  }

  private validateRevision(revision: number): void {
    if (!Number.isInteger(revision) || revision < 1) {
      throw new VehicleServiceError(400, 'revision deve ser um inteiro positivo.')
    }
  }

  private async requireActor(id: string, client: PoolClient) {
    const actor = await this.repository.findActorSnapshot(id, client)
    if (!actor) throw new VehicleServiceError(401, 'Usuário autenticado não está ativo ou não existe.')
    return actor
  }

  private duplicatePlateError(): VehicleServiceError {
    return new VehicleServiceError(409, 'Placa já cadastrada')
  }
}
