/** Filtros normalizados para a leitura paginada dos eventos de uma entidade. */
export interface EntityHistoryFilters {
  page: number
  pageSize: number
  eventType?: string
  from?: string
  to?: string
}

/** Filtros ainda não validados recebidos pelo endpoint REST. */
export interface EntityHistoryQueryInput {
  page?: unknown
  pageSize?: unknown
  eventType?: unknown
  from?: unknown
  to?: unknown
}

/** Evento histórico comum a veículos e motoristas; não reconstrói fatos ausentes. */
export interface EntityHistoryEntry {
  id: string
  eventType: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED'
  occurredAt: Date
  registeredAt: Date
  reportedBy: string
  reason: string
  evidenceDescription: null
  actor: { id: string; name: string; role: string }
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown>
}

/** Página de eventos com metadados para navegação previsível no cliente. */
export interface EntityHistoryPage {
  items: EntityHistoryEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
