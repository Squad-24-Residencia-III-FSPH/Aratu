import type { PoolClient } from 'pg'
import type { AuditActorSnapshot, AuditLogger } from '../types/audit.types'
import {
  CNH_CATEGORIES,
  DRIVER_AUDIT_OPERATIONS,
  DRIVER_STATUSES,
  DriverServiceError,
} from '../types/driver.types'
import type {
  ChangeDriverStatusInput,
  CreateDriverInput,
  Driver,
  DriverActorSnapshot,
  DriverAttributes,
  DriverFilters,
  DriverStatus,
  NormalizedDriverAttributes,
  UpdateDriverInput,
} from '../types/driver.types'
import type { DriversRepositoryContract } from '../repositories/drivers.repository'

const FSPH_TIME_ZONE = 'America/Maceio'
const DRIVER_ROLE = 'MOTORISTA'
const CPF_PATTERN = /^\d{11}$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ID_PATTERN = /^[1-9]\d*$/
const REVISION_CONFLICT_MESSAGE = 'O motorista foi alterado por outra operação. Atualize os dados e tente novamente.'
const EXPIRED_CNH_MESSAGE = 'CNH vencida: renove a validade antes de deixar o motorista ativo.'

/** Data (`YYYY-MM-DD`) de um instante no fuso de Aracaju/SE, onde opera a FSPH. */
export function fsphDateOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FSPH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** Data corrente (`YYYY-MM-DD`) no fuso de Aracaju/SE, onde opera a FSPH. */
export function currentFsphDate(): string {
  return fsphDateOf(new Date())
}

