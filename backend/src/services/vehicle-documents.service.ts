import type { PoolClient } from 'pg'
import type { VehiclesRepositoryContract } from '../repositories/vehicles.repository'
import type { VehicleDocumentsRepositoryContract } from '../repositories/vehicle-documents.repository'
import type { AuditLogger } from '../types/audit.types'
import type { Vehicle, VehicleActorSnapshot } from '../types/vehicle.types'
import {
  VEHICLE_DOCUMENT_STATUSES,
  VEHICLE_DOCUMENT_MANAGER_ROLES,
  VEHICLE_DOCUMENT_TYPES,
  VehicleDocumentServiceError,
} from '../types/vehicle-document.types'
import type {
  AnnulVehicleDocumentInput,
  CreateVehicleDocumentInput,
  UpdateVehicleDocumentInput,
  VehicleDocument,
  VehicleDocumentAttributes,
  VehicleDocumentCriteria,
  VehicleDocumentDetail,
  VehicleDocumentEvent,
  VehicleDocumentFilters,
  VehicleDocumentList,
  VehicleDocumentMetadata,
  VehicleDocumentRecord,
  VehicleDocumentStatus,
  VehicleDocumentType,
} from '../types/vehicle-document.types'
import { currentFsphDate } from './drivers.service'

const MAX_SQL_INTEGER = 2147483647
const MAX_SQL_BIGINT = 9223372036854775807n
const MIN_ALERT_DAYS = 1
const MAX_ALERT_DAYS = 365
const MS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const REVISION_CONFLICT_MESSAGE =
  'O documento foi alterado por outra operação. Atualize os dados e tente novamente.'
const DUPLICATE_DOCUMENT_MESSAGE =
  'Já existe documento deste tipo com o mesmo vencimento para o veículo.'
const ANNULLED_IMMUTABLE_MESSAGE = 'Documento anulado não pode ser alterado.'

function invalid(message: string): never {
  throw new VehicleDocumentServiceError(400, message)
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`Informe ${label}.`)
  return value.trim()
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalid(`${label} inválido.`)
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value) || value.startsWith('0000')) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function parseUtcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day)
}

/** Soma dias corridos a uma data civil ISO (`YYYY-MM-DD`) em UTC puro, sem deslocamento de fuso. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Calcula a diferença em dias corridos entre duas datas civis ISO (`toIsoDate - fromIsoDate`). */
export function daysBetweenIsoDates(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((parseUtcDay(toIsoDate) - parseUtcDay(fromIsoDate)) / MS_PER_DAY)
}

function validateId(value: unknown, label = 'um identificador válido'): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_SQL_BIGINT) {
    invalid(`Informe ${label} como texto numérico positivo.`)
  }
}

function validateRevision(revision: unknown): asserts revision is number {
  if (
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > MAX_SQL_INTEGER
  ) {
    invalid('Informe expectedRevision como inteiro positivo.')
  }
}

function validateMetadata(input: VehicleDocumentMetadata): VehicleDocumentMetadata {
  return {
    reportedBy: requiredText(input.reportedBy, 'a origem da informação em reportedBy'),
    reason: requiredText(input.reason, 'a justificativa em reason'),
  }
}

function validateAttributes(
  input: {
    documentType: unknown
    documentNumber?: unknown
    issuedAt?: unknown
    expiresAt: unknown
    notes?: unknown
  },
  today: string,
): VehicleDocumentAttributes & { documentType: VehicleDocumentType } {
  if (!isOneOf(input.documentType, VEHICLE_DOCUMENT_TYPES)) {
    invalid(
      `Informe um tipo de documento válido: ${VEHICLE_DOCUMENT_TYPES.join(', ')}.`,
    )
  }
  const documentNumber = optionalText(input.documentNumber, 'Número do documento')
  const notes = optionalText(input.notes, 'Observações')

  if (!isValidIsoDate(input.expiresAt)) {
    invalid('Informe a data de vencimento no formato AAAA-MM-DD.')
  }
  const expiresAt = input.expiresAt

  let issuedAt: string | null = null
  if (input.issuedAt !== undefined && input.issuedAt !== null && input.issuedAt !== '') {
    if (!isValidIsoDate(input.issuedAt)) {
      invalid('Informe a data de emissão no formato AAAA-MM-DD.')
    }
    if (input.issuedAt > today) {
      invalid('A data de emissão não pode estar no futuro.')
    }
    if (expiresAt < input.issuedAt) {
      invalid('O vencimento não pode ser anterior à emissão.')
    }
    issuedAt = input.issuedAt
  }

  if (input.documentType === 'OTHER' && notes === null) {
    invalid('Descreva o documento em observações quando o tipo for Outro.')
  }

  return {
    documentType: input.documentType,
    documentNumber,
    issuedAt,
    expiresAt,
    notes,
  }
}

