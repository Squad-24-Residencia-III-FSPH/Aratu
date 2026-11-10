import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PoolClient } from 'pg'
import { AuditService } from '../src/services/audit.service'
import {
  DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS,
  loadVehicleDocumentAlertDays,
} from '../src/services/vehicle-document-config.service'
import {
  VehicleDocumentsService,
  addDaysToIsoDate,
  daysBetweenIsoDates,
  resolveVehicleDocumentStatus,
} from '../src/services/vehicle-documents.service'
import type { VehicleDocumentsRepositoryContract } from '../src/repositories/vehicle-documents.repository'
import type { VehiclesRepositoryContract } from '../src/repositories/vehicles.repository'
import type { CreateAuditInput } from '../src/types/audit.types'
import type { Vehicle } from '../src/types/vehicle.types'
import type {
  CreateVehicleDocumentInput,
  UpdateVehicleDocumentInput,
  VehicleDocumentEvent,
  VehicleDocumentRecord,
} from '../src/types/vehicle-document.types'

const FIXED_TODAY = '2026-11-07'
const actor = { id: '3', name: 'Gestor Fictício', email: 'gestor@example.test', role: 'GESTOR' }
const metadata = {
  reportedBy: 'Setor de Patrimônio Fictício por e-mail',
  reason: 'Registro fictício de documento da frota',
}

