export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED'] as const

export type RequestStatus = typeof REQUEST_STATUSES[number]

export interface RequestSummary {
  id: string
  requesterId: string
  requesterName: string
  serviceId: string
  serviceName: string
  requestedDate: string
  requestedTime: string
  origin: string
  destination: string
  purpose: string
  passengers: number
  status: RequestStatus
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

export interface RequestListFilters {
  status?: RequestStatus
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