/**
 * Calcula a situação operacional do documento de acordo com a precedência de domínio da FSPH:
 * `ANNULLED` → `RENEWED` → `EXPIRED` (`expiresAt < hoje`) → `EXPIRING` (`hoje ≤ expiresAt ≤ limite`) → `VALID`.
 *
 * @param record - Registro persistido contendo flags de anulação, substituição e vencimento.
 * @param today - Data corrente civil da FSPH (`YYYY-MM-DD`).
 * @param limitDate - Data-limite inclusiva do alerta (`hoje + alertDays`).
 * @returns Situação calculada do documento.
 */
export function resolveVehicleDocumentStatus(
  record: Pick<VehicleDocumentRecord, 'isAnnulled' | 'supersededById' | 'expiresAt'>,
  today: string,
  limitDate: string,
): VehicleDocumentStatus {
  if (record.isAnnulled) return 'ANNULLED'
  if (record.supersededById !== null) return 'RENEWED'
  if (record.expiresAt < today) return 'EXPIRED'
  if (record.expiresAt <= limitDate) return 'EXPIRING'
  return 'VALID'
}

function toVehicleDocument(
  record: VehicleDocumentRecord,
  today: string,
  limitDate: string,
): VehicleDocument {
  return {
    ...record,
    status: resolveVehicleDocumentStatus(record, today, limitDate),
    daysUntilExpiration: daysBetweenIsoDates(today, record.expiresAt),
  }
}

function statusToCriteria(
  status: VehicleDocumentStatus | undefined,
  today: string,
  limitDate: string,
): Omit<VehicleDocumentCriteria, 'vehicleId' | 'documentType'> {
  if (status === undefined) return {}
  switch (status) {
    case 'ANNULLED':
      return { isAnnulled: true }
    case 'RENEWED':
      return { isAnnulled: false, superseded: true }
    case 'EXPIRED':
      return { isAnnulled: false, superseded: false, expiresTo: addDaysToIsoDate(today, -1) }
    case 'EXPIRING':
      return { isAnnulled: false, superseded: false, expiresFrom: today, expiresTo: limitDate }
    case 'VALID':
      return { isAnnulled: false, superseded: false, expiresFrom: addDaysToIsoDate(limitDate, 1) }
  }
}

/**
 * Serviço responsável pelas regras de negócio de documentos de veículos da FSPH e do SVO.
 *
 * Orquestra cálculo de vigência, alertas de vencimento, encadeamento de renovações (`supersedesId`),
 * prevenção de duplicidade sob trava transacional da viatura, revisão otimista, anulação justificada
 * e gravação atômica de eventos e auditoria.
 */
export class VehicleDocumentsService {
  constructor(
    private readonly repository: VehicleDocumentsRepositoryContract,
    private readonly vehiclesRepository: Pick<
      VehiclesRepositoryContract,
      'withTransaction' | 'findByIdForUpdate' | 'findActorSnapshot'
    >,
    private readonly audit: AuditLogger,
    private readonly alertDays: number,
    private readonly today: () => string = currentFsphDate,
  ) {}

  /**
   * Lista documentos de veículos aplicando filtros opcionais de veículo, tipo e situação calculada.
   *
   * @param filters - Filtros opcionais recebidos da consulta HTTP.
   * @returns Lista de documentos enriquecidos com situação e dias até o vencimento.
   * @throws {VehicleDocumentServiceError} 400 se algum filtro for inválido.
   */
  async list(filters: VehicleDocumentFilters): Promise<VehicleDocumentList> {
    if (filters.vehicleId !== undefined) validateId(filters.vehicleId, 'o veículo')
    if (filters.documentType !== undefined && !isOneOf(filters.documentType, VEHICLE_DOCUMENT_TYPES)) {
      invalid('Tipo de documento inválido.')
    }
    if (filters.status !== undefined && !isOneOf(filters.status, VEHICLE_DOCUMENT_STATUSES)) {
      invalid('Situação de documento inválida.')
    }

    const today = this.today()
    const limitDate = addDaysToIsoDate(today, this.alertDays)
    const criteria: VehicleDocumentCriteria = {
      vehicleId: filters.vehicleId ?? null,
      documentType: filters.documentType ?? null,
      ...statusToCriteria(filters.status, today, limitDate),
    }

    const records = await this.repository.list(criteria)
    return {
      referenceDate: today,
      alertDays: this.alertDays,
      items: records.map((record) => toVehicleDocument(record, today, limitDate)),
    }
  }

