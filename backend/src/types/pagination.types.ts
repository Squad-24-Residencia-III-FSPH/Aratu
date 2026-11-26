/** Envelope de listagem calculada no servidor para consultas operacionais. */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Recorte comum das consultas de cadastros com atividade atual ou arquivada. */
export type ActivityView = 'operational' | 'archived' | 'all'
