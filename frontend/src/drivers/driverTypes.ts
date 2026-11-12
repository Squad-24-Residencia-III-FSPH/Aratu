/** Categorias de CNH aceitas pela API de motoristas. */
export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const
export type CnhCategory = typeof CNH_CATEGORIES[number]

/** Situações de cadastro aceitas pela API de motoristas. */
export const DRIVER_STATUSES = ['ACTIVE', 'AWAY', 'INACTIVE'] as const
export type DriverStatus = typeof DRIVER_STATUSES[number]

/** Dados retornados pela API administrativa de motoristas. */
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
  createdAt: string
  updatedAt: string
}

/** Campos comuns e metadados obrigatórios em alterações de motorista. */
export interface DriverAttributes {
  name: string
  cpf: string
  cnhNumber: string
  cnhCategory: CnhCategory
  cnhExpiresAt: string
  phone: string | null
  userId: string | null
}

/** Entrada de cadastro; a situação inicial é opcional no contrato da API. */
export interface CreateDriverInput extends DriverAttributes {
  status: DriverStatus
  reportedBy: string
  reason: string
}

/** Entrada de edição completa sob controle de revisão otimista. */
export interface UpdateDriverInput extends DriverAttributes {
  expectedRevision: number
  reportedBy: string
  reason: string
}

/** Entrada para alterar a situação sob controle de revisão otimista. */
export interface ChangeDriverStatusInput {
  status: DriverStatus
  expectedRevision: number
  reportedBy: string
  reason: string
}

/** Filtros aceitos pela listagem da API. */
export interface DriverFilters {
  name?: string
  status?: DriverStatus
}

/** Erro HTTP de domínio devolvido pela API de motoristas. */
export type DriverRequestErrorKind = 'forbidden' | 'not-found' | 'conflict' | 'validation' | 'unavailable'

export class DriverRequestError extends Error {
  readonly kind: DriverRequestErrorKind

  constructor(kind: DriverRequestErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'DriverRequestError'
  }
}