  /**
   * Lista documentos vigentes vencidos ou que vencem dentro do prazo de alerta,
   * excluindo veículos inativos (`INACTIVE`), documentos renovados e documentos anulados.
   *
   * @param days - Quantidade opcional de dias corridos (1 a 365) sobrescrevendo o padrão para a consulta.
   * @returns Lista de documentos em alerta ordenada pelo vencimento mais próximo.
   * @throws {VehicleDocumentServiceError} 400 se `days` não for um inteiro entre 1 e 365.
   */
  async listExpiring(days?: string): Promise<VehicleDocumentList> {
    let effectiveAlertDays = this.alertDays
    if (days !== undefined) {
      if (!/^[1-9]\d*$/.test(days)) {
        invalid('Informe days como inteiro entre 1 e 365.')
      }
      const parsed = Number(days)
      if (!Number.isSafeInteger(parsed) || parsed < MIN_ALERT_DAYS || parsed > MAX_ALERT_DAYS) {
        invalid('Informe days como inteiro entre 1 e 365.')
      }
      effectiveAlertDays = parsed
    }

    const today = this.today()
    const limitDate = addDaysToIsoDate(today, effectiveAlertDays)
    const records = await this.repository.listExpiring(limitDate)
    return {
      referenceDate: today,
      alertDays: effectiveAlertDays,
      items: records.map((record) => toVehicleDocument(record, today, limitDate)),
    }
  }

  /**
   * Consulta um documento específico juntamente com sua linha do tempo de eventos.
   *
   * @param id - Identificador numérico do documento.
   * @returns Documento detalhado e histórico de eventos em ordem decrescente.
   * @throws {VehicleDocumentServiceError} 400 para id inválido ou 404 se não existir.
   */
  async getById(id: string): Promise<VehicleDocumentDetail> {
    validateId(id)
    const record = await this.repository.findById(id)
    if (!record) {
      throw new VehicleDocumentServiceError(404, 'Documento não encontrado. Confira o identificador.')
    }
    const events = await this.repository.listEvents(id)
    const today = this.today()
    const limitDate = addDaysToIsoDate(today, this.alertDays)
    return {
      ...toVehicleDocument(record, today, limitDate),
      events,
    }
  }