function makeVehicle(id = '7', status: Vehicle['status'] = 'AVAILABLE'): Vehicle {
  const now = new Date('2026-11-07T12:00:00Z')
  return {
    id,
    licensePlate: `VAN0A0${id}`,
    brand: 'Marca Fictícia',
    model: 'Van Fictícia',
    year: 2025,
    vehicleType: 'VAN',
    ownership: 'OWNED',
    categories: ['PASSENGER'],
    seats: 12,
    bodyLimit: 0,
    weightLimit: null,
    operationType: 'ADMINISTRATIVE',
    status,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function setup(alertDays = DEFAULT_VEHICLE_DOCUMENT_ALERT_DAYS) {
  const now = new Date('2026-11-07T12:00:00Z')
  let vehicles = new Map<string, Vehicle>([
    ['7', makeVehicle('7', 'AVAILABLE')],
    ['8', makeVehicle('8', 'AVAILABLE')],
    ['9', makeVehicle('9', 'INACTIVE')],
  ])
  let documents: VehicleDocumentRecord[] = []
  let events: VehicleDocumentEvent[] = []
  let audits: CreateAuditInput[] = []
  let failAudit = false
  let activeActor: typeof actor | null = actor
  const client = {} as PoolClient

  function computeSupersededById(id: string): string | null {
    const activeRenewal = [...documents]
      .reverse()
      .find((doc) => doc.supersedesId === id && !doc.isAnnulled)
    return activeRenewal?.id ?? null
  }

  function hydrate(doc: VehicleDocumentRecord): VehicleDocumentRecord {
    const vehicle = vehicles.get(doc.vehicleId)!
    return {
      ...doc,
      vehicle: {
        licensePlate: vehicle.licensePlate,
        model: vehicle.model,
        status: vehicle.status,
      },
      supersededById: computeSupersededById(doc.id),
    }
  }

  const audit = new AuditService({
    async create(entry, suppliedClient) {
      assert.equal(suppliedClient, client)
      if (failAudit) throw new Error('Falha simulada de auditoria')
      audits.push(entry)
      return { ...entry, id: String(audits.length), registeredAt: now }
    },
  })

  const vehiclesRepository: Pick<
    VehiclesRepositoryContract,
    'withTransaction' | 'findByIdForUpdate' | 'findActorSnapshot'
  > = {
    async withTransaction(work) {
      const snapshot = structuredClone({
        vehicles: [...vehicles.entries()],
        documents,
        events,
        audits,
      })
      try {
        return await work(client)
      } catch (error) {
        vehicles = new Map(snapshot.vehicles)
        documents = snapshot.documents
        events = snapshot.events
        audits = snapshot.audits
        throw error
      }
    },
    async findByIdForUpdate(id) {
      return vehicles.get(id) ?? null
    },
    async findActorSnapshot() {
      return activeActor
    },
  }

  const repository: VehicleDocumentsRepositoryContract = {
    async findById(id) {
      const doc = documents.find((item) => item.id === id)
      return doc ? hydrate(doc) : null
    },
    async lockById(id) {
      return this.findById(id, client)
    },
    async list(criteria) {
      return documents
        .map(hydrate)
        .filter((doc) => {
          if (criteria.vehicleId && doc.vehicleId !== criteria.vehicleId) return false
          if (criteria.documentType && doc.documentType !== criteria.documentType) return false
          if (criteria.isAnnulled !== undefined && criteria.isAnnulled !== null) {
            if (doc.isAnnulled !== criteria.isAnnulled) return false
          }
          if (criteria.superseded !== undefined && criteria.superseded !== null) {
            if ((doc.supersededById !== null) !== criteria.superseded) return false
          }
          if (criteria.expiresFrom && doc.expiresAt < criteria.expiresFrom) return false
          if (criteria.expiresTo && doc.expiresAt > criteria.expiresTo) return false
          return true
        })
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || Number(a.id) - Number(b.id))
    },
    async listExpiring(limitDate) {
      return documents
        .map(hydrate)
        .filter(
          (doc) =>
            !doc.isAnnulled &&
            doc.supersededById === null &&
            doc.vehicle.status !== 'INACTIVE' &&
            doc.expiresAt <= limitDate,
        )
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || Number(a.id) - Number(b.id))
    },
    async existsDuplicate(vehicleId, type, expiresAt, _client, excludingId) {
      return documents.some(
        (doc) =>
          doc.vehicleId === vehicleId &&
          doc.documentType === type &&
          doc.expiresAt === expiresAt &&
          !doc.isAnnulled &&
          doc.id !== excludingId,
      )
    },
    async create(input) {
      const created: VehicleDocumentRecord = {
        id: String(documents.length + 1),
        vehicleId: input.vehicle.id,
        vehicle: {
          licensePlate: input.vehicle.licensePlate,
          model: input.vehicle.model,
          status: input.vehicle.status,
        },
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        notes: input.notes,
        supersedesId: input.supersedesId,
        supersededById: null,
        isAnnulled: false,
        annulmentReason: null,
        vehicleSnapshot: structuredClone(input.vehicle),
        createdBy: input.actorId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }
      documents.push(created)
      return hydrate(created)
    },
    async saveAttributes(id, attributes) {
      const index = documents.findIndex((item) => item.id === id)
      documents[index] = {
        ...documents[index]!,
        ...attributes,
        revision: documents[index]!.revision + 1,
        updatedAt: now,
      }
      return hydrate(documents[index]!)
    },
    async annul(id, reason) {
      const index = documents.findIndex((item) => item.id === id)
      documents[index] = {
        ...documents[index]!,
        isAnnulled: true,
        annulmentReason: reason,
        revision: documents[index]!.revision + 1,
        updatedAt: now,
      }
      return hydrate(documents[index]!)
    },
    async createEvent(event) {
      events.push(structuredClone(event))
    },
    async listEvents(documentId) {
      return events
        .filter((event) => event.documentId === documentId)
        .reverse()
        .map((event, idx) => ({
          id: String(events.length - idx),
          eventType: event.eventType,
          occurredAt: now,
          registeredAt: now,
          reportedBy: event.metadata.reportedBy,
          reason: event.metadata.reason,
          actor: {
            id: event.actor.id,
            name: event.actor.name,
            role: event.actor.role,
          },
          before: event.before,
          after: event.after,
        }))
    },
  }

  const service = new VehicleDocumentsService(
    repository,
    vehiclesRepository,
    audit,
    alertDays,
    () => FIXED_TODAY,
  )

  return {
    service,
    state: () => ({ documents, events, audits }),
    failAudit: () => {
      failAudit = true
    },
    deactivateActor: () => {
      activeActor = null
    },
    revokeActorRole: () => {
      activeActor = { ...actor, role: 'SOLICITANTE' }
    },
  }
}

