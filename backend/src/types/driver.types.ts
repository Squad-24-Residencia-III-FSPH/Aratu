/** Categorias de CNH aceitas pelo cadastro de motoristas (espelha o CHECK de `fleet.drivers`). */
export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const
export type CnhCategory = typeof CNH_CATEGORIES[number]

/** Situações vigentes de um motorista: ativo, afastado ou inativo. */
export const DRIVER_STATUSES = ['ACTIVE', 'AWAY', 'INACTIVE'] as const
export type DriverStatus = typeof DRIVER_STATUSES[number]

/** Operações de auditoria associadas às mutações de motorista. */
export const DRIVER_AUDIT_OPERATIONS = {
  create: 'CREATE',
  edit: 'UPDATE',
  statusChange: 'STATUS_CHANGE',
} as const

/** Estado atual de um motorista; `cnhExpiresAt` é a data de validade no formato `YYYY-MM-DD`. */
export interface Driver {
  id: string
  name: string
  cpf: string
  cnhNumber: string
  cnhCategory: CnhCategory
  cnhExpiresAt: string
  phone: string | null
  status: DriverStatus
  userId: string | null
  revision: number
  createdAt: Date
  updatedAt: Date
}

/** Origem e justificativa obrigatórias em toda mutação registrada no histórico. */
export interface DriverChangeMetadata {
  reportedBy: string
  reason: string
}

/** Campos editáveis do cadastro de motorista. */
export interface DriverAttributes {
  name: string
  cpf: string
  cnhNumber: string
  cnhCategory: CnhCategory
  cnhExpiresAt: string
  phone?: string | null
  userId?: string | null
}

/** Entrada para cadastro; a situação inicial é opcional e o padrão é `ACTIVE`. */
export interface CreateDriverInput extends DriverAttributes, DriverChangeMetadata {
  status?: DriverStatus
}

/** Entrada para edição completa protegida por revisão otimista. */
export interface UpdateDriverInput extends DriverAttributes, DriverChangeMetadata {
  expectedRevision: number
}

/** Entrada para alteração de situação protegida por revisão otimista. */
export interface ChangeDriverStatusInput extends DriverChangeMetadata {
  status: DriverStatus
  expectedRevision: number
}

/** Filtros opcionais aceitos pela listagem de motoristas. */
export interface DriverFilters {
  name?: string
  status?: DriverStatus
}

/** Atributos já validados e normalizados, prontos para persistência. */
export interface NormalizedDriverAttributes {
  name: string
  cpf: string
  cnhNumber: string
  cnhCategory: CnhCategory
  cnhExpiresAt: string
  phone: string | null
  userId: string | null
}

/** Conta de usuário candidata ao vínculo com o motorista. */
export interface DriverUserAccount {
  id: string
  role: string
  active: boolean
}

/** Snapshot público do ator autenticado preservado no histórico. */
export interface DriverActorSnapshot {
  id: string
  name: string
  email: string
  role: string
}

/** Evento append-only da história de um motorista (`fleet.driver_events`). */
export interface CreateDriverEventInput {
  driverId: string
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED'
  reportedBy: string
  registeredBy: string
  actorSnapshot: DriverActorSnapshot
  reason: string
  beforeState: Driver | null
  afterState: Driver
}

/** Resultado discriminado de uma alteração concorrente protegida por revision. */
export type DriverMutationResult =
  | { kind: 'updated'; driver: Driver }
  | { kind: 'not-found' }
  | { kind: 'revision-conflict' }

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class DriverServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'DriverServiceError'
    this.statusCode = statusCode
  }
}