/** Valida os dois dígitos verificadores do CPF e rejeita sequências repetidas. */
export function isValidCpf(cpf: string): boolean {
  if (!CPF_PATTERN.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digits = [...cpf].map(Number)
  const checkDigit = (length: number): number => {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10]
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isDatabaseError(error: unknown, code: string): error is { code: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function requiredText(value: unknown, message: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) throw new DriverServiceError(400, message)
  return trimmed
}

function auditState(driver: Driver | null): Record<string, unknown> | null {
  if (!driver) return null
  return {
    id: driver.id,
    name: driver.name,
    cpf: driver.cpf,
    cnhNumber: driver.cnhNumber,
    cnhCategory: driver.cnhCategory,
    cnhExpiresAt: driver.cnhExpiresAt,
    phone: driver.phone,
    status: driver.status,
    userId: driver.userId,
    revision: driver.revision,
  }
}

function auditActor(actor: DriverActorSnapshot): AuditActorSnapshot {
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role }
}

/** Regras de domínio do cadastro de motoristas: CPF, CNH, vínculo de conta e situação. */
export class DriversService {
  /**
   * @param today - Fonte da data corrente (`YYYY-MM-DD`); injetável para testes determinísticos.
   */
  constructor(
    private readonly repository: DriversRepositoryContract,
    private readonly auditService: AuditLogger,
    private readonly today: () => string = currentFsphDate,
  ) {}

  /**
   * Lista motoristas filtrando por nome parcial e situação.
   *
   * @throws {DriverServiceError} 400 quando a situação informada não existe.
   */
  async listDrivers(filters: DriverFilters): Promise<Driver[]> {
    if (filters.status !== undefined && !isOneOf(filters.status, DRIVER_STATUSES)) {
      throw new DriverServiceError(400, 'Situação de motorista inválida.')
    }
    const name = filters.name?.trim()
    return this.repository.list({
      ...(name ? { name } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    })
  }

  /**
   * Busca o detalhe de um motorista.
   *
   * @throws {DriverServiceError} 400 para id malformado e 404 quando não existe.
   */
  async getDriver(id: string): Promise<Driver> {
    this.validateId(id)
    const driver = await this.repository.findById(id)
    if (!driver) throw new DriverServiceError(404, 'Motorista não encontrado.')
    return driver
  }

  /**
   * Cadastra o motorista, o evento inicial e a auditoria na mesma transação.
   *
   * Um motorista nunca é gravado como `ACTIVE` com CNH vencida: para registrá-lo,
   * o Gestor informa a situação inicial `AWAY` ou `INACTIVE`.
   *
   * @throws {DriverServiceError} 400 dados inválidos, 409 CPF ou conta já usados, 422 CNH vencida ou conta não elegível.
   */
  async createDriver(input: CreateDriverInput, actorId: string): Promise<Driver> {
    const attributes = this.validateAttributes(input)
    const metadata = this.validateMetadata(input)
    const status = input.status ?? 'ACTIVE'
    if (!isOneOf(status, DRIVER_STATUSES)) {
      throw new DriverServiceError(400, 'Situação de motorista inválida.')
    }
    this.assertCnhAllowsStatus(status, attributes.cnhExpiresAt)
    if (await this.repository.findByCpf(attributes.cpf)) throw this.duplicateCpfError()

    try {
      return await this.repository.withTransaction(async (client) => {
        if (attributes.userId) await this.assertUserCanBeLinked(attributes.userId, null, client)
        const actor = await this.requireActor(actorId, client)
        const driver = await this.repository.create(attributes, status, client)
        await this.recordHistory('CREATED', DRIVER_AUDIT_OPERATIONS.create, null, driver, actor, metadata, client)
        return driver
      })
    } catch (error) {
      throw this.translateUniqueViolation(error)
    }
  }

  /**
   * Substitui os atributos editáveis sob controle de revisão otimista.
   *
   * A situação não muda por aqui (usar {@link changeDriverStatus}); ainda assim,
   * um motorista `ACTIVE` não pode receber validade de CNH já vencida.
   *
   * @throws {DriverServiceError} 400, 404, 409 (revisão, CPF ou conta) ou 422 (CNH vencida, conta não elegível).
   */
  async updateDriver(id: string, input: UpdateDriverInput, actorId: string): Promise<Driver> {
    this.validateId(id)
    const attributes = this.validateAttributes(input)
    const metadata = this.validateMetadata(input)
    this.validateRevision(input.expectedRevision)

    try {
      return await this.repository.withTransaction(async (client) => {
        const before = await this.repository.findByIdForUpdate(id, client)
        if (!before) throw new DriverServiceError(404, 'Motorista não encontrado.')
        if (before.revision !== input.expectedRevision) throw new DriverServiceError(409, REVISION_CONFLICT_MESSAGE)
        this.assertCnhAllowsStatus(before.status, attributes.cnhExpiresAt)
        const duplicate = await this.repository.findByCpf(attributes.cpf, client)
        if (duplicate && duplicate.id !== id) throw this.duplicateCpfError()
        if (attributes.userId && attributes.userId !== before.userId) {
          await this.assertUserCanBeLinked(attributes.userId, id, client)
        }
        const actor = await this.requireActor(actorId, client)
        const result = await this.repository.saveAttributes(id, input.expectedRevision, attributes, client)
        if (result.kind === 'not-found') throw new DriverServiceError(404, 'Motorista não encontrado.')
        if (result.kind === 'revision-conflict') throw new DriverServiceError(409, REVISION_CONFLICT_MESSAGE)
        await this.recordHistory('UPDATED', DRIVER_AUDIT_OPERATIONS.edit, before, result.driver, actor, metadata, client)
        return result.driver
      })
    } catch (error) {
      throw this.translateUniqueViolation(error)
    }
  }

  /**
   * Altera a situação do motorista; qualquer transição é permitida, mas `ACTIVE` exige CNH válida.
   *
   * Pedir a situação atual devolve o registro sem gerar evento.
   *
   * @throws {DriverServiceError} 400, 404, 409 (revisão) ou 422 (CNH vencida).
   */
  async changeDriverStatus(id: string, input: ChangeDriverStatusInput, actorId: string): Promise<Driver> {
    this.validateId(id)
    this.validateRevision(input.expectedRevision)
    if (!isOneOf(input.status, DRIVER_STATUSES)) {
      throw new DriverServiceError(400, 'Situação de motorista inválida.')
    }
    const metadata = this.validateMetadata(input)
    return this.repository.withTransaction(async (client) => {
      const before = await this.repository.findByIdForUpdate(id, client)
      if (!before) throw new DriverServiceError(404, 'Motorista não encontrado.')
      if (before.revision !== input.expectedRevision) throw new DriverServiceError(409, REVISION_CONFLICT_MESSAGE)
      if (before.status === input.status) return before
      this.assertCnhAllowsStatus(input.status, before.cnhExpiresAt)
      const actor = await this.requireActor(actorId, client)
      const result = await this.repository.saveStatus(id, input.expectedRevision, input.status, client)
      if (result.kind === 'not-found') throw new DriverServiceError(404, 'Motorista não encontrado.')
      if (result.kind === 'revision-conflict') throw new DriverServiceError(409, REVISION_CONFLICT_MESSAGE)
      await this.recordHistory('STATUS_CHANGED', DRIVER_AUDIT_OPERATIONS.statusChange, before, result.driver, actor, metadata, client)
      return result.driver
    })
  }

  /**
   * Indica se o motorista pode ser escalado: situação `ACTIVE` e CNH não vencida.
   *
   * Regra única de disponibilidade cadastral reutilizada pela verificação de agenda (FROTA-96).
   *
   * @throws {DriverServiceError} 400 para id malformado e 404 quando não existe.
   */
  async isAvailableForAllocation(driverId: string): Promise<boolean> {
    const driver = await this.getDriver(driverId)
    return driver.status === 'ACTIVE' && !this.isCnhExpired(driver.cnhExpiresAt)
  }

  private isCnhExpired(cnhExpiresAt: string): boolean {
    return cnhExpiresAt < this.today()
  }

  private assertCnhAllowsStatus(status: DriverStatus, cnhExpiresAt: string): void {
    if (status === 'ACTIVE' && this.isCnhExpired(cnhExpiresAt)) {
      throw new DriverServiceError(422, EXPIRED_CNH_MESSAGE)
    }
  }

  private async assertUserCanBeLinked(userId: string, driverId: string | null, client: PoolClient): Promise<void> {
    const account = await this.repository.findUserAccount(userId, client)
    if (!account || !account.active || account.role !== DRIVER_ROLE) {
      throw new DriverServiceError(422, 'A conta vinculada deve existir, estar ativa e ter o perfil MOTORISTA.')
    }
    const linked = await this.repository.findByUserId(userId, client)
    if (linked && linked.id !== driverId) throw this.duplicateUserLinkError()
  }

  private async recordHistory(
    eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED',
    operation: string,
    before: Driver | null,
    after: Driver,
    actor: DriverActorSnapshot,
    metadata: { reportedBy: string; reason: string },
    client: PoolClient,
  ): Promise<void> {
    await this.repository.createEvent({
      driverId: after.id,
      eventType,
      reportedBy: metadata.reportedBy,
      registeredBy: actor.id,
      actorSnapshot: actor,
      reason: metadata.reason,
      beforeState: before,
      afterState: after,
    }, client)
    await this.auditService.recordAudit({
      userId: actor.id,
      table: 'fleet.drivers',
      recordId: after.id,
      operation,
      before: auditState(before),
      after: auditState(after),
      actorSnapshot: auditActor(actor),
      reason: metadata.reason,
    }, client)
  }

  private validateAttributes(input: DriverAttributes): NormalizedDriverAttributes {
    const name = requiredText(input.name, 'Nome do motorista é obrigatório.')
    const cpf = typeof input.cpf === 'string' ? input.cpf.trim() : ''
    if (!isValidCpf(cpf)) {
      throw new DriverServiceError(400, 'CPF inválido. Informe os 11 dígitos, sem pontuação.')
    }
    const cnhNumber = requiredText(input.cnhNumber, 'Número da CNH é obrigatório.')
    if (!isOneOf(input.cnhCategory, CNH_CATEGORIES)) {
      throw new DriverServiceError(400, `Categoria da CNH inválida. Use: ${CNH_CATEGORIES.join(', ')}.`)
    }
    if (typeof input.cnhExpiresAt !== 'string' || !isValidIsoDate(input.cnhExpiresAt)) {
      throw new DriverServiceError(400, 'Validade da CNH é obrigatória no formato AAAA-MM-DD.')
    }
    let phone: string | null = null
    if (input.phone !== undefined && input.phone !== null) {
      if (typeof input.phone !== 'string') throw new DriverServiceError(400, 'Telefone inválido.')
      phone = input.phone.trim() || null
    }
    let userId: string | null = null
    if (input.userId !== undefined && input.userId !== null) {
      const candidate = String(input.userId)
      if (!ID_PATTERN.test(candidate)) throw new DriverServiceError(400, 'Identificador da conta vinculada inválido.')
      userId = candidate
    }
    return {
      name,
      cpf,
      cnhNumber,
      cnhCategory: input.cnhCategory,
      cnhExpiresAt: input.cnhExpiresAt,
      phone,
      userId,
    }
  }

  private validateMetadata(input: { reportedBy: string; reason: string }): { reportedBy: string; reason: string } {
    const reportedBy = typeof input.reportedBy === 'string' ? input.reportedBy.trim() : ''
    const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
    if (!reportedBy || !reason) {
      throw new DriverServiceError(400, 'reportedBy e reason são obrigatórios.')
    }
    return { reportedBy, reason }
  }

  private validateId(id: string): void {
    if (!ID_PATTERN.test(id)) throw new DriverServiceError(400, 'Identificador de motorista inválido.')
  }

  private validateRevision(revision: number): void {
    if (!Number.isInteger(revision) || revision < 1) {
      throw new DriverServiceError(400, 'expectedRevision deve ser um inteiro positivo.')
    }
  }

  private async requireActor(id: string, client: PoolClient): Promise<DriverActorSnapshot> {
    const actor = await this.repository.findActorSnapshot(id, client)
    if (!actor) throw new DriverServiceError(401, 'Usuário autenticado não está ativo ou não existe.')
    return actor
  }

  private translateUniqueViolation(error: unknown): unknown {
    if (!isDatabaseError(error, '23505')) return error
    return error.constraint === 'fleet_drivers_user_id_unique'
      ? this.duplicateUserLinkError()
      : this.duplicateCpfError()
  }

  private duplicateCpfError(): DriverServiceError {
    return new DriverServiceError(409, 'CPF já cadastrado')
  }

  private duplicateUserLinkError(): DriverServiceError {
    return new DriverServiceError(409, 'Esta conta já está vinculada a outro motorista.')
  }
}