test('cálculo de situação e precedência (ANNULLED > RENEWED > EXPIRED > EXPIRING > VALID)', () => {
  const limitDate = addDaysToIsoDate(FIXED_TODAY, 30)
  assert.equal(limitDate, '2026-12-07')

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: false, supersededById: null, expiresAt: '2026-11-06' },
      FIXED_TODAY,
      limitDate,
    ),
    'EXPIRED',
  )
  assert.equal(daysBetweenIsoDates(FIXED_TODAY, '2026-11-06'), -1)

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: false, supersededById: null, expiresAt: '2026-11-07' },
      FIXED_TODAY,
      limitDate,
    ),
    'EXPIRING',
  )
  assert.equal(daysBetweenIsoDates(FIXED_TODAY, '2026-11-07'), 0)

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: false, supersededById: null, expiresAt: '2026-12-07' },
      FIXED_TODAY,
      limitDate,
    ),
    'EXPIRING',
  )
  assert.equal(daysBetweenIsoDates(FIXED_TODAY, '2026-12-07'), 30)

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: false, supersededById: null, expiresAt: '2026-12-08' },
      FIXED_TODAY,
      limitDate,
    ),
    'VALID',
  )
  assert.equal(daysBetweenIsoDates(FIXED_TODAY, '2026-12-08'), 31)

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: false, supersededById: '99', expiresAt: '2026-11-01' },
      FIXED_TODAY,
      limitDate,
    ),
    'RENEWED',
  )

  assert.equal(
    resolveVehicleDocumentStatus(
      { isAnnulled: true, supersededById: '99', expiresAt: '2026-11-01' },
      FIXED_TODAY,
      limitDate,
    ),
    'ANNULLED',
  )
})

test('loadVehicleDocumentAlertDays aplica padrão 30 e rejeita valores fora de 1..365', () => {
  assert.equal(loadVehicleDocumentAlertDays({}), 30)
  assert.equal(loadVehicleDocumentAlertDays({ VEHICLE_DOCUMENT_ALERT_DAYS: '   ' }), 30)
  assert.equal(loadVehicleDocumentAlertDays({ VEHICLE_DOCUMENT_ALERT_DAYS: '1' }), 1)
  assert.equal(loadVehicleDocumentAlertDays({ VEHICLE_DOCUMENT_ALERT_DAYS: '45' }), 45)
  assert.equal(loadVehicleDocumentAlertDays({ VEHICLE_DOCUMENT_ALERT_DAYS: '365' }), 365)

  for (const invalidValue of ['0', '366', '400', '-10', 'trinta', '30.5']) {
    assert.throws(
      () => loadVehicleDocumentAlertDays({ VEHICLE_DOCUMENT_ALERT_DAYS: invalidValue }),
      /VEHICLE_DOCUMENT_ALERT_DAYS/,
    )
  }
})

test('validações de entrada (400) bloqueiam campos obrigatórios, datas incoerentes, OTHER sem notes e imutáveis no PUT', async () => {
  const { service, state } = setup()
  const validInput: CreateVehicleDocumentInput = {
    ...metadata,
    vehicleId: '7',
    documentType: 'CRLV',
    issuedAt: '2026-11-01',
    expiresAt: '2027-10-31',
  }

  for (const invalidCreate of [
    { ...validInput, vehicleId: '' },
    { ...validInput, documentType: 'INVALID' as CreateVehicleDocumentInput['documentType'] },
    { ...validInput, expiresAt: '2026-02-30' },
    { ...validInput, issuedAt: '2026-11-08' },
    { ...validInput, issuedAt: '2026-11-07', expiresAt: '2026-11-06' },
    { ...validInput, documentType: 'OTHER' as const, notes: '   ' },
    { ...validInput, reportedBy: '  ' },
    { ...validInput, reason: '' },
  ]) {
    await assert.rejects(service.create(invalidCreate, actor.id), { statusCode: 400 })
  }
  assert.equal(state().documents.length, 0)

  for (const badDays of ['0', '366', '-5', 'abc']) {
    await assert.rejects(service.listExpiring(badDays), { statusCode: 400 })
  }

  const created = await service.create(validInput, actor.id)
  for (const immutableOverride of [
    { vehicleId: '8' },
    { documentType: 'IPVA' },
    { supersedesId: '1' },
  ]) {
    await assert.rejects(
      service.updateDocument(
        created.id,
        {
          ...metadata,
          expectedRevision: 1,
          ...immutableOverride,
        } as unknown as UpdateVehicleDocumentInput,
        actor.id,
      ),
      { statusCode: 400 },
    )
  }
})

