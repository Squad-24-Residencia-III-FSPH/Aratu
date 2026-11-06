import type { UserRole } from './auth'
import type { VehicleCategory } from './vehicle.types'

/** Perfis que mantêm o catálogo e enxergam também os tipos de serviço inativos. */
export const SERVICE_MANAGER_ROLES = ['GESTOR', 'ADMINISTRADOR'] as const satisfies readonly UserRole[]

/** Perfis que apenas consultam os tipos de serviço ativos ao solicitar viagens. */
export const SERVICE_READER_ROLES = [
  ...SERVICE_MANAGER_ROLES,
  'SOLICITANTE',
  'ATENDENTE_SVO',
] as const satisfies readonly UserRole[]

/** Operações de auditoria associadas às mutações de tipo de serviço. */
export const SERVICE_AUDIT_OPERATIONS = {
  create: 'CREATE',
  edit: 'UPDATE',
  statusChange: 'STATUS_CHANGE',
} as const

/** Tipo de serviço atendido pela frota (`fleet.services`). */
export interface FleetService {
  id: string
  name: string
  description: string | null
  categories: VehicleCategory[]
  requiresTriage: boolean
  requiresWeight: boolean
  requiresIdentification: boolean
  active: boolean
  revision: number
  createdAt: Date
  updatedAt: Date
}

/** Campos editáveis; omitidos assumem os padrões da tabela. */
export interface FleetServiceAttributes {
  name: string
  description?: string | null
  categories?: VehicleCategory[]
  requiresTriage?: boolean
  requiresWeight?: boolean
  requiresIdentification?: boolean
}

/** Atributos validados e completos, prontos para persistência. */
export interface NormalizedFleetServiceAttributes {
  name: string
  description: string | null
  categories: VehicleCategory[]
  requiresTriage: boolean
  requiresWeight: boolean
  requiresIdentification: boolean
}

/** Entrada para cadastro; a justificativa vai para a auditoria. */
export interface CreateFleetServiceInput extends FleetServiceAttributes {
  reason: string
}

/** Entrada para substituição completa protegida por revisão otimista. */
export interface UpdateFleetServiceInput extends FleetServiceAttributes {
  reason: string
  expectedRevision: number
}

/** Entrada para ativar ou inativar protegida por revisão otimista. */
export interface ChangeFleetServiceStatusInput {
  reason: string
  expectedRevision: number
}

/** Filtros da listagem; `active` só é aceito para perfis gestores. */
export interface FleetServiceFilters {
  active?: boolean
}

/** Snapshot público do ator autenticado preservado na auditoria. */
export interface FleetServiceActorSnapshot {
  id: string
  name: string
  email: string
  role: string
}

/** Resultado discriminado de uma alteração concorrente protegida por revision. */
export type FleetServiceMutationResult =
  | { kind: 'updated'; service: FleetService }
  | { kind: 'not-found' }
  | { kind: 'revision-conflict' }

/** Erro de domínio convertido pela camada HTTP em resposta REST apropriada. */
export class FleetServiceError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'FleetServiceError'
    this.statusCode = statusCode
  }
}
