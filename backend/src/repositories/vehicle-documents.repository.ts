import type { Pool, PoolClient } from 'pg'
import type {
  NewVehicleDocumentRow,
  VehicleDocumentAttributes,
  VehicleDocumentCriteria,
  VehicleDocumentEvent,
  VehicleDocumentEventType,
  VehicleDocumentRecord,
  VehicleDocumentTimelineEntry,
  VehicleDocumentType,
} from '../types/vehicle-document.types'
import type { Vehicle, VehicleStatus } from '../types/vehicle.types'

interface RawVehicleDocumentRow {
  id: string
  vehicleId: string
  licensePlate: string
  model: string | null
  vehicleStatus: VehicleStatus
  documentType: VehicleDocumentType
  documentNumber: string | null
  issuedAt: string | null
  expiresAt: string
  notes: string | null
  supersedesId: string | null
  supersededById: string | null
  isAnnulled: boolean
  annulmentReason: string | null
  vehicleSnapshot: Vehicle | null
  createdBy: string
  revision: number
  createdAt: Date
  updatedAt: Date
}

interface RawVehicleDocumentEventRow {
  id: string
  eventType: VehicleDocumentEventType
  occurredAt: Date
  registeredAt: Date
  reportedBy: string
  reason: string
  actorId: string
  actorName: string
  actorRole: string
  before: VehicleDocumentRecord | null
  after: VehicleDocumentRecord
}

