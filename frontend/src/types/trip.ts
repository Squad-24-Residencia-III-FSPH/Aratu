/**
 * Tipos do Domínio de Viagens e Agendamento de Frotas — Sistema Aratu
 * Em conformidade com PE-RN-010, PE-RN-023, PE-RN-026 e PE-CA-014.
 */

export type RequestStatus = 'SUBMITTED' | 'APPROVED' | 'SCHEDULED' | 'REJECTED' | 'CANCELED'

export interface TripRequest {
  id: string
  requesterName: string
  requesterDepartment: string
  destination: string
  passengersCount: number
  cargoDescription?: string
  requestedDeparture: string
  justification: string
  status: RequestStatus
  observations?: string
  urgency: 'NORMAL' | 'URGENT'
}

export type VehicleStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'MAINTENANCE'

export interface VehicleOption {
  id: string
  licensePlate: string
  model: string
  capacity: number
  category: string
  status: VehicleStatus
  currentMileage: number
  isCompatible: boolean
}

export type DriverStatus = 'AVAILABLE' | 'ON_DUTY' | 'LEAVE'

export interface DriverOption {
  id: string
  name: string
  cnhCategory: string
  cnhNumber: string
  status: DriverStatus
  shift: string
  isAvailable: boolean
}

export interface FleetScheduleItem {
  id: string
  vehiclePlate: string
  vehicleModel: string
  driverName: string
  destination: string
  startTime: string
  endTime: string
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'
}

export interface ScheduleTripInput {
  requestId: string
  vehicleId: string
  driverId: string
  startDateTime: string
  endDateTime: string
  notes?: string
}

export interface ScheduleTripResult {
  success: boolean
  tripId?: string
  protocol?: string
  message: string
}