  /**
   * Cadastra um novo documento ou registra a renovação de um documento anterior na mesma transação.
   *
   * Trava primeiro a viatura (`FOR UPDATE`) para serializar verificações de duplicidade e renovações
   * concorrentes, congela o `vehicleSnapshot` e grava o evento (`REGISTERED` ou `RENEWED`) e a auditoria.
   *
   * @param input - Dados do documento, incluindo `supersedesId` opcional para renovação.
   * @param actorId - Identificador do gestor ou administrador autenticado.
   * @returns Documento recém-criado com situação calculada.
   * @throws {VehicleDocumentServiceError} 400, 401, 403, 404 ou 409 (autoria, duplicidade ou renovação inválida).
   */
  async create(input: CreateVehicleDocumentInput, actorId: string): Promise<VehicleDocument> {
    validateId(input.vehicleId, 'o identificador do veículo')
    const today = this.today()
    const limitDate = addDaysToIsoDate(today, this.alertDays)
    const values = validateAttributes(input, today)
    const source = validateMetadata(input)

    const supersedesId =
      input.supersedesId === undefined || input.supersedesId === null ? null : input.supersedesId
    if (supersedesId !== null) {
      validateId(supersedesId, 'o identificador do documento a renovar')
    }

    return this.vehiclesRepository.withTransaction(async (client) => {
      const vehicle = await this.lockVehicle(input.vehicleId, client)

      if (supersedesId !== null) {
        const previous = await this.repository.lockById(supersedesId, client)
        if (!previous) {
          throw new VehicleDocumentServiceError(404, 'Documento a renovar não encontrado.')
        }
        if (
          previous.vehicleId !== input.vehicleId ||
          previous.documentType !== values.documentType
        ) {
          throw new VehicleDocumentServiceError(
            409,
            'A renovação deve ser do mesmo veículo e do mesmo tipo de documento.',
          )
        }
        if (previous.isAnnulled) {
          throw new VehicleDocumentServiceError(
            409,
            'Documento anulado não pode ser renovado. Consulte a renovação vigente ou cadastre um novo documento.',
          )
        }
        if (previous.supersededById !== null) {
          throw new VehicleDocumentServiceError(
            409,
            'Este documento já foi renovado. Consulte a renovação vigente.',
          )
        }
      }

      if (
        await this.repository.existsDuplicate(
          input.vehicleId,
          values.documentType,
          values.expiresAt,
          client,
        )
      ) {
        throw new VehicleDocumentServiceError(409, DUPLICATE_DOCUMENT_MESSAGE)
      }

      const actor = await this.requireActor(actorId, client)
      const created = await this.repository.create(
        {
          vehicle,
          documentType: values.documentType,
          documentNumber: values.documentNumber,
          issuedAt: values.issuedAt,
          expiresAt: values.expiresAt,
          notes: values.notes,
          supersedesId,
          actorId,
        },
        client,
      )

      const eventType = supersedesId !== null ? 'RENEWED' : 'REGISTERED'
      await this.record(
        {
          documentId: created.id,
          eventType,
          actor,
          metadata: source,
          before: null,
          after: created,
        },
        client,
      )

      return toVehicleDocument(created, today, limitDate)
    })
  }

  /**
   * Corrige atributos editáveis de um documento não anulado sob controle de revisão otimista.
   *
   * Veículo, tipo e vínculo de renovação são imutáveis após o cadastro; caso tenham sido
   * lançados incorretamente, o gestor deve anular o documento e cadastrar um novo.
   *
   * @param id - Identificador do documento a corrigir.
   * @param input - Campos editáveis, `expectedRevision`, `reportedBy` e `reason`.
   * @param actorId - Identificador do gestor ou administrador autenticado.
   * @returns Documento atualizado com revisão incrementada.
   * @throws {VehicleDocumentServiceError} 400, 401, 403, 404 ou 409 (autoria, anulado, revisão obsoleta ou duplicidade).
   */
  async updateDocument(
    id: string,
    input: UpdateVehicleDocumentInput,
    actorId: string,
  ): Promise<VehicleDocument> {
    validateId(id)
    const raw = input as unknown as Record<string, unknown>
    if (
      raw.vehicleId !== undefined ||
      raw.documentType !== undefined ||
      raw.supersedesId !== undefined
    ) {
      invalid('Veículo, tipo e renovação não podem ser alterados. Anule e cadastre novamente.')
    }
    validateRevision(input.expectedRevision)
    const source = validateMetadata(input)

    const current = await this.repository.findById(id)
    if (!current) {
      throw new VehicleDocumentServiceError(404, 'Documento não encontrado. Confira o identificador.')
    }

    const today = this.today()
    const limitDate = addDaysToIsoDate(today, this.alertDays)

    return this.vehiclesRepository.withTransaction(async (client) => {
      await this.lockVehicle(current.vehicleId, client)
      const before = await this.repository.lockById(id, client)
      if (!before) {
        throw new VehicleDocumentServiceError(404, 'Documento não encontrado.')
      }
      if (before.isAnnulled) {
        throw new VehicleDocumentServiceError(409, ANNULLED_IMMUTABLE_MESSAGE)
      }
      if (before.revision !== input.expectedRevision) {
        throw new VehicleDocumentServiceError(409, REVISION_CONFLICT_MESSAGE)
      }

      const values = validateAttributes(
        {
          documentType: before.documentType,
          documentNumber:
            input.documentNumber !== undefined ? input.documentNumber : before.documentNumber,
          issuedAt: input.issuedAt !== undefined ? input.issuedAt : before.issuedAt,
          expiresAt: input.expiresAt !== undefined ? input.expiresAt : before.expiresAt,
          notes: input.notes !== undefined ? input.notes : before.notes,
        },
        today,
      )

      if (
        await this.repository.existsDuplicate(
          before.vehicleId,
          before.documentType,
          values.expiresAt,
          client,
          id,
        )
      ) {
        throw new VehicleDocumentServiceError(409, DUPLICATE_DOCUMENT_MESSAGE)
      }

      const actor = await this.requireActor(actorId, client)
      const after = await this.repository.saveAttributes(id, values, client)
      await this.record(
        {
          documentId: id,
          eventType: 'UPDATED',
          actor,
          metadata: source,
          before,
          after,
        },
        client,
      )

      return toVehicleDocument(after, today, limitDate)
    })
  }