function toRecord(row: RawVehicleDocumentRow): VehicleDocumentRecord {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    vehicle: {
      licensePlate: row.licensePlate,
      model: row.model,
      status: row.vehicleStatus,
    },
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    notes: row.notes,
    supersedesId: row.supersedesId,
    supersededById: row.supersededById,
    isAnnulled: row.isAnnulled,
    annulmentReason: row.annulmentReason,
    vehicleSnapshot: row.vehicleSnapshot,
    createdBy: row.createdBy,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Contrato de persistência para documentos de veículos e sua trilha de eventos. */
export interface VehicleDocumentsRepositoryContract {
  findById(id: string, client?: PoolClient): Promise<VehicleDocumentRecord | null>
  lockById(id: string, client: PoolClient): Promise<VehicleDocumentRecord | null>
  list(criteria: VehicleDocumentCriteria): Promise<VehicleDocumentRecord[]>
  listExpiring(limitDate: string): Promise<VehicleDocumentRecord[]>
  existsDuplicate(
    vehicleId: string,
    type: VehicleDocumentType,
    expiresAt: string,
    client: PoolClient,
    excludingId?: string,
  ): Promise<boolean>
  create(input: NewVehicleDocumentRow, client: PoolClient): Promise<VehicleDocumentRecord>
  saveAttributes(id: string, attributes: VehicleDocumentAttributes, client: PoolClient): Promise<VehicleDocumentRecord>
  annul(id: string, reason: string, client: PoolClient): Promise<VehicleDocumentRecord>
  createEvent(event: VehicleDocumentEvent, client: PoolClient): Promise<void>
  listEvents(documentId: string): Promise<VehicleDocumentTimelineEntry[]>
}

/**
 * Repositório PostgreSQL de documentos de veículos e eventos imutáveis.
 *
 * Participa da transação aberta sobre a viatura em `VehiclesRepository.withTransaction`
 * para serializar renovações, edições e verificações de duplicidade.
 */
export class VehicleDocumentsRepository implements VehicleDocumentsRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Busca um documento pelo identificador, projetando o veículo atual e o sucessor não anulado. */
  async findById(id: string, client?: PoolClient): Promise<VehicleDocumentRecord | null> {
    const executor = client ?? this.pool
    const result = await executor.query<RawVehicleDocumentRow>(
      `SELECT d.id::text AS id,
              d.vehicle_id::text AS "vehicleId",
              v.license_plate AS "licensePlate",
              v.model,
              v.status AS "vehicleStatus",
              d.document_type AS "documentType",
              d.document_number AS "documentNumber",
              d.issued_at::text AS "issuedAt",
              d.expires_at::text AS "expiresAt",
              d.notes,
              d.supersedes_id::text AS "supersedesId",
              s.id::text AS "supersededById",
              d.is_annulled AS "isAnnulled",
              d.annulment_reason AS "annulmentReason",
              d.vehicle_snapshot AS "vehicleSnapshot",
              d.created_by::text AS "createdBy",
              d.revision,
              d.created_at AS "createdAt",
              d.updated_at AS "updatedAt"
         FROM fleet.vehicle_documents d
         JOIN fleet.vehicles v ON v.id = d.vehicle_id
         LEFT JOIN LATERAL (
               SELECT n.id
                 FROM fleet.vehicle_documents n
                WHERE n.supersedes_id = d.id AND n.is_annulled = false
                ORDER BY n.id DESC
                LIMIT 1
         ) s ON true
        WHERE d.id = $1
        LIMIT 1`,
      [id],
    )
    const row = result.rows[0]
    return row ? toRecord(row) : null
  }

  /**
   * Adquire trava pessimista na linha do documento após a trava do veículo já estar retida.
   */
  async lockById(id: string, client: PoolClient): Promise<VehicleDocumentRecord | null> {
    await client.query('SELECT id FROM fleet.vehicle_documents WHERE id = $1 FOR UPDATE', [id])
    return this.findById(id, client)
  }

  /** Lista documentos aplicando critérios sargáveis traduzidos pelo service. */
  async list(criteria: VehicleDocumentCriteria): Promise<VehicleDocumentRecord[]> {
    const result = await this.pool.query<RawVehicleDocumentRow>(
      `SELECT d.id::text AS id,
              d.vehicle_id::text AS "vehicleId",
              v.license_plate AS "licensePlate",
              v.model,
              v.status AS "vehicleStatus",
              d.document_type AS "documentType",
              d.document_number AS "documentNumber",
              d.issued_at::text AS "issuedAt",
              d.expires_at::text AS "expiresAt",
              d.notes,
              d.supersedes_id::text AS "supersedesId",
              s.id::text AS "supersededById",
              d.is_annulled AS "isAnnulled",
              d.annulment_reason AS "annulmentReason",
              d.vehicle_snapshot AS "vehicleSnapshot",
              d.created_by::text AS "createdBy",
              d.revision,
              d.created_at AS "createdAt",
              d.updated_at AS "updatedAt"
         FROM fleet.vehicle_documents d
         JOIN fleet.vehicles v ON v.id = d.vehicle_id
         LEFT JOIN LATERAL (
               SELECT n.id
                 FROM fleet.vehicle_documents n
                WHERE n.supersedes_id = d.id AND n.is_annulled = false
                ORDER BY n.id DESC
                LIMIT 1
         ) s ON true
        WHERE ($1::bigint IS NULL OR d.vehicle_id = $1)
          AND ($2::text IS NULL OR d.document_type = $2)
          AND ($3::boolean IS NULL OR d.is_annulled = $3)
          AND ($4::boolean IS NULL OR (s.id IS NOT NULL) = $4)
          AND ($5::date IS NULL OR d.expires_at >= $5)
          AND ($6::date IS NULL OR d.expires_at <= $6)
        ORDER BY d.expires_at ASC, d.id ASC`,
      [
        criteria.vehicleId ?? null,
        criteria.documentType ?? null,
        criteria.isAnnulled ?? null,
        criteria.superseded ?? null,
        criteria.expiresFrom ?? null,
        criteria.expiresTo ?? null,
      ],
    )
    return result.rows.map(toRecord)
  }

  /**
   * Lista documentos vigentes (não anulados e não superados) de veículos ativos com vencimento até a data-limite.
   */
  async listExpiring(limitDate: string): Promise<VehicleDocumentRecord[]> {
    const result = await this.pool.query<RawVehicleDocumentRow>(
      `SELECT d.id::text AS id,
              d.vehicle_id::text AS "vehicleId",
              v.license_plate AS "licensePlate",
              v.model,
              v.status AS "vehicleStatus",
              d.document_type AS "documentType",
              d.document_number AS "documentNumber",
              d.issued_at::text AS "issuedAt",
              d.expires_at::text AS "expiresAt",
              d.notes,
              d.supersedes_id::text AS "supersedesId",
              s.id::text AS "supersededById",
              d.is_annulled AS "isAnnulled",
              d.annulment_reason AS "annulmentReason",
              d.vehicle_snapshot AS "vehicleSnapshot",
              d.created_by::text AS "createdBy",
              d.revision,
              d.created_at AS "createdAt",
              d.updated_at AS "updatedAt"
         FROM fleet.vehicle_documents d
         JOIN fleet.vehicles v ON v.id = d.vehicle_id
         LEFT JOIN LATERAL (
               SELECT n.id
                 FROM fleet.vehicle_documents n
                WHERE n.supersedes_id = d.id AND n.is_annulled = false
                ORDER BY n.id DESC
                LIMIT 1
         ) s ON true
        WHERE d.is_annulled = false
          AND s.id IS NULL
          AND v.status <> 'INACTIVE'
          AND d.expires_at <= $1
        ORDER BY d.expires_at ASC, d.id ASC`,
      [limitDate],
    )
    return result.rows.map(toRecord)
  }

  /**
   * Verifica sob a trava da viatura se já existe documento não anulado com mesmo veículo, tipo e vencimento.
   */
  async existsDuplicate(
    vehicleId: string,
    type: VehicleDocumentType,
    expiresAt: string,
    client: PoolClient,
    excludingId?: string,
  ): Promise<boolean> {
    const result = await client.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM fleet.vehicle_documents
          WHERE vehicle_id = $1
            AND document_type = $2
            AND expires_at = $3
            AND is_annulled = false
            AND ($4::bigint IS NULL OR id <> $4)
       ) AS found`,
      [vehicleId, type, expiresAt, excludingId ?? null],
    )
    return result.rows[0]!.found
  }

  /** Insere o documento congelando o snapshot do veículo no instante do cadastro. */
  async create(input: NewVehicleDocumentRow, client: PoolClient): Promise<VehicleDocumentRecord> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO fleet.vehicle_documents (
         vehicle_id, document_type, document_number, issued_at,
         expires_at, notes, supersedes_id, created_by, vehicle_snapshot
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id::text AS id`,
      [
        input.vehicle.id,
        input.documentType,
        input.documentNumber,
        input.issuedAt,
        input.expiresAt,
        input.notes,
        input.supersedesId,
        input.actorId,
        JSON.stringify(input.vehicle),
      ],
    )
    return (await this.findById(result.rows[0]!.id, client))!
  }

  /** Atualiza os atributos editáveis incrementando a revisão e o carimbo temporal. */
  async saveAttributes(
    id: string,
    attributes: VehicleDocumentAttributes,
    client: PoolClient,
  ): Promise<VehicleDocumentRecord> {
    await client.query(
      `UPDATE fleet.vehicle_documents
          SET document_number = $2,
              issued_at = $3,
              expires_at = $4,
              notes = $5,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1`,
      [id, attributes.documentNumber, attributes.issuedAt, attributes.expiresAt, attributes.notes],
    )
    return (await this.findById(id, client))!
  }

  /** Marca o documento como anulado preservando o registro e a justificativa obrigatória. */
  async annul(id: string, reason: string, client: PoolClient): Promise<VehicleDocumentRecord> {
    await client.query(
      `UPDATE fleet.vehicle_documents
          SET is_annulled = true,
              annulment_reason = $2,
              revision = revision + 1,
              updated_at = clock_timestamp()
        WHERE id = $1`,
      [id, reason],
    )
    return (await this.findById(id, client))!
  }

  /** Registra evento imutável na trilha `fleet.vehicle_document_events`. */
  async createEvent(event: VehicleDocumentEvent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO fleet.vehicle_document_events (
         vehicle_document_id, event_type, occurred_at, registered_at,
         reported_by, registered_by, actor_snapshot, reason,
         before_state, after_state
       ) VALUES (
         $1, $2, clock_timestamp(), clock_timestamp(),
         $3, $4, $5::jsonb, $6,
         $7::jsonb, $8::jsonb
       )`,
      [
        event.documentId,
        event.eventType,
        event.metadata.reportedBy,
        event.actor.id,
        JSON.stringify(event.actor),
        event.metadata.reason,
        event.before ? JSON.stringify(event.before) : null,
        JSON.stringify(event.after),
      ],
    )
  }

  /**
   * Lista a linha do tempo de eventos do documento do mais recente para o mais antigo,
   * omitindo o e-mail do operador em conformidade com a LGPD.
   */
  async listEvents(documentId: string): Promise<VehicleDocumentTimelineEntry[]> {
    const result = await this.pool.query<RawVehicleDocumentEventRow>(
      `SELECT id::text AS id,
              event_type AS "eventType",
              occurred_at AS "occurredAt",
              registered_at AS "registeredAt",
              reported_by AS "reportedBy",
              reason,
              registered_by::text AS "actorId",
              actor_snapshot->>'name' AS "actorName",
              actor_snapshot->>'role' AS "actorRole",
              before_state AS "before",
              after_state AS "after"
         FROM fleet.vehicle_document_events
        WHERE vehicle_document_id = $1
        ORDER BY occurred_at DESC, id DESC`,
      [documentId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      registeredAt: row.registeredAt,
      reportedBy: row.reportedBy,
      reason: row.reason,
      actor: {
        id: row.actorId,
        name: row.actorName,
        role: row.actorRole,
      },
      before: row.before,
      after: row.after,
    }))
  }
}