test('regras de renovação, duplicidade, cadeia de anulação (D16) e reversão de vigência (D12)', async () => {
  const { service } = setup()

  const docA = await service.create(
    {
      ...metadata,
      vehicleId: '7',
      documentType: 'CRLV',
      expiresAt: '2026-10-31',
    },
    actor.id,
  )
  assert.equal(docA.status, 'EXPIRED')

  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'CRLV',
        expiresAt: '2026-10-31',
      },
      actor.id,
    ),
    { statusCode: 409 },
  )

  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '8',
        documentType: 'CRLV',
        expiresAt: '2027-10-31',
        supersedesId: docA.id,
      },
      actor.id,
    ),
    { statusCode: 409 },
  )
  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'IPVA',
        expiresAt: '2027-10-31',
        supersedesId: docA.id,
      },
      actor.id,
    ),
    { statusCode: 409 },
  )

  const docR = await service.create(
    {
      ...metadata,
      vehicleId: '7',
      documentType: 'CRLV',
      expiresAt: '2026-11-20',
      supersedesId: docA.id,
    },
    actor.id,
  )
  assert.equal(docR.status, 'EXPIRING')
  assert.equal((await service.getById(docA.id)).status, 'RENEWED')

  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'CRLV',
        expiresAt: '2028-10-31',
        supersedesId: docA.id,
      },
      actor.id,
    ),
    { statusCode: 409 },
  )

  const docR3 = await service.create(
    {
      ...metadata,
      vehicleId: '7',
      documentType: 'CRLV',
      expiresAt: '2027-11-20',
      supersedesId: docR.id,
    },
    actor.id,
  )
  assert.equal(docR3.status, 'VALID')

  await assert.rejects(
    service.annul(docR.id, { ...metadata, expectedRevision: docR.revision }, actor.id),
    { statusCode: 409 },
  )

  const annulledR3 = await service.annul(
    docR3.id,
    { ...metadata, expectedRevision: docR3.revision },
    actor.id,
  )
  assert.equal(annulledR3.status, 'ANNULLED')
  assert.equal((await service.getById(docR.id)).status, 'EXPIRING')

  await service.annul(docR.id, { ...metadata, expectedRevision: docR.revision }, actor.id)
  assert.equal((await service.getById(docA.id)).status, 'EXPIRED')

  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'CRLV',
        expiresAt: '2027-11-20',
        supersedesId: docR3.id,
      },
      actor.id,
    ),
    { statusCode: 409 },
  )
})

test('falha de auditoria desfaz criação e eventos na transação; ator inativo retorna 401', async () => {
  const { service, state, failAudit, deactivateActor } = setup()
  failAudit()

  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'INSURANCE',
        expiresAt: '2027-05-01',
      },
      actor.id,
    ),
    /Falha simulada de auditoria/,
  )
  assert.equal(state().documents.length, 0)
  assert.equal(state().events.length, 0)
  assert.equal(state().audits.length, 0)

  deactivateActor()
  await assert.rejects(
    service.create(
      {
        ...metadata,
        vehicleId: '7',
        documentType: 'INSURANCE',
        expiresAt: '2027-05-01',
      },
      actor.id,
    ),
    { statusCode: 401 },
  )
})

test('perfil revogado bloqueia criação, edição e anulação dentro da transação sem alterar as trilhas', async () => {
  const { service, state, revokeActorRole } = setup()
  const input: CreateVehicleDocumentInput = {
    ...metadata, vehicleId: '7', documentType: 'CRLV', expiresAt: '2027-05-01',
  }
  const document = await service.create(input, actor.id)
  const before = structuredClone(state())
  revokeActorRole()
  for (const mutate of [
    () => service.create({ ...input, expiresAt: '2027-06-01' }, actor.id),
    () => service.updateDocument(document.id, { ...metadata, expectedRevision: 1, notes: 'QA' }, actor.id),
    () => service.annul(document.id, { ...metadata, expectedRevision: 1 }, actor.id),
  ]) {
    await assert.rejects(mutate(), { statusCode: 403 })
    assert.deepEqual(state(), before)
  }
})