  /**
   * Anula justificadamente um documento de veículo preservando-o no histórico.
   *
   * Impede a anulação de um documento intermediário que já possua renovação ativa (`supersededById`),
   * exigindo que a renovação mais recente seja anulada primeiro. Quando uma renovação é anulada,
   * o documento anterior volta automaticamente a ser vigente.
   *
   * @param id - Identificador do documento a anular.
   * @param input - Revisão esperada, origem da informação e justificativa da anulação.
   * @param actorId - Identificador do gestor ou administrador autenticado.
   * @returns Documento marcado como `ANNULLED`.
   * @throws {VehicleDocumentServiceError} 400, 401, 403, 404 ou 409 (autoria, já anulado, revisão obsoleta ou renovação ativa).
   */
  async annul(
    id: string,
    input: AnnulVehicleDocumentInput,
    actorId: string,
  ): Promise<VehicleDocument> {
    validateId(id)
    validateRevision(input.expectedRevision)
    const source = validateMetadata(input)

    const current = await this.repository.findById(id)
    if (!current) {
      throw new VehicleDocumentServiceError(404, 'Documento não encontrado. Confira o identificador.')
    }

    const today = this.today()
    const limitDate = addDaysToIsoDate(today, this.alertDays)

    return this.vehiclesRepository.withTransaction(async (client) => {
      await this.lockVehicle(current.vehicleId, client)
      const before = await this.repository.lockById(id, client)
      if (!before) {
        throw new VehicleDocumentServiceError(404, 'Documento não encontrado.')
      }
      if (before.isAnnulled) {
        throw new VehicleDocumentServiceError(409, ANNULLED_IMMUTABLE_MESSAGE)
      }
      if (before.revision !== input.expectedRevision) {
        throw new VehicleDocumentServiceError(409, REVISION_CONFLICT_MESSAGE)
      }
      if (before.supersededById !== null) {
        throw new VehicleDocumentServiceError(
          409,
          'Este documento já foi renovado. Anule primeiro a renovação mais recente.',
        )
      }

      const actor = await this.requireActor(actorId, client)
      const after = await this.repository.annul(id, source.reason, client)
      await this.record(
        {
          documentId: id,
          eventType: 'ANNULLED',
          actor,
          metadata: source,
          before,
          after,
        },
        client,
      )

      return toVehicleDocument(after, today, limitDate)
    })
  }

  private async lockVehicle(id: string, client: PoolClient): Promise<Vehicle> {
    const vehicle = await this.vehiclesRepository.findByIdForUpdate(id, client)
    if (!vehicle) {
      throw new VehicleDocumentServiceError(404, 'Veículo não encontrado. Confira o identificador.')
    }
    return vehicle
  }

  private async requireActor(id: string, client: PoolClient): Promise<VehicleActorSnapshot> {
    const actor = await this.vehiclesRepository.findActorSnapshot(id, client)
    if (!actor) {
      throw new VehicleDocumentServiceError(
        401,
        'Sua conta não está ativa. Entre novamente ou procure a administração.',
      )
    }
    if (!VEHICLE_DOCUMENT_MANAGER_ROLES.some((role) => role === actor.role)) {
      throw new VehicleDocumentServiceError(
        403,
        'Acesso negado: perfil de usuário não autorizado para esta operação.',
      )
    }
    return actor
  }

  private async record(event: VehicleDocumentEvent, client: PoolClient): Promise<void> {
    await this.repository.createEvent(event, client)
    await this.audit.recordAudit(
      {
        userId: event.actor.id,
        table: 'fleet.vehicle_documents',
        recordId: event.documentId,
        operation: event.eventType,
        before: event.before ? { ...event.before } : null,
        after: { ...event.after },
        actorSnapshot: { ...event.actor },
        reason: event.metadata.reason,
      },
      client,
    )
  }
}
