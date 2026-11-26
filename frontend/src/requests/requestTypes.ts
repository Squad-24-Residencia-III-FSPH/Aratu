export const REQUEST_STATUSES = ['PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'] as const

export type RequestStatus = typeof REQUEST_STATUSES[number]

export interface RequestSummary {
  id: string
  requesterId: string
  requesterName: string
  serviceId: string | null
  serviceName: string | null
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  specialRequirements: string | null
  notes: string | null
  status: RequestStatus
  revision: number
  createdAt: string
  updatedAt: string
}

export interface RequestTrip {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  vehicle: { id: string; licensePlate: string; brand: string | null; model: string | null }
  driver: { id: string; name: string }
}

export interface RequestDetail extends RequestSummary {
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionReason: string | null
  trip: RequestTrip | null
}

export interface RequestSubmission {
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  specialRequirements: string | null
  notes: string | null
}

export interface RequestHistoryItem {
  id: string
  eventType: string
  occurredAt: string
  registeredAt: string
  reportedBy: string
  registeredBy: string
  actorSnapshot: { id: string; name: string; email: string; role: string }
  reason: string
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown>
}

export interface PaginatedRequestHistory {
  items: RequestHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface RequestListFilters {
  status?: RequestStatus
  statuses?: RequestStatus[]
  from?: string
  to?: string
  requester?: string
  service?: string
  page?: number
  pageSize?: number
}

export interface PaginatedRequests {
  requests: RequestSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
